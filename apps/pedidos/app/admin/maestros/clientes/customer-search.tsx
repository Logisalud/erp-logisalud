"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { MIN_SEARCH_LENGTH, displayRazonSocial } from "@/domain/customer-search";
import { buscarClientesCartera } from "./actions";
import type { CustomerSearchHit } from "@/services/customers";

/**
 * Buscar UN cliente para ver o corregir su ficha.
 *
 * Busca en el servidor y en cualquier estado: el cliente que se viene a
 * corregir suele ser justamente el que está mal cargado o pendiente de
 * validación, y el buscador del pedido —que sólo ofrece ACTIVO— no lo
 * encuentra.
 */
export function CustomerSearch() {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<CustomerSearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function buscar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = term.trim();
    setError(null);
    if (query.length < MIN_SEARCH_LENGTH) {
      setError(`Escribí ${MIN_SEARCH_LENGTH} caracteres o más.`);
      setHits(null);
      return;
    }
    startTransition(async () => {
      try {
        setHits(await buscarClientesCartera(query));
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo buscar.");
        setHits(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={buscar} className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="buscar-cliente">
          Buscar cliente por nombre, razón social o RUC
        </label>
        <input
          id="buscar-cliente"
          className="campo flex-1"
          placeholder="Nombre, razón social o RUC / documento…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <button type="submit" className="btn-secondary sm:w-40" disabled={isPending}>
          {isPending ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error && (
        <p className="aviso-error" role="alert">
          <span>{error}</span>
        </p>
      )}

      {hits !== null && hits.length === 0 && (
        <p className="text-sm text-slate-600">
          Ningún cliente coincide con “{term.trim()}”. Se busca por razón social, nombre comercial y
          RUC, en cualquier estado.
        </p>
      )}

      {hits !== null && hits.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {hits.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/maestros/clientes/${encodeURIComponent(c.ruc_o_documento)}`}
                className="flex min-h-14 flex-col gap-0.5 px-4 py-3 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">
                  {displayRazonSocial(c.razon_social)}
                  {c.nombre_comercial ? (
                    <span className="font-normal text-slate-600"> — {c.nombre_comercial}</span>
                  ) : null}
                </span>
                <span className="cifra text-sm text-slate-600">
                  {c.ruc_o_documento} · {c.canal?.nombre ?? "sin canal"} ·{" "}
                  {c.zona?.nombre ?? "sin zona"} · {c.estado} ·{" "}
                  {c.direcciones === 0
                    ? "sin dirección"
                    : `${c.direcciones} ${c.direcciones === 1 ? "dirección" : "direcciones"}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
