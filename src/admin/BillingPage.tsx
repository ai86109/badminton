import { useEffect, useRef, useState } from "react";
import { addFundEvent, deleteFundEvent, loadFund, type FundData, type FundEvent } from "./fund";
import { todayIso } from "../logic";

function mmdd(iso: string): string {
  const p = iso.split("-");
  return p.length === 3 ? `${+p[1]}/${+p[2]}` : iso;
}
function fmtAmt(n: number): string {
  return n.toLocaleString("en-US");
}

const PRESETS: Record<"expense" | "income", string[]> = {
  expense: ["買羽球"],
  income: ["固定成員交錢"],
};

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
  onAdd,
  onDelete,
}: {
  data: FundData;
  onAdd: (e: { date: string; kind: "income" | "expense"; label: string; amount: number }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [sheetMounted, setSheetMounted] = useState(false); // 在 DOM 上（含收起動畫期間）
  const [sheetShown, setSheetShown] = useState(false); // 已滑上（觸發過場）
  const closeTimer = useRef<number | undefined>(undefined);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [date, setDate] = useState(todayIso());
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<FundEvent | null>(null);

  function openSheet() {
    setKind("expense");
    setDate(todayIso());
    setLabel("");
    setAmount("");
    setComboOpen(false);
    window.clearTimeout(closeTimer.current);
    setSheetMounted(true);
    requestAnimationFrame(() => setSheetShown(true)); // 下一幀才 show → 從底部滑上
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
      await onAdd({ date, kind, label: label.trim(), amount: amt });
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

  const presets = PRESETS[kind];
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

      <div className="section-h">
        <h2>事件紀錄</h2>
      </div>
      {data.events.length ? (
        <div className="card fund-list">
          {data.events.map((e) => (
            <div className="log-row" key={e.id}>
              <div className="log-date num">{mmdd(e.date)}</div>
              <div className="log-main">
                <div className="log-title">
                  {e.label || (e.kind === "income" ? "收入" : "支出")}
                  <span className={"log-tag " + (e.auto ? "auto" : "manual")}>
                    {e.auto ? "自動" : "手動"}
                  </span>
                </div>
              </div>
              <div className={"log-amt num " + (e.kind === "income" ? "plus" : "minus")}>
                {e.kind === "income" ? "+" : "−"}
                {fmtAmt(e.amount)}
              </div>
              {e.auto ? (
                <span className="log-del-spacer" />
              ) : (
                <button className="log-del" aria-label="刪除" onClick={() => setDel(e)}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">還沒有任何事件。打球結算的多收金額會自動累積，也可手動新增。</div>
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
              <div className="fund-combo">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onFocus={() => setComboOpen(true)}
                  placeholder="可自訂，或點右邊選預設"
                />
                <button
                  type="button"
                  className="fund-combo-caret"
                  aria-label="預設選項"
                  onClick={() => setComboOpen((o) => !o)}
                >
                  ▾
                </button>
                {comboOpen && (
                  <div className="fund-combo-list">
                    {presets.map((p) => (
                      <button
                        type="button"
                        key={p}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          setLabel(p);
                          setComboOpen(false);
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
