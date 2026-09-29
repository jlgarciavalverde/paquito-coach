import { WarningCircle } from "@phosphor-icons/react";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-[12px] bg-danger-soft px-3.5 py-3 text-sm text-danger">
      <WarningCircle size={18} weight="fill" className="mt-px shrink-0" />
      <span>{message}</span>
    </div>
  );
}
