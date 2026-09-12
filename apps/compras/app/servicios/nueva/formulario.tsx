'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { crearOSAction, type EstadoFormulario } from './actions'
import type { ValoresOS } from '@/domain/valores-os'
import { SelectorCondicionPago } from '@/components/selector-condicion-pago'
import { TASA_IGV, redondear } from '@/domain/obligacion'

type ProveedorServicio = { id: string; razon_social: string }

export function FormularioOS({
  proveedores, inicial, accionServidor = crearOSAction, textoBoton, textoEnviando,
}: {
  proveedores: ProveedorServicio[]
  /** Valores guardados, al editar. Es el MISMO componente en los dos modos:
   * así una regla nueva entra en el alta y en la edición a la vez. */
  inicial?: ValoresOS
  accionServidor?: (previo: EstadoFormulario, form: FormData) => Promise<EstadoFormulario>
  textoBoton?: string
  textoEnviando?: string
}) {
  // El aviso por correo (Pieza K) necesita el nombre del proveedor, no el id.
  const [proveedorId, setProveedorId] = useState(inicial?.proveedorServicioId ?? '')
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(accionServidor, null)
  const sucio = useMarcarSucioAlEditar(estado)
  const [montoEstimado, setMontoEstimado] = useState(inicial?.montoEstimado ?? '')
  const [montoIncluyeIgv, setMontoIncluyeIgv] = useState(inicial?.montoIncluyeIgv ?? '')
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  // Mismo patrón de feedback en vivo que Gastos/Pago Directo: el monto
  // ingresado es la base O el total, según el selector — nunca se inventa
  // un valor, solo se muestra cómo queda repartido.
  const monto = Number(montoEstimado) || 0
  const desglose =
    montoIncluyeIgv === 'true'
      ? { base: redondear(monto / (1 + TASA_IGV)), igv: redondear(monto - monto / (1 + TASA_IGV)), total: monto }
      : montoIncluyeIgv === 'false'
        ? { base: monto, igv: redondear(monto * TASA_IGV), total: redondear(monto * (1 + TASA_IGV)) }
        : null

  return (
    <form action={accion} onChange={sucio.onChange} onSubmit={sucio.onSubmit} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{errorDe('general')}</p>
      ) : null}

      <section className="card space-y-3">
        <Campo etiqueta="Proveedor de servicio *" error={errorDe('proveedorServicioId')}>
          <input
            type="hidden" name="proveedorNombre"
            value={proveedores.find((p) => p.id === proveedorId)?.razon_social ?? ''}
          />
          <select
            name="proveedorServicioId" required value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            <option value="">Elige uno…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.razon_social}</option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Descripción del servicio" error={errorDe('descripcionServicio')}>
          <textarea name="descripcionServicio" rows={3} defaultValue={inicial?.descripcionServicio} className="w-full rounded-md border border-gray-300 px-3 py-2" />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Monto estimado" error={errorDe('montoEstimado')}>
            <input
              type="number" name="montoEstimado" min="0" step="0.01" value={montoEstimado}
              onChange={(e) => setMontoEstimado(e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>
          <Campo etiqueta="¿El monto es con IGV o sin IGV?" error={errorDe('montoIncluyeIgv')}>
            <select
              name="montoIncluyeIgv" value={montoIncluyeIgv}
              onChange={(e) => setMontoIncluyeIgv(e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
            >
              <option value="" disabled>Elegir...</option>
              <option value="false">Sin IGV (es la base imponible)</option>
              <option value="true">Con IGV (es el total)</option>
            </select>
          </Campo>
        </div>

        {desglose ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Base imponible</span><span className="tabular-nums">{desglose.base.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">IGV (18%)</span><span className="tabular-nums">{desglose.igv.toFixed(2)}</span></div>
            <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold">
              <span>Total</span><span className="tabular-nums">{desglose.total.toFixed(2)}</span>
            </div>
          </div>
        ) : null}

        <Campo etiqueta="Moneda">
          <select name="moneda" defaultValue={inicial?.moneda ?? 'PEN'} className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="PEN">PEN — Soles</option>
            <option value="USD">USD — Dólares</option>
          </select>
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Condición de pago en días">
            <SelectorCondicionPago name="condicionesPagoDias" required defaultValue={inicial?.condicionesPagoDias} />
          </Campo>
          <Campo etiqueta="Fecha de entrega estimada (opcional)">
            <input type="date" name="fechaEntregaEstimada" defaultValue={inicial?.fechaEntregaEstimada} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        </div>
      </section>

      <BotonGuardar
        texto={textoBoton ?? 'Crear orden de servicio'}
        textoEnviando={textoEnviando ?? 'Enviando…'}
      />
    </form>
  )
}

function BotonGuardar({ texto, textoEnviando }: { texto: string; textoEnviando: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? textoEnviando : texto}
    </button>
  )
}

function Campo({ etiqueta, error, children }: { etiqueta: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-800">{etiqueta}</span>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-red-700">{error}</p> : null}
    </label>
  )
}
