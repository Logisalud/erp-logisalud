import Link from "next/link";
import { Breadcrumb } from "@/components/breadcrumb";
import { getCurrentUser } from "@/lib/auth/session";
import { displayNombreProducto } from "@/domain/products";
import { getStockResumen, listStockLotes, STOCK_PAGE_SIZE } from "@/services/stock";

/**
 * Consulta de stock, de sólo lectura, para cualquier rol.
 *
 * El vendedor necesita responder "¿cuánto hay de esto?" antes de
 * ofrecérselo a un cliente, y hasta ahora el stock vivía dentro de
 * Maestros, que sólo ve el administrador. Se muestra por LOTE, tal cual
 * está en el almacén: el mismo producto puede tener varios, cada uno con
 * su vencimiento.
 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: { q?: string; pagina?: string };
}) {
  const busqueda = (searchParams.q ?? "").trim();
  const pagina = Math.max(1, Number(searchParams.pagina ?? "1") || 1);

  const [user, resumen, page] = await Promise.all([
    getCurrentUser(),
    getStockResumen(),
    listStockLotes({ busqueda, pagina }),
  ]);

  const esAdmin = user?.roles.includes("administrador") ?? false;
  const hrefPagina = (n: number) => {
    const params = new URLSearchParams();
    if (busqueda) params.set("q", busqueda);
    if (n > 1) params.set("pagina", String(n));
    const qs = params.toString();
    return qs ? `/stock?${qs}` : "/stock";
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[{ label: "Stock" }]} />
        <h2 className="text-xl font-semibold">Stock disponible</h2>
        <p className="mt-1 text-sm text-gray-600">
          Lo que hay en almacén, por lote. Es sólo de consulta: la carga la hace un administrador
          desde el importador.
          {resumen.ultimaActualizacion && (
            <>
              {" "}
              Última carga:{" "}
              <span className="cifra">
                {new Date(resumen.ultimaActualizacion).toLocaleString("es-PE", {
                  timeZone: "America/Lima",
                })}
              </span>
              .
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="cifra text-lg font-semibold">{resumen.productos.toLocaleString("es-PE")}</p>
          <p className="text-xs text-gray-600">Productos con stock</p>
        </div>
        <div className="card p-4">
          <p className="cifra text-lg font-semibold">{resumen.lotes.toLocaleString("es-PE")}</p>
          <p className="text-xs text-gray-600">Lotes</p>
        </div>
        <div className="card p-4">
          <p className="cifra text-lg font-semibold">{resumen.unidades.toLocaleString("es-PE")}</p>
          <p className="text-xs text-gray-600">Unidades</p>
        </div>
      </div>

      {/*
        Formulario GET, sin JavaScript: la búsqueda queda en la URL, así que
        se puede compartir o recargar, y funciona igual con la señal mala
        del celular en la calle.
      */}
      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="q">
          Buscar por código o nombre de producto
        </label>
        <input
          id="q"
          name="q"
          defaultValue={busqueda}
          placeholder="Código o nombre del producto…"
          className="campo flex-1"
        />
        <button type="submit" className="btn-secondary sm:w-40">
          Buscar
        </button>
      </form>

      {page.filas.length === 0 ? (
        <p className="text-sm text-slate-600">
          {busqueda
            ? `Ningún lote coincide con “${busqueda}”.`
            : "Todavía no hay stock cargado."}
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {page.total.toLocaleString("es-PE")} lote{page.total === 1 ? "" : "s"}
            {busqueda ? ` para “${busqueda}”` : ""} · página {page.pagina} de {page.paginas}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2 pr-3 font-medium">Código</th>
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 font-medium">Lote</th>
                  <th className="py-2 pr-3 font-medium">Vence</th>
                  <th className="py-2 pr-3 text-right font-medium">Cantidad</th>
                  <th className="py-2 pr-3 font-medium">Fuente</th>
                  <th className="py-2 font-medium">Proveedor</th>
                </tr>
              </thead>
              <tbody>
                {page.filas.map((f) => (
                  <tr key={f.id} className="border-b border-slate-100 last:border-0">
                    <td className="cifra py-2 pr-3">{f.codigo}</td>
                    <td className="py-2 pr-3">{displayNombreProducto(f.descripcion, f.codigo)}</td>
                    <td className="cifra py-2 pr-3">{f.lote}</td>
                    <td className="cifra py-2 pr-3">{f.fechaVencimiento ?? "—"}</td>
                    <td className="cifra py-2 pr-3 text-right font-medium text-slate-900">
                      {f.cantidad.toLocaleString("es-PE")}
                    </td>
                    <td className="py-2 pr-3">{f.fuente}</td>
                    <td className="py-2 text-slate-600">{f.proveedor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {page.paginas > 1 && (
            <div className="flex items-center justify-between gap-3">
              {page.pagina > 1 ? (
                <Link href={hrefPagina(page.pagina - 1)} className="btn-secondary text-sm">
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-slate-600">
                {STOCK_PAGE_SIZE} lotes por página
              </span>
              {page.pagina < page.paginas ? (
                <Link href={hrefPagina(page.pagina + 1)} className="btn-secondary text-sm">
                  Siguiente
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}

      {esAdmin && (
        <p className="text-sm text-slate-600">
          Para cargar el stock del día:{" "}
          <Link href="/admin/maestros/stock" className="underline">
            importador de stock
          </Link>
          .
        </p>
      )}
    </div>
  );
}
