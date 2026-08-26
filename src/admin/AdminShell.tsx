import { useState, type ReactNode } from "react";

/**
 * 登入後的後台外框。
 * 底部兩個分頁：帳務／統計。設定跟主 App 一樣放右上角齒輪（有返回鍵、不佔底部導覽）。
 * 內容目前留空（只有版型與導覽）；登出放在「設定」頁裡。
 */
type Tab = "billing" | "stats";

// --- 導覽用的線條 icon（沿用主 App 的 .navbtn svg 樣式）---
const IconBilling = (
  <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.4" />
  </svg>
);
const IconStats = (
  <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="20" x2="5" y2="12" />
    <line x1="12" y1="20" x2="12" y2="6" />
    <line x1="19" y1="20" x2="19" y2="15" />
  </svg>
);
const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: "billing", label: "帳務", icon: IconBilling },
  { key: "stats", label: "統計", icon: IconStats },
];

/** 分頁的頂列：admin icon + 標題 + 右上角齒輪（進入設定）。 */
function AdminTopbar({ title, onGear }: { title: string; onGear: () => void }) {
  return (
    <div className="topbar">
      <div className="logo">
        <img src="/admin-apple-touch-icon.png" alt="羽球後台" />
      </div>
      <div>
        <h1>{title}</h1>
      </div>
      <button className="gear" onClick={onGear} aria-label="設定" title="設定">
        ⚙️
      </button>
    </div>
  );
}

/** 空頁的暫時內容，之後把功能填進來。 */
function Placeholder({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="card">
      <div className="clabel">{title}</div>
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.7 }}>{hint}</p>
    </div>
  );
}

function BillingPage({ onGear }: { onGear: () => void }) {
  return (
    <>
      <AdminTopbar title="帳務" onGear={onGear} />
      <div className="screen">
        <Placeholder title="建置中" hint="這裡之後放收支明細、對帳、每人結算等帳務功能。" />
      </div>
    </>
  );
}

function StatsPage({ onGear }: { onGear: () => void }) {
  return (
    <>
      <AdminTopbar title="統計" onGear={onGear} />
      <div className="screen">
        <Placeholder title="建置中" hint="這裡之後放出席率、場地費趨勢、每月統計等圖表。" />
      </div>
    </>
  );
}

/** 設定頁：跟主 App 一樣，左上角返回鍵、不顯示底部導覽。登出放這裡。 */
function SettingsPage({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  return (
    <>
      <div className="topbar">
        <button className="back" onClick={onBack} aria-label="返回">
          ‹
        </button>
        <div>
          <h1>設定</h1>
        </div>
      </div>
      <div className="screen no-nav">
        <Placeholder title="建置中" hint="這裡之後放後台專用的設定選項。" />
        <button className="btn btn-ghost btn-block" onClick={onLogout}>
          登出此裝置
        </button>
      </div>
    </>
  );
}

function AdminNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <nav className="bottomnav">
      <div className="bottomnav-inner">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={"navbtn" + (tab === t.key ? " on" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export default function AdminShell({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("billing");
  const [settings, setSettings] = useState(false);

  if (settings) {
    return (
      <div className="app">
        <SettingsPage onBack={() => setSettings(false)} onLogout={onLogout} />
      </div>
    );
  }

  return (
    <>
      <div className="app">
        {tab === "billing" && <BillingPage onGear={() => setSettings(true)} />}
        {tab === "stats" && <StatsPage onGear={() => setSettings(true)} />}
      </div>
      <AdminNav tab={tab} setTab={setTab} />
    </>
  );
}
