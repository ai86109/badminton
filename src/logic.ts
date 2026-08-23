import type { AppState, Att, Member, SessionRec, Settings, Slot } from "./types";

export const WD = ["日", "一", "二", "三", "四", "五", "六"];
export const LV: Record<string, string> = { fixed: "固定", floating: "非固定" };

export const TPL_OPEN =
  "🏸 {日期}（週{星期}）開打！\n{時段清單}\n———\n出席 {出席人數} 人：{出席名單}\n請假 {請假人數} 人：{請假名單}\n———\n記得準時到場 💪";
export const TPL_FEE =
  "🏸 {日期}（週{星期}）收費\n{費用摘要}｜{人數} 人\n———\n{收費明細}\n———\n應收合計 ${合計}\n（含隊費結餘 ${結餘}）\n請盡快轉帳給隊長 🙏";

export function defaultSettings(): Settings {
  return {
    playWeekday: 5,
    hourlyRate: 500,
    defaultCourt: "5",
    defaultSlots: ["18:00", "19:00"],
    tplOpen: TPL_OPEN,
    tplFee: TPL_FEE,
  };
}

/** A fresh account starts with default settings and an empty roster. */
export function seedState(): AppState {
  return { settings: defaultSettings(), members: [], sessions: [] };
}

/** Heal/normalise a loaded blob so older/partial data still works. */
export function migrate(raw: any): AppState {
  const st: AppState = {
    settings: { ...defaultSettings(), ...(raw?.settings || {}) },
    members: Array.isArray(raw?.members) ? raw.members : [],
    sessions: Array.isArray(raw?.sessions) ? raw.sessions : [],
  };
  st.members.forEach((m) => {
    if (m.level !== "fixed") m.level = "floating";
  });
  st.sessions.forEach((s) => {
    if (!Array.isArray(s.slots)) s.slots = [];
    if (!s.attend) s.attend = {};
    if (!s.paid) s.paid = {};
    s.slots.forEach((sl) => {
      if (!Array.isArray(sl.courts)) sl.courts = [];
    });
    s.locked = !!s.locked || Object.keys(s.attend).length > 0 || Object.keys(s.paid).length > 0;
    if (!s.locked) s.slots = [];
  });
  return st;
}

// ---- ids ----
let _uid = 0;
export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  _uid++;
  return "u" + Date.now().toString(36) + "_" + _uid;
}

// ---- primitives ----
export function fmt(n: number): string {
  return (Math.round(n) || 0).toLocaleString("en-US");
}
export function ceilMoney(v: number): number {
  return Math.ceil(v - 1e-9);
}
export function rate(settings: Settings): number {
  return Number(settings.hourlyRate) || 0;
}
export function endTime(start: string): string {
  const p = String(start || "").split(":");
  let h = +p[0] + 1;
  if (!(h >= 0)) return start;
  if (h >= 24) h -= 24;
  return String(h).padStart(2, "0") + ":" + (p[1] || "00");
}
export function slotLabel(start: string): string {
  return start ? start + "–" + endTime(start) : "（未定）";
}
export function dparts(iso: string): Date {
  const p = iso.split("-");
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
export function mmdd(iso: string): string {
  const p = iso.split("-");
  return +p[1] + "/" + +p[2];
}
export function wd(iso: string): string {
  return WD[dparts(iso).getDay()];
}
export function todayIso(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
export function isoAdd(iso: string, n: number): string {
  const d = dparts(iso);
  d.setDate(d.getDate() + n);
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
export function weekdayOf(iso: string): number {
  return dparts(iso).getDay();
}

// ---- slots / courts ----
export function sortedSlots(s: SessionRec): Slot[] {
  return s.slots.slice().sort((a, b) => (String(a.start) < String(b.start) ? -1 : 1));
}
export function courtCount(sl: Slot): number {
  return (sl.courts && sl.courts.length) || 0;
}
export function courtText(sl: Slot): string {
  return sl.courts && sl.courts.length ? sl.courts.join("、") + " 號" : "";
}
export function spanLabel(s: SessionRec): string {
  const ss = sortedSlots(s);
  if (!ss.length) return "打球日";
  return ss[0].start + "–" + endTime(ss[ss.length - 1].start);
}
export function settingsSpan(settings: Settings): string {
  const a = settings.defaultSlots.slice().sort();
  if (!a.length) return "打球日";
  return a[0] + "–" + endTime(a[a.length - 1]);
}
/** Slots derived live from the current settings. Deterministic ids (= start time). */
export function settingsSlots(settings: Settings): Slot[] {
  return settings.defaultSlots
    .slice()
    .sort()
    .map((st) => ({ id: st, start: st, courts: [String(settings.defaultCourt || "1")] }));
}

/**
 * The slots a session actually uses right now: its own frozen slots once it is
 * locked, otherwise the current settings' default slots (so untouched days
 * follow settings automatically).
 */
export function effectiveSlots(state: AppState, s: SessionRec): Slot[] {
  return s.locked ? sortedSlots(s) : settingsSlots(state.settings);
}

/** Freeze the current effective slots onto the session (first edit / first record). */
export function lockSlots(state: AppState, s: SessionRec): void {
  if (!s.locked) {
    s.slots = settingsSlots(state.settings);
    s.locked = true;
  }
}

// ---- sessions / calendar ----
export function sessById(state: AppState, iso: string): SessionRec | null {
  return state.sessions.find((s) => s.id === iso) || null;
}
export function defaultStatus(state: AppState, iso: string): "play" | "rest" {
  return weekdayOf(iso) === +state.settings.playWeekday ? "play" : "rest";
}
export function effStatus(state: AppState, iso: string): "play" | "rest" {
  const r = sessById(state, iso);
  return r ? r.status : defaultStatus(state, iso);
}
export function hasData(r: SessionRec | null): boolean {
  return !!(
    r &&
    ((r.attend && Object.keys(r.attend).length > 0) ||
      (r.paid && Object.keys(r.paid).length > 0))
  );
}
/** Ensure a session record exists for a play day (mutates state). */
export function ensureDay(state: AppState, iso: string): SessionRec {
  let r = sessById(state, iso);
  if (!r) {
    r = { id: iso, date: iso, status: defaultStatus(state, iso), slots: [], attend: {}, paid: {} };
    state.sessions.push(r);
  }
  return r;
}
/** Toggle a calendar day between play / rest (mutates state). */
export function toggleDay(state: AppState, iso: string): void {
  const r = sessById(state, iso);
  const def = defaultStatus(state, iso);
  const cur = r ? r.status : def;
  const nw = cur === "play" ? "rest" : "play";
  if (!r) {
    state.sessions.push({ id: iso, date: iso, status: nw, slots: [], attend: {}, paid: {} });
    return;
  }
  r.status = nw;
  if (nw === def && !hasData(r) && !r.locked) {
    state.sessions = state.sessions.filter((x) => x.id !== iso);
  }
}
export function upcomingList(state: AppState, nPlay: number): { iso: string; play: boolean }[] {
  const out: { iso: string; play: boolean }[] = [];
  let d = todayIso();
  let g = 0;
  let pc = 0;
  while (pc < nPlay && g < 400) {
    const st = effStatus(state, d);
    if (st === "play") {
      out.push({ iso: d, play: true });
      pc++;
    } else if (defaultStatus(state, d) === "play") {
      out.push({ iso: d, play: false });
    }
    d = isoAdd(d, 1);
    g++;
  }
  return out;
}
export function pastPlays(state: AppState, n: number): string[] {
  const out: string[] = [];
  let d = isoAdd(todayIso(), -1);
  let g = 0;
  while (out.length < n && g < 400) {
    if (effStatus(state, d) === "play") out.push(d);
    d = isoAdd(d, -1);
    g++;
  }
  return out;
}
export function daySlotLines(state: AppState, iso: string): { t: string; c: string }[] {
  const r = sessById(state, iso);
  const slots = r ? effectiveSlots(state, r) : settingsSlots(state.settings);
  return slots.map((sl) => ({ t: slotLabel(sl.start), c: (sl.courts || []).join("、") }));
}

// ---- attendance ----
export function attOf(s: SessionRec, id: string, allSlotIds: string[]): Att {
  return s.attend[id] || { status: "in", slots: allSlotIds };
}

export interface Computed {
  rows: Record<string, number>;
  feeTotal: number;
  grand: number;
  inCount: number;
  leaveCount: number;
  per: number;
  fixedTotal: number;
  fixedCount: number;
  collectCount: number;
  paidCount: number;
  roundSurplus: number;
}

export function compute(state: AppState, s: SessionRec | null): Computed {
  const res: Computed = {
    rows: {},
    feeTotal: 0,
    grand: 0,
    inCount: 0,
    leaveCount: 0,
    per: 0,
    fixedTotal: 0,
    fixedCount: 0,
    collectCount: 0,
    paidCount: 0,
    roundSurplus: 0,
  };
  if (!s) return res;
  const r = rate(state.settings);
  const slots = effectiveSlots(state, s);
  const allIds = slots.map((x) => x.id);
  const ins = state.members.filter((m) => attOf(s, m.id, allIds).status === "in");
  res.inCount = ins.length;
  res.leaveCount = state.members.filter((m) => attOf(s, m.id, allIds).status === "leave").length;
  const base: Record<string, number> = {};
  ins.forEach((m) => (base[m.id] = 0));
  slots.forEach((sl) => {
    const slotFee = courtCount(sl) * r;
    res.feeTotal += slotFee;
    const here = ins.filter((m) => (attOf(s, m.id, allIds).slots || []).indexOf(sl.id) >= 0);
    if (!here.length) return;
    const share = slotFee / here.length;
    here.forEach((m) => (base[m.id] += share));
  });
  let allTotal = 0;
  ins.forEach((m) => {
    res.rows[m.id] = ceilMoney(base[m.id]);
    allTotal += res.rows[m.id];
    if (m.level === "fixed") {
      res.fixedTotal += res.rows[m.id];
      res.fixedCount++;
    } else {
      res.grand += res.rows[m.id];
      res.collectCount++;
      if (s.paid[m.id]) res.paidCount++;
    }
  });
  res.per = ins.length ? res.feeTotal / ins.length : 0;
  res.roundSurplus = allTotal - res.feeTotal;
  return res;
}

// ---- notices ----
export function buildNotice(tpl: string, ctx: Record<string, any>): string {
  return tpl
    .split("\n")
    .filter((line) => {
      if (line.indexOf("{請假") >= 0 && !ctx._leave) return false;
      if (line.indexOf("{結餘}") >= 0 && !(ctx._surplus > 0)) return false;
      return true;
    })
    .map((line) => line.replace(/\{([^{}]+)\}/g, (m, k) => (k in ctx ? String(ctx[k]) : m)))
    .join("\n");
}
export function ctxOpen(state: AppState, s: SessionRec): Record<string, any> {
  const ss = effectiveSlots(state, s);
  const allIds = ss.map((x) => x.id);
  const ins = state.members.filter((m) => attOf(s, m.id, allIds).status === "in");
  const lv = state.members.filter((m) => attOf(s, m.id, allIds).status === "leave");
  const lines = (ss.length ? ss : [{ start: "", courts: [] } as unknown as Slot]).map((sl) => {
    const ct = courtText(sl as Slot);
    return "・" + slotLabel((sl as Slot).start) + (ct ? "　" + ct : "");
  });
  return {
    日期: mmdd(s.date),
    星期: wd(s.date),
    時段清單: lines.join("\n"),
    出席人數: ins.length,
    出席名單: ins.map((m) => m.name).join("、") || "—",
    請假人數: lv.length,
    請假名單: lv.map((m) => m.name).join("、"),
    _leave: lv.length > 0,
  };
}
export function ctxFee(state: AppState, s: SessionRec): Record<string, any> {
  const c = compute(state, s);
  const ss = effectiveSlots(state, s);
  const allIds = ss.map((x) => x.id);
  const ins = state.members.filter((m) => attOf(s, m.id, allIds).status === "in");
  const detail = ins
    .map((m) => {
      if (m.level === "fixed") return "・" + m.name + "（隊費）";
      const a = attOf(s, m.id, allIds);
      let note = "";
      if (ss.length > 1 && (a.slots || []).length < ss.length)
        note =
          "（" +
          ss
            .filter((sl) => a.slots.indexOf(sl.id) >= 0)
            .map((sl) => slotLabel(sl.start))
            .join("、") +
          "）";
      return (s.paid[m.id] ? "✅ " : "⬜ ") + m.name + "　$" + fmt(c.rows[m.id]) + note;
    })
    .join("\n");
  return {
    日期: mmdd(s.date),
    星期: wd(s.date),
    費用摘要: "場地費 $" + fmt(c.feeTotal),
    場地費: fmt(c.feeTotal),
    人數: c.inCount,
    收費明細: detail,
    合計: fmt(c.grand),
    結餘: fmt(c.roundSurplus),
    _surplus: c.roundSurplus,
  };
}
export function sampleCtx(state: AppState, kind: "open" | "fee"): Record<string, any> {
  if (kind === "open")
    return {
      日期: "8/25",
      星期: "一",
      時段清單: state.settings.defaultSlots
        .slice()
        .sort()
        .map((st) => "・" + slotLabel(st) + (state.settings.defaultCourt ? "　" + state.settings.defaultCourt + " 號" : ""))
        .join("\n"),
      出席人數: 6,
      出席名單: "小明、阿華、婷婷、阿凱、小美、Kevin",
      請假人數: 1,
      請假名單: "Wei",
      _leave: true,
    };
  return {
    日期: "8/25",
    星期: "一",
    費用摘要: "場地費 $1,000",
    場地費: "1,000",
    人數: 6,
    收費明細:
      "・小明（隊費）\n・阿華（隊費）\n・婷婷（隊費）\n⬜ 阿凱　$200\n⬜ 小美　$100（20:00–21:00）\n⬜ Kevin　$200",
    合計: "500",
    結餘: "0",
    _surplus: 0,
  };
}
