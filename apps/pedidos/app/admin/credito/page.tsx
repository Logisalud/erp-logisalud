import { requireSession } from "@/lib/auth/session";
import { getEstadoDelCredito } from "@/services/credito";
import { ultimaCorridaDeContactos } from "@/services/contactos-cobranzas";
import { PanelDeCredito } from "./panel";

export const dynamic = "force-dynamic";

export default async function CreditoPage() {
  await requireSession();
  const [estado, ultimosContactos] = await Promise.all([
    getEstadoDelCredito(),
    ultimaCorridaDeContactos(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Crédito del cliente</h2>
        <p className="mt-1 text-sm text-gray-600">
          El puente con el ERP de cobranzas, que va en las dos direcciones. De allá viene la deuda,
          que acá se guarda como copia por RUC y decide si un pedido a crédito sale o se frena.
          Hacia allá van los celulares y las direcciones que conoce el vendedor, para completar las
          fichas de la cartera que están vacías.
        </p>
      </div>

      <PanelDeCredito estado={estado} ultimosContactos={ultimosContactos} />
    </div>
  );
}
