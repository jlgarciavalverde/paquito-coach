import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";

type Ask = { title: string; body?: ReactNode; confirm: string; danger?: boolean };
const Ctx = createContext<(a: Ask) => Promise<boolean>>(async () => false);

/**
 * Confirmación con el diálogo de la app (sustituye a `confirm()` del navegador).
 * Solo para lo que no se puede deshacer; lo demás se hace directamente con un aviso «Deshacer».
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const open = useCallback((a: Ask) => {
    setAsk(a);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);
  const done = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setAsk(null);
  };
  return (
    <Ctx.Provider value={open}>
      {children}
      <Dialog
        open={Boolean(ask)}
        onOpenChange={(o) => !o && done(false)}
        title={ask?.title ?? ""}
        footer={
          <>
            <Button variant="quiet" onClick={() => done(false)}>
              Cancelar
            </Button>
            <Button variant={ask?.danger ? "danger" : "primary"} onClick={() => done(true)} autoFocus>
              {ask?.confirm}
            </Button>
          </>
        }
      >
        {ask?.body ? <div className="text-sm text-ink-2">{ask.body}</div> : <p className="text-sm text-ink-2">Esta acción no se puede deshacer.</p>}
      </Dialog>
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
