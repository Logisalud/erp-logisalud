"use client";

import { useRef, useState, useTransition } from "react";
import { previewImport, publishImport } from "./actions";
import type { StockImportPreview, StockImportResult } from "@/services/stock-import";

/**
 * Carga masiva de stock. Vista previa primero, publicar después: el mismo
 * gesto que los importadores de precios y de clientes, para que quien ya usó
 * uno no tenga que aprender otro.
 *
 * El botón de publicar sólo se habilita después de una vista previa: cargar
 * stock a ciegas es cómo se pisa el inventario de una fuente entera.
 */
export function StockImporter({ fuentes }: { fuentes: string[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<StockImportPreview | null>(null);
  const [result, setResult] = useState<StockImportResult | null>(null);

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

  const puedePublicar = preview !== null && preview.items.length > 0;

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
            Archivo de stock (CSV o Excel)
          </label>
          <input
            id="archivo"
            type="file"
            name="archivo"
            accept=".csv,.txt,.tsv,.xlsx,text/csv"
            required
            className="min-h-12 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            onChange={() => {
              // Cambiar el archivo invalida la vista previa: publicar con la
              // del archivo anterior cargaría números que nadie revisó.
              setPreview(null);
              setResult(null);
              setError(null);
            }}
          />
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-medium">Columnas que necesita el archivo</p>
          <ul className="mt-1 list-disc pl-5 text-slate-600">
            <li>
              <code>codigo_producto</code> — el código interno del producto (DHP014, BSA301…).
            </li>
            <li>
              <code>inventory_source</code> — el nombre de la fuente de stock, tal como está en el
              catálogo.
            </li>
            <li>
              <code>cantidad_disponible</code> — el número de unidades disponibles.
            </li>
          </ul>
          <p className="mt-2 text-slate-600">
            La fila de cabeceras puede no ser la primera y los nombres admiten variantes
            (<code>codigo</code>, <code>fuente</code>, <code>cantidad</code>). Si un producto ya
            tiene stock en esa fuente, la fila lo <strong>actualiza</strong>; nunca se duplica.
          </p>
          {fuentes.length > 0 && (
            <p className="mt-2 text-slate-600">
              Fuentes activas hoy: <strong>{fuentes.join(", ")}</strong>.
            </p>
          )}
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
            Confirmar carga
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

function PreviewPanel({ preview }: { preview: StockImportPreview }) {
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
        <Stat label="Se crean" value={resumen.crear} />
        <Stat label="Se actualizan" value={resumen.actualizar} />
        <Stat label="Quedan igual" value={resumen.sinCambio} />
        <Stat label="Filas con problema" value={preview.errors.length} tone="warn" />
      </div>

      {preview.codigosSinProducto.length > 0 && (
        <div className="aviso-bloqueo flex-col items-start" role="alert">
          <p className="font-medium">
            {preview.codigosSinProducto.length === 1
              ? "Un código de producto no existe en el catálogo"
              : `${preview.codigosSinProducto.length} códigos de producto no existen en el catálogo`}
          </p>
          <p className="cifra mt-1 break-words">{preview.codigosSinProducto.join(", ")}</p>
          <p className="mt-1">Esas filas no se van a cargar. El resto sí.</p>
        </div>
      )}

      {preview.fuentesDesconocidas.length > 0 && (
        <div className="aviso-bloqueo flex-col items-start" role="alert">
          <p className="font-medium">Fuentes de stock que no existen en el catálogo</p>
          <p className="mt-1 break-words">{preview.fuentesDesconocidas.join(", ")}</p>
          <p className="mt-1">
            Registralas en Maestros → Despacho, o corregí el nombre en el archivo. Disponibles:{" "}
            {preview.fuentesDisponibles.join(", ") || "ninguna"}.
          </p>
        </div>
      )}

      {preview.fuentesInactivas.length > 0 && (
        <div className="aviso-bloqueo flex-col items-start" role="alert">
          <p className="font-medium">Fuentes de stock inactivas</p>
          <p className="mt-1 break-words">{preview.fuentesInactivas.join(", ")}</p>
          <p className="mt-1">
            Existen en el catálogo pero están fuera de uso, así que esas filas no se cargan.
            Reactivalas en Maestros → Despacho si corresponde.
          </p>
        </div>
      )}

      {preview.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 pr-3 font-medium">Código</th>
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 pr-3 font-medium">Fuente</th>
                <th className="py-2 pr-3 text-right font-medium">Ahora</th>
                <th className="py-2 pr-3 text-right font-medium">Queda en</th>
                <th className="py-2 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {preview.items.slice(0, 200).map((item) => (
                <tr
                  key={`${item.productId}-${item.inventorySourceId}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="cifra py-2 pr-3">{item.codigoProducto}</td>
                  <td className="py-2 pr-3">{item.descripcion}</td>
                  <td className="py-2 pr-3">{item.fuenteNombre}</td>
                  <td className="cifra py-2 pr-3 text-right text-slate-600">
                    {item.cantidadActual === null
                      ? "—"
                      : item.cantidadActual.toLocaleString("es-PE")}
                  </td>
                  <td className="cifra py-2 pr-3 text-right font-medium text-slate-900">
                    {item.cantidad.toLocaleString("es-PE")}
                  </td>
                  <td className="py-2">
                    {item.accion === "crear" ? "Se crea" : "Se actualiza"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.items.length > 200 && (
            <p className="mt-2 text-sm italic text-slate-600">
              …y {(preview.items.length - 200).toLocaleString("es-PE")} filas más, que también se
              cargan.
            </p>
          )}
        </div>
      )}

      {preview.errors.length > 0 && (
        <details className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <summary className="min-h-11 cursor-pointer font-medium">
            Filas que no se van a cargar ({preview.errors.length.toLocaleString("es-PE")})
          </summary>
          <ul className="mt-2 max-h-64 overflow-y-auto">
            {preview.errors.slice(0, 200).map((issue, i) => (
              <li key={`${issue.rowNumber}-${issue.code}-${i}`} className="py-0.5">
                Fila {issue.rowNumber}: {issue.message}
              </li>
            ))}
            {preview.errors.length > 200 && (
              <li className="py-0.5 italic">
                …y {(preview.errors.length - 200).toLocaleString("es-PE")} más.
              </li>
            )}
          </ul>
        </details>
      )}
    </div>
  );
}

function ResultPanel({ result }: { result: StockImportResult }) {
  return (
    <div className="card-highlight flex flex-col gap-4 p-5">
      <h3 className="font-heading text-lg">Carga completada</h3>
      <p className="text-sm text-slate-600">{result.fileName}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Registros creados" value={result.creados} />
        <Stat label="Registros actualizados" value={result.actualizados} />
        <Stat label="Sin cambio" value={result.sinCambio} />
        <Stat label="Filas omitidas" value={result.omitidos} tone="warn" />
      </div>
    </div>
  );
}
