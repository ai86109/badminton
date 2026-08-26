/**
 * 管理後台（骨架）。目前是空殼，之後在這裡放後台功能。
 * 沿用主 App 的 Warm Canvas 設計系統（styles.css）。
 */
export default function AdminApp() {
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
      </div>
      <div className="screen no-nav">
        <div className="card">
          <div className="clabel">建置中</div>
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.7 }}>
            這是後台的骨架頁面。之後要放的功能（例如成員管理、歷史帳目、匯出等）會加在這裡。
          </p>
        </div>
      </div>
    </div>
  );
}
