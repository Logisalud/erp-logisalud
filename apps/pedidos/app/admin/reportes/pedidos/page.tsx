import { Breadcrumb } from "@/components/breadcrumb";
import { RangoDeFechas } from "./rango-de-fechas";
import { contarPedidosEnviados } from "@/services/reportes-resumen";

export const dynamic = "force-dynamic";

export default async function ReportePedidosPage() {
  const resumen = await contarPedidosEnviados();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Breadcrumb items={[{ label: "Reportes", href: "/admin" }, { label: "Pedidos enviados" }]} />
        <h2 className="text-xl font-semibold">Reporte de pedidos enviados</h2>
        <p className="mt-1 text-sm text-gray-600">
          Una fila por línea de producto, con el precio de lista, el precio que se cobró y en qué
          quedó la solicitud de descuento de esa línea. Los borradores no entran: solo pedidos
          efectivamente enviados.
        </p>
      </div>

      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <p className="text-lg font-semibold">{resumen.pedidos.toLocaleString("es-PE")}</p>
            <p className="text-xs text-gray-600">Pedidos enviados</p>
          </div>
          <div className="card p-4">
            <p className="text-lg font-semibold">{resumen.lineas.toLocaleString("es-PE")}</p>
            <p className="text-xs text-gray-600">Líneas de producto</p>
          </div>
          <div className="card p-4">
            <p className="text-sm font-semibold">
              {resumen.primera ?? "—"}
              {resumen.ultima && resumen.ultima !== resumen.primera ? ` → ${resumen.ultima}` : ""}
            </p>
            <p className="text-xs text-gray-600">Período con datos</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="font-heading text-lg">Exportar</h3>
        <p className="mt-1 text-sm text-slate-600">
          Sin fechas descarga todo el histórico. Con un rango, solo los pedidos enviados dentro de
          esos días (ambos inclusive).
        </p>
        <div className="mt-3">
          <RangoDeFechas />
        </div>
      </section>
    </div>
  );
}
