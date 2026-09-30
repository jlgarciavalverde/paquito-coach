import { useLayoutEffect, useRef, type HTMLAttributes, type KeyboardEvent } from "react";

const radios = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])'));

/**
 * Grupo de opciones con el teclado de un radio de verdad (WAI-ARIA): una sola parada con Tab (la opción elegida, o la
 * primera), flechas para moverse y elegir, Inicio/Fin. Las opciones siguen siendo botones con `role="radio"` y
 * `aria-checked`, con su propio aspecto; este contenedor solo añade el comportamiento.
 */
export function RadioGroup({ onKeyDown, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  // Parada única con Tab: se recalcula en cada pintado (la opción elegida puede cambiar).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const all = radios(el);
    const current = all.find((r) => r.getAttribute("aria-checked") === "true") ?? all[0];
    for (const r of all) r.tabIndex = r === current ? 0 : -1;
  });
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    const el = ref.current;
    if (!el || e.defaultPrevented) return;
    const all = radios(el);
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? all[(i + 1) % all.length]
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? all[(i - 1 + all.length) % all.length]
      : e.key === "Home" ? all[0]
      : e.key === "End" ? all.at(-1)
      : undefined;
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.click();
  };
  return (
    <div ref={ref} role="radiogroup" onKeyDown={onKey} {...rest}>
      {children}
    </div>
  );
}
