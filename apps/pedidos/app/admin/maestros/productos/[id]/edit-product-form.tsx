"use client";

import { useState, useTransition } from "react";
import type { ProductDetail } from "@/services/products";

export function EditProductForm({
  product,
  onSave,
}: {
  product: ProductDetail;
  onSave: (formData: FormData) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await onSave(formData);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-3 p-5">
      <h3 className="font-semibold">Editar datos del producto</h3>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Guardado.</p>
      )}

      <label className="text-sm text-gray-600">
        Descripción
        <input
          name="descripcion"
          defaultValue={product.descripcion}
          required
          className="mt-1 min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="text-sm text-gray-600">
        Presentación
        <input
          name="presentacion"
          defaultValue={product.presentacion ?? ""}
          className="mt-1 min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="controlaLote" defaultChecked={product.controla_lote} />
          Controla lote
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="controlaVencimiento"
            defaultChecked={product.controla_vencimiento}
          />
          Controla vencimiento
        </label>
      </div>

      <button type="submit" className="btn-primary self-start" disabled={isPending}>
        Guardar cambios
      </button>
    </form>
  );
}
