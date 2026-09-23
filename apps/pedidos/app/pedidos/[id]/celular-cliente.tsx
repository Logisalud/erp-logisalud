"use client";

import { useState, useTransition } from "react";
import { guardarCelular } from "./actions";

/**
 * El celular del cliente, siempre a la vista y siempre editable desde el pedido.
 *
 * Aparece tenga o no tenga número cargado: si falta, el panel avisa en ámbar y
 * el pedido no se puede enviar (la regla la aplica `submit_order`); si ya lo
 * tiene, igual se muestra para que el vendedor lo lea y lo corrija en el
 * momento cuando el cliente le da uno nuevo. Es por donde Operaciones coordina
 * la entrega y Cobranzas llega al cliente, así que un número viejo cuesta tanto
 * como uno ausente.
 */
export function CelularDelCliente({
  orderId,
  customerId,
  razonSocial,
  celularActual,
  celularOk,
}: {
  orderId: string;
  customerId: string;
  razonSocial: string;
  celularActual: string | null;
  celularOk: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [isPending, startTransition] = useTransition();

  const guardar = (formData: FormData) => {
    setError(null);
    setGuardado(false);
    startTransition(async () => {
      const r = await guardarCelular(orderId, customerId, formData);
      if (r.ok) setGuardado(true);
      else setError(r.mensaje);
    });
  };

  return (
    <section
      className={
        celularOk
          ? "panel p-4"
          : "panel border-2 border-amber-300 bg-amber-50 p-4"
      }
    >
      <h3 className="text-lg text-slate-900">
        {celularOk ? "Celular del cliente" : "Falta el celular del cliente"}
      </h3>
      <p className="mt-1 text-sm text-slate-700">
        {celularOk ? (
          <>
            Es el número por donde Operaciones coordina la entrega y Cobranzas llega al
            cliente. Si el cliente te dio otro, actualizalo acá.
          </>
        ) : (
          <>
            {celularActual
              ? `El número guardado (${celularActual}) no es un celular válido.`
              : `${razonSocial} no tiene celular registrado.`}{" "}
            Sin él el pedido no se puede enviar: es por donde Operaciones coordina la
            entrega y Cobranzas llega al cliente.
          </>
        )}
      </p>

      <form action={guardar} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Celular</span>
          <input
            name="celular"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="987654321"
            defaultValue={celularActual ?? ""}
            className="min-h-12 rounded-lg border border-slate-300 px-3 py-2 text-base"
          />
        </label>
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "Guardando…" : celularOk ? "Actualizar celular" : "Guardar celular"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {guardado && !error && (
        <p className="mt-2 text-sm text-emerald-700">Celular guardado.</p>
      )}
    </section>
  );
}
