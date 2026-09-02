import { Breadcrumb } from "@/components/breadcrumb";
import { listInventorySources } from "@/services/inventory";
import { listStockLevels } from "@/services/stock-import";
import { StockImporter } from "./stock-importer";

export default async function CargarStockPage() {
  const [fuentes, stock] = await Promise.all([listInventorySources(), listStockLevels()]);
  const activas = fuentes.filter((f) => f.estado === "activo");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Cargar stock" }]} />
        <h2 className="text-xl font-semibold">Cargar stock</h2>
        <p className="mt-1 text-sm text-slate-600">
          Carga masiva del stock disponible por producto y fuente, desde CSV o Excel. El registro
          sigue siendo manual: esta pantalla sólo evita cargarlo de a uno.
        </p>
      </div>

      {activas.length === 0 ? (
        <p className="aviso-bloqueo" role="alert">
          <span>
            No hay ninguna fuente de stock activa, así que no hay dónde cargar. Registrá una en
            Maestros → Despacho y volvé.
          </span>
        </p>
      ) : (
        <StockImporter fuentes={activas.map((f) => f.nombre)} />
      )}

      <section>
        <h3 className="font-heading text-lg">Últimos movimientos cargados</h3>
        <p className="mt-1 text-sm text-slate-600">
          Las 50 filas actualizadas más recientemente, para confirmar que la carga entró.
        </p>

        {stock.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">Todavía no hay stock registrado.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2 pr-3 font-medium">Código</th>
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 font-medium">Fuente</th>
                  <th className="py-2 pr-3 text-right font-medium">Disponible</th>
                  <th className="py-2 font-medium">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((fila) => (
                  <tr
                    key={`${fila.codigo}-${fila.fuente}`}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="cifra py-2 pr-3">{fila.codigo}</td>
                    <td className="py-2 pr-3">{fila.descripcion}</td>
                    <td className="py-2 pr-3">{fila.fuente}</td>
                    <td className="cifra py-2 pr-3 text-right">
                      {fila.cantidad.toLocaleString("es-PE")}
                    </td>
                    <td className="cifra py-2 text-slate-600">
                      {new Date(fila.fechaActualizacion).toLocaleString("es-PE", {
                        timeZone: "America/Lima",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
