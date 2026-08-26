import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * 後台專用的 Supabase client。
 * 用「獨立的 storageKey」把 admin 的登入 session 跟主 App 分開存 ——
 * 這樣後台登入不會外溢到主 App（主 App 永遠維持匿名 anon 身分）。
 */
export const adminSupabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storageKey: "badminton-admin-auth",
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

/** admin 帳號的 email（寫死用途，不是機密）。從環境變數帶入，登入畫面只問密碼。 */
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

/** 「記住這台裝置」的滑動視窗：30 天內有開過就續，超過才要求重打。 */
export const REMEMBER_DAYS = 30;
export const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;
const LAST_ACTIVE_KEY = "badminton-admin-active";

export function markActive(): void {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}
export function clearActive(): void {
  try {
    localStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}
/** 上次活躍時間（毫秒）；沒有紀錄回傳 null。 */
export function lastActive(): number | null {
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
