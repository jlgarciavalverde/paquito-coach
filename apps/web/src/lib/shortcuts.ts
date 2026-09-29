import { useEffect, useRef } from "react";

export type Shortcut = { keys: string; label: string };

/** Atajos del entrenador (se muestran con «?»). */
export const SHORTCUTS: Shortcut[] = [
  { keys: "⌘ K", label: "Buscar o hacer algo (también Ctrl K o /)" },
  { keys: "g h", label: "Ir a Hoy" },
  { keys: "g c", label: "Ir a Clientes" },
  { keys: "g e", label: "Ir a Entrenos" },
  { keys: "g n", label: "Ir a Nutrición" },
  { keys: "g a", label: "Ir a Agenda" },
  { keys: "g m", label: "Ir a Mensajes" },
  { keys: "g s", label: "Ir a Seguimiento" },
  { keys: "g i", label: "Ir a Informes" },
  { keys: "g x", label: "Ir a IA" },
  { keys: "n", label: "Crear en la pantalla actual (cliente, rutina, cita, plantilla)" },
  { keys: "?", label: "Ver estos atajos" },
];

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || Boolean(t.closest("[role=dialog]")));

/**
 * Atajos de teclado globales. Las secuencias «g x» esperan la segunda tecla 1 s.
 * No actúan mientras se escribe en un campo ni con un diálogo abierto (salvo ⌘K).
 */
export function useShortcuts(h: { palette: () => void; go: (key: string) => boolean; create: () => void; help: () => void }) {
  const ref = useRef(h);
  ref.current = h;
  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current.palette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (pendingG && Date.now() - pendingG < 1000) {
        pendingG = 0;
        if (ref.current.go(e.key.toLowerCase())) e.preventDefault();
        return;
      }
      if (e.key === "g") pendingG = Date.now();
      else if (e.key === "/") (e.preventDefault(), ref.current.palette());
      else if (e.key === "n") (e.preventDefault(), ref.current.create());
      else if (e.key === "?") (e.preventDefault(), ref.current.help());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
