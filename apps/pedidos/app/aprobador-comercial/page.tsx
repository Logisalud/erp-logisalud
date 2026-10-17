import { requireSession } from "@/lib/auth/session";
import { listPendingApprovalRequests } from "@/services/approvals";
import { ApprovalRequestList } from "./approval-request-list";

export default async function AprobadorComercialPage() {
  // Antes de consultar nada: el layout y la página se renderizan en
  // paralelo, así que sin esto la consulta sale al mismo tiempo que el
  // guardia del layout y, con la sesión vencida, gana cualquiera.
  await requireSession();
  const requests = await listPendingApprovalRequests();

  return (
    <div>
      <h2 className="text-xl font-semibold">Solicitudes de descuento pendientes</h2>
      <p className="mt-1 text-sm text-gray-600">
        El pedido no avanza mientras la solicitud siga pendiente.
      </p>
      <div className="mt-4">
        <ApprovalRequestList requests={requests} />
      </div>
    </div>
  );
}
