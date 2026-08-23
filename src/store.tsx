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
    <div className="app">
      <div className="splash">
        <div className="splash-logo">🏸</div>
        <div className="splash-txt">載入中…</div>
      </div>
    </div>
  );
}

function ErrorScreen() {
  return (
    <div className="app">
      <div className="splash">
        <div className="splash-logo">🏸</div>
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
