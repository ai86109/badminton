import { loadAll } from "../db";
import { loadFund } from "./fund";
import { attOf, effectiveSlots, rosterOf, todayIso } from "../logic";

export interface MonthStat {
  month: string; // "YYYY-MM"
  income: number;
  expense: number;
  endBalance: number; // 到該月底的累積結餘
}
export interface DayAttend {
  date: string; // "YYYY-MM-DD"
  fixed: number;
  floating: number;
}
export interface MemberInfo {
  id: string;
  name: string;
  level: "fixed" | "floating";
}
export interface MemberRank {
  id: string;
  name: string;
  level: "fixed" | "floating";
  attended: number; // 這區間內到場場次
  total: number; // 這區間內「他在名單上」的場次（分母）
}
/** 一個已完成場次的名單／到場資料，供前端依日期區間重算排行。 */
export interface RankDay {
  date: string; // "YYYY-MM-DD"
  roster: string[]; // 當天在名單上的成員 id
  present: string[]; // 當天到場的成員 id
}
export interface StatsData {
  monthly: MonthStat[];
  attendance: DayAttend[];
  members: MemberInfo[]; // 目前成員（排行用；等級以現況為準）
  rankDays: RankDay[]; // 全部已完成場次
}

export async function loadStats(): Promise<StatsData> {
  const [state, fund] = await Promise.all([loadAll(), loadFund()]);

  // ---- 每月收支 + 月底結餘（近 MONTHS_WINDOW 個月）----
  const asc = [...fund.events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const mMap = new Map<string, { income: number; expense: number }>();
  const order: string[] = [];
  asc.forEach((e) => {
    const m = e.date.slice(0, 7);
    if (!mMap.has(m)) {
      mMap.set(m, { income: 0, expense: 0 });
      order.push(m);
    }
    const o = mMap.get(m)!;
    if (e.kind === "income") o.income += e.amount;
    else o.expense += e.amount;
  });
  let run = 0;
  // 回傳「全部月份」（含累積月底結餘）；年/季彙總與視窗裁切都在前端做。
  const monthly: MonthStat[] = order.map((m) => {
    const o = mMap.get(m)!;
    run += o.income - o.expense;
    return { month: m, income: o.income, expense: o.expense, endBalance: run };
  });

  // ---- 出席（只算「已完成」＝過去且已鎖定的打球日）----
  const today = todayIso();
  const playDays = state.sessions
    .filter((s) => s.status === "play" && s.locked && s.date < today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // 回傳全部已完成場次；長條裁切與平均彙總都在前端做。
  const attendance: DayAttend[] = [];
  const rankDays: RankDay[] = [];
  playDays.forEach((s) => {
    const ids = effectiveSlots(state, s).map((x) => x.id);
    const roster = rosterOf(state, s);
    const present = roster.filter((m) => attOf(s, m.id, ids).status === "in");
    const fixed = present.filter((m) => m.level === "fixed").length;
    attendance.push({ date: s.date, fixed, floating: present.length - fixed });
    rankDays.push({ date: s.date, roster: roster.map((m) => m.id), present: present.map((m) => m.id) });
  });

  // 排行的分母／到場都在前端依所選日期區間重算；等級以現況為準。
  const members: MemberInfo[] = state.members.map((m) => ({ id: m.id, name: m.name, level: m.level }));

  return { monthly, attendance, members, rankDays };
}
