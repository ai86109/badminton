import { useEffect, useState } from "react";
import {
  addPreset,
  deletePreset,
  loadFundConfig,
  loadMembers,
  loadPresets,
  saveFundConfig,
  updatePreset,
  type FundConfig,
  type FundPreset,
} from "./fund";
import { TargetPicker } from "./TargetPicker";
import type { Member } from "../types";

type Kind = "income" | "expense";
const KINDS: { key: Kind; label: string }[] = [
  { key: "expense", label: "支出" },
  { key: "income", label: "收入" },
];

/** 純畫面：吃 data + 各種 callback，方便測試／截圖。 */
export function AdminSettingsView({
  presets,
  members,
  config,
  onBack,
  onLogout,
  onEditPreset,
  onCommitPreset,
  onAddPreset,
  onDeletePreset,
  onEditConfig,
  onCommitConfig,
}: {
  presets: FundPreset[];
  members: Member[];
  config: FundConfig;
  onBack: () => void;
  onLogout: () => void;
  onEditPreset: (id: string, patch: Partial<FundPreset>) => void;
  onCommitPreset: (id: string) => void;
  onAddPreset: (kind: Kind) => void;
  onDeletePreset: (id: string) => void;
  onEditConfig: (patch: Partial<FundConfig>) => void;
  onCommitConfig: () => void;
}) {
  return (
    <>
      <div className="topbar">
        <button className="back" onClick={onBack} aria-label="返回">
          ‹
        </button>
        <div>
          <h1>設定</h1>
        </div>
      </div>
      <div className="screen no-nav">
        {/* 公積金設定 */}
        <div className="card">
          <div className="clabel">公積金設定</div>
          <div className="field">
            <div className="field-lbl">固定成員請假退款金額</div>
            <div className="money">
              <input
                className="num"
                type="text"
                inputMode="numeric"
                value={config.leaveRefund ? String(config.leaveRefund) : ""}
                placeholder="0"
                onChange={(e) =>
                  onEditConfig({ leaveRefund: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })
                }
                onBlur={onCommitConfig}
              />
            </div>
            <div className="hint">固定成員請假時，從公積金退回的金額（每人每次）。</div>
          </div>
        </div>

        {/* 預設事件選項 */}
        {KINDS.map(({ key, label }) => {
          const items = presets.filter((p) => p.kind === key);
          return (
            <div className="card" key={key}>
              <div className="clabel">預設選項 · {label}</div>
              {key === "expense" && (
                <div className="hint" style={{ marginTop: -2, marginBottom: 12 }}>
                  新增事件時，說明欄的下拉會列出這些選項；「對象」「金額」可先留空，選了之後仍可改。
                </div>
              )}
              {items.map((p) => (
                <div className="preset-item" key={p.id}>
                  <div className="preset-top">
                    <input
                      className="preset-label"
                      type="text"
                      value={p.label}
                      placeholder="說明（例：買羽球）"
                      onChange={(e) => onEditPreset(p.id, { label: e.target.value })}
                      onBlur={() => onCommitPreset(p.id)}
                    />
                    <button
                      className="icon-btn"
                      aria-label="刪除"
                      onClick={() => onDeletePreset(p.id)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="preset-sub">
                    <TargetPicker
                      value={p.target}
                      members={members}
                      onChange={(v) => onEditPreset(p.id, { target: v })}
                      onCommit={() => onCommitPreset(p.id)}
                    />
                    <div className="preset-money money">
                      <input
                        className="num"
                        type="text"
                        inputMode="numeric"
                        value={p.amount == null ? "" : String(p.amount)}
                        placeholder="金額（選填）"
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^0-9]/g, "");
                          onEditPreset(p.id, { amount: digits === "" ? null : Number(digits) });
                        }}
                        onBlur={() => onCommitPreset(p.id)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="add-line" onClick={() => onAddPreset(key)}>
                <span className="plus">+</span>再加一個選項
              </div>
            </div>
          );
        })}

        <button
          className="btn btn-ghost btn-block"
          style={{ marginTop: 22 }}
          onClick={onLogout}
        >
          登出此裝置
        </button>
      </div>
    </>
  );
}

/** 容器：載入預設選項＋設定，處理即時編輯與存檔。 */
export default function AdminSettings({
  onBack,
  onLogout,
}: {
  onBack: () => void;
  onLogout: () => void;
}) {
  const [presets, setPresets] = useState<FundPreset[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [config, setConfig] = useState<FundConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [ps, ms, cfg] = await Promise.all([loadPresets(), loadMembers(), loadFundConfig()]);
        setPresets(ps);
        setMembers(ms);
        setConfig(cfg);
      } catch {
        setErr("讀取失敗，請檢查網路後重新整理。");
      }
    })();
  }, []);

  function editPreset(id: string, patch: Partial<FundPreset>) {
    setPresets((cur) => (cur ? cur.map((p) => (p.id === id ? { ...p, ...patch } : p)) : cur));
  }
  async function commitPreset(id: string) {
    const p = presets?.find((x) => x.id === id);
    if (p) {
      try {
        await updatePreset(p);
      } catch {
        /* 忽略單筆存檔失敗，下次編輯會再送 */
      }
    }
  }
  async function addOne(kind: Kind) {
    const sort = (presets || []).filter((p) => p.kind === kind).length;
    try {
      const created = await addPreset(kind, sort);
      setPresets((cur) => (cur ? [...cur, created] : [created]));
    } catch {
      /* ignore */
    }
  }
  async function removeOne(id: string) {
    setPresets((cur) => (cur ? cur.filter((p) => p.id !== id) : cur));
    try {
      await deletePreset(id);
    } catch {
      /* ignore */
    }
  }
  function editConfig(patch: Partial<FundConfig>) {
    setConfig((cur) => (cur ? { ...cur, ...patch } : cur));
  }
  async function commitConfig() {
    if (config) {
      try {
        await saveFundConfig(config);
      } catch {
        /* ignore */
      }
    }
  }

  if (err) {
    return (
      <>
        <div className="topbar">
          <button className="back" onClick={onBack} aria-label="返回">
            ‹
          </button>
          <div>
            <h1>設定</h1>
          </div>
        </div>
        <div className="screen no-nav">
          <div className="empty">{err}</div>
          <button className="btn btn-ghost btn-block" onClick={onLogout}>
            登出此裝置
          </button>
        </div>
      </>
    );
  }
  if (!presets || !config) {
    return (
      <>
        <div className="topbar">
          <button className="back" onClick={onBack} aria-label="返回">
            ‹
          </button>
          <div>
            <h1>設定</h1>
          </div>
        </div>
        <div className="screen no-nav">
          <div className="empty">載入中…</div>
        </div>
      </>
    );
  }

  return (
    <AdminSettingsView
      presets={presets}
      members={members}
      config={config}
      onBack={onBack}
      onLogout={onLogout}
      onEditPreset={editPreset}
      onCommitPreset={commitPreset}
      onAddPreset={addOne}
      onDeletePreset={removeOne}
      onEditConfig={editConfig}
      onCommitConfig={commitConfig}
    />
  );
}
