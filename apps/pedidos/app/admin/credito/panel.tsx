"use client";

import { useState, useTransition } from "react";
import { actualizarDeudaAhora, guardarReglaDeCredito } from "./actions";
import type { EstadoDelCredito } from "@/services/credito";

const soles = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 });

const cuando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "nunca";

export function PanelDeCredito({ estado }: { estado: EstadoDelCredito }) {
  const [pendiente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);

  function actualizar() {
    setAviso(null);
    startTransition(async () => {
      const r = await actualizarDeudaAhora();
      setAviso(
        r.ok
          ? { texto: `Listo: ${r.clientes} clientes con deuda, ${soles(r.vencido)} vencidos.`, ok: true }
          : { texto: r.mensaje, ok: false },
      );
    });
  }

  function guardar(formData: FormData) {
    setAviso(null);
    startTransition(async () => {
      const r = await guardarReglaDeCredito(formData);
      setAviso(r.ok ? { texto: "Regla guardada.", ok: true } : { texto: r.mensaje, ok: false });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {aviso && (
        <p className={aviso.ok ? "aviso-ok" : "aviso-error"} role="status">
          <span aria-hidden>{aviso.ok ? "✓" : "✕"}</span>
          <span>{aviso.texto}</span>
        </p>
      )}

      {estado.sinConfigurar && (
        <p className="aviso-bloqueo">
          <span aria-hidden>!</span>
          <span>
            Falta configurar el acceso al ERP de cobranzas. Sin las variables{" "}
            <strong>COBRANZAS_SUPABASE_URL</strong> y <strong>COBRANZAS_SERVICE_ROLE_KEY</strong> no
            se puede traer la deuda, y la copia se queda con lo último que haya.
          </span>
        </p>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-heading text-lg">La copia de la deuda</h3>
          <p className="text-sm text-gray-600">Última actualización: {cuando(estado.ultimaActualizacion)}</p>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato titulo="Clientes con deuda" valor={String(estado.clientes)} />
          <Dato titulo="Con algo vencido" valor={String(estado.conVencido)} />
          <Dato titulo="Pasan la tolerancia" valor={String(estado.bloqueados)} />
          <Dato titulo="Vencido de esos" valor={soles(estado.vencidoBloqueado)} />
          <Dato titulo="Sin venta a crédito" valor={String(estado.sinVenta)} />
          <Dato titulo="Vencido de esos" valor={soles(estado.vencidoSinVenta)} />
        </dl>

        <button type="button" className="btn-secondary mt-4" onClick={actualizar} disabled={pendiente}>
          {pendiente ? "Actualizando…" : "Actualizar ahora"}
        </button>
        <p className="mt-2 text-sm text-gray-600">
          Se actualiza sola todos los días. Este botón es para cuando un cliente acaba de pagar y
          no se puede esperar al refresco.
        </p>
      </section>

      <form action={guardar} className="card flex flex-col gap-4 p-5">
        <h3 className="font-heading text-lg">La regla</h3>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="activo"
            defaultChecked={estado.config.activo}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-gray-900">Frenar pedidos por deuda vencida</span>
            <span className="block text-gray-600">
              Apagado, la deuda se ve pero no frena nada. Encendido, hay dos escalones: pasada la
              tolerancia el pedido va a aprobación comercial —no se pierde: lo decide una persona—,
              y pasado el tope de abajo no se puede enviar. Los pedidos de contado nunca se frenan:
              pagar contra entrega no agranda la deuda.
            </span>
          </span>
        </label>

        <div>
          <label className="etiqueta" htmlFor="diasTolerancia">
            Días de atraso tolerados
          </label>
          <input
            id="diasTolerancia"
            name="diasTolerancia"
            type="number"
            min={0}
            step={1}
            defaultValue={estado.config.diasTolerancia}
            className="campo cifra w-32"
          />
          <p className="mt-1 text-sm text-gray-600">
            El pedido del cliente cuyo documento vencido más antiguo pase este número sale igual,
            pero queda esperando aprobación comercial, con la deuda escrita en el correo.
          </p>
        </div>

        <div>
          <label className="etiqueta" htmlFor="diasBloqueo">
            Días de atraso sin venta a crédito
          </label>
          <input
            id="diasBloqueo"
            name="diasBloqueo"
            type="number"
            min={0}
            step={1}
            defaultValue={estado.config.diasBloqueo}
            className="campo cifra w-32"
          />
          <p className="mt-1 text-sm text-gray-600">
            Desde este atraso el vendedor directamente no puede enviar el pedido, y nadie lo puede
            aprobar: se destraba cuando el cliente paga. No puede ser menor que el número de
            arriba.
          </p>
        </div>

        <div>
          <button type="submit" className="btn-primary" disabled={pendiente}>
            Guardar la regla
          </button>
        </div>
      </form>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{titulo}</dt>
      <dd className="mt-0.5 text-base font-semibold text-gray-900">{valor}</dd>
    </div>
  );
}
