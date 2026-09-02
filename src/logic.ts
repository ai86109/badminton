import type { AppState, Att, Member, SessionRec, Settings, Slot } from "./types";

export const WD = ["日", "一", "二", "三", "四", "五", "六"];
export const LV: Record<string, string> = { fixed: "固定", floating: "非固定" };

export const TPL_OPEN = "{日期}\n{時段清單}";
// 收費通知模板：{明細} 會換成依當天出席自動算出的人數與金額那段；其餘文字可自由編輯。
export const TPL_FEE = "今天羽球場地費\n{明細}\n再勞煩大家給我錢\n感恩";

export function defaultSettings(): Settings {
  return {
    playWeekday: 5,
    hourlyRate: 500,
    defaultCourt: ["5"],
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
  st.settings.tplFee = normalizeFeeTpl(st.settings.tplFee);
  // 舊資料相容：defaultCourt 從單一字串 → 陣列
  const dcRaw: unknown = st.settings.defaultCourt;
  st.settings.defaultCourt = Array.isArray(dcRaw)
    ? dcRaw.map((c) => String(c))
    : dcRaw
      ? [String(dcRaw)]
      : [];
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
    if (s.roster && !Array.isArray(s.roster)) delete s.roster;
  });
  normalizeRosters(st);
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
/** Court numbers sorted numerically (for display). */
export function sortCourts(courts: string[]): string[] {
  return (courts || []).slice().sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
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
/** 清過的季租場地號碼陣列（去空白/空字串）；空的話退回 ["1"]。 */
export function defaultCourts(settings: Settings): string[] {
  const cs = (settings.defaultCourt || []).map((c) => String(c).trim()).filter(Boolean);
  return cs.length ? cs : ["1"];
}

export function settingsSlots(settings: Settings): Slot[] {
  const dc = defaultCourts(settings);
  return settings.defaultSlots
    .slice()
    .sort()
    .map((st) => ({ id: st, start: st, courts: dc.slice() }));
}

/**
 * Slots for a day that is locking in. The id is `${date}@${start}` — unique
 * across days (so different days never collide on the session_slots primary
 * key), yet deterministic within a day (so two people first-recording the same
 * day generate the SAME ids and converge instead of creating duplicate slots).
 * The start time is also kept in `start`.
 */
export function freshSlots(settings: Settings, date: string): Slot[] {
  const dc = defaultCourts(settings);
  return settings.defaultSlots
    .slice()
    .sort()
    .map((st) => ({ id: `${date}@${st}`, start: st, courts: dc.slice() }));
}

/**
 * Repair a locked day whose stored slots were lost to the legacy time-id
 * collision: rebuild slots with fresh unique ids, remapping any per-slot
 * attendance refs by start time so partial participation stays intact.
 * No-op when the day already has slots.
 */
export function repairLockedSlots(state: AppState, s: SessionRec): void {
  if (!s.locked || (s.slots && s.slots.length)) return;
  const fresh = freshSlots(state.settings, s.date);
  const idByStart = new Map(fresh.map((sl) => [sl.start, sl.id]));
  const validIds = new Set(fresh.map((sl) => sl.id));
  for (const mid in s.attend) {
    const a = s.attend[mid];
    if (a && Array.isArray(a.slots) && a.slots.length) {
      a.slots = a.slots.map((old) => idByStart.get(old) ?? old).filter((id) => validIds.has(id));
    }
  }
  s.slots = fresh;
}

/**
 * The slots a session actually uses right now: its own frozen slots once it is
 * locked, otherwise the current settings' default slots (so untouched days
 * follow settings automatically).
 */
export function effectiveSlots(state: AppState, s: SessionRec): Slot[] {
  // A locked day with lost/empty slots falls back to the current settings so the
  // schedule still shows its times and the money still computes.
  return s.locked && s.slots.length ? sortedSlots(s) : settingsSlots(state.settings);
}

/** Freeze the current effective slots onto the session (first edit / first record). */
export function lockSlots(state: AppState, s: SessionRec): void {
  if (!s.locked) {
    s.slots = freshSlots(state.settings, s.date);
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
  } else {
    // heal any legacy locked day that lost its slots, and persist on this open
    repairLockedSlots(state, r);
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
  return slots.map((sl) => ({ t: slotLabel(sl.start), c: sortCourts(sl.courts || []).join("、") }));
}

// ---- roster snapshots ----
/** A shallow copy of the roster, safe to freeze onto a session. */
export function cloneRoster(members: Member[]): Member[] {
  return members.map((m) => ({ id: m.id, name: m.name, level: m.level }));
}

/**
 * The roster a session should use for headcount / money. Recorded (locked) days
 * use their own frozen snapshot; every other day follows the live roster.
 */
export function rosterOf(state: AppState, s: SessionRec): Member[] {
  return s.locked && s.roster && s.roster.length ? s.roster : state.members;
}

/** 這天是否季租日（預設 true）。 */
export function isSeasonRent(s: SessionRec): boolean {
  return s.seasonRent !== false;
}

/**
 * Keep roster snapshots consistent after any change:
 *  - unlocked days carry no snapshot (they follow the live roster),
 *  - locked days that are today or in the future stay synced to the live roster,
 *  - locked days already in the past are frozen (their snapshot is left alone),
 *    and any legacy locked day missing a snapshot is frozen at the current roster.
 */
export function normalizeRosters(state: AppState): void {
  const today = todayIso();
  const liveIds = new Set(state.members.map((m) => m.id));
  state.sessions.forEach((s) => {
    if (!s.locked) {
      delete s.roster;
      return;
    }
    if (s.date >= today) {
      // today / future: follow the live roster, but keep this day's own
      // one-off "temp" members (roster entries that aren't real members).
      const temps = (s.roster || []).filter((m) => !liveIds.has(m.id));
      s.roster = [...cloneRoster(state.members), ...temps];
    } else if (!s.roster) {
      // legacy past day with no snapshot → freeze at the current roster.
      s.roster = cloneRoster(state.members);
    }
    // Drop attendance/paid for anyone no longer on this day's roster. Past days
    // keep their frozen people, so their records survive a member being deleted.
    const ids = new Set((s.roster || []).map((m) => m.id));
    Object.keys(s.attend).forEach((id) => {
      if (!ids.has(id)) delete s.attend[id];
    });
    Object.keys(s.paid).forEach((id) => {
      if (!ids.has(id)) delete s.paid[id];
    });
  });
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
    collectCount: 0,
    paidCount: 0,
    roundSurplus: 0,
  };
  if (!s) return res;
  const r = rate(state.settings);
  const slots = effectiveSlots(state, s);
  const allIds = slots.map((x) => x.id);
  const roster = rosterOf(state, s);
  const ins = roster.filter((m) => attOf(s, m.id, allIds).status === "in");
  res.inCount = ins.length;
  res.leaveCount = roster.filter((m) => attOf(s, m.id, allIds).status === "leave").length;
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
  // 季租日：固定成員走隊費不另收；非季租日：固定成員當天也要收費（跟非固定一樣）。
  const seasonRent = s.seasonRent !== false;
  let allTotal = 0;
  ins.forEach((m) => {
    res.rows[m.id] = ceilMoney(base[m.id]);
    allTotal += res.rows[m.id];
    // 季租日的固定成員走隊費、不列入收費；其餘（非固定，或非季租日的固定）都要收。
    const chargeable = m.level !== "fixed" || !seasonRent;
    if (chargeable) {
      res.grand += res.rows[m.id];
      res.collectCount++;
      if (s.paid[m.id]) res.paidCount++;
    }
  });
  res.per = ins.length ? res.feeTotal / ins.length : 0;
  res.roundSurplus = allTotal - res.feeTotal;
  return res;
}

// ---- 收費通知（模板 + 自動明細）----
const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
/** 小數字轉中文（第一小時、第二小時…）。 */
function cnNum(n: number): string {
  if (n <= 10) return CN[n] ?? String(n);
  if (n < 20) return "十" + (n % 10 ? CN[n % 10] : "");
  if (n < 100) return CN[Math.floor(n / 10)] + "十" + (n % 10 ? CN[n % 10] : "");
  return String(n);
}

/**
 * {明細}那段——依當天出席自動算。兩種格式：
 *  A) 所有非固定成員都打滿全部時段 → 大家金額相同：
 *       「N人，非固定成員每人X元」
 *  B) 有非固定成員只打其中部分時段 → 逐時段人數＋打滿者金額＋只打單一時段者的名字與金額：
 *       「第一小時a人 / 第二小時b人 / 非固定成員每人X元 / 名字…Y元」
 */
export function feeDetail(state: AppState, s: SessionRec): string {
  const c = compute(state, s);
  const ss = effectiveSlots(state, s);
  const allIds = ss.map((x) => x.id);
  const roster = rosterOf(state, s);
  const ins = roster.filter((m) => attOf(s, m.id, allIds).status === "in");
  const slotsOf = (m: Member) => new Set(attOf(s, m.id, allIds).slots || []);
  const playsAll = (m: Member) => allIds.every((id) => slotsOf(m).has(id));

  // 季租日只收非固定成員；非季租日所有出席者都要收費。
  const seasonRent = s.seasonRent !== false;
  const payLabel = seasonRent ? "非固定成員" : ""; // 非季租日大家都收，不加前綴
  const chargeable = seasonRent ? ins.filter((m) => m.level !== "fixed") : ins.slice();
  const fullCharge = chargeable.filter((m) => playsAll(m));
  const partialCharge = chargeable.filter((m) => !playsAll(m));

  const lines: string[] = [];

  if (chargeable.length === 0) {
    lines.push(`${ins.length}人，全部都是固定成員，無需另外收費`);
  } else if (partialCharge.length === 0) {
    // 格式 A：全部打滿，金額一致
    const amt = c.rows[fullCharge[0].id] || 0;
    lines.push(`${ins.length}人，${payLabel}每人${fmt(amt)}元`);
  } else {
    // 格式 B：有人只打部分時段
    ss.forEach((sl, i) => {
      const cnt = ins.filter((m) => slotsOf(m).has(sl.id)).length;
      lines.push(`第${cnNum(i + 1)}小時${cnt}人`);
    });
    if (fullCharge.length) {
      lines.push(`${payLabel}每人${fmt(c.rows[fullCharge[0].id] || 0)}元`);
    }
    // 只打部分時段者：金額相同的併成一行
    const groups = new Map<number, string[]>();
    partialCharge.forEach((m) => {
      const amt = c.rows[m.id] || 0;
      if (!groups.has(amt)) groups.set(amt, []);
      groups.get(amt)!.push(m.name);
    });
    [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([amt, names]) => lines.push(`${names.join("、")}${fmt(amt)}元`));
  }

  return lines.join("\n");
}

/** 舊版或缺 {明細} 的模板一律回到預設，確保數字一定會出現。 */
export function normalizeFeeTpl(tpl?: string): string {
  return tpl && tpl.indexOf("{明細}") >= 0 ? tpl : TPL_FEE;
}

/** 設定頁預覽用的範例明細。 */
export function sampleFeeDetail(): string {
  return "第一小時13人\n第二小時14人\n非固定成員每人149元\n里長、宛林72元";
}

/** 套用使用者模板，把 {明細} 換成自動算出的內容。 */
export function buildFeeNotice(state: AppState, s: SessionRec): string {
  const detail = feeDetail(state, s);
  return normalizeFeeTpl(state.settings.tplFee).replace("{明細}", () => detail);
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
  const roster = rosterOf(state, s);
  const ins = roster.filter((m) => attOf(s, m.id, allIds).status === "in");
  const lv = roster.filter((m) => attOf(s, m.id, allIds).status === "leave");
  const lines = ss.map((sl) => {
    const cts = sortCourts(sl.courts || []);
    return sl.start + " - " + endTime(sl.start) + (cts.length ? " 場地 " + cts.join("+") : "");
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
export function sampleCtx(state: AppState, kind: "open" | "fee"): Record<string, any> {
  if (kind === "open")
    return {
      日期: "8/25",
      星期: "一",
      時段清單: state.settings.defaultSlots
        .slice()
        .sort()
        .map(
          (st) =>
            st +
            " - " +
            endTime(st) +
            (state.settings.defaultCourt.length ? " 場地 " + state.settings.defaultCourt.join("、") : ""),
        )
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
