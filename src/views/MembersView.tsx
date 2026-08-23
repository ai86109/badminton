import { useState } from "react";
import { useStore } from "../store";
import { uid } from "../logic";
import type { Level } from "../types";

const ORDER: Record<string, number> = { fixed: 0, floating: 1 };

export default function MembersView() {
  const { state, update } = useStore();
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
          <p>
            固定 {cn.fixed} · 非固定 {cn.floating}
          </p>
        </div>
      </div>
      <div className="screen">
        <div className="card">
          <div className="clabel">
            隊員<span className="r">{state.members.length} 人</span>
          </div>
          {ms.length ? (
            ms.map((m) => (
              <div className="mrow" key={m.id}>
                <div className="mname">{m.name}</div>
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
            ))
          ) : (
            <div className="empty">還沒有成員，先在下面加入。</div>
          )}
          <div className="add-row">
            <input
              type="text"
              placeholder="新成員名字"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
            />
            <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
              <option value="fixed">固定</option>
              <option value="floating">非固定</option>
            </select>
            <button className="btn btn-solid" onClick={add}>
              加入
            </button>
          </div>
        </div>
        <div className="foot">固定成員由隊費支付、不逐次收款；非固定成員逐次收款</div>
      </div>
    </>
  );
}
