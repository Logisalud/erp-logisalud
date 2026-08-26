"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ApprovalRequestWithOrder } from "@/services/approvals";
import { decidirSolicitud } from "./actions";

export function ApprovalRequestList({ requests }: { requests: ApprovalRequestWithOrder[] }) {
  const [isPending, startTransition] = useTransition();
  const [openForm, setOpenForm] = useState<{ id: string; decision: "APROBAR_OTRO_PRECIO" | "SOLICITAR_INFO" } | null>(null);
  const [precio, setPrecio] = useState("");
  const [comentario, setComentario] = useState("");

  if (requests.length === 0) {
    return <p className="text-sm text-gray-500">No hay solicitudes de descuento pendientes.</p>;
  }

  function decidir(id: string, decision: "APROBAR" | "RECHAZAR" | "APROBAR_OTRO_PRECIO" | "SOLICITAR_INFO") {
    startTransition(async () => {
      await decidirSolicitud(id, decision, precio ? Number(precio) : undefined, comentario || undefined);
      setOpenForm(null);
      setPrecio("");
      setComentario("");
    });
  }

  return (
    <ul className="flex flex-col gap-4">
      {requests.map((r) => (
        <li key={r.id} className="card-highlight p-5">
          <p className="font-semibold">{r.order?.customer?.razon_social ?? "Cliente sin nombre"}</p>
          <p className="text-sm text-gray-600">{r.order_item?.product?.descripcion}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-500">Precio actual</dt>
            <dd>{r.order_item?.precio_unitario?.toFixed(4) ?? "—"}</dd>
            <dt className="text-gray-500">Precio solicitado</dt>
            <dd>{r.precio_solicitado?.toFixed(4) ?? (r.porcentaje_descuento ? `${r.porcentaje_descuento}% dcto.` : "—")}</dd>
            <dt className="text-gray-500">Cantidad</dt>
            <dd>{r.cantidad}</dd>
            <dt className="text-gray-500">Motivo</dt>
            <dd>{r.motivo}</dd>
            {r.competencia_negociacion && (
              <>
                <dt className="text-gray-500">Competencia/negociación</dt>
                <dd>{r.competencia_negociacion}</dd>
              </>
            )}
          </dl>
          <Link href={`/pedidos/${r.order_id}`} className="mt-2 inline-block text-sm text-logisalud-teal hover:underline">
            Ver detalle del pedido
          </Link>

          <div className="mt-4 flex flex-wrap gap-3">
            <button className="btn-primary text-sm" disabled={isPending} onClick={() => decidir(r.id, "APROBAR")}>
              Aprobar
            </button>
            <button className="text-sm text-red-600 hover:underline" disabled={isPending} onClick={() => decidir(r.id, "RECHAZAR")}>
              Rechazar
            </button>
            <button
              className="btn-secondary text-sm"
              disabled={isPending}
              onClick={() => setOpenForm({ id: r.id, decision: "APROBAR_OTRO_PRECIO" })}
            >
              Aprobar otro precio
            </button>
            <button
              className="text-sm text-gray-600 hover:underline"
              disabled={isPending}
              onClick={() => setOpenForm({ id: r.id, decision: "SOLICITAR_INFO" })}
            >
              Solicitar info
            </button>
          </div>

          {openForm?.id === r.id && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
              {openForm.decision === "APROBAR_OTRO_PRECIO" && (
                <input
                  type="number"
                  step="0.0001"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                  placeholder="Precio aprobado"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              )}
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Comentario"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button className="btn-secondary self-start text-sm" onClick={() => decidir(r.id, openForm.decision)} disabled={isPending}>
                Confirmar
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
