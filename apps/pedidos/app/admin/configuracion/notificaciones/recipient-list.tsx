"use client";

import { useState, useTransition } from "react";
import type { NotificationRecipient } from "@/services/order-notifications";
import { agregarDestinatario, cambiarEstadoDestinatario, editarDestinatario } from "./actions";

export function RecipientList({ recipients }: { recipients: NotificationRecipient[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setEditandoId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  function handleAgregar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    run(async () => {
      await agregarDestinatario(formData);
      form.reset();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={handleAgregar} className="card flex flex-col gap-3 p-5">
        <p className="font-semibold">Agregar destinatario</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            name="email"
            type="email"
            required
            placeholder="correo@logisalud.com"
            className="min-h-12 flex-1 rounded-lg border border-gray-300 px-3 py-2"
          />
          <input
            name="nombreReferencial"
            type="text"
            placeholder="Referencia (opcional, ej. Facturación)"
            className="min-h-12 flex-1 rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
        <button type="submit" className="btn-primary self-start" disabled={isPending}>
          Agregar
        </button>
      </form>

      {recipients.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No hay destinatarios configurados. Mientras la lista esté vacía, los pedidos se envían
          normalmente pero <strong>no se manda ningún correo</strong> — queda registrado como
          &quot;sin destinatarios&quot; en la bitácora de abajo.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {recipients.map((r) => (
            <li key={r.id} className="card p-4">
              {editandoId === r.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    run(() => editarDestinatario(r.id, formData));
                  }}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      name="email"
                      type="email"
                      required
                      defaultValue={r.email}
                      className="min-h-12 flex-1 rounded-lg border border-gray-300 px-3 py-2"
                    />
                    <input
                      name="nombreReferencial"
                      type="text"
                      defaultValue={r.nombre_referencial ?? ""}
                      placeholder="Referencia (opcional)"
                      className="min-h-12 flex-1 rounded-lg border border-gray-300 px-3 py-2"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary text-sm" disabled={isPending}>
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoId(null)}
                      className="btn-secondary text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{r.email}</p>
                    <p className="text-sm text-gray-600">
                      {r.nombre_referencial ?? "Sin referencia"} ·{" "}
                      <span className={r.activo ? "text-logisalud-green" : "text-gray-500"}>
                        {r.activo ? "Activo" : "Inactivo"}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditandoId(r.id)}
                      className="btn-secondary text-sm"
                      disabled={isPending}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => run(() => cambiarEstadoDestinatario(r.id, !r.activo))}
                      className="btn-secondary text-sm"
                      disabled={isPending}
                    >
                      {r.activo ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
