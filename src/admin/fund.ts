import { adminSupabase } from "./adminSupabase";
import { loadAll } from "../db";
import { compute, todayIso, wd } from "../logic";
import type { AppState } from "../types";

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
