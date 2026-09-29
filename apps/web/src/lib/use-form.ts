import { useState, type FormEvent } from "react";
import { errorMessage } from "./api";

/** Envío de formulario con estado de carga y error, sin librerías. */
export function useSubmit<T>(fn: () => Promise<T>, onDone?: (r: T) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const r = await fn();
      onDone?.(r);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return { pending, error, setError, onSubmit };
}
