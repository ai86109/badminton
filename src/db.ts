import { supabase } from "./supabaseClient";
import {
  defaultSettings,
  migrate,
  normalizeFeeTpl,
  normalizeRosters,
  seedState,
  TPL_OPEN,
} from "./logic";
import type { AppState, Member, SessionRec, Settings, Slot } from "./types";

const LS_KEY = "badminton-captain-shared-v1";

/** Reject if a promise takes longer than `ms` — so a dead connection never hangs the app. */
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// ---------------- mappers ----------------
function settingsToRow(s: Settings) {
  return {
    id: 1,
    play_weekday: s.playWeekday,
    hourly_rate: s.hourlyRate,
    default_court: s.defaultCourt,
    default_slots: s.defaultSlots,
    tpl_open: s.tplOpen,
    tpl_fee: s.tplFee,
    updated_at: new Date().toISOString(),
  };
}
function toCourtArray(v: any, dflt: string[]): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) return [v]; // 相容：舊的單一 text 欄
  return dflt;
}
function rowToSettings(r: any): Settings {
  const d = defaultSettings();
  return {
    playWeekday: r.play_weekday ?? d.playWeekday,
    hourlyRate: r.hourly_rate ?? d.hourlyRate,
    defaultCourt: toCourtArray(r.default_court, d.defaultCourt),
    defaultSlots: r.default_slots && r.default_slots.length ? r.default_slots : d.defaultSlots,
    tplOpen: r.tpl_open || TPL_OPEN,
    tplFee: normalizeFeeTpl(r.tpl_fee),
  };
}

interface AttRow {
  member_id: string;
  status: "in" | "leave";
  slots: string[];
  paid: boolean;
}
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}
/** Only members whose state differs from the default (in / all slots / unpaid) get a row. */
function desiredAttRows(sess: SessionRec | undefined, allSlotIds: string[]): AttRow[] {
  if (!sess) return [];
  const ids = new Set<string>([...Object.keys(sess.attend || {}), ...Object.keys(sess.paid || {})]);
  const rows: AttRow[] = [];
  ids.forEach((mid) => {
    const a = sess.attend[mid];
    const status = (a?.status ?? "in") as "in" | "leave";
    const slots = a?.slots ?? allSlotIds;
    const paid = !!sess.paid[mid];
    const isDefault = status === "in" && sameSet(slots, allSlotIds) && !paid;
    if (!isDefault) rows.push({ member_id: mid, status, slots, paid });
  });
  return rows;
}

// ---------------- load ----------------
export async function loadAll(): Promise<AppState> {
  if (!supabase) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    return seedState();
  }

  const [sRes, mRes, seRes, slRes, aRes] = await withTimeout(
    Promise.all([
      supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("members").select("*"),
      supabase.from("sessions").select("*"),
      supabase.from("session_slots").select("*"),
      supabase.from("attendance").select("*"),
    ]),
    12000,
  );

  const firstErr = [sRes, mRes, seRes, slRes, aRes].find((r) => r.error);
  if (firstErr && firstErr.error) throw firstErr.error;

  let settings: Settings;
  if (sRes.data) settings = rowToSettings(sRes.data);
  else {
    settings = defaultSettings();
    await supabase.from("settings").upsert(settingsToRow(settings));
  }

  const members: Member[] = (mRes.data || []).map((m: any) => ({
    id: m.id,
    name: m.name,
    level: m.level === "fixed" ? "fixed" : "floating",
  }));

  const slotsByDate: Record<string, Slot[]> = {};
  (slRes.data || []).forEach((sl: any) => {
    (slotsByDate[sl.session_date] ||= []).push({
      id: sl.id,
      start: sl.start_time,
      courts: sl.courts || [],
    });
  });
  const attByDate: Record<string, any[]> = {};
  (aRes.data || []).forEach((a: any) => {
    (attByDate[a.session_date] ||= []).push(a);
  });

  const staleSlotDates: string[] = [];
  const sessions: SessionRec[] = (seRes.data || []).map((s: any) => {
    const attend: SessionRec["attend"] = {};
    const paid: SessionRec["paid"] = {};
    (attByDate[s.date] || []).forEach((a: any) => {
      attend[a.member_id] = { status: a.status, slots: a.slots || [] };
      if (a.paid) paid[a.member_id] = true;
    });
    const stored = slotsByDate[s.date] || [];
    const rec: SessionRec = {
      id: s.date,
      date: s.date,
      status: s.status,
      // `locked` column may be absent on legacy rows → fall back to "has data".
      locked: !!s.locked || Object.keys(attend).length > 0 || Object.keys(paid).length > 0,
      roster: Array.isArray(s.roster) && s.roster.length ? s.roster : undefined,
      slots: stored,
      attend,
      paid,
    };
    // Untouched (unlocked) days follow the current settings, so drop any stale
    // snapshot slots left from before this day was used.
    if (!rec.locked) {
      if (stored.length) staleSlotDates.push(s.date);
      rec.slots = [];
    }
    return rec;
  });

  // one-time cleanup of orphaned slots for unlocked days
  if (staleSlotDates.length) {
    const sb = supabase;
    staleSlotDates.forEach((d) => {
      sb.from("session_slots").delete().eq("session_date", d);
    });
  }

  const st = { settings, members, sessions };
  // freeze/sync roster snapshots (past days stay frozen, today/future follow live)
  normalizeRosters(st);
  return st;
}

// ---------------- save (diff prev -> next, write only what changed) ----------------
export function applyChanges(prev: AppState, next: AppState): void {
  if (!supabase) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    return;
  }
  const sb = supabase;
  const ops: PromiseLike<any>[] = [];

  // settings
  if (JSON.stringify(prev.settings) !== JSON.stringify(next.settings))
    ops.push(sb.from("settings").upsert(settingsToRow(next.settings)));

  // members
  const prevM = new Map(prev.members.map((m) => [m.id, m]));
  const nextM = new Map(next.members.map((m) => [m.id, m]));
  next.members.forEach((m) => {
    const p = prevM.get(m.id);
    if (!p || p.name !== m.name || p.level !== m.level)
      ops.push(sb.from("members").upsert({ id: m.id, name: m.name, level: m.level }));
  });
  prev.members.forEach((m) => {
    if (!nextM.has(m.id)) ops.push(sb.from("members").delete().eq("id", m.id));
  });

  // sessions (+ nested slots + attendance)
  const prevS = new Map(prev.sessions.map((s) => [s.date, s]));
  const nextS = new Map(next.sessions.map((s) => [s.date, s]));
  next.sessions.forEach((s) => {
    const p = prevS.get(s.date);
    const rosterVal = s.roster ?? null;
    if (
      !p ||
      p.status !== s.status ||
      !!p.locked !== !!s.locked ||
      JSON.stringify(p.roster ?? null) !== JSON.stringify(rosterVal)
    )
      ops.push(
        sb.from("sessions").upsert({ date: s.date, status: s.status, locked: !!s.locked, roster: rosterVal }),
      );

    // slots — only persisted for locked days; unlocked days follow settings live
    const nextSlots = s.locked ? s.slots : [];
    const prevSlots = p && p.locked ? p.slots : [];
    const pSlots = new Map(prevSlots.map((sl) => [sl.id, sl]));
    const nSlots = new Map(nextSlots.map((sl) => [sl.id, sl]));
    nextSlots.forEach((sl) => {
      const pp = pSlots.get(sl.id);
      if (!pp || pp.start !== sl.start || JSON.stringify(pp.courts) !== JSON.stringify(sl.courts))
        ops.push(
          sb.from("session_slots").upsert({
            id: sl.id,
            session_date: s.date,
            start_time: sl.start,
            courts: sl.courts,
          }),
        );
    });
    prevSlots.forEach((sl) => {
      if (!nSlots.has(sl.id)) ops.push(sb.from("session_slots").delete().eq("id", sl.id));
    });

    // attendance
    const allSlotIds = nextSlots.map((x) => x.id);
    const prevRows = desiredAttRows(p, prevSlots.map((x) => x.id));
    const nextRows = desiredAttRows(s, allSlotIds);
    const prevR = new Map(prevRows.map((r) => [r.member_id, r]));
    const nextR = new Map(nextRows.map((r) => [r.member_id, r]));
    nextRows.forEach((r) => {
      const pp = prevR.get(r.member_id);
      if (
        !pp ||
        pp.status !== r.status ||
        pp.paid !== r.paid ||
        JSON.stringify(pp.slots) !== JSON.stringify(r.slots)
      )
        ops.push(
          sb.from("attendance").upsert(
            {
              session_date: s.date,
              member_id: r.member_id,
              status: r.status,
              slots: r.slots,
              paid: r.paid,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "session_date,member_id" },
          ),
        );
    });
    prevRows.forEach((r) => {
      if (!nextR.has(r.member_id))
        ops.push(
          sb.from("attendance").delete().eq("session_date", s.date).eq("member_id", r.member_id),
        );
    });
  });
  prev.sessions.forEach((s) => {
    if (!nextS.has(s.date)) ops.push(sb.from("sessions").delete().eq("date", s.date));
  });

  Promise.allSettled(ops);
}

// ---------------- realtime ----------------
export function subscribeRealtime(onRemote: () => void): () => void {
  if (!supabase) return () => {};
  const sb = supabase;
  const ch = sb.channel("shared-data");
  ["settings", "members", "sessions", "session_slots", "attendance"].forEach((table) => {
    ch.on("postgres_changes", { event: "*", schema: "public", table }, onRemote);
  });
  ch.subscribe();
  return () => {
    sb.removeChannel(ch);
  };
}
