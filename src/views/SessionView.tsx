import { useEffect, useState } from "react";
import { useStore } from "../store";
import { useManager } from "../manager";
import {
  attOf,
  buildFeeNotice,
  buildNotice,
  cloneRoster,
  compute,
  ctxOpen,
  effectiveSlots,
  endTime,
  fmt,
  LV,
  lockSlots,
  mmdd,
  rosterOf,
  sessById,
  slotLabel,
  uid,
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
  const isManager = useManager();
  const [tempName, setTempName] = useState("");
  const s = ui.openId ? sessById(state, ui.openId) : null;

  useEffect(() => {
    if (!s) setUi({ view: "schedule" });
  }, [s, setUi]);
  if (!s) return null;

  const c = compute(state, s);
  const seasonRent = s.seasonRent !== false; // 預設季租
  const ss = effectiveSlots(state, s);
  const allIds = ss.map((x) => x.id);
  const paidCount = c.paidCount;
  const headSpan = ss.length ? ss[0].start + "–" + endTime(ss[ss.length - 1].start) : "打球日";
  const liveIds = new Set(state.members.map((m) => m.id));

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
      const next = nums.length
        ? Math.max(...nums) + 1
        : parseInt(state.settings.defaultCourt[0] ?? "1", 10) || 1;
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
  function addTemp() {
    const n = tempName.trim();
    if (!n) return;
    update((st) => {
      const sess = findSess(st);
      if (!sess) return;
      lockSlots(st, sess);
      if (!sess.roster || !sess.roster.length) sess.roster = cloneRoster(st.members);
      sess.roster.push({ id: uid(), name: n, level: "floating" });
    });
    setTempName("");
  }
  function delTemp(id: string) {
    update((st) => {
      const sess = findSess(st);
      if (!sess) return;
      if (sess.roster) sess.roster = sess.roster.filter((m) => m.id !== id);
      delete sess.attend[id];
      delete sess.paid[id];
    });
  }
  function toggleSeasonRent() {
    update((st) => {
      const sess = findSess(st);
      if (!sess) return;
      lockSlots(st, sess);
      sess.seasonRent = sess.seasonRent === false; // 切換：預設季租(true) ↔ 非季租(false)
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
            {mmdd(s.date)}（{wd(s.date)}）
          </h1>
          <p>{headSpan}</p>
        </div>
      </div>
      <div className={"screen " + (isManager ? "has-bar" : "no-nav")}>
        {/* 打球時段 */}
        <div className="card">
          <div className="clabel">
            打球時段
            {!seasonRent && <span className="ss-tag">非季租</span>}
          </div>
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
                    .map(({ cn, ci }) =>
                      isManager ? (
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
                      ) : (
                        <span className="court-chip" key={ci}>
                          <span className="court-in num">{cn}</span>
                          <span className="court-suffix">號</span>
                        </span>
                      ),
                    )}
                  {isManager && (
                    <button className="add-court" onClick={() => addCourt(sl.id)}>
                      ＋ 加場地
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              尚未安排時段，到設定裡調整預設時段就會自動帶進來。
            </div>
          )}
          {isManager && (
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
          )}
        </div>

        {/* 今天誰來 */}
        <div className="card">
          <div className="clabel">
            今天誰來
            <span className="r att-count">
              出席 {c.inCount} · 請假 {c.leaveCount}
            </span>
          </div>
          {rosterOf(state, s).length === 0 && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              還沒有成員，先到「成員」分頁加人。
            </div>
          )}
          {[...rosterOf(state, s)]
            .sort((a, b) => (a.level === "fixed" ? 0 : 1) - (b.level === "fixed" ? 0 : 1))
            .map((m) => {
            const a = attOf(s, m.id, allIds);
            const isIn = a.status === "in";
            const isTemp = !liveIds.has(m.id);
            const lvcls = m.level === "fixed" ? "fixed" : "";
            return (
              <div className="prow" key={m.id}>
                <button className={"att-toggle " + (isIn ? "in" : "leave")} onClick={() => toggleAtt(m.id)}>
                  {isIn ? "出席" : "請假"}
                </button>
                <div className="p-body">
                  <div className="p-name">
                    {m.name}{" "}
                    {isTemp ? (
                      <span className="lvtag temp">臨時</span>
                    ) : (
                      <span className={"lvtag " + lvcls}>{LV[m.level]}</span>
                    )}
                    {isTemp && (
                      <button className="temp-x" aria-label="移除臨時成員" onClick={() => delTemp(m.id)}>
                        移除
                      </button>
                    )}
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
                  {isIn && m.level === "fixed" && seasonRent ? (
                    <div className="p-note">隊費</div>
                  ) : isIn ? (
                    <>
                      <div className="p-amt num">{fmt(c.rows[m.id] || 0)}</div>
                      {isManager && (
                        <span
                          className={"paybtn " + (s.paid[m.id] ? "paid" : "")}
                          onClick={() => togglePaid(m.id)}
                        >
                          {s.paid[m.id] ? "已收" : "未收"}
                        </span>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div className="temp-add">
            <input
              type="text"
              placeholder="臨時成員名字"
              autoComplete="off"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
            />
            <button className="btn btn-ghost" onClick={addTemp}>
              ＋ 臨時成員
            </button>
          </div>
        </div>

        {/* 季租日切換 */}
        {isManager && (
          <div className="card">
            <div className="clabel">場地性質</div>
            <div className="season-row">
              <div className="season-info">
                <div className="season-cur">{seasonRent ? "季租日" : "非季租日"}</div>
                <div className="season-hint">
                  {seasonRent
                    ? "固定成員不另外收費"
                    : "全部成員都要收費，固定成員請假不退款"}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={toggleSeasonRent}>
                改為{seasonRent ? "非季租日" : "季租日"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* action bar（收款區塊）：只有管理者看得到 */}
      {isManager && (
        <div className="actionbar">
          <div className="actionbar-inner bar-row">
            <button
              className="btn btn-solid bar-cta"
              onClick={() =>
                copyText(buildFeeNotice(state, s), () => toast("收款通知已複製"))
              }
            >
              💰 複製收款通知
            </button>
            <div className="bar-stat">
              <div className="k">已收 / 應收</div>
              <div className="v num">
                {paidCount}
                <small> / {c.collectCount} 人</small>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
