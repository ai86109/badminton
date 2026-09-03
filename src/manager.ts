import { useSyncExternalStore } from "react";
import {
  ADMIN_EMAIL,
  adminSupabase,
  clearActive,
  lastActive,
  markActive,
  REMEMBER_MS,
} from "./admin/adminSupabase";

/**
 * 主程式的「管理者」身分（層次一：畫面層閘門）。
 *
 * 沿用後台同一套 Supabase Auth——同一組密碼（email 寫死在 VITE_ADMIN_EMAIL）、
 * 同一個 storageKey，所以在主程式登入＝同時登入後台，登出亦然（單一登入）。
 * 也沿用後台「30 天記住這台裝置」的滑動視窗。
 *
 * ⚠️ 注意：主資料表對 anon 仍開放讀寫，這層只擋「誤觸」，不是真正的權限控管。
 */
let managerState = false;
const listeners = new Set<() => void>();

function setManager(v: boolean): void {
  if (v === managerState) return;
  managerState = v;
  listeners.forEach((l) => l());
}

let inited = false;
function ensureInit(): void {
  if (inited || !adminSupabase) return;
  inited = true;
  // 開啟 App 時檢查既有 session ＋ 30 天滑動視窗（跟 AdminApp 一致）。
  adminSupabase.auth.getSession().then(({ data }) => {
    if (!data.session) {
      setManager(false);
      return;
    }
    const last = lastActive();
    if (last === null || Date.now() - last <= REMEMBER_MS) {
      markActive(); // 有用就續
      setManager(true);
    } else {
      adminSupabase!.auth.signOut().finally(() => {
        clearActive();
        setManager(false);
      });
    }
  });
  // 只處理登出（登入由 managerLogin 明確設定，避免與逾期檢查競爭）。
  adminSupabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") setManager(false);
  });
}

function subscribe(cb: () => void): () => void {
  ensureInit();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot(): boolean {
  return managerState;
}

/** 是否為管理者（隨登入／登出即時更新）。 */
export function useManager(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export type ManagerLoginResult = { ok: true } | { ok: false; reason: "config" | "wrong" };

/** 用密碼登入（沿用 admin 帳號）。 */
export async function managerLogin(pw: string): Promise<ManagerLoginResult> {
  if (!adminSupabase || !ADMIN_EMAIL) return { ok: false, reason: "config" };
  const { error } = await adminSupabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pw });
  if (error) return { ok: false, reason: "wrong" };
  markActive();
  setManager(true);
  return { ok: true };
}

/** 登出。 */
export async function managerLogout(): Promise<void> {
  clearActive();
  if (adminSupabase) await adminSupabase.auth.signOut();
  setManager(false);
}

// App 載入時就先啟動 session 檢查，減少開設定頁時的閃爍。
ensureInit();
