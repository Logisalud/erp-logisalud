import { listPendingApprovalRequests } from "@/services/approvals";
import { ApprovalRequestList } from "./approval-request-list";

export default async function AprobadorComercialPage() {
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
