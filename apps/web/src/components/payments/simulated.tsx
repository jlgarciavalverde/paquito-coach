import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { api } from "../../lib/api";

/** Solo en entornos de prueba sin Stripe real: simula la confirmación del pago. */
export function Simulated({ checkoutId }: { checkoutId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 border-l-[5px] border-plate-yellow bg-tray px-4 py-3 text-sm">
      <span className="flex-1">Entorno de pruebas: aquí estaría la página de pago de Stripe.</span>
      <Button
        size="sm"
        onClick={async () => {
          await api("/stripe/simulate", { body: { checkoutId } });
          await qc.invalidateQueries();
          toast("Pago simulado");
        }}
      >
        Simular pago
      </Button>
    </div>
  );
}
