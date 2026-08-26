"use client";

import { useTransition } from "react";
import type { CatalogItem } from "@/services/catalog";

export function CatalogList({
  items,
  onCreate,
  onToggle,
  withDescription = false,
}: {
  items: CatalogItem[];
  onCreate: (formData: FormData) => Promise<void>;
  onToggle: (id: number, estado: "activo" | "inactivo") => Promise<void>;
  withDescription?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <form action={onCreate} className="card flex flex-col gap-3 p-4">
        <input
          name="nombre"
          placeholder="Nombre"
          required
          className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
        />
        {withDescription && (
          <input
            name="descripcion"
            placeholder="Descripción (opcional)"
            className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
          />
        )}
        <button type="submit" className="btn-primary self-start" disabled={isPending}>
          Agregar
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="card flex items-center justify-between p-4">
            <div>
              <p className="font-semibold">{item.nombre}</p>
              {item.descripcion && (
                <p className="text-sm text-gray-600">{item.descripcion}</p>
              )}
              <p className="text-xs text-gray-500">{item.estado}</p>
            </div>
            <button
              className="btn-secondary text-sm"
              disabled={isPending}
              onClick={() =>
                startTransition(() =>
                  onToggle(item.id, item.estado === "activo" ? "inactivo" : "activo"),
                )
              }
            >
              {item.estado === "activo" ? "Desactivar" : "Activar"}
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-gray-500">Sin registros todavía.</p>
        )}
      </ul>
    </div>
  );
}
