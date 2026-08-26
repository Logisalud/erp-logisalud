"use client";

import { useState, useTransition } from "react";
import { agregarObservacion } from "./actions";

export function ObservationForm({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await agregarObservacion(orderId, formData);
        (e.target as HTMLFormElement).reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo agregar la observación.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <textarea name="comentario" required placeholder="Agregar una observación..." className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      <button type="submit" className="btn-secondary self-start text-sm" disabled={isPending}>
        Agregar observación
      </button>
    </form>
  );
}
