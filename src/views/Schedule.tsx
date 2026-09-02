import { useStore } from "../store";
import {
  compute,
  daySlotLines,
  dparts,
  ensureDay,
  mmdd,
  pastPlays,
  sessById,
  todayIso,
  upcomingList,
  wd,
} from "../logic";

function SchedCard({ iso }: { iso: string }) {
  const { state, update, setUi } = useStore();
  const r = sessById(state, iso);
  const att = r ? compute(state, r).inCount : state.members.length;
  const lines = daySlotLines(state, iso);
  function open() {
    update((s) => {
      ensureDay(s, iso);
    });
    setUi({ view: "session", openId: iso });
  }
  return (
    <button className="sess" onClick={open}>
      <div className="date-chip">
        <div className="d num">{mmdd(iso)}</div>
        <div className="w">週{wd(iso)}</div>
      </div>
      <div className="sess-main">
        <div className="slot-lines">
          {lines.map((x, i) => (
            <div className="slot-line" key={i}>
              <span className="sl-t">{x.t}</span>
              <span className="sl-c">{x.c ? x.c + " 號" : "—"}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="att-badge">
        <b className="num">{att}</b>
        <span>出席</span>
      </div>
      <div className="sess-arrow">›</div>
    </button>
  );
}

function RestCard({ iso }: { iso: string }) {
  return (
    <div className="sess rest">
      <div className="date-chip">
        <div className="d num">{mmdd(iso)}</div>
        <div className="w">週{wd(iso)}</div>
      </div>
      <div className="sess-main">
        <div className="rest-label">休息</div>
      </div>
    </div>
  );
}

export default function Schedule() {
  const { state, setUi } = useStore();
  const ups = upcomingList(state, 6);
  const past = pastPlays(state, 2);

  function openCalendar() {
    const t = dparts(todayIso());
    setUi({ view: "calendar", calY: t.getFullYear(), calM: t.getMonth() });
  }

  return (
    <>
      <div className="topbar">
        <div className="logo"><img src="/apple-touch-icon.png" alt="打羽球摟" /></div>
        <div>
          <h1>打羽球摟</h1>
        </div>
        <button className="gear" onClick={() => setUi({ view: "settings" })} aria-label="設定">
          ⚙️
        </button>
      </div>
      <div className="screen">
        <button className="btn btn-solid btn-block" onClick={openCalendar}>
          編輯日曆
        </button>
        <div className="section-h">
          <h2>即將到來</h2>
        </div>
        {ups.length ? (
          ups.map((u) => (u.play ? <SchedCard iso={u.iso} key={u.iso} /> : <RestCard iso={u.iso} key={u.iso} />))
        ) : (
          <div className="empty">日曆上沒有安排打球日，點上面編輯日曆。</div>
        )}
        {past.length > 0 && (
          <>
            <div className="section-h">
              <h2>已結束</h2>
            </div>
            {past.map((iso) => (
              <SchedCard iso={iso} key={iso} />
            ))}
          </>
        )}
      </div>
    </>
  );
}
