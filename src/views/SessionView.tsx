import { useEffect } from "react";
import { useStore } from "../store";
import {
  attOf,
  buildNotice,
  compute,
  ctxFee,
  ctxOpen,
  effectiveSlots,
  endTime,
  fmt,
  LV,
  lockSlots,
  mmdd,
  sessById,
  slotLabel,
  wd,
} from "../logic";

async function copyText(text: string, ok: () => void) {
  try {
    await navigator.clipboard.writeText(text);
    ok();
    return;
  } catch {
    /* fallback below */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    ok();
  } catch {
    /* ignore */
  }
  document.body.removeChild(ta);
}

export default function SessionView() {
  const { state, update, ui, setUi, toast } = useStore();
  const s = ui.openId ? sessById(state, ui.openId) : null;

  useEffect(() => {
    if (!s) setUi({ view: "schedule" });
  }, [s, setUi]);
  if (!s) return null;

  const c = compute(state, s);
  const ss = effectiveSlots(state, s);
  const allIds = ss.map((x) => x.id);
  const paidCount = c.paidCount;
  const headSpan = ss.length ? ss[0].start + "–" + endTime(ss[ss.length - 1].start) : "打球日";

  const findSess = (st: typeof state) => st.sessions.find((x) => x.id === s!.id);

  function editCourt(slotId: string, i: number, val: string) {
    update((st) => {
      const sess = findSess(st);
      if (!sess) return;
      lockSlots(st, sess);
      const sl = sess.slots.find((x) => x.id === slotId);
      if (sl && sl.courts) sl.courts[i] = val;
    });
  }
  function addCourt(slotId: string) {
    update((st) => {
      const sess = findSess(st);
      if (!sess) return;
      lockSlots(st, sess);
      const sl = sess.slots.find((x) => x.id === slotId);
      if (!sl) return;
      if (!sl.courts) sl.courts = [];
      const nums = sl.courts.map((x) => parseInt(x, 10)).filter((n) => !isNaN(n));
      const next = nums.length ? Math.max(...nums) + 1 : parseInt(state.settings.defaultCourt, 10) || 1;
      sl.courts.push(String(next));
    });
  }
  function delCourt(slotId: string, i: number) {
    update((st) => {
      const sess = findSess(st);
      if (!sess) return;
      lockSlots(st, sess);
      const sl = sess.slots.find((x) => x.id === slotId);
      if (sl && sl.courts && sl.courts.length > 1) sl.courts.splice(i, 1);
    });
  }
  function toggleAtt(id: string) {
    update((st) => {
      const sess = findSess(st);
      if (!sess) return;
      lockSlots(st, sess);
      const ids = sess.slots.map((x) => x.id);
      const cur = attOf(sess, id, ids).status;
      sess.attend[id] =
        cur === "in" ? { status: "leave", slots: [] } : { status: "in", slots: ids };
    });
  }
  function toggleSlot(memberId: string, slotId: string) {
    update((st) => {
      const sess = findSess(st);
      if (!sess) return;
      lockSlots(st, sess);
      const ids = sess.slots.map((x) => x.id);
      if (!sess.attend[memberId]) sess.attend[memberId] = { status: "in", slots: ids };
      const arr = sess.attend[memberId].slots;
      const idx = arr.indexOf(slotId);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(slotId);
    });
  }
  function togglePaid(id: string) {
    update((st) => {
      const sess = findSess(st);
      if (!sess) return;
      lockSlots(st, sess);
      sess.paid[id] = !sess.paid[id];
    });
  }

  return (
    <>
      <div className="topbar">
        <button className="back" onClick={() => setUi({ view: "schedule" })}>
          ‹
        </button>
        <div>
          <h1>
            {mmdd(s.date)}（週{wd(s.date)}）
          </h1>
          <p>{headSpan}</p>
        </div>
      </div>
      <div className="screen has-bar">
        {/* 打球時段 */}
        <div className="card">
          <div className="clabel">打球時段</div>
          {ss.length ? (
            ss.map((sl) => (
              <div className="slot-blk" key={sl.id}>
                <div className="slot-head">
                  <span className="slot-time num">{slotLabel(sl.start)}</span>
                </div>
                <div className="court-row">
                  {(sl.courts || [])
                    .map((cn, ci) => ({ cn, ci }))
                    .sort((a, b) => (parseInt(a.cn, 10) || 0) - (parseInt(b.cn, 10) || 0))
                    .map(({ cn, ci }) => (
                      <span className="court-chip" key={ci}>
                        <input
                          className="court-in num"
                          type="text"
                          inputMode="numeric"
                          aria-label="場地號碼"
                          value={cn}
                          onChange={(e) => editCourt(sl.id, ci, e.target.value)}
                        />
                        <span className="court-suffix">號</span>
                        {(sl.courts || []).length > 1 && (
                          <button
                            className="court-x"
                            aria-label="移除場地"
                            onClick={() => delCourt(sl.id, ci)}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  <button className="add-court" onClick={() => addCourt(sl.id)}>
                    ＋ 加場地
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              尚未安排時段，到設定裡調整預設時段就會自動帶進來。
            </div>
          )}
          <div className="notice-btn-wrap">
            <button
              className="btn btn-ghost btn-block"
              onClick={() =>
                copyText(buildNotice(state.settings.tplOpen, ctxOpen(state, s)), () =>
                  toast("場地通知已複製"),
                )
              }
            >
              📢 複製場地通知
            </button>
          </div>
        </div>

        {/* 今天誰來 */}
        <div className="card">
          <div className="clabel">
            今天誰來
            <span className="r att-count">
              出席 {c.inCount} · 請假 {c.leaveCount}
            </span>
          </div>
          {state.members.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              還沒有成員，先到「成員」分頁加人。
            </div>
          )}
          {[...state.members]
            .sort((a, b) => (a.level === "fixed" ? 0 : 1) - (b.level === "fixed" ? 0 : 1))
            .map((m) => {
            const a = attOf(s, m.id, allIds);
            const isIn = a.status === "in";
            const lvcls = m.level === "fixed" ? "fixed" : "";
            return (
              <div className="prow" key={m.id}>
                <button className={"att-toggle " + (isIn ? "in" : "leave")} onClick={() => toggleAtt(m.id)}>
                  {isIn ? "出席" : "請假"}
                </button>
                <div className="p-body">
                  <div className="p-name">
                    {m.name} <span className={"lvtag " + lvcls}>{LV[m.level]}</span>
                  </div>
                  {isIn && ss.length > 1 && (
                    <div className="slot-chips">
                      {ss.map((sl) => (
                        <span
                          key={sl.id}
                          className={"schip " + ((a.slots || []).indexOf(sl.id) >= 0 ? "on" : "")}
                          onClick={() => toggleSlot(m.id, sl.id)}
                        >
                          {slotLabel(sl.start)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-right">
                  {isIn && m.level === "fixed" ? (
                    <div className="p-note">隊費</div>
                  ) : isIn ? (
                    <>
                      <div className="p-amt num">{fmt(c.rows[m.id] || 0)}</div>
                      <span
                        className={"paybtn " + (s.paid[m.id] ? "paid" : "")}
                        onClick={() => togglePaid(m.id)}
                      >
                        {s.paid[m.id] ? "已收 ✓" : "未收"}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* action bar */}
      <div className="actionbar">
        <div className="actionbar-inner">
          <div className="sum-grid">
            <div className="sum-block">
              <div className="k">每人約</div>
              <div className="v money num">{fmt(c.per)}</div>
            </div>
            <div className="sum-block">
              <div className="k">已收 / 應收</div>
              <div className="v num">
                {paidCount}
                <small> / {c.collectCount} 人</small>
              </div>
            </div>
            <div className="sum-block divide">
              <div className="k">應收合計</div>
              <div className="v money num">{fmt(c.grand)}</div>
            </div>
          </div>
          <div className="bar-btns">
            <button
              className="btn btn-solid"
              onClick={() =>
                copyText(buildNotice(state.settings.tplFee, ctxFee(state, s)), () =>
                  toast("收費通知已複製，貼到群組吧"),
                )
              }
            >
              💰 產生收費通知
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
