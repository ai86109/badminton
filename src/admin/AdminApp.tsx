import { useEffect, useState, type FormEvent } from "react";
import {
  ADMIN_EMAIL,
  adminSupabase,
  clearActive,
  lastActive,
  markActive,
  REMEMBER_MS,
} from "./adminSupabase";

/** 後台空殼（登入後看到的內容）。之後的管理功能加在這裡。 */
function AdminShell({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="app">
      <div className="topbar">
        <div className="logo">
          <img src="/admin-apple-touch-icon.png" alt="羽球後台" />
        </div>
        <div>
          <h1>管理後台</h1>
          <p>打羽球摟 · admin</p>
        </div>
        <button className="gear" onClick={onLogout} aria-label="登出" title="登出此裝置">
          ⏻
        </button>
      </div>
      <div className="screen no-nav">
        <div className="card">
          <div className="clabel">建置中</div>
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.7 }}>
            這是後台的骨架頁面。之後要放的功能（每項都會是新的資料表、並設成只有 admin
            能存取）會加在這裡。
          </p>
        </div>
      </div>
    </div>
  );
}

/** 密碼登入畫面（只問密碼，email 從環境變數帶入）。 */
function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!adminSupabase) {
      setErr("後台需要連上 Supabase（缺少環境變數）。");
      return;
    }
    if (!ADMIN_EMAIL) {
      setErr("尚未設定 admin 帳號（缺少 VITE_ADMIN_EMAIL）。");
      return;
    }
    if (!pw) return;
    setBusy(true);
    const { error } = await adminSupabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: pw,
    });
    setBusy(false);
    if (error) {
      setErr("密碼錯誤，請再試一次。");
      setPw("");
      return;
    }
    markActive();
    onSuccess();
  }

  return (
    <div className="app">
      <div className="login">
        <div
          className="login-logo"
          style={{ overflow: "hidden", background: "transparent" }}
        >
          <img
            src="/admin-apple-touch-icon.png"
            alt="羽球後台"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
        <h1 className="login-title">管理後台</h1>
        <p className="login-sub">請輸入管理密碼。通過後這台裝置 30 天內免再輸入。</p>
        <form className="login-card card" onSubmit={submit}>
          <div className="field-lbl">管理密碼</div>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="輸入密碼"
            autoFocus
            autoComplete="current-password"
          />
          {err && <div className="login-err">{err}</div>}
          <button
            className="btn btn-solid btn-block"
            type="submit"
            disabled={busy}
            style={{ marginTop: 13 }}
          >
            {busy ? "登入中…" : "進入後台"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminApp() {
  // null = 檢查中；true = 已登入；false = 需要密碼
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    if (!adminSupabase) {
      setAuthed(false);
      return;
    }
    adminSupabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (!data.session) {
        setAuthed(false);
        return;
      }
      // 有 session：套用 30 天滑動視窗
      const last = lastActive();
      if (last === null || Date.now() - last <= REMEMBER_MS) {
        markActive(); // 有用就續
        setAuthed(true);
      } else {
        // 超過 30 天沒開過 → 逾期，要求重打
        adminSupabase!.auth.signOut().finally(() => {
          if (!alive) return;
          clearActive();
          setAuthed(false);
        });
      }
    });
    const { data: sub } = adminSupabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && alive) setAuthed(false);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    if (adminSupabase) await adminSupabase.auth.signOut();
    clearActive();
    setAuthed(false);
  }

  if (authed === null) return <div className="app" />;
  if (!authed) return <AdminLogin onSuccess={() => setAuthed(true)} />;
  return <AdminShell onLogout={logout} />;
}
