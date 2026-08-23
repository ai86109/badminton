import { useStore } from "../store";
import { defaultStatus, effStatus, todayIso, toggleDay, WD } from "../logic";

export default function CalendarView() {
  const { state, update, ui, setUi } = useStore();
  const now = new Date();
  const y = ui.calY ?? now.getFullYear();
  const m = ui.calM ?? now.getMonth();
  const today = todayIso();

  const sd = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const cells: number[] = [];
  for (let i = 0; i < sd; i++) cells.push(0);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7) cells.push(0);

  const wkName = WD[+state.settings.playWeekday];

  function prev() {
    let nm = m - 1;
    let ny = y;
    if (nm < 0) {
      nm = 11;
      ny--;
    }
    setUi({ calM: nm, calY: ny });
  }
  function next() {
    let nm = m + 1;
    let ny = y;
    if (nm > 11) {
      nm = 0;
      ny++;
    }
    setUi({ calM: nm, calY: ny });
  }
  function tap(iso: string) {
    update((s) => toggleDay(s, iso));
  }

  return (
    <>
      <div className="topbar">
        <button className="back" onClick={() => setUi({ view: "schedule" })}>
          ‹
        </button>
        <div>
          <h1>編輯日曆</h1>
          <p>點日期切換 會打／不打</p>
        </div>
      </div>
      <div className="screen no-nav">
        <div className="cal-nav">
          <button className="cal-arrow" onClick={prev} aria-label="上個月">
            ‹
          </button>
          <div className="cal-title num">
            {y} 年 {m + 1} 月
          </div>
          <button className="cal-arrow" onClick={next} aria-label="下個月">
            ›
          </button>
        </div>
        <div className="cal-grid cal-head">
          {WD.map((w, i) => (
            <div className="cal-h" key={i}>
              {w}
            </div>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((d, i) => {
            if (!d) return <div className="cal-cell empty" key={i} />;
            const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const st = effStatus(state, iso);
            const def = defaultStatus(state, iso);
            let cls = "cal-cell";
            if (st === "play") cls += " play";
            if (def === "play" && st === "rest") cls += " off";
            if (iso === today) cls += " today";
            return (
              <button className={cls} key={i} onClick={() => tap(iso)}>
                {d}
              </button>
            );
          })}
        </div>
        <div className="cal-legend">
          <span className="lg">
            <i className="dot play" />
            會打
          </span>
          <span className="lg">
            <i className="dot off" />
            取消的週{wkName}
          </span>
          <span className="lg">
            <i className="dot today" />
            今天
          </span>
        </div>
        <div className="hint" style={{ marginTop: 16 }}>
          預設每週<b>{wkName}</b>開打（可在設定改）。點任何一天可切換打／不打；點掉的週{wkName}
          會標成灰色刪除線。
        </div>
      </div>
    </>
  );
}
