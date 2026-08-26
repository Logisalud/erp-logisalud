"use client";

import { useState, useTransition } from "react";
import type { InventorySource } from "@/services/inventory";
import { cambiarEstadoFuenteStock, crearFuenteStock } from "./actions";

export function InventorySourceList({ items }: { items: InventorySource[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCrear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      try {
        await crearFuenteStock(formData);
        form.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear la fuente.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={handleCrear} className="flex flex-col gap-2 sm:flex-row">
        <input
          name="nombre"
          required
          placeholder="Nombre de la fuente"
          className="min-h-12 flex-1 rounded-lg border border-gray-300 px-3 py-2"
        />
        <select
          name="tipo"
          required
          defaultValue=""
          className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">Tipo</option>
          <option value="central">Central</option>
          <option value="regional">Regional</option>
        </select>
        <button type="submit" className="btn-secondary" disabled={isPending}>
          Agregar
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {items.map((s) => (
          <li key={s.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-gray-900">{s.nombre}</p>
              <p className="text-sm text-gray-600">
                {s.tipo === "central" ? "Central" : "Regional"} ·{" "}
                <span className={s.estado === "activo" ? "text-logisalud-green" : "text-gray-500"}>
                  {s.estado === "activo" ? "Activa" : "Inactiva"}
                </span>
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={isPending}
              onClick={() =>
                startTransition(() =>
                  cambiarEstadoFuenteStock(s.id, s.estado === "activo" ? "inactivo" : "activo"),
                )
              }
            >
              {s.estado === "activo" ? "Desactivar" : "Activar"}
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-gray-500">No hay fuentes de stock registradas.</p>
        )}
      </ul>
    </div>
  );
}
