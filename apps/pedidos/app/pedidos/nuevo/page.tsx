import { getCurrentUser } from "@/lib/auth/session";
import { listActiveCustomers, listZonasSeleccionables } from "@/services/customers";
import { listActiveSellers } from "@/services/sellers";
import { listCatalog, listPaymentTerms } from "@/services/catalog";
import { NewOrderForm } from "./new-order-form";

export default async function NuevoPedidoPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.roles.includes("administrador") ?? false;

  const [customers, paymentTerms, salesChannels, zones, sellers] = await Promise.all([
    listActiveCustomers(),
    listPaymentTerms(),
    listCatalog("sales_channels"),
    // Sólo las zonas que el usuario puede usar: un cliente registrado en
    // otra zona le queda invisible por RLS y el registro rebota.
    listZonasSeleccionables(isAdmin),
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
          paymentTerms={paymentTerms.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            permite_dias_libres: p.permite_dias_libres,
          }))}
          salesChannels={salesChannels.map((c) => ({ id: c.id, nombre: c.nombre }))}
          zones={zones}
        />
      </div>
    </div>
  );
}
