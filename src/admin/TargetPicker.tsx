import { useState } from "react";
import type { Member } from "../types";

/** 幾個「群組」快捷，點了直接把對象設成這個標籤（純標註）。 */
const GROUPS = ["整隊", "固定成員", "非固定成員"] as const;
const SEP = "、";

function splitNames(v: string): string[] {
  return v
    .split(SEP)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * 「對象」選擇器：輸入框 + 下拉。
 *  - 下拉：整隊／固定成員／非固定成員（存標籤），或「自行選擇」勾多位成員（存名字）。
 *  - 下拉找不到時，仍可直接在輸入框打字。
 * value 一律是純字串；元件不自己存檔，透過 onChange 往上帶、離開時 onCommit。
 */
export function TargetPicker({
  value,
  members,
  onChange,
  onCommit,
  placeholder = "對象（可留空）",
}: {
  value: string;
  members: Member[];
  onChange: (v: string) => void;
  onCommit?: () => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(false); // 是否進入「自行選擇」勾選模式

  function close(commit = true) {
    setOpen(false);
    setPick(false);
    if (commit) onCommit?.();
  }

  function chooseGroup(g: string) {
    onChange(g);
    close();
  }

  // 目前輸入框內容對應到哪些成員（用來預先勾選）
  const chosen = new Set(splitNames(value));
  const pickedIds = new Set(members.filter((m) => chosen.has(m.name)).map((m) => m.id));

  function toggleMember(m: Member) {
    const next = new Set(pickedIds);
    if (next.has(m.id)) next.delete(m.id);
    else next.add(m.id);
    // 依成員清單順序組回字串，保持穩定
    const names = members.filter((x) => next.has(x.id)).map((x) => x.name);
    onChange(names.join(SEP));
  }

  return (
    <div className="fund-combo">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => close()}
      />
      <button
        type="button"
        className="fund-combo-caret"
        aria-label="對象選項"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => {
            const nx = !o;
            if (!nx) setPick(false);
            return nx;
          });
        }}
      >
        ▾
      </button>

      {open && (
        <div className="fund-combo-list">
          {!pick ? (
            <>
              {GROUPS.map((g) => (
                <button
                  type="button"
                  key={g}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    chooseGroup(g);
                  }}
                >
                  {g}
                </button>
              ))}
              <button
                type="button"
                className="target-more"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setPick(true);
                }}
              >
                自行選擇…
              </button>
            </>
          ) : (
            <>
              <div className="target-picklist">
                {members.length ? (
                  members.map((m) => {
                    const on = pickedIds.has(m.id);
                    return (
                      <button
                        type="button"
                        key={m.id}
                        className={"target-opt" + (on ? " on" : "")}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          toggleMember(m);
                        }}
                      >
                        <span className="box">{on ? "✓" : ""}</span>
                        <span className="nm">{m.name}</span>
                        {m.level === "fixed" && <span className="target-lv">固定</span>}
                      </button>
                    );
                  })
                ) : (
                  <div className="target-empty">還沒有成員</div>
                )}
              </div>
              <button
                type="button"
                className="target-done"
                onMouseDown={(e) => {
                  e.preventDefault();
                  close();
                }}
              >
                完成
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default TargetPicker;
