import { adminSupabase } from "./adminSupabase";
import { loadAll } from "../db";
import { compute, todayIso, wd } from "../logic";
import type { AppState, Member } from "../types";

/**
 * 公積金的一筆「事件」。
 *  - auto: 由「已過去且已記錄的打球日」的多收金額（roundSurplus）算出，唯讀。
 *  - 手動: 存在 fund_events 資料表，可新增／刪除。
 * 結餘 = 所有事件的加總（收入 +、支出 −），不另存數字，所以一定對得起來。
 */
export interface FundEvent {
  id: string;
  date: string; // YYYY-MM-DD
  kind: "income" | "expense";
  label: string;
  amount: number; // 一律正數
  auto: boolean;
}
export interface FundData {
  balance: number;
  events: FundEvent[];
}

/** 過去（date < today）且已鎖定的打球日，其多收金額 → 一筆自動「場地結餘」收入。 */
function autoSurplusEvents(state: AppState): FundEvent[] {
  const today = todayIso();
  const out: FundEvent[] = [];
  for (const s of state.sessions) {
    if (s.status !== "play" || !s.locked || s.date >= today) continue;
    const surplus = compute(state, s).roundSurplus;
    if (surplus > 0) {
      out.push({
        id: `auto:${s.date}`,
        date: s.date,
        kind: "income",
        label: `場地結餘（週${wd(s.date)}）`,
        amount: surplus,
        auto: true,
      });
    }
  }
  return out;
}

function byDateDesc(a: FundEvent, b: FundEvent): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.auto === b.auto ? 0 : a.auto ? 1 : -1; // 同日：手動排在自動前
}

export async function loadFund(): Promise<FundData> {
  const state = await loadAll();
  const auto = autoSurplusEvents(state);

  let manual: FundEvent[] = [];
  if (adminSupabase) {
    const { data, error } = await adminSupabase.from("fund_events").select("*");
    if (error) throw error;
    manual = (data || []).map((r: any) => ({
      id: r.id as string,
      date: r.event_date as string,
      kind: r.kind === "expense" ? "expense" : "income",
      label: r.label || "",
      amount: Number(r.amount) || 0,
      auto: false,
    }));
  }

  const events = [...auto, ...manual].sort(byDateDesc);
  const balance = events.reduce((sum, e) => sum + (e.kind === "income" ? e.amount : -e.amount), 0);
  return { balance, events };
}

export async function addFundEvent(e: {
  date: string;
  kind: "income" | "expense";
  label: string;
  amount: number;
}): Promise<void> {
  if (!adminSupabase) throw new Error("Supabase not configured");
  const { error } = await adminSupabase
    .from("fund_events")
    .insert({ event_date: e.date, kind: e.kind, label: e.label, amount: e.amount });
  if (error) throw error;
}

export async function deleteFundEvent(id: string): Promise<void> {
  if (!adminSupabase) throw new Error("Supabase not configured");
  const { error } = await adminSupabase.from("fund_events").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- 預設事件選項（fund_presets）----------------
/**
 * 新增事件時下拉選單的一個預設項。
 *  - label：說明（下拉顯示的文字）
 *  - target：對象（純標註，可留空）
 *  - amount：預填金額；null = 留空，新增時再自己打
 */
export interface FundPreset {
  id: string;
  kind: "income" | "expense";
  label: string;
  target: string;
  amount: number | null;
  sort: number;
}

export async function loadPresets(): Promise<FundPreset[]> {
  if (!adminSupabase) return [];
  const { data, error } = await adminSupabase
    .from("fund_presets")
    .select("*")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id as string,
    kind: r.kind === "income" ? "income" : "expense",
    label: r.label || "",
    target: r.target || "",
    amount: r.amount == null ? null : Number(r.amount),
    sort: Number(r.sort) || 0,
  }));
}

export async function addPreset(kind: "income" | "expense", sort: number): Promise<FundPreset> {
  if (!adminSupabase) throw new Error("Supabase not configured");
  const { data, error } = await adminSupabase
    .from("fund_presets")
    .insert({ kind, label: "", target: "", amount: null, sort })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id as string, kind, label: "", target: "", amount: null, sort };
}

export async function updatePreset(p: FundPreset): Promise<void> {
  if (!adminSupabase) throw new Error("Supabase not configured");
  const { error } = await adminSupabase
    .from("fund_presets")
    .update({
      kind: p.kind,
      label: p.label.trim(),
      target: p.target.trim(),
      amount: p.amount,
      sort: p.sort,
    })
    .eq("id", p.id);
  if (error) throw error;
}

export async function deletePreset(id: string): Promise<void> {
  if (!adminSupabase) throw new Error("Supabase not configured");
  const { error } = await adminSupabase.from("fund_presets").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- 成員清單（給「對象」下拉用）----------------
/** 後台讀成員名單：固定成員排前面，用來組「對象」下拉。 */
export async function loadMembers(): Promise<Member[]> {
  if (!adminSupabase) return [];
  const { data, error } = await adminSupabase
    .from("members")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const ms: Member[] = (data || []).map((m: any) => ({
    id: m.id as string,
    name: m.name as string,
    level: m.level === "fixed" ? "fixed" : "floating",
  }));
  return ms.sort((a, b) => (a.level === "fixed" ? 0 : 1) - (b.level === "fixed" ? 0 : 1));
}

// ---------------- 公積金整體設定（fund_config）----------------
export interface FundConfig {
  /** 固定成員請假的退款金額（每人每次）。 */
  leaveRefund: number;
}
const DEFAULT_CONFIG: FundConfig = { leaveRefund: 200 };

export async function loadFundConfig(): Promise<FundConfig> {
  if (!adminSupabase) return { ...DEFAULT_CONFIG };
  const { data, error } = await adminSupabase
    .from("fund_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...DEFAULT_CONFIG };
  return { leaveRefund: Number(data.leave_refund_amount) || 0 };
}

export async function saveFundConfig(c: FundConfig): Promise<void> {
  if (!adminSupabase) throw new Error("Supabase not configured");
  const { error } = await adminSupabase.from("fund_config").upsert({
    id: 1,
    leave_refund_amount: Math.max(0, Math.round(c.leaveRefund) || 0),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
