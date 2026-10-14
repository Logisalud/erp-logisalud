"use client";

import { useRef, useState, useTransition } from "react";
import { previewCarga, publicarCarga } from "./actions";
import type { PreviewAvance, ResultadoAvance } from "@/services/avance";

const soles = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 });

const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

/**
 * Carga del avance de ventas. Vista previa primero, publicar después —
 * el mismo gesto que los importadores de precios, stock y clientes.
 *
 * La vista previa no es un trámite: esta carga reemplaza lo que ven los
 * dieciocho vendedores. Antes de pisarla conviene leer de qué día es el
 * corte y cuántas filas trae, porque el error más probable no es un
 * archivo roto sino el archivo de ayer subido de nuevo.
 */
export function ImportadorAvance() {
  const formRef = useRef<HTMLFormElement>(null);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewAvance | null>(null);
  const [resultado, setResultado] = useState<ResultadoAvance | null>(null);

  function correr(accion: "preview" | "publicar") {
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      try {
        if (accion === "preview") {
          setResultado(null);
          setPreview(await previewCarga(formData));
        } else {
          setResultado(await publicarCarga(formData));
          setPreview(null);
          form.reset();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
      }
    });
  }

  const r = preview?.resumen;

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} className="card flex flex-col gap-4 p-5">
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
            id="archivo"
            type="file"
            name="archivo"
            accept=".xlsx"
            required
            className="campo py-2"
            onChange={() => {
              // Cambiar el archivo invalida la vista previa: publicar con la
              // del anterior publicaría números que nadie miró.
              setPreview(null);
              setResultado(null);
              setError(null);
            }}
          />
          <p className="mt-1.5 text-sm text-slate-600">
            El archivo de siempre. Se leen dos hojas: <strong>AVANCE 2026</strong> para el cuadro y{" "}
            <strong>base</strong> para el detalle de venta. El resto se ignora.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={pendiente}
            onClick={() => correr("preview")}
          >
            {pendiente ? "Leyendo…" : "Ver qué trae"}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={pendiente || !preview}
            onClick={() => correr("publicar")}
          >
            Publicar a los vendedores
          </button>
        </div>
      </form>

      {resultado && (
        <p className="aviso-ok" role="status">
          <span aria-hidden>✓</span>
          <span>
            Publicado. {resultado.resumen.vendedores} vendedores con el corte al{" "}
            {resultado.resumen.fechaCorte ? fechaLarga(resultado.resumen.fechaCorte) : "—"} y{" "}
            {resultado.resumen.filasDetalle.toLocaleString("es-PE")} líneas de detalle. Cada uno ya
            ve lo suyo.
          </span>
        </p>
      )}

      {r && (
        <section className="card flex flex-col gap-4 p-5">
          <h3 className="font-heading text-lg">Esto es lo que se va a publicar</h3>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato titulo="Corte al" valor={r.fechaCorte ? fechaLarga(r.fechaCorte) : "—"} />
            <Dato
              titulo="Día del mes"
              valor={r.diasTranscurridos && r.diasMes ? `${r.diasTranscurridos} de ${r.diasMes}` : "—"}
            />
            <Dato titulo="Vendedores" valor={String(r.vendedores)} />
            <Dato titulo="Líneas de detalle" valor={r.filasDetalle.toLocaleString("es-PE")} />
            <Dato titulo="Avance total" valor={soles(r.totalAvance)} />
            <Dato titulo="Cuota total" valor={soles(r.totalCuota)} />
            <Dato
              titulo="% del mes"
              valor={r.totalCuota ? `${((r.totalAvance / r.totalCuota) * 100).toFixed(2)}%` : "—"}
            />
            <Dato titulo="Período" valor={r.periodo ?? "—"} />
          </dl>

          {preview.reemplazaA && (
            <p className="aviso-info">
              <span aria-hidden>↻</span>
              <span>
                Reemplaza la carga del corte al {fechaLarga(preview.reemplazaA.fechaCorte)}, subida
                el {new Date(preview.reemplazaA.subidoEn).toLocaleString("es-PE")}.
              </span>
            </p>
          )}

          {r.codigosSinVendedor.length > 0 && (
            <p className="aviso-bloqueo">
              <span aria-hidden>!</span>
              <span>
                Estos códigos del cuadro no tienen vendedor cargado en el sistema, así que su fila
                no la va a ver nadie (vos sí): <strong>{r.codigosSinVendedor.join(", ")}</strong>. Si
                alguno es una persona que debería entrar, cargala en Maestros → Vendedores.
              </span>
            </p>
          )}
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
