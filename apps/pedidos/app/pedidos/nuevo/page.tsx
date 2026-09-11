import { getCurrentUser } from "@/lib/auth/session";
import { listActiveCustomers } from "@/services/customers";
import { listActiveSellers } from "@/services/sellers";
import { listCatalog, listPaymentTerms } from "@/services/catalog";
import { listDepartamentos } from "@/services/ubigeos";
import { NewOrderForm } from "./new-order-form";

export default async function NuevoPedidoPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.roles.includes("administrador") ?? false;

  // La zona del cliente nuevo ya no se elige: sale del vendedor con el que
  // va a salir el pedido, así que la pantalla no necesita el catálogo.
  const [customers, paymentTerms, salesChannels, sellers, departamentos] = await Promise.all([
    listActiveCustomers(),
    listPaymentTerms(),
    listCatalog("sales_channels"),
    isAdmin ? listActiveSellers() : Promise.resolve([]),
    // Sólo los 25 departamentos: las provincias y los distritos se piden
    // cuando el vendedor elige, para no mandarle 1.884 filas al celular.
    listDepartamentos(),
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
          departamentos={departamentos}
        />
      </div>
    </div>
  );
}
