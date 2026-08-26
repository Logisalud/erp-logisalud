"use client";

import { useState, useTransition } from "react";

export function PriceCorrectionForm({
  channels,
  onSubmit,
}: {
  channels: Array<{ id: number; nombre: string }>;
  onSubmit: (formData: FormData) => Promise<void>;
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
        await onSubmit(formData);
        setSaved(true);
        (e.target as HTMLFormElement).reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo corregir el precio.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card-highlight flex flex-col gap-3 p-5">
      <div>
        <h3 className="font-semibold text-logisalud-teal">Corrección puntual de precio</h3>
        <p className="mt-1 text-sm text-gray-600">
          Esto es para corregir un error puntual en un canal, no el flujo normal de
          actualización de precios. El flujo normal es reimportar el Excel del proveedor
          en <span className="font-medium">Listas de precios</span>. Esta corrección crea
          una versión nueva del precio de ese canal — nunca sobrescribe ni borra el historial.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Precio corregido.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <select
          name="salesChannelId"
          required
          className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">Canal</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <input
          name="precio"
          type="number"
          step="0.0001"
          min="0.0001"
          placeholder="Precio nuevo"
          required
          className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
        />
        <button type="submit" className="btn-secondary" disabled={isPending}>
          Corregir precio
        </button>
      </div>
    </form>
  );
}
