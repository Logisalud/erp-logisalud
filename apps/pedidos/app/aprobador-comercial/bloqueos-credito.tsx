"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { decidirBloqueo } from "./actions";
import type { BloqueoPendiente } from "@/services/credito";

const soles = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 });

const fecha = (iso: string) => new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima" });

/**
 * Pedidos frenados porque el cliente arrastra deuda vencida.
 *
 * Aprobar es una decisión comercial con nombre y apellido: queda guardada
 * con quién la tomó y con las cifras que tenía el cliente en ese momento.
 * Por eso el motivo se pide al aprobar y no solo al rechazar.
 */
export function BloqueosDeCredito({ bloqueos }: { bloqueos: BloqueoPendiente[] }) {
  const [pendiente, startTransition] = useTransition();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (bloqueos.length === 0) {
    return <p className="mt-3 text-sm text-gray-600">No hay pedidos frenados por deuda.</p>;
  }

  function decidir(orderId: string, decision: "aprobado" | "rechazado") {
    setError(null);
    startTransition(async () => {
      const r = await decidirBloqueo(orderId, decision, motivo);
      if (!r.ok) setError(r.mensaje);
      else {
        setAbierto(null);
        setMotivo("");
      }
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      {error && (
        <p className="aviso-error" role="alert">
          <span aria-hidden>✕</span>
          <span>{error}</span>
        </p>
      )}

      {bloqueos.map((b) => (
        <article key={b.orderId} className="card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-semibold text-gray-900">
              Pedido #{b.numero} · {b.razonSocial}
            </h4>
            <Link href={`/pedidos/${b.orderId}`} className="text-sm text-logisalud-teal hover:underline">
              Ver pedido →
            </Link>
          </div>

          <p className="cifra mt-1 text-sm text-gray-600">
            RUC {b.ruc}
            {b.vendedor ? ` · ${b.vendedor}` : ""} · frenado {fecha(b.creadoEn)}
          </p>

          <p className="mt-2 text-sm">
            <span className="font-medium text-red-700">
              {soles(b.vencido)} vencidos, {b.diasAtraso}{" "}
              {b.diasAtraso === 1 ? "día" : "días"} de atraso
            </span>
            <span className="text-gray-600"> · deuda total {soles(b.saldo)}</span>
          </p>

          {!b.liberable && (
            <p className="mt-2 text-sm text-red-700">
              Este cliente pasó el tope de atraso: el pedido <strong>no se puede liberar desde
              acá</strong>. Aunque se apruebe, vuelve a quedar frenado. Se destraba cuando pague y
              Cobranzas lo refleje.
            </p>
          )}

          {!b.liberable ? null : abierto === b.orderId ? (
            <div className="mt-3 flex flex-col gap-2">
              <label className="etiqueta" htmlFor={`motivo-${b.orderId}`}>
                Por qué (queda guardado)
              </label>
              <textarea
                id={`motivo-${b.orderId}`}
                className="campo"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Se compromete a pagar el viernes / ya depositó y falta registrar…"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={pendiente}
                  onClick={() => decidir(b.orderId, "aprobado")}
                >
                  Dejar pasar el pedido
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={pendiente}
                  onClick={() => decidir(b.orderId, "rechazado")}
                >
                  Mantener frenado
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setAbierto(null)}
                  disabled={pendiente}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn-secondary mt-3"
              onClick={() => {
                setAbierto(b.orderId);
                setMotivo("");
              }}
            >
              Resolver
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
