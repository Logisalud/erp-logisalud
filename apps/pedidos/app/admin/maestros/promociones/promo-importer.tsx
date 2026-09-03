"use client";

import { useRef, useState, useTransition } from "react";
import { previewImport, publishImport } from "./actions";
import type { PromoImportPreview, PromoImportResult } from "@/services/promo-import";

/**
 * Importador de promociones de Diphasac. Vista previa primero, publicar
 * después, igual que precios, clientes y stock.
 *
 * Acá la vista previa hace algo más que contar filas: muestra, promoción
 * por promoción, el precio que sale de nuestra lectura al lado del que
 * declara el archivo. Una lista de precios mal leída se nota; un
 * porcentaje leído de la columna equivocada, no — hasta que un pedido sale
 * con el precio cambiado.
 */
export function PromoImporter() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PromoImportPreview | null>(null);
  const [result, setResult] = useState<PromoImportResult | null>(null);

  function run(accion: "preview" | "publish") {
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      try {
        if (accion === "preview") {
          setResult(null);
          setPreview(await previewImport(formData));
        } else {
          setResult(await publishImport(formData));
          setPreview(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo procesar el archivo.");
      }
    });
  }

  const puedePublicar = preview !== null && preview.promos.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} className="card flex flex-col gap-4 p-5">
        {error && (
          <p className="aviso-error" role="alert">
            <span>{error}</span>
          </p>
        )}

        <div>
          <label className="etiqueta" htmlFor="archivo">
            Archivo de promociones de Diphasac (CSV o Excel)
          </label>
          <input
            id="archivo"
            type="file"
            name="archivo"
            accept=".csv,.txt,.tsv,.xlsx,text/csv"
            required
            className="min-h-12 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            onChange={() => {
              setPreview(null);
              setResult(null);
              setError(null);
            }}
          />
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-medium">Qué lee del archivo</p>
          <ul className="mt-1 list-disc pl-5 text-slate-600">
            <li>
              <strong>Escalas</strong> — las columnas &ldquo;ESCALA PARA…&rdquo; y su
              &ldquo;% DCTO&rdquo;. Alcanzado el umbral, el descuento va sobre{" "}
              <strong>todas</strong> las unidades de la línea.
            </li>
            <li>
              <strong>Bonificaciones</strong> — las columnas &ldquo;PROMOS VÍA
              BONIFICACIÓN&rdquo; (&ldquo;2 + 1&rdquo;). El motor agrega la línea gratis; no
              cambia el precio de lo que se paga.
            </li>
          </ul>
          <p className="mt-2 text-slate-600">
            El bloque de Horizontalidad se carga para el canal <strong>Horizontal</strong>; el de
            Mayorista/Subdistribuidora, para <strong>Mayorista, Subdistribuidores, Minicadenas y
            Tops</strong> (una fila por canal, con el PVF de cada uno). Se guarda el{" "}
            <strong>porcentaje</strong>, no el precio: el precio sale del PVF del canal.
          </p>
          <p className="mt-2 text-slate-600">
            Publicar <strong>cierra</strong> las promociones vigentes de esos productos y canales, y
            abre las nuevas desde hoy. Las anteriores quedan guardadas para poder explicar un pedido
            viejo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => run("preview")}
            className="btn-secondary"
            disabled={isPending}
          >
            Ver vista previa
          </button>
          <button
            type="button"
            onClick={() => run("publish")}
            className="btn-primary"
            disabled={isPending || !puedePublicar}
            title={puedePublicar ? undefined : "Primero revisá la vista previa"}
          >
            Publicar promociones
          </button>
        </div>
      </form>

      {isPending && <p className="text-sm text-slate-600">Procesando…</p>}

      {preview && <PreviewPanel preview={preview} />}
      {result && <ResultPanel result={result} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p
        className={`cifra text-lg font-semibold ${
          tone === "warn" ? "text-amber-800" : "text-slate-900"
        }`}
      >
        {value.toLocaleString("es-PE")}
      </p>
      <p className="text-xs text-slate-600">{label}</p>
    </div>
  );
}

function soles(valor: number): string {
  return valor.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function PreviewPanel({ preview }: { preview: PromoImportPreview }) {
  const { resumen } = preview;
  return (
    <div className="card-highlight flex flex-col gap-4 p-5">
      <div>
        <h3 className="font-heading text-lg">Vista previa</h3>
        <p className="text-sm text-slate-600">
          Todavía no se guardó nada. {preview.fileName}
          {preview.headerRowNumber ? ` · cabeceras en la fila ${preview.headerRowNumber}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Escalas" value={resumen.escalas} />
        <Stat label="Bonificaciones" value={resumen.bonificaciones} />
        <Stat label="Filas a escribir (por canal)" value={resumen.filasAEscribir} />
        <Stat label="Filas con problema" value={preview.errors.length} tone="warn" />
      </div>

      {preview.codigosSinProducto.length > 0 && (
        <div className="aviso-bloqueo flex-col items-start" role="alert">
          <p className="font-medium">
            {preview.codigosSinProducto.length === 1
              ? "Un código de proveedor no existe en el catálogo"
              : `${preview.codigosSinProducto.length} códigos de proveedor no existen en el catálogo`}
          </p>
          <p className="cifra mt-1 break-words">{preview.codigosSinProducto.join(", ")}</p>
          <p className="mt-1">Esas promociones no se van a cargar. El resto sí.</p>
        </div>
      )}

      {preview.notas.length > 0 && (
        <div className="rounded-lg border-l-4 border-logisalud-teal bg-slate-50 p-3 text-sm">
          <p className="font-medium">Promociones escritas en prosa, que el importador no carga</p>
          <p className="mt-1 text-slate-600">
            El archivo las escribe como texto libre, no como una fila con umbral y porcentaje.
            Interpretarlas sería adivinar: se cargan a mano.
          </p>
          <ul className="mt-2 list-disc pl-5 text-slate-700">
            {preview.notas.map((nota, i) => (
              <li key={`${nota.rowNumber}-${i}`}>
                Fila {nota.rowNumber} · <span className="cifra">{nota.codigoProveedor}</span>{" "}
                {nota.producto}: &ldquo;{nota.texto}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.promos.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 pr-3 font-medium">Código</th>
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 pr-3 font-medium">Promoción</th>
                <th className="py-2 pr-3 font-medium">Canales</th>
                <th className="py-2 pr-3 text-right font-medium">Lista</th>
                <th className="py-2 pr-3 text-right font-medium">Calculado</th>
                <th className="py-2 pr-3 text-right font-medium">Declarado</th>
                <th className="py-2 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {preview.promos.map((promo) => (
                <tr
                  key={`${promo.tipo}-${promo.productId}-${promo.bloque}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="cifra py-2 pr-3">{promo.codigoInterno}</td>
                  <td className="py-2 pr-3">{promo.descripcion}</td>
                  <td className="py-2 pr-3">
                    {promo.tipo === "ESCALA"
                      ? `Escala: desde ${promo.cantidadMinima} u. · −${promo.porcentajeDescuento}%`
                      : `Bonificación: compra ${promo.cantidadComprada} · lleva ${promo.cantidadGratis}`}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">
                    {promo.canales.map((c) => c.nombre).join(", ")}
                  </td>
                  <td className="cifra py-2 pr-3 text-right text-slate-600">
                    {soles(promo.precioLista)}
                  </td>
                  <td className="cifra py-2 pr-3 text-right font-medium">
                    {soles(promo.precioCalculado)}
                  </td>
                  <td className="cifra py-2 pr-3 text-right text-slate-600">
                    {promo.precioDeclarado === null ? "—" : soles(promo.precioDeclarado)}
                  </td>
                  <td className="py-2">
                    {promo.accion === "crear" ? "Se crea" : "Reemplaza la vigente"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-600">
            &ldquo;Calculado&rdquo; sale del PVF de nuestro catálogo con el porcentaje leído del
            archivo; &ldquo;Declarado&rdquo; es el precio promocional que trae el archivo. Si
            difieren más de un centavo, la fila no se publica.
          </p>
        </div>
      )}

      {preview.errors.length > 0 && (
        <details className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <summary className="min-h-11 cursor-pointer font-medium">
            Filas que no se van a cargar ({preview.errors.length.toLocaleString("es-PE")})
          </summary>
          <ul className="mt-2 max-h-64 overflow-y-auto">
            {preview.errors.map((issue, i) => (
              <li key={`${issue.rowNumber}-${issue.code}-${i}`} className="py-0.5">
                Fila {issue.rowNumber}: {issue.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ResultPanel({ result }: { result: PromoImportResult }) {
  return (
    <div className="card-highlight flex flex-col gap-4 p-5">
      <h3 className="font-heading text-lg">Promociones publicadas</h3>
      <p className="text-sm text-slate-600">{result.fileName}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Escalas" value={result.escalas} />
        <Stat label="Bonificaciones" value={result.bonificaciones} />
        <Stat label="Filas escritas" value={result.filasEscritas} />
        <Stat label="Promos anteriores cerradas" value={result.cerradas} />
      </div>
      <p className="text-sm text-slate-600">
        Se aplican solas a los pedidos nuevos: el vendedor no tiene que pedir nada y no se genera
        ninguna solicitud de aprobación.
      </p>
    </div>
  );
}
