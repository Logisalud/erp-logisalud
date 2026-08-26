import Link from "next/link";
import { Breadcrumb } from "@/components/breadcrumb";
import { listOrdersWithDrafts } from "@/services/electronic-documents";

export default async function DocumentosPage() {
  const pedidos = await listOrdersWithDrafts();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[{ label: "Control de pedidos", href: "/" }, { label: "Documentación electrónica" }]} />
        <h2 className="text-xl font-semibold">Documentación electrónica</h2>
        <p className="mt-1 text-sm text-gray-600">
          Borradores generados al despachar cada pedido, para revisar contra el manual de la
          facturadora.
        </p>
      </div>

      <p className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
        <strong>Nada de esto se ha enviado a ningún servicio.</strong> Son archivos generados
        localmente para revisión humana. Los nombres y códigos de campo están sin confirmar contra
        el manual oficial.
      </p>

      {pedidos.length === 0 ? (
        <p className="text-sm text-gray-500">
          Todavía no hay borradores. Se generan solos al confirmar el despacho de un pedido.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pedidos.map((p) => (
            <li key={p.order_id}>
              <Link
                href={`/control-pedidos/documentos/${p.order_id}`}
                className="card block p-4 hover:shadow-md"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-logisalud-green">Pedido #{p.numero}</p>
                  <p className="text-xs text-gray-500">
                    Generado{" "}
                    {new Date(p.generado_en).toLocaleString("es-PE", { timeZone: "America/Lima" })}
                  </p>
                </div>
                <p className="mt-1 text-sm text-gray-700">{p.razon_social_snapshot ?? "—"}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
