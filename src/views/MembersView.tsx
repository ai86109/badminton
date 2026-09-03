import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { useManager } from "../manager";
import { uid } from "../logic";
import type { Level } from "../types";

const ORDER: Record<string, number> = { fixed: 0, floating: 1 };

/** Single-line-looking name field that wraps and grows when a name is long. */
function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <textarea
      ref={ref}
      className="mname"
      rows={1}
      aria-label="成員名字"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}

export default function MembersView() {
  const { state, update } = useStore();
  const isManager = useManager();
  const [name, setName] = useState("");
  const [level, setLevel] = useState<Level>("fixed");

  const ms = state.members.slice().sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const cn = { fixed: 0, floating: 0 };
  state.members.forEach((m) => (cn[m.level === "fixed" ? "fixed" : "floating"] += 1));

  function add() {
    const n = name.trim();
    if (!n) return;
    update((s) => {
      s.members.push({ id: uid(), name: n, level });
    });
    setName("");
  }
  function setLvl(id: string, lv: Level) {
    update((s) => {
      const m = s.members.find((x) => x.id === id);
      if (m) m.level = lv;
    });
  }
  function rename(id: string, val: string) {
    update((s) => {
      const m = s.members.find((x) => x.id === id);
      if (m) m.name = val;
    });
  }
  function del(id: string) {
    update((s) => {
      s.members = s.members.filter((x) => x.id !== id);
    });
  }

  return (
    <>
      <div className="topbar">
        <div className="logo">👥</div>
        <div>
          <h1>成員名單</h1>
        </div>
      </div>
      <div className="screen">
        <div className="card">
          <div className="clabel">
            隊員<span className="r">{state.members.length} 人 （固定 {cn.fixed} · 非固定 {cn.floating}）</span>
          </div>
          {ms.length ? (
            ms.map((m) =>
              isManager ? (
                <div className="mrow" key={m.id}>
                  <NameField value={m.name} onChange={(v) => rename(m.id, v)} />
                  <div className="lvseg">
                    <button className={m.level === "fixed" ? "on" : ""} onClick={() => setLvl(m.id, "fixed")}>
                      固定
                    </button>
                    <button className={m.level !== "fixed" ? "on" : ""} onClick={() => setLvl(m.id, "floating")}>
                      非固定
                    </button>
                  </div>
                  <button className="icon-btn" aria-label="移除" onClick={() => del(m.id)}>
                    ×
                  </button>
                </div>
              ) : (
                <div className="mrow" key={m.id}>
                  <div className="mname-ro">{m.name}</div>
                  <span className={"lvtag " + (m.level === "fixed" ? "fixed" : "")}>
                    {m.level === "fixed" ? "固定" : "非固定"}
                  </span>
                </div>
              ),
            )
          ) : (
            <div className="empty">{isManager ? "還沒有成員，先在下面加入。" : "還沒有成員。"}</div>
          )}
          {isManager && (
            <div className="add-row">
              <input
                type="text"
                placeholder="新成員名字"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                <option value="fixed">固定</option>
                <option value="floating">非固定</option>
              </select>
              <button className="btn btn-solid" onClick={add}>
                加入
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
