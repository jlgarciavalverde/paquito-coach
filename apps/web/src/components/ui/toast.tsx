import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

type Action = { label: string; onClick: () => void };
type Toast = { id: number; text: string; tone: "ok" | "error"; action?: Action };
type Push = (text: string, tone?: Toast["tone"], action?: Action) => void;
const Ctx = createContext<Push>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback<Push>((text, tone = "ok", action) => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l, { id, text, tone, action }]);
    // Con «Deshacer» se queda más tiempo: da margen a leerlo y reaccionar.
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), action ? 7000 : 4000);
  }, []);
  const dismiss = (id: number) => setItems((l) => l.filter((t) => t.id !== id));
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-20 left-4 z-[60] flex flex-col items-start gap-2 sm:right-auto sm:bottom-6 sm:left-6" role="status" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-auto flex items-center gap-3 rounded-[var(--radius-control)] bg-ink py-2.5 pr-4 pl-3 text-sm text-paper shadow-[var(--shadow-float)]"
            >
              <span className={`h-4 w-[5px] rounded-[1.5px] ${t.tone === "ok" ? "bg-plate-green" : "bg-plate-red"}`} aria-hidden="true" />
              {t.text}
              {t.action && (
                <button
                  type="button"
                  onClick={() => (t.action!.onClick(), dismiss(t.id))}
                  className="-my-1 ml-1 rounded-[4px] px-2 py-1 font-medium text-paper underline decoration-[rgb(255_255_255/0.45)] underline-offset-2 hover:bg-[rgb(255_255_255/0.12)]"
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

/** Aviso de algo ya hecho con la opción de deshacerlo (en lugar de preguntar antes). */
export function useUndoToast() {
  const push = useContext(Ctx);
  return (text: string, undo: () => void) => push(text, "ok", { label: "Deshacer", onClick: undo });
}
