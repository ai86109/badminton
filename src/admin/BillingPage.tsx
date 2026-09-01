import { useEffect, useMemo, useRef, useState } from "react";
import {
  addFundEvent,
  deleteFundEvent,
  loadFund,
  loadMembers,
  loadPresets,
  type FundData,
  type FundEvent,
  type FundPreset,
} from "./fund";
import { TargetPicker } from "./TargetPicker";
import { todayIso } from "../logic";
import type { Member } from "../types";

function mmdd(iso: string): string {
  const p = iso.split("-");
  return p.length === 3 ? `${+p[1]}/${+p[2]}` : iso;
}
function fmtAmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** 一筆事件（標題＋金額＋刪除＋明細）。明細一律展開，人名／群組用螢光筆強調。 */
function EventRow({ e, onDel }: { e: FundEvent; onDel: (e: FundEvent) => void }) {
  const bd = e.breakdown || [];
  return (
    <div className="fund-ev-item">
      <div className="fund-ev">
        <div className="fund-ev-main">
          <div className="fund-ev-title">
            {e.label || (e.kind === "income" ? "收入" : "支出")}
            <span className={"log-tag " + (e.auto ? "auto" : "manual")}>
              {e.auto ? "自動" : "手動"}
            </span>
          </div>
        </div>
        <div className={"fund-ev-amt num " + (e.kind === "income" ? "plus" : "minus")}>
          {e.kind === "income" ? "+" : "−"}
          {fmtAmt(e.amount)}
        </div>
        {e.auto ? (
          <span className="fund-ev-sp" />
        ) : (
          <button className="fund-ev-del" aria-label="刪除" onClick={() => onDel(e)}>
            ×
          </button>
        )}
      </div>
      {bd.length > 0 && (
        <div className="fund-ev-bd">
          {bd.map((line, i) => (
            <div className="fund-ev-bd-l" key={i}>
              {line.verb} <span className="bd-hl">{line.who}</span>{" "}
              {line.per ? "每人 " : ""}
              {fmtAmt(line.amount)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 一天一個區塊：日期 + 當日淨額 + 到當日結餘，底下是當天的事件。 */
function DayBlock({
  date,
  events,
  net,
  bal,
  onDel,
}: {
  date: string;
  events: FundEvent[];
  net: number;
  bal: number;
  onDel: (e: FundEvent) => void;
}) {
  return (
    <div className="fund-day">
      <div className="fund-day-h">
        <span className="d num">{mmdd(date)}</span>
        <span className="rt">
          <span className={"net num " + (net >= 0 ? "up" : "dn")}>
            {net >= 0 ? "＋" : "−"}
            {fmtAmt(Math.abs(net))}
          </span>
          <span className="bl num">
            <span className="lb">結餘</span>${fmtAmt(bal)}
          </span>
        </span>
      </div>
      <div className="fund-day-rows">
        {events.map((e) => (
          <EventRow key={e.id} e={e} onDel={onDel} />
        ))}
      </div>
    </div>
  );
}

function AdminTopbar({ onGear }: { onGear: () => void }) {
  return (
    <div className="topbar">
      <div className="logo">
        <img src="/admin-apple-touch-icon.png" alt="羽球後台" />
      </div>
      <div>
        <h1>帳務</h1>
      </div>
      <button className="gear" onClick={onGear} aria-label="設定" title="設定">
        ⚙️
      </button>
    </div>
  );
}

/** 純畫面元件：吃 data + 新增/刪除 callback，自己管 UI 狀態（方便測試/截圖）。 */
export function BillingView({
  data,
  presets,
  members,
  onAdd,
  onDelete,
}: {
  data: FundData;
  presets: FundPreset[];
  members: Member[];
  onAdd: (e: {
    date: string;
    kind: "income" | "expense";
    label: string;
    target: string;
    amount: number;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [sheetMounted, setSheetMounted] = useState(false); // 在 DOM 上（含收起動畫期間）
  const [sheetShown, setSheetShown] = useState(false); // 已滑上（觸發過場）
  const closeTimer = useRef<number | undefined>(undefined);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [date, setDate] = useState(todayIso());
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<FundEvent | null>(null);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  // 依日期分組、算每日/月的結餘，並切成「當月（展開）」與「更早（依年月收合）」。
  const grouped = useMemo(() => {
    const evs = data.events; // 新到舊
    // 每日淨額 → 累積結餘（需由舊到新累加）
    const asc = [...evs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const net: Record<string, number> = {};
    const order: string[] = [];
    asc.forEach((e) => {
      if (!(e.date in net)) {
        net[e.date] = 0;
        order.push(e.date);
      }
      net[e.date] += e.kind === "income" ? e.amount : -e.amount;
    });
    let run = 0;
    const bal: Record<string, number> = {};
    order.forEach((d) => {
      run += net[d];
      bal[d] = run;
    });

    // 依日分組（保持新到舊）
    const byDay = new Map<string, FundEvent[]>();
    evs.forEach((e) => {
      const a = byDay.get(e.date) || [];
      a.push(e);
      byDay.set(e.date, a);
    });

    const curMonth = todayIso().slice(0, 7);
    const monthsPresent = new Set([...byDay.keys()].map((d) => d.slice(0, 7)));
    const latestMonth = order.length ? order[order.length - 1].slice(0, 7) : curMonth;
    // 當月有事件就展開當月；當月還沒有（例如月初）就改展開最近有紀錄的那個月。
    const expMonth = monthsPresent.has(curMonth) ? curMonth : latestMonth;
    const recent: string[] = [];
    const olderDates: string[] = [];
    for (const d of byDay.keys()) {
      if (d.slice(0, 7) >= expMonth) recent.push(d);
      else olderDates.push(d);
    }

    // 更早：依「年-月」分組（新到舊），月底結餘＝該月最新一天的結餘
    const months = new Map<string, { dates: string[]; count: number; bal: number }>();
    olderDates.forEach((d) => {
      const m = d.slice(0, 7);
      const cur = months.get(m) || { dates: [], count: 0, bal: 0 };
      cur.dates.push(d);
      cur.count += (byDay.get(d) || []).length;
      months.set(m, cur);
    });
    months.forEach((v) => {
      v.bal = bal[v.dates[0]] ?? 0;
    });

    // 依年分組（僅作標題，不收合）
    const years = new Map<string, string[]>();
    for (const m of months.keys()) {
      const y = m.slice(0, 4);
      const a = years.get(y) || [];
      a.push(m);
      years.set(y, a);
    }

    return { byDay, net, bal, recent, months, years };
  }, [data.events]);

  // 點「說明」下拉以外的地方 → 收合
  useEffect(() => {
    if (!comboOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setComboOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [comboOpen]);

  function openSheet() {
    setKind("expense");
    setDate(todayIso());
    setLabel("");
    setTarget("");
    setAmount("");
    setComboOpen(false);
    window.clearTimeout(closeTimer.current);
    setSheetMounted(true);
    requestAnimationFrame(() => setSheetShown(true)); // 下一幀才 show → 從底部滑上
  }

  /** 點預設選項：一次帶入 說明／對象／金額。 */
  function applyPreset(p: FundPreset) {
    setLabel(p.label);
    setTarget(p.target);
    setAmount(p.amount == null ? "" : String(p.amount));
    setComboOpen(false);
  }

  function closeSheet() {
    setSheetShown(false); // 觸發往下滑
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setSheetMounted(false), 300); // 動畫結束後卸載
  }

  async function save() {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) return;
    setBusy(true);
    try {
      await onAdd({ date, kind, label: label.trim(), target: target.trim(), amount: amt });
      closeSheet();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!del) return;
    setBusy(true);
    try {
      await onDelete(del.id);
      setDel(null);
    } finally {
      setBusy(false);
    }
  }

  const kindPresets = presets.filter((p) => p.kind === kind && p.label.trim());
  const delImpact = del ? (del.kind === "income" ? -del.amount : del.amount) : 0;

  return (
    <div className="screen">
      {/* 結餘（只顯示金額） */}
      <div className="fund-bal">
        <div className="fund-bal-label">公積金結餘</div>
        <div className="fund-bal-amt">
          <span className="cur">$</span>
          {fmtAmt(data.balance)}
        </div>
      </div>

      <button className="btn btn-solid btn-block" style={{ marginTop: 13 }} onClick={openSheet}>
        ＋ 新增事件
      </button>

      {data.events.length ? (
        <>
          <div className="section-h">
            <h2>事件紀錄</h2>
          </div>
          {grouped.recent.length ? (
            grouped.recent.map((d) => (
              <DayBlock
                key={d}
                date={d}
                events={grouped.byDay.get(d) || []}
                net={grouped.net[d]}
                bal={grouped.bal[d]}
                onDel={setDel}
              />
            ))
          ) : (
            <div className="empty" style={{ marginTop: 8 }}>
              本月還沒有事件。
            </div>
          )}

          {grouped.months.size > 0 && (
            <>
              <div className="section-h">
                <h2>更早的紀錄</h2>
              </div>
              {[...grouped.years.entries()].map(([y, monthKeys]) => (
                <div key={y}>
                  <div className="fund-year">{y} 年</div>
                  {monthKeys.map((m) => {
                    const mo = grouped.months.get(m);
                    if (!mo) return null;
                    const open = !!openMonths[m];
                    return (
                      <div className={"fund-mo" + (open ? " open" : "")} key={m}>
                        <div
                          className="fund-mo-h"
                          onClick={() => setOpenMonths((c) => ({ ...c, [m]: !c[m] }))}
                        >
                          <span className="mn">{+m.slice(5, 7)} 月</span>
                          <span className="meta">{mo.count} 筆</span>
                          <span className="rt">
                            <span className="bl num">
                              <span className="lb">月底結餘</span>${fmtAmt(mo.bal)}
                            </span>
                            <span className="cx">{open ? "▾" : "▸"}</span>
                          </span>
                        </div>
                        {open && (
                          <div className="fund-mo-body">
                            {mo.dates.map((d) => (
                              <DayBlock
                                key={d}
                                date={d}
                                events={grouped.byDay.get(d) || []}
                                net={grouped.net[d]}
                                bal={grouped.bal[d]}
                                onDel={setDel}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          <div className="section-h">
            <h2>事件紀錄</h2>
          </div>
          <div className="empty">還沒有任何事件。打球結算的多收金額會自動累積，也可手動新增。</div>
        </>
      )}

      {/* 新增事件 sheet */}
      {sheetMounted && (
        <>
          <div className={"scrim" + (sheetShown ? " show" : "")} onClick={closeSheet} />
          <div className={"sheet" + (sheetShown ? " show" : "")} role="dialog" aria-label="新增事件">
            <div className="sheet-grab" />
            <div className="sheet-h">新增事件</div>

            <div className="lvseg seg2" style={{ marginBottom: 14 }}>
              <button className={kind === "expense" ? "on" : ""} onClick={() => setKind("expense")}>
                支出
              </button>
              <button className={kind === "income" ? "on" : ""} onClick={() => setKind("income")}>
                收入
              </button>
            </div>

            <div className="fund-fld">
              <label className="field-lbl">日期</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="fund-fld">
              <label className="field-lbl">說明</label>
              <div className="fund-combo" ref={comboRef}>
                <div className="fund-combo-field">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onFocus={() => setComboOpen(true)}
                    placeholder="可自訂，或右邊下拉選擇預設"
                  />
                  <button
                    type="button"
                    className="fund-combo-caret"
                    aria-label="預設選項"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setComboOpen((o) => !o);
                    }}
                  >
                    ▾
                  </button>
                </div>
                {comboOpen && kindPresets.length > 0 && (
                  <div className="fund-combo-list">
                    {kindPresets.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          applyPreset(p);
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="fund-fld">
              <label className="field-lbl">對象</label>
              <TargetPicker value={target} members={members} onChange={setTarget} />
            </div>

            <div className="fund-fld">
              <label className="field-lbl">金額</label>
              <div className="money">
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                />
              </div>
            </div>

            <button
              className="btn btn-solid btn-block"
              style={{ marginTop: 4 }}
              disabled={busy || !(Math.round(Number(amount) || 0) > 0)}
              onClick={save}
            >
              {busy ? "儲存中…" : "儲存"}
            </button>
          </div>
        </>
      )}

      {/* 刪除確認 */}
      {del && (
        <>
          <div className="scrim show" onClick={() => setDel(null)} />
          <div className="dialog" role="dialog" aria-label="刪除確認">
            <div className="dlg-title">刪除這筆紀錄？</div>
            <div className="dlg-body">
              <span className="q">
                「{mmdd(del.date)} {del.label || (del.kind === "income" ? "收入" : "支出")}{" "}
                {del.kind === "income" ? "+" : "−"}
                {fmtAmt(del.amount)}」
              </span>
              <br />
              刪除後，公積金結餘會{" "}
              <b>
                {delImpact >= 0 ? "+" : "−"}
                {fmtAmt(Math.abs(delImpact))}
              </b>
              ，變成{" "}
              <b style={{ color: "var(--ink)" }}>${fmtAmt(data.balance + delImpact)}</b>。
            </div>
            <div className="dlg-actions">
              <button className="btn btn-ghost" onClick={() => setDel(null)}>
                取消
              </button>
              <button className="btn btn-danger" disabled={busy} onClick={confirmDelete}>
                {busy ? "刪除中…" : "刪除"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 容器：載入資料、處理新增/刪除後重載。 */
export default function BillingPage({ onGear }: { onGear: () => void }) {
  const [data, setData] = useState<FundData | null>(null);
  const [presets, setPresets] = useState<FundPreset[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    try {
      setData(await loadFund());
    } catch {
      setErr("讀取失敗，請檢查網路後重新整理。");
    }
  }
  useEffect(() => {
    reload();
    // 預設選項與成員清單載入一次即可（新增事件的下拉會用到）
    (async () => {
      try {
        const [ps, ms] = await Promise.all([loadPresets(), loadMembers()]);
        setPresets(ps);
        setMembers(ms);
      } catch {
        /* 下拉載不到不影響主要記帳功能 */
      }
    })();
  }, []);

  return (
    <>
      <AdminTopbar onGear={onGear} />
      {err ? (
        <div className="screen">
          <div className="empty">{err}</div>
        </div>
      ) : !data ? (
        <div className="screen">
          <div className="empty">載入中…</div>
        </div>
      ) : (
        <BillingView
          data={data}
          presets={presets}
          members={members}
          onAdd={async (e) => {
            await addFundEvent(e);
            await reload();
          }}
          onDelete={async (id) => {
            await deleteFundEvent(id);
            await reload();
          }}
        />
      )}
    </>
  );
}
