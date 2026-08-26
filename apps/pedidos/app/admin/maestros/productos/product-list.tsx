"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { ProductWithTaxProfile } from "@/services/products";
import { displayNombreProducto } from "@/domain/products";

const PAGE_SIZE = 20;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function ProductList({
  products,
  onToggle,
}: {
  products: ProductWithTaxProfile[];
  onToggle: (id: string, estado: "activo" | "inactivo") => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return products;
    return products.filter((p) =>
      [p.descripcion, p.codigo_interno, p.codigo_proveedor ?? "", p.supplier?.nombre ?? ""]
        .map(normalize)
        .some((field) => field.includes(q)),
    );
  }, [products, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        placeholder="Buscar por nombre, código o proveedor..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2 sm:max-w-sm"
      />

      <p className="text-sm text-gray-500">
        {filtered.length} producto{filtered.length === 1 ? "" : "s"}
        {query && ` que coinciden con "${query}"`}
      </p>

      <ul className="flex flex-col gap-2">
        {pageItems.map((p) => {
          const perfilVigente = p.product_tax_profiles.find((tp) => tp.vigente_hasta === null);

          return (
            <li key={p.id} className="card flex items-center justify-between gap-3 p-4">
              <Link href={`/admin/maestros/productos/${p.id}`} className="min-w-0 flex-1">
                <p className="truncate font-semibold hover:text-logisalud-green hover:underline">
                  {displayNombreProducto(p.descripcion, p.codigo_interno)}{" "}
                  <span className="text-gray-500">({p.codigo_interno})</span>
                </p>
                <p className="text-sm text-gray-600">
                  {p.supplier?.nombre ?? "Sin proveedor"} · {p.unidad_medida}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {perfilVigente && (
                    <span className="text-xs text-gray-500">
                      {perfilVigente.afectacion_tributaria} · {perfilVigente.tasa_aplicable}%
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{p.estado}</span>
                  {!p.hasCurrentPrice && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      Sin precio en ningún canal
                    </span>
                  )}
                </div>
                {p.nota_estado && (
                  <p className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                    {p.nota_estado}
                  </p>
                )}
              </Link>
              <button
                className="btn-secondary shrink-0 text-sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(() =>
                    onToggle(p.id, p.estado === "activo" ? "inactivo" : "activo"),
                  )
                }
              >
                {p.estado === "activo" ? "Desactivar" : "Activar"}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-500">
            {products.length === 0
              ? "Sin productos todavía."
              : "No hay productos que coincidan con la búsqueda."}
          </p>
        )}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            className="btn-secondary px-3 py-1 text-sm disabled:opacity-40"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </button>
          <span className="text-gray-600">
            Página {currentPage} de {totalPages}
          </span>
          <button
            className="btn-secondary px-3 py-1 text-sm disabled:opacity-40"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
