import { listPendingCustomers } from "@/services/customers";
import { listAdministrativeExceptionOrders } from "@/services/order-exceptions";
import { Breadcrumb } from "@/components/breadcrumb";
import { CustomerValidationList } from "./customer-validation-list";
import { AdministrativeExceptionList } from "./administrative-exception-list";
import { aprobarCliente, rechazarCliente, aprobarExcepcionAdministrativa, devolverPedido, observarPedido } from "./actions";

export default async function ValidacionClientesPage() {
  const [customers, administrativeExceptionOrders] = await Promise.all([
    listPendingCustomers(),
    listAdministrativeExceptionOrders(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Breadcrumb items={[{ label: "Control de Pedidos" }, { label: "Validación de clientes" }]} />
        <h2 className="text-xl font-semibold">Clientes pendientes de validación</h2>
        <p className="mt-1 text-sm text-gray-600">
          Solicitudes creadas por vendedores. Un cliente no puede usarse en
          pedidos hasta ser aprobado acá.
        </p>
        <div className="mt-4">
          <CustomerValidationList
            customers={customers}
            onAprobar={aprobarCliente}
            onRechazar={rechazarCliente}
          />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold">Pedidos en excepción administrativa</h2>
        <p className="mt-1 text-sm text-gray-600">
          La condición de pago elegida en el pedido es distinta de la condición de pago habitual del cliente.
        </p>
        <div className="mt-4">
          <AdministrativeExceptionList
            orders={administrativeExceptionOrders}
            onAprobar={aprobarExcepcionAdministrativa}
            onDevolver={devolverPedido}
            onObservar={observarPedido}
          />
        </div>
      </div>
    </div>
  );
}
