import { adminSupabase } from "./adminSupabase";
import { loadAll } from "../db";
import {
  attOf,
  compute,
  defaultCourts,
  effectiveSlots,
  isoAdd,
  rate,
  rosterOf,
  todayIso,
  wd,
  weekdayOf,
} from "../logic";
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
  target: string; // 對象（純標註，可留空）
  amount: number; // 一律正數
  auto: boolean;
  names?: string[]; // 名單（目前用於「固定成員請假退款」）
  breakdown?: BreakdownLine[]; // 明細：依對象／名單算出的每人金額
}

/** 明細的一列：verb（收／退）+ who（要用螢光筆強調的人名或群組）+ 是否「每人」+ 金額。 */
export interface BreakdownLine {
  verb: string;
  who: string;
  per: boolean;
  amount: number;
}
export interface FundData {
  balance: number;
  events: FundEvent[];
}

/**
 * 過去（date < today）且已鎖定的打球日，自動拆成最多三筆：
 *  ① 臨時場地支出：超出季租場地數的部分才算，負值歸零。
 *     = max(0, 當日場地費總額 − 季租場地數 × 時薪 × 時段數)
 *  ② 場地費收入：應收，只算「有顯示金額」的非固定成員（compute.grand）。
 *  ③ 固定成員請假退款：當天請假的固定成員 × 每人退款額（設定可調），可展開看名單。
 * 每筆金額 > 0 才會產生。
 */
function autoDayEvents(state: AppState, leaveRefund: number): FundEvent[] {
  const today = todayIso();
  const out: FundEvent[] = [];
  for (const s of state.sessions) {
    if (s.status !== "play" || !s.locked || s.date >= today) continue;
    const c = compute(state, s);
    const slots = effectiveSlots(state, s);
    const r = rate(state.settings);
    const seasonCount = defaultCourts(state.settings).length;
    const seasonBaseline = seasonCount * r * slots.length;
    const tempExpense = Math.max(0, c.feeTotal - seasonBaseline);

    // ② 場地費收入（應收）
    if (c.grand > 0) {
      out.push({
        id: `auto:income:${s.date}`,
        date: s.date,
        kind: "income",
        label: `場地費收入`,
        target: "",
        amount: c.grand,
        auto: true,
      });
    }
    // ① 臨時場地支出
    if (tempExpense > 0) {
      out.push({
        id: `auto:temp:${s.date}`,
        date: s.date,
        kind: "expense",
        label: `臨時場地支出`,
        target: "",
        amount: tempExpense,
        auto: true,
      });
    }
    // ③ 固定成員請假退款
    //    「固定成員」以「目前」的身分判定（用 state.members），不看當天凍結名單的
    //    舊 level —— 這樣之後把某人改成非固定，過去的退款也會跟著不再算他。
    //    請假與否仍讀當天的凍結出席紀錄（attOf 讀 s.attend）。
    if (leaveRefund > 0) {
      const allIds = slots.map((x) => x.id);
      const fixedLeave = state.members.filter(
        (m) => m.level === "fixed" && attOf(s, m.id, allIds).status === "leave",
      );
      if (fixedLeave.length > 0) {
        out.push({
          id: `auto:refund:${s.date}`,
          date: s.date,
          kind: "expense",
          label: `固定成員請假退款`,
          target: "",
          amount: fixedLeave.length * leaveRefund,
          auto: true,
          names: fixedLeave.map((m) => m.name),
        });
      }
    }
  }
  return out;
}

function byDateDesc(a: FundEvent, b: FundEvent): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.auto === b.auto ? 0 : a.auto ? 1 : -1; // 同日：手動排在自動前
}

// ---- 展開明細（每人金額）----
const TARGET_GROUPS = ["整隊", "固定成員", "非固定成員"];

/** 某事件日期「當週那一天打球日」的名單；找不到就退回目前成員。 */
function weekPlayRoster(state: AppState, dateIso: string): Member[] {
  const pd = isoAdd(dateIso, state.settings.playWeekday - weekdayOf(dateIso));
  const sess = state.sessions.find((x) => x.date === pd);
  return sess ? rosterOf(state, sess) : state.members;
}

/** 群組（整隊／固定成員／非固定成員）在「當週該打球日」的人數。 */
function groupCount(state: AppState, dateIso: string, group: string): number {
  const roster = weekPlayRoster(state, dateIso);
  if (group === "整隊") return roster.length;
  if (group === "固定成員") return roster.filter((m) => m.level === "fixed").length;
  if (group === "非固定成員") return roster.filter((m) => m.level !== "fixed").length;
  return 0;
}

/**
 * 一筆事件展開後要顯示的每一列文字：
 *  - 有名單（自動退款）：每人一列「退 {人名} {總額÷人數}」。
 *  - 對象是群組：一列「退 {群組} 每人 {總額÷當週該群組人數}」。
 *  - 對象是多個人名（「、」分隔）：每人一列「退 {人名} {總額÷人數}」。
 *  - 其他（空的或單一自訂文字）：不展開。
 */
export function eventBreakdown(state: AppState, e: FundEvent): BreakdownLine[] {
  const verb = e.kind === "income" ? "收" : "退"; // 收入用「收」、支出用「退」
  // 有名單（自動退款）：每人一列
  if (e.names && e.names.length) {
    const each = Math.round(e.amount / e.names.length);
    return e.names.map((n) => ({ verb, who: n, per: false, amount: each }));
  }
  const t = (e.target || "").trim();
  if (!t) return [];
  // 群組：一列「每人」
  if (TARGET_GROUPS.includes(t)) {
    const n = groupCount(state, e.date, t);
    if (n > 0) return [{ verb, who: t, per: true, amount: Math.round(e.amount / n) }];
    return [{ verb, who: t, per: false, amount: e.amount }];
  }
  // 多個人名：每人一列
  const names = t
    .split("、")
    .map((x) => x.trim())
    .filter(Boolean);
  if (names.length > 1) {
    const each = Math.round(e.amount / names.length);
    return names.map((n) => ({ verb, who: n, per: false, amount: each }));
  }
  // 單一對象（人名或自訂文字）：一列，全額
  return [{ verb, who: t, per: false, amount: e.amount }];
}

export async function loadFund(): Promise<FundData> {
  const state = await loadAll();
  const config = await loadFundConfig();
  const auto = autoDayEvents(state, config.leaveRefund);

  let manual: FundEvent[] = [];
  if (adminSupabase) {
    const { data, error } = await adminSupabase.from("fund_events").select("*");
    if (error) throw error;
    manual = (data || []).map((r: any) => ({
      id: r.id as string,
      date: r.event_date as string,
      kind: r.kind === "expense" ? "expense" : "income",
      label: r.label || "",
      target: r.target || "",
      amount: Number(r.amount) || 0,
      auto: false,
    }));
  }

  const events = [...auto, ...manual].sort(byDateDesc);
  events.forEach((e) => {
    e.breakdown = eventBreakdown(state, e);
  });
  const balance = events.reduce((sum, e) => sum + (e.kind === "income" ? e.amount : -e.amount), 0);
  return { balance, events };
}

export async function addFundEvent(e: {
  date: string;
  kind: "income" | "expense";
  label: string;
  target: string;
  amount: number;
}): Promise<void> {
  if (!adminSupabase) throw new Error("Supabase not configured");
  const { error } = await adminSupabase
    .from("fund_events")
    .insert({ event_date: e.date, kind: e.kind, label: e.label, target: e.target, amount: e.amount });
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
