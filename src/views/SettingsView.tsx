import { useRef } from "react";
import { useStore } from "../store";
import { buildNotice, endTime, fmt, rate, sampleCtx, TPL_OPEN, WD } from "../logic";

const OPEN_TOKENS = ["日期", "星期", "時段清單", "出席人數", "出席名單", "請假人數", "請假名單"];

export default function SettingsView() {
  const { state, update, setUi } = useStore();
  const st = state.settings;
  const r = rate(st);
  const slots = st.defaultSlots.slice().sort();
  const openRef = useRef<HTMLTextAreaElement>(null);

  function insertToken(tok: string) {
    const ta = openRef.current;
    if (!ta) return;
    const a = ta.selectionStart ?? ta.value.length;
    const b = ta.selectionEnd ?? ta.value.length;
    const next = ta.value.slice(0, a) + "{" + tok + "}" + ta.value.slice(b);
    update((s) => {
      s.settings.tplOpen = next;
    });
    requestAnimationFrame(() => {
      ta.focus();
      const pos = a + tok.length + 2;
      ta.selectionStart = ta.selectionEnd = pos;
    });
  }

  return (
    <>
      <div className="topbar">
        <button className="back" onClick={() => setUi({ view: "schedule" })}>
          ‹
        </button>
        <div>
          <h1>設定</h1>
          <p>整隊通用的預設值</p>
        </div>
      </div>
      <div className="screen no-nav">
        {/* 固定打球日 */}
        <div className="card">
          <div className="clabel">固定打球日</div>
          <div className="field-lbl">每週固定星期幾開打</div>
          <div className="lvseg wk">
            {WD.map((w, i) => (
              <button
                key={i}
                className={+st.playWeekday === i ? "on" : ""}
                onClick={() =>
                  update((s) => {
                    s.settings.playWeekday = i;
                  })
                }
              >
                {w}
              </button>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            日曆上這天預設「會打」，其他天預設休息，都可在日曆手動調整。
          </div>
        </div>

        {/* 場地費 */}
        <div className="card">
          <div className="clabel">場地費</div>
          <div className="field">
            <div className="field-lbl">場地一小時多少錢</div>
            <div className="rate-wrap">
              <input
                className="num"
                type="number"
                inputMode="numeric"
                min={0}
                step={10}
                value={st.hourlyRate}
                onChange={(e) =>
                  update((s) => {
                    s.settings.hourlyRate = Number(e.target.value) || 0;
                  })
                }
              />
            </div>
          </div>
          <div className="field">
            <div className="field-lbl">預設場地號碼</div>
            <input
              className="num"
              type="text"
              inputMode="numeric"
              value={st.defaultCourt}
              onChange={(e) =>
                update((s) => {
                  s.settings.defaultCourt = e.target.value;
                })
              }
            />
          </div>
          <div className="hint">
            每個時段固定 1 小時，場地費 = 場地數 × 每小時金額。新增打球日時，每個時段預設用這個場地號碼，該場次裡可再手動加場地。改每小時金額，所有場次都會跟著重算。金額不整除時一律<b>無條件進位</b>。
          </div>
        </div>

        {/* 打的時段 */}
        <div className="card">
          <div className="clabel">打的時段（預設）</div>
          {slots.map((start, i) => (
            <div className="slot-row" key={i}>
              <input
                className="st"
                type="time"
                value={start}
                onChange={(e) =>
                  update((s) => {
                    const arr = s.settings.defaultSlots.slice().sort();
                    arr[i] = e.target.value;
                    s.settings.defaultSlots = arr;
                  })
                }
              />
              <div className="slot-range">
                ～ <b>{endTime(start)}</b>（1 小時）
              </div>
              <span className="slot-fee num">{fmt(r)}</span>
              <button
                className="icon-btn"
                aria-label="刪除"
                onClick={() =>
                  update((s) => {
                    const arr = s.settings.defaultSlots.slice().sort();
                    arr.splice(i, 1);
                    s.settings.defaultSlots = arr;
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <div
            className="add-line"
            onClick={() =>
              update((s) => {
                s.settings.defaultSlots.push("22:00");
              })
            }
          >
            <span className="plus">+</span>再加一個時段
          </div>
          <div className="slot-sum">
            預設每場 <b>{slots.length}</b> 個時段（每段 1 小時）· 場地費合計 ≈{" "}
            <b className="num">${fmt(slots.length * r)}</b>
          </div>
        </div>

        {/* 開打通知模板 */}
        <div className="card">
          <div className="clabel">開打通知模板</div>
          <textarea
            ref={openRef}
            spellCheck={false}
            value={st.tplOpen}
            onChange={(e) =>
              update((s) => {
                s.settings.tplOpen = e.target.value;
              })
            }
          />
          <div className="legend">
            {OPEN_TOKENS.map((t) => (
              <button className="tk" key={t} onClick={() => insertToken(t)}>
                {"{" + t + "}"}
              </button>
            ))}
          </div>
          <div className="hint">點標籤可插入變數。沒有人請假時，含「請假」那行會自動省略。</div>
          <div className="preview">
            <div className="plabel">預覽</div>
            <div>{buildNotice(st.tplOpen, sampleCtx(state, "open"))}</div>
          </div>
          <button
            className="link"
            style={{ marginTop: 10 }}
            onClick={() =>
              update((s) => {
                s.settings.tplOpen = TPL_OPEN;
              })
            }
          >
            ↺ 回復預設模板
          </button>
        </div>

        {/* 收費通知 */}
        <div className="card">
          <div className="clabel">收費通知</div>
          <div className="hint">
            收費通知會依當天實際出席自動產生，不需模板：大家都打滿全部時段時，顯示總人數與每人金額；有人只打其中一個時段時，會列出各時段人數、打滿者的金額，以及只打單一時段者的名字與金額。到某一天的頁面按「產生收費通知」即可複製。
          </div>
        </div>

        <div className="foot">設定會即時套用到算錢與通知</div>
      </div>
    </>
  );
}
