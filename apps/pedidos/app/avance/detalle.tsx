"use client";

import { useMemo, useState } from "react";
import type { LineaDetalle } from "@/services/avance";

const soles = (n: number | null) =>
  (n ?? 0).toLocaleString("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 });

const fechaCorta = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a.slice(2)}`;
};

/**
 * El detalle de venta: una fila por producto facturado, como viene de la
 * base de Comercial.
 *
 * Con filtro de texto y no con cinco selectores: el vendedor busca "¿qué
 * le vendí a Vidal Marcelo?" o "¿cuánto del FIEBRIN?", y una sola caja
 * cubre las dos preguntas sin obligarlo a elegir primero en qué columna
 * mirar. En el celular, además, cada selector come una pantalla.
 */
export function DetalleDeVenta({
  filas,
  mostrarVendedor,
}: {
  filas: LineaDetalle[];
  mostrarVendedor: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [soloNotas, setSoloNotas] = useState(false);

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (soloNotas && !/NOTA/i.test(f.tipoDocumento ?? "")) return false;
      if (!t) return true;
      return [f.razonSocial, f.producto, f.nroDocumento, f.ruc, f.linea, f.codProducto, f.vendedor]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t));
    });
  }, [filas, busqueda, soloNotas]);

  const total = visibles.reduce((s, f) => s + (f.neto ?? 0), 0);
  const unidades = visibles.reduce((s, f) => s + (f.cantidad ?? 0), 0);

  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg">Mi detalle de venta</h2>
        <a href="/avance/excel" className="text-sm font-medium text-logisalud-green underline">
          Bajar en Excel
        </a>
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-slate-600">
          Todavía no hay ninguna línea facturada a tu nombre en este corte.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente, producto, documento…"
              aria-label="Buscar en el detalle"
              className="campo sm:max-w-sm"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={soloNotas}
                onChange={(e) => setSoloNotas(e.target.checked)}
                className="h-5 w-5 rounded border-slate-400"
              />
              Solo notas de crédito
            </label>
          </div>

          <p className="text-sm text-slate-600">
            {visibles.length.toLocaleString("es-PE")}{" "}
            {visibles.length === 1 ? "línea" : "líneas"} · {unidades.toLocaleString("es-PE")}{" "}
            unidades · <strong className="text-slate-900">{soles(total)}</strong>
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Documento</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Producto</th>
                  {mostrarVendedor && <th className="py-2 pr-3">Vendedor</th>}
                  <th className="py-2 pr-3 text-right">Cant.</th>
                  <th className="py-2 text-right">Neto</th>
                </tr>
              </thead>
              <tbody>
                {visibles.slice(0, 500).map((f, i) => {
                  const esNota = /NOTA/i.test(f.tipoDocumento ?? "");
                  return (
                    <tr key={i} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{fechaCorta(f.fecha)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <span className="block font-medium text-slate-800">{f.nroDocumento ?? "—"}</span>
                        {/* El tipo va como texto y no como color: una nota de
                            crédito resta, y eso tiene que leerse. */}
                        <span className={esNota ? "text-xs font-medium text-red-700" : "text-xs text-slate-500"}>
                          {esNota ? "Nota de crédito" : (f.tipoDocumento ?? "")}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{f.razonSocial ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <span className="block">{f.producto ?? "—"}</span>
                        <span className="text-xs text-slate-500">
                          {[f.codProducto, f.linea].filter(Boolean).join(" · ")}
                        </span>
                      </td>
                      {mostrarVendedor && <td className="py-2 pr-3 text-slate-600">{f.vendedor ?? "—"}</td>}
                      <td className="py-2 pr-3 text-right tabular-nums">{f.cantidad ?? 0}</td>
                      <td className="py-2 text-right tabular-nums">{soles(f.neto)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {visibles.length > 500 && (
            <p className="text-sm text-slate-600">
              Se muestran las primeras 500 de {visibles.length.toLocaleString("es-PE")}. Afiná la
              búsqueda, o bajá el Excel para verlas todas.
            </p>
          )}
        </>
      )}
    </section>
  );
}
