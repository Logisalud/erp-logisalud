import { requireSession } from "@/lib/auth/session";
import { listPendingApprovalRequests } from "@/services/approvals";
import { listarBloqueosPendientes } from "@/services/credito";
import { ApprovalRequestList } from "./approval-request-list";
import { BloqueosDeCredito } from "./bloqueos-credito";

export default async function AprobadorComercialPage() {
  // Antes de consultar nada: el layout y la página se renderizan en
  // paralelo, así que sin esto la consulta sale al mismo tiempo que el
  // guardia del layout y, con la sesión vencida, gana cualquiera.
  await requireSession();
  const [requests, bloqueos] = await Promise.all([
    listPendingApprovalRequests(),
    listarBloqueosPendientes(),
  ]);

  return (
    <div>
      <h2 className="text-xl font-semibold">Solicitudes de descuento pendientes</h2>
      <p className="mt-1 text-sm text-gray-600">
        El pedido no avanza mientras la solicitud siga pendiente.
      </p>
      <div className="mt-4">
        <ApprovalRequestList requests={requests} />
      </div>

      <section className="mt-10">
        <h3 className="text-lg font-semibold">
          Pedidos frenados por deuda
          {bloqueos.length > 0 && <span className="text-gray-500"> ({bloqueos.length})</span>}
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          El cliente arrastra deuda vencida más allá de la tolerancia. Dejar pasar el pedido es una
          decisión comercial: queda registrada con tu nombre y con lo que debía en ese momento.
        </p>
        <BloqueosDeCredito bloqueos={bloqueos} />
      </section>
    </div>
  );
}
