"use client";

import { useState, useTransition } from "react";
import { guardarCelular } from "./actions";

/**
 * El celular que le falta al cliente, cargable desde el pedido.
 *
 * Solo aparece cuando falta o está mal: si el cliente ya lo tiene, esta
 * sección no existe y no estorba. El pedido no se puede enviar hasta que
 * quede cargado — la regla la aplica `submit_order`, esto es para que el
 * vendedor pueda resolverlo en el momento y no tenga que volver mañana.
 */
export function CelularDelCliente({
  orderId,
  customerId,
  razonSocial,
  celularActual,
}: {
  orderId: string;
  customerId: string;
  razonSocial: string;
  celularActual: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const guardar = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const r = await guardarCelular(orderId, customerId, formData);
      if (!r.ok) setError(r.mensaje);
    });
  };

  return (
    <section className="panel border-2 border-amber-300 bg-amber-50 p-4">
      <h3 className="text-lg text-slate-900">Falta el celular del cliente</h3>
      <p className="mt-1 text-sm text-slate-700">
        {celularActual
          ? `El número guardado (${celularActual}) no es un celular válido.`
          : `${razonSocial} no tiene celular registrado.`}{" "}
        Sin él el pedido no se puede enviar: es por donde Operaciones coordina la entrega y
        Cobranzas llega al cliente.
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
          {isPending ? "Guardando…" : "Guardar celular"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
