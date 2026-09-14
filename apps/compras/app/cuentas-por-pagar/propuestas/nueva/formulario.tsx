'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { crearPropuestaAction, type EstadoFormulario } from './actions'
import { Money } from '@/components/money'
import { TablaObligaciones, type FilaObligacion } from '@/components/tabla-obligaciones'
import { sumarPorMoneda } from '@/domain/propuesta-permisos'
import { estaVencida } from '@/domain/categorias-estado-obligacion'

/**
 * Armar el lote con las MISMAS columnas de Cuentas por Pagar (pedido de
 * Mariela, 2026-09-12): antes esto era una lista de código + monto, y para
 * decidir si una factura entraba al lote había que abrirla.
 *
 * La tabla es literalmente el mismo componente que usa Cuentas por Pagar,
 * con la columna de selección encendida — no una tabla "parecida", que es
 * como las dos pantallas empezarían a divergir sin que nadie lo note.
 *
 * Separado en VENCIDAS y NO VENCIDAS (pedido de Mariela, 2026-09-14): lo que
 * ya venció es lo que hay que priorizar al armar el lote, y en una lista
 * única ordenada por fecha eso había que deducirlo mirando la columna de
 * vencimiento fila por fila. El criterio es `estaVencida`, el mismo que
 * pinta de rojo en Cuentas por Pagar y en el Dashboard — no uno nuevo.
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

  const hoy = new Date().toISOString().slice(0, 10)
  const filas: FilaObligacion[] = obligaciones.map((o) => ({
    ...o,
    aviso:
      o.notasCreditoSinAplicar > 0
        ? 'Tiene una nota de crédito sin aplicar — el monto de esta propuesta no la descuenta.'
        : null,
  }))

  // Todas son `conforme` (es lo que las hace candidatas), así que acá
  // `estaVencida` se reduce a "venció antes de hoy" — pero se usa la función
  // compartida igual: si mañana cambia el criterio de vencido, cambia en un
  // solo lugar y esta pantalla no queda diciendo otra cosa.
  const vencidas = filas.filter((o) => estaVencida(o.fecha_vencimiento_real, o.estado, hoy))
  // Lo que no venció, ordenado por fecha: lo que vence antes va primero, y
  // lo que no tiene fecha al final — no se puede priorizar lo que no se sabe
  // cuándo vence.
  const noVencidas = filas
    .filter((o) => !estaVencida(o.fecha_vencimiento_real, o.estado, hoy))
    .sort(porVencimiento)

  // Agrupado por moneda y nunca sumado entre sí: antes esto sumaba PEN con
  // USD y lo mostraba con un "S/" fijo adelante, o sea un número que no
  // existe. Mismo criterio que `totalesDeLote` en el detalle del lote.
  const totales = sumarPorMoneda(
    obligaciones.filter((o) => elegidas.has(o.id)).map((o) => ({ moneda: o.moneda, monto: o.neto_a_pagar }))
  )

  // "Seleccionar todas" es por SECCIÓN, no global: el caso real de Mariela es
  // "meter todas las vencidas y después elegir a mano entre las que no".
  const seleccionDeSeccion = (deLaSeccion: readonly FilaObligacion[]) => ({
    elegidas,
    alternar,
    alternarTodas: () =>
      setElegidas((prev) => {
        const next = new Set(prev)
        const todas = deLaSeccion.length > 0 && deLaSeccion.every((o) => next.has(o.id))
        for (const o of deLaSeccion) {
          if (todas) next.delete(o.id)
          else next.add(o.id)
        }
        return next
      }),
    nombreCampo: 'obligacionId',
  })

  return (
    <form action={accion} className="space-y-4">
      {estado?.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{estado.error}</p>
      ) : null}

      {vencidas.length > 0 ? (
        <Seccion
          titulo="Vencidas"
          detalle={`${vencidas.length} ${vencidas.length === 1 ? 'obligación ya venció' : 'obligaciones ya vencieron'} — estas primero.`}
          tono="alerta"
        >
          <TablaObligaciones filas={vencidas} hoy={hoy} seleccion={seleccionDeSeccion(vencidas)} />
        </Seccion>
      ) : null}

      {noVencidas.length > 0 ? (
        <Seccion
          titulo="No vencidas"
          detalle="Ordenadas por vencimiento: lo que vence antes va primero. Las que no tienen fecha van al final."
          tono="neutro"
        >
          <TablaObligaciones filas={noVencidas} hoy={hoy} seleccion={seleccionDeSeccion(noVencidas)} />
        </Seccion>
      ) : null}

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

/** Sin fecha de vencimiento va al final: no se puede priorizar lo que no se
 * sabe cuándo vence (pasa con reembolsos y anticipos, que nacen sin fecha). */
function porVencimiento(a: FilaObligacion, b: FilaObligacion): number {
  if (!a.fecha_vencimiento_real && !b.fecha_vencimiento_real) return 0
  if (!a.fecha_vencimiento_real) return 1
  if (!b.fecha_vencimiento_real) return -1
  return a.fecha_vencimiento_real.localeCompare(b.fecha_vencimiento_real)
}

function Seccion({
  titulo, detalle, tono, children,
}: {
  titulo: string
  detalle: string
  tono: 'alerta' | 'neutro'
  children: React.ReactNode
}) {
  return (
    <section>
      <h2
        className={`font-heading text-lg ${tono === 'alerta' ? 'text-red-700' : 'text-gray-900'}`}
      >
        {titulo}
      </h2>
      <p className="mb-2 mt-0.5 text-sm text-gray-600">{detalle}</p>
      {children}
    </section>
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
