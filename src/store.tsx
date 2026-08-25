import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppState, UIState } from "./types";
import { normalizeRosters } from "./logic";
import { applyChanges, loadAll, subscribeRealtime } from "./db";

interface StoreCtx {
  state: AppState;
  update: (mutator: (s: AppState) => void) => void;
  ui: UIState;
  setUi: (patch: Partial<UIState> | ((u: UIState) => UIState)) => void;
  toast: (msg: string) => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export function useStore(): StoreCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used inside <StoreProvider>");
  return c;
}

function Splash() {
  return (
    <div id="sc-loader" role="status" aria-live="polite" aria-label="載入中">
      <svg viewBox="0 0 180 180" aria-hidden="true">
        <g className="sc-cycle">
          <g className="sc-fills">
            <path
              d="M 30,54 Q 30,45 39,44 L 122,32 Q 130,30 133,38 L 136,48 L 114,116 Q 114,121 109,121 L 78,122 Q 72,122 70,117 L 31,58 Z"
              fill="var(--sc-fill-1)"
            />
            <path
              d="M 75,121 C 74,139 80,148 94,148 C 108,148 114,139 113,121 Z"
              fill="var(--sc-fill-2)"
            />
          </g>
          <g className="sc-strokes">
            <path className="sc-skirt" d="M 30,54 Q 30,45 39,44 L 122,32 Q 130,30 133,38 L 136,48 L 114,116 Q 114,121 109,121 L 78,122 Q 72,122 70,117 L 31,58 Z" />
            <path className="sc-band" d="M 31,57 Q 82,58 134,45" />
            <path className="sc-f1" d="M 41,45 Q 70,80 86,119" />
            <path className="sc-f2" d="M 58,43 Q 76,84 90,119" />
            <path className="sc-f3" d="M 80,39 Q 87,80 93,119" />
            <path className="sc-f4" d="M 105,35 Q 101,80 96,119" />
            <path className="sc-f5" d="M 120,32 Q 107,80 99,119" />
            <path className="sc-cband" d="M 71,120 Q 93,124 114,119" />
            <path className="sc-cork" d="M 75,121 C 74,139 80,148 94,148 C 108,148 114,139 113,121" />
          </g>
        </g>
      </svg>
    </div>
  );
}

function ErrorScreen() {
  return (
    <div className="app">
      <div className="splash">
        <div className="splash-logo"><img src="/apple-touch-icon.png" alt="打羽球摟" /></div>
        <div className="splash-txt" style={{ maxWidth: 260, textAlign: "center", lineHeight: 1.7 }}>
          連不上雲端資料。請檢查網路後重新整理。
        </div>
        <button className="btn btn-solid" onClick={() => window.location.reload()}>
          重新整理
        </button>
      </div>
    </div>
  );
}

function Toast({ msg }: { msg: { k: number; t: string } | null }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!msg) return;
    setShow(true);
    const id = window.setTimeout(() => setShow(false), 1900);
    return () => window.clearTimeout(id);
  }, [msg]);
  return <div className={"toast" + (show ? " show" : "")}>{msg?.t}</div>;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [ui, setUiState] = useState<UIState>({ view: "schedule" });
  const [toastMsg, setToastMsg] = useState<{ k: number; t: string } | null>(null);

  const persisted = useRef<AppState | null>(null); // last state written to the DB
  const lastWrite = useRef(0); // timestamp of last local activity / write
  const saveTimer = useRef<number | undefined>(undefined);

  const toast = useCallback((t: string) => setToastMsg({ k: Date.now(), t }), []);

  // initial load
  useEffect(() => {
    let alive = true;
    loadAll()
      .then((s) => {
        if (!alive) return;
        persisted.current = s;
        setState(s);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((mutator: (s: AppState) => void) => {
    lastWrite.current = Date.now();
    setState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev) as AppState;
      mutator(next);
      normalizeRosters(next);
      return next;
    });
  }, []);

  const setUi = useCallback(
    (patch: Partial<UIState> | ((u: UIState) => UIState)) => {
      setUiState((prev) =>
        typeof patch === "function" ? (patch as (u: UIState) => UIState)(prev) : { ...prev, ...patch },
      );
    },
    [],
  );

  // debounced diff-save whenever state changes
  useEffect(() => {
    if (!state || !persisted.current || state === persisted.current) return;
    const snapshot = state;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      applyChanges(persisted.current!, snapshot);
      persisted.current = snapshot;
      lastWrite.current = Date.now();
    }, 400);
  }, [state]);

  // realtime: when someone else changes data, reload — but not while we're actively editing
  useEffect(() => {
    return subscribeRealtime(() => {
      if (Date.now() - lastWrite.current < 1500) return;
      loadAll()
        .then((s) => {
          persisted.current = s;
          setState(s);
        })
        .catch(() => {
          /* keep current state on a transient realtime reload failure */
        });
    });
  }, []);

  if (loadError) return <ErrorScreen />;
  if (!state) return <Splash />;
  return (
    <Ctx.Provider value={{ state, update, ui, setUi, toast }}>
      {children}
      <Toast msg={toastMsg} />
    </Ctx.Provider>
  );
}
