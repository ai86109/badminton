export type Level = "fixed" | "floating";

export interface Member {
  id: string;
  name: string;
  level: Level;
}

export interface Slot {
  id: string;
  start: string; // "HH:MM"
  courts: string[]; // court numbers
}

export type AttStatus = "in" | "leave";

export interface Att {
  status: AttStatus;
  slots: string[]; // slot ids the member joins
}

export interface SessionRec {
  id: string; // = date "YYYY-MM-DD"
  date: string;
  status: "play" | "rest";
  /**
   * When `locked` is false/absent the session has never been used, so its time
   * slots follow the current settings live. The first time someone edits its
   * courts or records attendance it "locks in": `slots` is frozen and future
   * settings changes no longer affect this day.
   */
  locked?: boolean;
  /**
   * Frozen roster snapshot for a recorded day. Once `locked` and the day has
   * passed, this list (who was on the team, and their level) is fixed, so later
   * adding/removing/renaming members never rewrites a past day's headcount or
   * money. Days that are today or in the future keep it synced to the live
   * roster; unlocked days have no snapshot and follow the live roster.
   */
  roster?: Member[];
  slots: Slot[];
  attend: Record<string, Att>;
  paid: Record<string, boolean>;
}

export interface Settings {
  playWeekday: number; // 0..6 (Sun..Sat)
  hourlyRate: number;
  defaultCourt: string;
  defaultSlots: string[]; // start times
  tplOpen: string;
  tplFee: string;
}

export interface AppState {
  settings: Settings;
  members: Member[];
  sessions: SessionRec[];
}

export type ViewName = "schedule" | "members" | "settings" | "session" | "calendar";

export interface UIState {
  view: ViewName;
  openId?: string;
  calY?: number;
  calM?: number;
}
