import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { listDraftsForOrder } from "@/services/electronic-documents";
import { getOrderForFulfillment } from "@/services/fulfillments";
import { DraftViewer } from "./draft-viewer";

export default async function DocumentosDePedidoPage({
  params,
}: {
  params: { orderId: string };
}) {
  const [drafts, order] = await Promise.all([
    listDraftsForOrder(params.orderId),
    getOrderForFulfillment(params.orderId),
  ]);

  if (drafts.length === 0 && !order) notFound();

  const numero = order?.numero ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Documentación electrónica", href: "/control-pedidos/documentos" },
            { label: `Pedido #${numero}` },
          ]}
        />
        <h2 className="text-xl font-semibold">Pedido #{numero}</h2>
        {order && (
          <p className="mt-1 text-sm text-gray-600">
            {order.razonSocial} · {order.rucODocumento}
          </p>
        )}
      </div>

      <p className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
        <strong>Borradores sin validar.</strong> No se enviaron a NubeFact ni a ningún otro
        servicio. Sirven para comparar campo por campo contra el manual oficial antes de conectar
        la integración real.
      </p>

      {drafts.length === 0 ? (
        <p className="text-sm text-gray-500">
          Este pedido no tiene borradores generados. Se generan al confirmar el despacho.
        </p>
      ) : (
        drafts.map((d) => <DraftViewer key={d.id} draft={d} numeroPedido={numero} />)
      )}
    </div>
  );
}
