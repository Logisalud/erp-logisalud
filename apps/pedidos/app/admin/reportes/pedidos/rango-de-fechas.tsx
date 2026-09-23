"use client";

import { useState } from "react";

/**
 * Filtro de fechas del reporte.
 *
 * La descarga es un enlace y no un fetch: el navegador se encarga de guardar
 * el archivo, y no hay que mantener el .xlsx en memoria del cliente. Por eso
 * lo único que hace este componente es armar la URL.
 */
export function RangoDeFechas() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const params = new URLSearchParams();
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  const query = params.toString();
  const href = `/admin/reportes/pedidos/excel${query ? `?${query}` : ""}`;

  const rangoInvertido = desde && hasta && desde > hasta;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Desde</span>
          <input
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Hasta</span>
          <input
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        {(desde || hasta) && (
          <button
            type="button"
            onClick={() => {
              setDesde("");
              setHasta("");
            }}
            className="min-h-12 px-3 text-sm text-gray-500 underline hover:text-gray-700"
          >
            Quitar fechas
          </button>
        )}
      </div>

      <div>
        <a href={href} className="btn-primary inline-flex items-center justify-center">
          Exportar a Excel
        </a>
      </div>

      {rangoInvertido && (
        <p className="text-sm text-amber-700">
          El &ldquo;desde&rdquo; es posterior al &ldquo;hasta&rdquo;: el reporte va a salir con las
          fechas dadas vuelta.
        </p>
      )}
    </div>
  );
}
