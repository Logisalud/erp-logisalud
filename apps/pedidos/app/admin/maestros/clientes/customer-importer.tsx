"use client";

import { useRef, useState, useTransition } from "react";
import { previewImport, publishImport } from "./actions";
import type { CustomerImportPreview, CustomerImportResult } from "@/services/customers-import";

export function CustomerImporter() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CustomerImportPreview | null>(null);
  const [result, setResult] = useState<CustomerImportResult | null>(null);

  function run(action: "preview" | "publish") {
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      try {
        if (action === "preview") {
          setResult(null);
          setPreview(await previewImport(formData));
        } else {
          setResult(await publishImport(formData));
          setPreview(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo procesar la importación.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} className="card flex flex-col gap-4 p-5">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Clientes (CSV) <span className="text-red-600">*</span>
          </label>
          <input
            type="file"
            name="clientes"
            accept=".csv,text/csv"
            required
            className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Vendedores (CSV) <span className="text-red-600">*</span>
          </label>
          <input
            type="file"
            name="vendedores"
            accept=".csv,text/csv"
            required
            className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Solo se leen las columnas <code>id</code> y <code>codigo</code>, para traducir el
            identificador del sistema de origen al código de representante. El resto del archivo
            se descarta y no se guarda.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Snapshot legacy de cartera (CSV, opcional)
          </label>
          <input
            type="file"
            name="snapshot"
            accept=".csv,text/csv"
            className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Se guarda solo como referencia histórica. No determina el vendedor actual de ningún
            cliente.
          </p>
        </div>

        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
          <p className="font-medium">Qué se asigna a todos los clientes de esta carga</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-gray-600">
            <li>
              <strong>Canal de venta: Horizontal.</strong> Supuesto temporal — el archivo de
              origen no trae la clasificación, y sin canal no se puede calcular precio. Se
              corrige cliente por cliente cuando llegue la clasificación real.
            </li>
            <li>
              <strong>Condición de pago habitual: sin definir.</strong> El origen no trae el
              dato y no se inventa uno. El vendedor elige la condición al armar cada pedido, y
              eso no dispara excepción administrativa.
            </li>
          </ul>
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
            disabled={isPending || !preview}
            title={preview ? undefined : "Primero revisa la vista previa"}
          >
            Confirmar carga
          </button>
        </div>
      </form>

      {isPending && <p className="text-sm text-gray-500">Procesando…</p>}

      {preview && <PreviewPanel preview={preview} />}
      {result && <ResultPanel result={result} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className={`text-lg font-semibold ${tone === "warn" ? "text-amber-700" : "text-gray-900"}`}>
        {value.toLocaleString("es-PE")}
      </p>
      <p className="text-xs text-gray-600">{label}</p>
    </div>
  );
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: Array<{ rowNumber: number; code: string; message: string }>;
  tone: "error" | "warn";
}) {
  if (issues.length === 0) return null;
  const styles =
    tone === "error" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800";
  return (
    <details className={`rounded-lg px-3 py-2 text-sm ${styles}`}>
      <summary className="cursor-pointer font-medium">
        {title} ({issues.length.toLocaleString("es-PE")})
      </summary>
      <ul className="mt-2 max-h-64 overflow-y-auto">
        {issues.slice(0, 200).map((issue, i) => (
          <li key={`${issue.rowNumber}-${issue.code}-${i}`} className="py-0.5">
            Fila {issue.rowNumber}: {issue.message}
          </li>
        ))}
        {issues.length > 200 && (
          <li className="py-0.5 italic">…y {(issues.length - 200).toLocaleString("es-PE")} más.</li>
        )}
      </ul>
    </details>
  );
}

function PreviewPanel({ preview }: { preview: CustomerImportPreview }) {
  return (
    <div className="card-highlight flex flex-col gap-4 p-5">
      <div>
        <h3 className="font-heading text-lg">Vista previa</h3>
        <p className="text-sm text-gray-600">
          Nada se ha guardado todavía. Revisa los números y confirma para cargar.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Filas en el archivo" value={preview.totalFilas} />
        <Stat label="Clientes a cargar" value={preview.aCargar} />
        <Stat label="Nuevos" value={preview.nuevos} />
        <Stat label="Ya existentes (se actualizan)" value={preview.yaExistentes} />
        <Stat label="Entran ACTIVO" value={preview.porEstado.ACTIVO} />
        <Stat
          label="Entran PENDIENTE_DE_VALIDACION"
          value={preview.porEstado.PENDIENTE_DE_VALIDACION}
          tone="warn"
        />
        <Stat label="Solo BOLETA" value={preview.porTipoComprobante.BOLETA} tone="warn" />
        <Stat label="FACTURA" value={preview.porTipoComprobante.FACTURA} />
        <Stat label="FACTURA_O_BOLETA" value={preview.porTipoComprobante.FACTURA_O_BOLETA} />
        <Stat label="Con celular (a contactos)" value={preview.conCelular} />
        <Stat label="Con distrito/provincia/depto." value={preview.conGeografia} />
        <Stat label="Historial de reasignación" value={preview.reasignaciones} />
        <Stat label="Filas de snapshot legacy" value={preview.snapshotFilas} />
        <Stat label="Sin zona" value={preview.sinZona} tone="warn" />
        <Stat label="Sin dirección de entrega" value={preview.sinDireccion} tone="warn" />
      </div>

      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Los {preview.sinDireccion.toLocaleString("es-PE")} clientes sin dirección de entrega no
        podrán recibir un pedido hasta que se les registre una. El archivo de origen no trae
        direcciones.
      </p>

      <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
        Todos entran con canal <strong>{preview.canalPorDefecto}</strong> y sin condición de pago
        habitual.
      </p>

      <IssueList title="Filas con error (se omiten)" issues={preview.errors} tone="error" />
      <IssueList title="Advertencias" issues={preview.warnings} tone="warn" />
    </div>
  );
}

function ResultPanel({ result }: { result: CustomerImportResult }) {
  return (
    <div className="card-highlight flex flex-col gap-4 p-5">
      <h3 className="font-heading text-lg">Carga completada</h3>
      <p className="text-sm text-gray-600">
        Todos quedaron con canal <strong>{result.canalPorDefecto}</strong> y sin condición de pago
        habitual.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Clientes cargados" value={result.clientesCargados} />
        <Stat label="ACTIVO" value={result.activos} />
        <Stat label="PENDIENTE_DE_VALIDACION" value={result.pendientesDeValidacion} tone="warn" />
        <Stat label="Contactos creados" value={result.contactosCreados} />
        <Stat label="Reasignaciones" value={result.reasignacionesCargadas} />
        <Stat label="Snapshot legacy" value={result.snapshotFilasCargadas} />
        <Stat label="Sin dirección" value={result.sinDireccion} tone="warn" />
        <Stat label="Filas omitidas por error" value={result.filasOmitidasPorError} tone="warn" />
      </div>
    </div>
  );
}
