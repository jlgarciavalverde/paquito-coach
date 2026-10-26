import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";

/**
 * Cifra que cambia con un desplazamiento corto (series hechas, cargas, kcal, cobros): sube si aumenta y baja si
 * disminuye, con la letra estrecha de las cifras y en formato español. Es texto normal (lectores de pantalla, buscar,
 * copiar); con «reducir movimiento», cambia sin animar.
 */
export function Figure({ value, className, suffix = "", decimals = 0, currency = false }: { value: number; className?: string; suffix?: string; decimals?: number; currency?: boolean }) {
  const reduce = useReducedMotion();
  const text = currency
    ? value.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: Number.isInteger(value) ? 0 : 2 })
    : `${value.toLocaleString("es-ES", { maximumFractionDigits: decimals })}${suffix}`;
  return (
    <span className={cn("relative inline-flex overflow-hidden align-baseline font-narrow tabular", className)}>
      <AnimatePresence initial={false} mode="popLayout" custom={value}>
        <motion.span
          key={text}
          initial={reduce ? false : { y: "0.6em", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? undefined : { y: "-0.6em", opacity: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.6 }}
          className="inline-block"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
