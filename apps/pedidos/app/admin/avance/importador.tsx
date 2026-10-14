"use client";

import { useRef, useState } from "react";
import {
  abandonarCarga,
  abrirCarga,
  leerContexto,
  publicarCarga,
  subirTandaDeDetalle,
} from "./actions";
import { leerLibroDeAvance, type LibroDeAvance } from "@/lib/leer-excel-avance";
import {
  HOJA_AVANCE,
  HOJA_DETALLE,
  resumirCarga,
  type ResumenCarga,
} from "@/domain/avance-import";

const soles = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 });

const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

/** Filas por viaje al servidor. ~300 KB cada tanda. */
const TANDA = 800;

type Leido = LibroDeAvance & { archivo: string };

type Estado =
  | { paso: "inicio" }
  | { paso: "leyendo" }
  | { paso: "previo"; leido: Leido; resumen: ResumenCarga; reemplazaA: Reemplazo }
  | { paso: "subiendo"; hechas: number; total: number }
  | { paso: "listo"; resumen: ResumenCarga };

type Reemplazo = { fechaCorte: string; subidoEn: string } | null;

/**
 * Carga del avance de ventas.
 *
 * **El Excel se abre acá, en el navegador.** Mandarlo al servidor no
 * funcionaba: son 3,4 MB y dieciséis hojas, la petición no llegaba a
 * ejecutarse y lo único que veía quien cargaba era "Failed to fetch". Y el
 * archivo crece todos los días. Ahora se leen las dos hojas que importan y
 * se manda solo eso, de a 800 filas, con la cuenta a la vista.
 *
 * La vista previa no es un trámite: esta carga reemplaza lo que ven los
 * dieciocho vendedores, y el error más probable no es un archivo roto sino
 * el archivo de ayer subido de nuevo.
 */
export function ImportadorAvance() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>({ paso: "inicio" });
  const [error, setError] = useState<string | null>(null);

  const trabajando = estado.paso === "leyendo" || estado.paso === "subiendo";

  async function leerArchivo(file: File) {
    setError(null);
    setEstado({ paso: "leyendo" });
    try {
      const { avance, detalle } = await leerLibroDeAvance(file);

      const contexto = await leerContexto(avance.periodo);
      const resumen = resumirCarga(avance, detalle, new Set(contexto.codigos));

      setEstado({
        paso: "previo",
        leido: { avance, detalle, archivo: file.name },
        resumen,
        reemplazaA: contexto.vigente,
      });
    } catch (err) {
      setEstado({ paso: "inicio" });
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    }
  }

  async function publicar(leido: Leido, resumen: ResumenCarga) {
    if (!resumen.periodo || !resumen.fechaCorte) {
      setError(`No pude leer la fecha de corte de la hoja "${HOJA_AVANCE}".`);
      return;
    }

    setError(null);
    const total = leido.detalle.length;
    setEstado({ paso: "subiendo", hechas: 0, total });

    let cargaId: string | null = null;
    try {
      cargaId = await abrirCarga(
        {
          periodo: resumen.periodo,
          fechaCorte: resumen.fechaCorte,
          inicioMes: leido.avance.inicioMes,
          diasMes: resumen.diasMes,
          diasTranscurridos: resumen.diasTranscurridos,
          archivo: leido.archivo,
          filasDetalle: total,
        },
        leido.avance.filas,
      );

      for (let i = 0; i < total; i += TANDA) {
        await subirTandaDeDetalle(cargaId, leido.detalle.slice(i, i + TANDA));
        setEstado({ paso: "subiendo", hechas: Math.min(i + TANDA, total), total });
      }

      await publicarCarga(cargaId, resumen);
      setEstado({ paso: "listo", resumen });
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      // Una carga a medias no se queda: todavía está apagada, así que
      // nadie la vio, pero sus filas ensucian el histórico.
      if (cargaId) {
        try {
          await abandonarCarga(cargaId);
        } catch {
          // Si tampoco se puede descartar, queda apagada y la limpieza
          // de cargas viejas se la lleva. No hay nada que avisar acá.
        }
      }
      setEstado({ paso: "previo", leido, resumen, reemplazaA: null });
      setError(
        err instanceof Error
          ? `No se pudo publicar: ${err.message}. No se cambió nada; los vendedores siguen viendo la carga anterior.`
          : "No se pudo publicar. No se cambió nada.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-4 p-5">
        {error && (
          <p className="aviso-error" role="alert">
            <span aria-hidden>✕</span>
            <span>{error}</span>
          </p>
        )}

        <div>
          <label className="etiqueta" htmlFor="archivo">
            Excel del avance de ventas
          </label>
          <input
            ref={inputRef}
            id="archivo"
            type="file"
            accept=".xlsx"
            disabled={trabajando}
            className="campo py-2"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void leerArchivo(file);
            }}
          />
          <p className="mt-1.5 text-sm text-slate-600">
            El archivo de siempre. Se leen dos hojas: <strong>{HOJA_AVANCE}</strong> para el cuadro y{" "}
            <strong>{HOJA_DETALLE}</strong> para el detalle de venta. El resto se ignora.
          </p>
        </div>

        {estado.paso === "leyendo" && (
          <p className="aviso-info" role="status">
            <span aria-hidden>⏳</span>
            <span>Abriendo el archivo… son unos segundos, el Excel es grande.</span>
          </p>
        )}

        {estado.paso === "subiendo" && (
          <div className="flex flex-col gap-2" role="status">
            <p className="text-sm text-slate-700">
              Subiendo el detalle: {estado.hechas.toLocaleString("es-PE")} de{" "}
              {estado.total.toLocaleString("es-PE")} líneas. No cierres la pantalla.
            </p>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-logisalud-green transition-all"
                style={{ width: `${estado.total ? (estado.hechas / estado.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {estado.paso === "listo" && (
        <p className="aviso-ok" role="status">
          <span aria-hidden>✓</span>
          <span>
            Publicado. {estado.resumen.vendedores} vendedores con el corte al{" "}
            {estado.resumen.fechaCorte ? fechaLarga(estado.resumen.fechaCorte) : "—"} y{" "}
            {estado.resumen.filasDetalle.toLocaleString("es-PE")} líneas de detalle. Cada uno ya ve
            lo suyo.
          </span>
        </p>
      )}

      {estado.paso === "previo" && (
        <section className="card flex flex-col gap-4 p-5">
          <h3 className="font-heading text-lg">Esto es lo que se va a publicar</h3>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato
              titulo="Corte al"
              valor={estado.resumen.fechaCorte ? fechaLarga(estado.resumen.fechaCorte) : "—"}
            />
            <Dato
              titulo="Día del mes"
              valor={
                estado.resumen.diasTranscurridos && estado.resumen.diasMes
                  ? `${estado.resumen.diasTranscurridos} de ${estado.resumen.diasMes}`
                  : "—"
              }
            />
            <Dato titulo="Vendedores" valor={String(estado.resumen.vendedores)} />
            <Dato
              titulo="Líneas de detalle"
              valor={estado.resumen.filasDetalle.toLocaleString("es-PE")}
            />
            <Dato titulo="Avance total" valor={soles(estado.resumen.totalAvance)} />
            <Dato titulo="Cuota total" valor={soles(estado.resumen.totalCuota)} />
            <Dato
              titulo="% del mes"
              valor={
                estado.resumen.totalCuota
                  ? `${((estado.resumen.totalAvance / estado.resumen.totalCuota) * 100).toFixed(2)}%`
                  : "—"
              }
            />
            <Dato titulo="Período" valor={estado.resumen.periodo ?? "—"} />
          </dl>

          {estado.reemplazaA && (
            <p className="aviso-info">
              <span aria-hidden>↻</span>
              <span>
                Reemplaza la carga del corte al {fechaLarga(estado.reemplazaA.fechaCorte)}, subida el{" "}
                {new Date(estado.reemplazaA.subidoEn).toLocaleString("es-PE")}.
              </span>
            </p>
          )}

          {estado.resumen.codigosSinVendedor.length > 0 && (
            <p className="aviso-bloqueo">
              <span aria-hidden>!</span>
              <span>
                Estos códigos del cuadro no tienen vendedor cargado en el sistema, así que su fila no
                la va a ver nadie (vos sí):{" "}
                <strong>{estado.resumen.codigosSinVendedor.join(", ")}</strong>. Si alguno es una
                persona que debería entrar, cargala en Maestros → Vendedores.
              </span>
            </p>
          )}

          <div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void publicar(estado.leido, estado.resumen)}
            >
              Publicar a los vendedores
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{titulo}</dt>
      <dd className="mt-0.5 text-base font-semibold text-slate-900">{valor}</dd>
    </div>
  );
}
