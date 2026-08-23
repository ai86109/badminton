import { useStore } from "../store";

export default function BottomNav() {
  const { ui, setUi } = useStore();
  return (
    <nav className="bottomnav">
      <div className="bottomnav-inner">
        <button
          className={"navbtn" + (ui.view === "schedule" ? " on" : "")}
          onClick={() => setUi({ view: "schedule" })}
        >
          <svg viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="17" rx="2" />
            <path d="M3 9h18M8 2v4M16 2v4" />
          </svg>
          排程
        </button>
        <button
          className={"navbtn" + (ui.view === "members" ? " on" : "")}
          onClick={() => setUi({ view: "members" })}
        >
          <svg viewBox="0 0 24 24">
            <circle cx="9" cy="8" r="3.2" />
            <path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 7.5a3 3 0 0 1 0 5.8M18 20a5.2 5.2 0 0 0-3-4.7" />
          </svg>
          成員
        </button>
      </div>
    </nav>
  );
}
