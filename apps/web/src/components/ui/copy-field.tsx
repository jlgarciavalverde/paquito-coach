import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { Button } from "./button";

/** Valor para copiar y pegar (enlace de invitación, código). */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-rule-strong bg-tray py-1 pr-1 pl-3">
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-2" aria-label={label}>
        {value}
      </span>
      <Button size="sm" variant={copied ? "quiet" : "primary"} onClick={copy} icon={copied ? <Check size={15} weight="bold" /> : <Copy size={15} />}>
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}
