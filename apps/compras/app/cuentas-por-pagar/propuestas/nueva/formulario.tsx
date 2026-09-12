'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { crearPropuestaAction, type EstadoFormulario } from './actions'
import { Money } from '@/components/money'
import { TablaObligaciones, type FilaObligacion } from '@/components/tabla-obligaciones'
import { sumarPorMoneda } from '@/domain/propuesta-permisos'

/**
 * Armar el lote con las MISMAS columnas de Cuentas por Pagar (pedido de
 * Mariela, 2026-09-12): antes esto era una lista de código + monto, y para
 * decidir si una factura entraba al lote había que abrirla.
 *
 * La tabla es literalmente el mismo componente que usa Cuentas por Pagar,
 * con la columna de selección encendida — no una tabla "parecida", que es
 * como las dos pantallas empezarían a divergir sin que nadie lo note.
 */

type ObligacionConforme = FilaObligacion & {
  neto_a_pagar: number
  notasCreditoSinAplicar: number
}

export function FormularioPropuesta({ obligaciones }: { obligaciones: ObligacionConforme[] }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearPropuestaAction, null)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // Todo o nada sobre lo que se está viendo: con un lote de 40 facturas, la
  // diferencia entre un clic y cuarenta.
  const todasElegidas = obligaciones.length > 0 && obligaciones.every((o) => elegidas.has(o.id))
  const alternarTodas = () =>
    setElegidas(todasElegidas ? new Set() : new Set(obligaciones.map((o) => o.id)))

  // Agrupado por moneda y nunca sumado entre sí: antes esto sumaba PEN con
  // USD y lo mostraba con un "S/" fijo adelante, o sea un número que no
  // existe. Mismo criterio que `totalesDeLote` en el detalle del lote.
  const totales = sumarPorMoneda(
    obligaciones.filter((o) => elegidas.has(o.id)).map((o) => ({ moneda: o.moneda, monto: o.neto_a_pagar }))
  )

  const hoy = new Date().toISOString().slice(0, 10)
  const filas: FilaObligacion[] = obligaciones.map((o) => ({
    ...o,
    aviso:
      o.notasCreditoSinAplicar > 0
        ? 'Tiene una nota de crédito sin aplicar — el monto de esta propuesta no la descuenta.'
        : null,
  }))

  return (
    <form action={accion} className="space-y-4">
      {estado?.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{estado.error}</p>
      ) : null}

      <TablaObligaciones
        filas={filas}
        hoy={hoy}
        seleccion={{ elegidas, alternar, alternarTodas, nombreCampo: 'obligacionId' }}
      />

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-gray-600">
          {elegidas.size} de {obligaciones.length} {obligaciones.length === 1 ? 'elegida' : 'elegidas'}
        </span>
        <span className="flex flex-wrap gap-x-4 font-semibold tabular-nums">
          {totales.length === 0
            ? '—'
            : totales.map((t) => <Money key={t.moneda} valor={t.monto} moneda={t.moneda} />)}
        </span>
      </div>

      <BotonCrear />
    </form>
  )
}

function BotonCrear() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Creando…' : 'Crear propuesta'}
    </button>
  )
}
