"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { armarHojaDeRuta, NOMBRE_DIA, type ParaPreparar } from "@/domain/ruteo";
import type { ZonaDeReparto } from "@/services/ruteo";

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima" }) : "—";

/**
 * Armado de la ruta del día.
 *
 * Operaciones elige qué sale: no se arma sola con todo lo pendiente porque
 * lo pendiente son 350 pedidos acumulados —el despacho casi no se marca en
 * el ERP— y una hoja con 279 paradas no la cumple nadie. Las zonas que el
 * plan semanal le asigna a hoy vienen marcadas, y se pueden desmarcar: una
 * urgencia de otra zona no puede quedar afuera por el calendario.
 */
export function ArmadorDeRuta({
  zonas,
  pendientes,
  diaSemana,
}: {
  zonas: ZonaDeReparto[];
  pendientes: ParaPreparar[];
  diaSemana: number;
}) {
  const zonasDeHoy = useMemo(
    () => new Set(zonas.filter((z) => z.esDeHoy).map((z) => z.id)),
    [zonas],
  );

  const [elegidos, setElegidos] = useState<Set<string>>(
    () => new Set(pendientes.filter((p) => p.zonaId && zonasDeHoy.has(p.zonaId)).map((p) => p.id)),
  );
  const [armada, setArmada] = useState(false);

  const alternar = (id: string) => {
    setArmada(false);
    setElegidos((previo) => {
      const copia = new Set(previo);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  };

  const alternarZona = (zonaId: number | null, marcar: boolean) => {
    setArmada(false);
    const delGrupo = pendientes.filter((p) => p.zonaId === zonaId).map((p) => p.id);
    setElegidos((previo) => {
      const copia = new Set(previo);
      for (const id of delGrupo) {
        if (marcar) copia.add(id);
        else copia.delete(id);
      }
      return copia;
    });
  };

  // La lista de selección se muestra con el MISMO orden que va a tener la
  // hoja: así lo que se ve al elegir es lo que después se imprime.
  const porZona = useMemo(() => {
    const hoja = armarHojaDeRuta(pendientes);
    return hoja.grupos;
  }, [pendientes]);

  const hoja = useMemo(
    () => armarHojaDeRuta(pendientes.filter((p) => elegidos.has(p.id))),
    [pendientes, elegidos],
  );

  if (pendientes.length === 0) {
    return <p className="card p-5 text-sm text-gray-600">No hay pedidos esperando despacho.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="no-imprimir flex flex-col gap-3">
        {porZona.map((grupo) => {
          const ids = grupo.paradas.map((p) => p.id);
          const marcados = ids.filter((id) => elegidos.has(id)).length;
          const esDeHoy = grupo.zonaId !== null && zonasDeHoy.has(grupo.zonaId);
          return (
            <details key={grupo.zonaNombre} open={esDeHoy} className="card overflow-hidden">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="font-heading text-base">
                  {grupo.zonaNombre}
                  {esDeHoy && (
                    <span className="ml-2 rounded-full bg-logisalud-green/10 px-2 py-0.5 text-xs font-medium text-logisalud-green">
                      le toca hoy
                    </span>
                  )}
                </span>
                <span className="text-sm text-gray-600">
                  {marcados} de {ids.length} elegidos
                </span>
              </summary>

              <div className="border-t border-gray-100 px-4 py-3">
                <div className="mb-2 flex gap-3 text-sm">
                  <button
                    type="button"
                    className="text-logisalud-green hover:underline"
                    onClick={() => alternarZona(grupo.zonaId, true)}
                  >
                    Marcar toda la zona
                  </button>
                  <button
                    type="button"
                    className="text-gray-600 hover:underline"
                    onClick={() => alternarZona(grupo.zonaId, false)}
                  >
                    Desmarcar
                  </button>
                </div>

                <ul className="flex flex-col gap-1.5">
                  {grupo.paradas.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={elegidos.has(p.id)}
                          onChange={() => alternar(p.id)}
                        />
                        <span>
                          <span className="font-medium text-gray-900">{p.razonSocial}</span>
                          <span className="cifra text-gray-600"> · #{p.numero}</span>
                          <span className="block text-gray-600">
                            {p.distrito ?? "sin distrito"} — {p.direccion ?? "sin dirección"}
                          </span>
                          <span className="block text-xs text-gray-500">
                            Enviado {fecha(p.fechaEnvio)}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          );
        })}
      </section>

      <div className="no-imprimir flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={elegidos.size === 0}
          onClick={() => setArmada(true)}
        >
          Armar la ruta ({elegidos.size})
        </button>
        {armada && (
          <button type="button" className="btn-secondary" onClick={() => window.print()}>
            Imprimir hoja de ruta
          </button>
        )}
      </div>

      {armada && (
        <section className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-heading text-lg">
              Hoja de ruta — {NOMBRE_DIA[diaSemana]}{" "}
              {new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima" })}
            </h3>
            <p className="text-sm text-gray-600">
              {hoja.paradas} {hoja.paradas === 1 ? "pedido" : "pedidos"} · {hoja.destinos}{" "}
              {hoja.destinos === 1 ? "destino" : "destinos"} · {hoja.distritos}{" "}
              {hoja.distritos === 1 ? "distrito" : "distritos"}
            </p>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Sale del almacén de Lurín. El orden es el de visita del catálogo de zonas, no un
            cálculo de distancias ni de tráfico.
          </p>

          {hoja.grupos.map((grupo) => (
            <div key={grupo.zonaNombre} className="mt-5">
              <h4 className="font-heading text-base uppercase tracking-wide text-gray-900">
                {grupo.zonaNombre}
              </h4>
              <ol className="mt-2 flex flex-col gap-2">
                {grupo.paradas.map((p) => (
                  <li key={p.id} className="flex gap-3 border-b border-gray-100 pb-2 last:border-0">
                    <span className="cifra w-7 shrink-0 text-right font-semibold text-logisalud-green">
                      {p.orden}
                    </span>
                    <span className="text-sm">
                      <span className="font-medium text-gray-900">{p.razonSocial}</span>
                      <span className="block text-gray-700">
                        {p.distrito ?? "—"} — {p.direccion ?? "sin dirección"}
                      </span>
                      <span className="cifra block text-xs text-gray-600">
                        Pedido #{p.numero}
                        {p.celular ? ` · ${p.celular}` : ""}
                      </span>
                    </span>
                    <Link
                      href={`/operaciones/${p.id}`}
                      className="no-imprimir ml-auto shrink-0 self-start text-xs text-logisalud-teal hover:underline"
                    >
                      Despachar →
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
