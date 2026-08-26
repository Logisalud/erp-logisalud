"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { AdministrativeExceptionOrder } from "@/services/order-exceptions";

export function AdministrativeExceptionList({
  orders,
  onAprobar,
  onDevolver,
  onObservar,
}: {
  orders: AdministrativeExceptionOrder[];
  onAprobar: (orderId: string) => Promise<void>;
  onDevolver: (orderId: string, motivo: string) => Promise<void>;
  onObservar: (orderId: string, comentario: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [activeForm, setActiveForm] = useState<{ orderId: string; kind: "devolver" | "observar" } | null>(null);
  const [texto, setTexto] = useState("");

  if (orders.length === 0) {
    return <p className="text-sm text-gray-500">No hay pedidos en excepción administrativa por ahora.</p>;
  }

  function submitTexto(orderId: string, kind: "devolver" | "observar") {
    if (!texto.trim()) return;
    startTransition(async () => {
      if (kind === "devolver") await onDevolver(orderId, texto.trim());
      else await onObservar(orderId, texto.trim());
      setActiveForm(null);
      setTexto("");
    });
  }

  return (
    <ul className="flex flex-col gap-4">
      {orders.map((order) => (
        <li key={order.id} className="card-highlight p-5">
          <p className="font-semibold">{order.customer?.razon_social ?? "Cliente sin nombre"}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-500">Vendedor</dt>
            <dd>{order.seller?.nombre_completo ?? "—"}</dd>
            <dt className="text-gray-500">Condición de pago solicitada</dt>
            <dd>{order.payment_terms?.nombre ?? "—"}</dd>
          </dl>
          <Link href={`/pedidos/${order.id}`} className="mt-2 inline-block text-sm text-logisalud-teal hover:underline">
            Ver detalle del pedido
          </Link>

          <div className="mt-4 flex flex-wrap gap-3">
            <button className="btn-primary text-sm" disabled={isPending} onClick={() => startTransition(() => onAprobar(order.id))}>
              Aprobar
            </button>
            <button
              className="btn-secondary text-sm"
              disabled={isPending}
              onClick={() => setActiveForm({ orderId: order.id, kind: "observar" })}
            >
              Observar
            </button>
            <button
              className="text-sm text-red-600 hover:underline"
              disabled={isPending}
              onClick={() => setActiveForm({ orderId: order.id, kind: "devolver" })}
            >
              Devolver a borrador
            </button>
          </div>

          {activeForm?.orderId === order.id && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={activeForm.kind === "devolver" ? "Motivo de la devolución" : "Comentario"}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button className="btn-secondary self-start text-sm" onClick={() => submitTexto(order.id, activeForm.kind)} disabled={isPending}>
                Confirmar
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
