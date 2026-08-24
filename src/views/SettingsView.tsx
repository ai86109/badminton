import { useRef } from "react";
import { useStore } from "../store";
import {
  buildNotice,
  endTime,
  normalizeFeeTpl,
  sampleCtx,
  sampleFeeDetail,
  TPL_FEE,
  TPL_OPEN,
  WD,
} from "../logic";

const OPEN_TOKENS = ["日期", "星期", "時段清單", "出席人數", "出席名單", "請假人數", "請假名單"];

// 24 小時制時間選項（每 30 分鐘一個），讓起始與結束時間顯示一致，不受手機 12/24 制影響。
const TIME_OPTS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of ["00", "30"]) TIME_OPTS.push(String(h).padStart(2, "0") + ":" + m);
}

export default function SettingsView() {
  const { state, update, setUi } = useStore();
  const st = state.settings;
  const slots = st.defaultSlots.slice().sort();
  const openRef = useRef<HTMLTextAreaElement>(null);
  const feeRef = useRef<HTMLTextAreaElement>(null);

  function insertToken(which: "tplOpen" | "tplFee", tok: string) {
    const ta = which === "tplOpen" ? openRef.current : feeRef.current;
    if (!ta) return;
    const a = ta.selectionStart ?? ta.value.length;
    const b = ta.selectionEnd ?? ta.value.length;
    const next = ta.value.slice(0, a) + "{" + tok + "}" + ta.value.slice(b);
    update((s) => {
      s.settings[which] = next;
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
        </div>
      </div>
      <div className="screen no-nav">
        {/* 固定打球日 */}
        <div className="card">
          <div className="clabel">打球日</div>
          <div className="field-lbl">每週固定星期幾打</div>
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
            設定後日曆上這天預設「會打」，其他天預設休息，後續皆可在日曆手動調整。
          </div>
        </div>

        {/* 打球時段 */}
        <div className="card">
          <div className="clabel">打球時段</div>
          {slots.map((start, i) => (
            <div className="slot-row" key={i}>
              <select
                className="st num"
                value={start}
                onChange={(e) =>
                  update((s) => {
                    const arr = s.settings.defaultSlots.slice().sort();
                    arr[i] = e.target.value;
                    s.settings.defaultSlots = arr;
                  })
                }
              >
                {(TIME_OPTS.includes(start) ? TIME_OPTS : [start, ...TIME_OPTS]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="slot-range">
                ～ <b className="num">{endTime(start)}</b>
              </div>
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
        </div>

        {/* 場地 */}
        <div className="card">
          <div className="clabel">場地</div>
          <div className="field">
            <div className="field-lbl">場地金額</div>
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
        </div>

        {/* 場地通知模板 */}
        <div className="card">
          <div className="clabel">場地通知模板</div>
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
              <button className="tk" key={t} onClick={() => insertToken("tplOpen", t)}>
                {"{" + t + "}"}
              </button>
            ))}
          </div>
          <div className="hint">點標籤可插入變數。沒有人請假時，含「請假」的那行會自動省略。</div>
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

        {/* 收費通知模板 */}
        <div className="card">
          <div className="clabel">收費通知模板</div>
          <textarea
            ref={feeRef}
            spellCheck={false}
            value={st.tplFee}
            onChange={(e) =>
              update((s) => {
                s.settings.tplFee = e.target.value;
              })
            }
          />
          <div className="legend">
            <button className="tk" onClick={() => insertToken("tplFee", "明細")}>
              {"{明細}"}
            </button>
          </div>
          <div className="hint">
            「{"{明細}"}」會依據當天出席狀況自動算出的人數與金額。開頭、結尾等文字都可自由編輯；記得保留 {"{明細}"} 這個標籤。
          </div>
          <div className="preview">
            <div className="plabel">預覽（範例資料）</div>
            <div>{normalizeFeeTpl(st.tplFee).replace("{明細}", sampleFeeDetail())}</div>
          </div>
          <button
            className="link"
            style={{ marginTop: 10 }}
            onClick={() =>
              update((s) => {
                s.settings.tplFee = TPL_FEE;
              })
            }
          >
            ↺ 回復預設模板
          </button>
        </div>
      </div>
    </>
  );
}
