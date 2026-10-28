import { requireSession } from "@/lib/auth/session";
import { getEstadoDelCredito } from "@/services/credito";
import { PanelDeCredito } from "./panel";

export const dynamic = "force-dynamic";

export default async function CreditoPage() {
  await requireSession();
  const estado = await getEstadoDelCredito();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Crédito del cliente</h2>
        <p className="mt-1 text-sm text-gray-600">
          La deuda vive en el ERP de cobranzas y acá se guarda una copia por RUC. Cuando la regla
          está encendida, un pedido a crédito de un cliente con deuda vencida pasada la tolerancia
          no sale: va a aprobación comercial.
        </p>
      </div>

      <PanelDeCredito estado={estado} />
    </div>
  );
}
