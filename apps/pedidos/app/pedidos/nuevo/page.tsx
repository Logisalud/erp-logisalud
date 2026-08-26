import { getCurrentUser } from "@/lib/auth/session";
import { listActiveCustomers } from "@/services/customers";
import { listActiveSellers } from "@/services/sellers";
import { listCatalog } from "@/services/catalog";
import { NewOrderForm } from "./new-order-form";

export default async function NuevoPedidoPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.roles.includes("administrador") ?? false;

  const [customers, paymentTerms, salesChannels, zones, sellers] = await Promise.all([
    listActiveCustomers(),
    listCatalog("payment_terms"),
    listCatalog("sales_channels"),
    listCatalog("zones"),
    isAdmin ? listActiveSellers() : Promise.resolve([]),
  ]);

  return (
    <div>
      <h2 className="text-xl font-semibold">Nuevo pedido</h2>
      <p className="mt-1 text-sm text-gray-600">
        {isAdmin
          ? "Elige a nombre de qué vendedor se registra, luego el cliente, dirección y condición de pago."
          : "Elige el cliente, dirección y condición de pago para empezar."}
      </p>
      <div className="mt-4">
        <NewOrderForm
          isAdmin={isAdmin}
          sellers={sellers}
          customers={customers}
          paymentTerms={paymentTerms.map((p) => ({ id: p.id, nombre: p.nombre }))}
          salesChannels={salesChannels.map((c) => ({ id: c.id, nombre: c.nombre }))}
          zones={zones.map((z) => ({ id: z.id, nombre: z.nombre }))}
        />
      </div>
    </div>
  );
}
