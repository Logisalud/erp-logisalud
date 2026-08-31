"use client";

import { useState, useTransition } from "react";
import type { ImportPreview, PublishResult } from "@/services/price-lists";
import { previewImport, publishImport } from "./actions";

export function PriceListImporter({
  suppliers,
}: {
  suppliers: Array<{ id: number; nombre: string }>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function buildFormData(): FormData {
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("supplierId", String(supplierId));
    return fd;
  }

  function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPublishResult(null);
    startTransition(async () => {
      try {
        setPreview(await previewImport(buildFormData()));
      } catch (err) {
        setPreview(null);
        setError(err instanceof Error ? err.message : "Error al leer el archivo.");
      }
    });
  }

  function handlePublish() {
    setError(null);
    startTransition(async () => {
      try {
        setPublishResult(await publishImport(buildFormData()));
        setPreview(null);
        setFile(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al publicar.");
      }
    });
  }

  // Las filas con error ya vienen excluidas de preview.products —
  // publicar no las incluye, solo se necesita al menos un producto
  // válido. Los errores se muestran igual para que el admin decida si
  // corrige el Excel y reimporta después.
  const canPublish = !!preview && preview.products.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handlePreview} className="card flex flex-col gap-3 p-4">
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
          className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">Selecciona proveedor</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="min-h-12"
        />
        <button
          type="submit"
          className="btn-primary self-start"
          disabled={isPending || !file || !supplierId}
        >
          Vista previa
        </button>
      </form>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {publishResult && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          <p>
            Publicado: {publishResult.productCount} productos, {publishResult.itemCount} precios
            por canal, en {publishResult.priceLists.length} lista(s).
            {publishResult.skippedErrorCount > 0 &&
              ` ${publishResult.skippedErrorCount} fila(s) con error se omitieron.`}
          </p>
          {publishResult.priceLists.length > 1 && (
            <ul className="mt-1 list-disc pl-5">
              {publishResult.priceLists.map((l) => (
                <li key={l.priceListId}>
                  {l.supplierNombre}: {l.productCount} productos, {l.itemCount} precios
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {preview && (
        <div className="card flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{preview.fileName}</p>
              <p className="text-sm text-gray-600">
                {preview.products.length} productos válidos · {preview.errors.length} errores ·{" "}
                {preview.warnings.length} advertencias
              </p>
              {preview.porProveedor.length > 1 && (
                <p className="text-sm text-gray-600">
                  Se publicará una lista por proveedor:{" "}
                  {preview.porProveedor.map((s) => `${s.nombre} (${s.productos})`).join(" · ")}
                </p>
              )}
            </div>
            <button
              className="btn-primary"
              disabled={!canPublish || isPending}
              onClick={handlePublish}
            >
              Confirmar publicación
            </button>
          </div>

          {preview.errors.length > 0 && (
            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-800">
                Errores — estas filas se omiten al publicar, el resto del archivo continúa
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-red-700">
                {preview.errors.map((e, i) => (
                  <li key={i}>
                    Fila {e.rowIndex + 1}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.warnings.length > 0 && (
            <details className="rounded-lg bg-yellow-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-yellow-800">
                Advertencias ({preview.warnings.length}) — no bloquean, solo revisar
              </summary>
              <ul className="mt-1 list-disc pl-5 text-sm text-yellow-800">
                {preview.warnings.map((w, i) => (
                  <li key={i}>
                    Fila {w.rowIndex + 1}: {w.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-1 pr-3">Código</th>
                  <th className="py-1 pr-3">Producto</th>
                  <th className="py-1 pr-3">Presentación</th>
                  <th className="py-1 pr-3">Tributario</th>
                  <th className="py-1 pr-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {preview.products.map((p) => (
                  <tr key={p.codigoLogisalud} className="border-b border-gray-100">
                    <td className="py-1 pr-3">{p.codigoLogisalud}</td>
                    <td className="py-1 pr-3">{p.producto}</td>
                    <td className="py-1 pr-3">{p.presentacion ?? "—"}</td>
                    <td className="py-1 pr-3">
                      {p.afectacionTributaria} {p.tasaAplicable}%
                    </td>
                    <td className="py-1 pr-3">{p.isNew ? "Nuevo" : "Existente"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
