'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'
import { Money } from '@/components/money'
import {
  etiquetaEspera, ETIQUETA_TIPO_PENDIENTE, ETIQUETA_TIPO_PENDIENTE_PLURAL,
  type FilaPendiente, type TipoPendiente,
} from '@/domain/pendientes-aprobar'
import {
  cuantasEntranAlLote, estadoDelCheckbox, estadoDelSeleccionarTodos, etiquetaBotonLote,
  exigeTotalDestacado, MAXIMO_POR_LOTE, resumenDeLaSeleccion,
  type ResumenSeleccion,
} from '@/domain/aprobacion-en-lote'
import { ChipFiltro } from '@/components/chip-filtro'
import { aprobarEnLoteAction, type EstadoLote } from './actions'

/**
 * La bandeja, con selección múltiple para aprobar varios juntos (pedido de
 * Mariela: entrar de a uno a seis pagos directos es el dolor real).
 *
 * Desde 2026-09-15 la selección PUEDE mezclar tipos. Lo que sostiene eso no
 * es la pantalla sino tres cosas del servidor —el orden de ejecución con las
 * propuestas al final, reusar la función individual de cada tipo, y el
 * resumen parcial honesto— explicadas en domain/aprobacion-en-lote.ts.
 *
 * Lo que sí aporta la pantalla es el resumen ANTES de confirmar: con tipos
 * mezclados, un total solo no deja ver que casi toda la plata son dos
 * propuestas y el resto son firmas chicas. De ahí el desglose por tipo más
 * el corte específico de Propuestas de pago.
 *
 * Nunca se llega a una selección inválida: los checkbox que no corresponden
 * se deshabilitan con el motivo a la vista, así no hay un error que explicar
 * DESPUÉS de tildar.
 */
export function TablaPendientes({ filas }: { filas: FilaPendiente[] }) {
  const [estado, accion] = useFormState<EstadoLote, FormData>(aprobarEnLoteAction, null)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [confirmando, setConfirmando] = useState(false)
  // Filtro por tipo, en el cliente: las filas ya están todas cargadas, así
  // que filtrar no necesita ir al servidor.
  const [filtro, setFiltro] = useState<TipoPendiente | null>(null)

  const visibles = filtro ? filas.filter((f) => f.tipo === filtro) : filas
  const conteos = contarPorTipo(filas)
  const seleccionarTodos = estadoDelSeleccionarTodos(visibles.length)

  const cambiarFiltro = (nuevo: TipoPendiente | null) => {
    setFiltro(nuevo)
    setConfirmando(false)
    // La selección SOBREVIVE al cambio de filtro, y eso es a propósito: es
    // la forma de armar un lote mezclado (filtrar a Pagos Directos, tildar
    // tres, pasar a Propuestas, tildar una). Antes se limpiaba, porque con
    // un tipo por selección cambiar de filtro solo podía ser un error.
    //
    // El riesgo que eso abre —tener tildado algo que no está en pantalla—
    // lo cubre el resumen de la confirmación, que lista TODO lo
    // seleccionado por tipo, visible o no.
  }

  const tildarTodosLosVisibles = () => {
    if (!seleccionarTodos.habilitado) return
    setElegidas((prev) => {
      const todosTildados = visibles.length > 0 && visibles.every((f) => prev.has(f.id))
      if (todosTildados) return new Set()
      // El tope manda: con 25 filas visibles entran las primeras 20.
      return new Set(visibles.slice(0, cuantasEntranAlLote(visibles.length)).map((f) => f.id))
    })
  }

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const seleccionadas = filas.filter((f) => elegidas.has(f.id))
  // Por MONEDA de cada fila, no por su columna Monto: una propuesta puede
  // mezclar PEN y USD adentro y la columna solo muestra una.
  const resumen = resumenDeLaSeleccion(seleccionadas)
  const totales = resumen.total
  const totalEnGrande = exigeTotalDestacado(seleccionadas)

  return (
    // Ya no se manda ningún `tipo`: el servidor lo saca de su propia
    // relectura de la bandeja. Un id manipulado no puede ni afirmar de qué
    // tipo es.
    <form action={accion}>

      {estado ? (
        <div
          role="status"
          className={`mb-3 rounded-md border px-3 py-2.5 text-sm ${
            estado.ok
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {estado.ok ? estado.resumen : estado.error}
        </div>
      ) : null}

      {/* Mismo chip que Cuentas por Pagar (components/chip-filtro.tsx). */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <ChipFiltro etiqueta="Todos" activo={filtro === null} onClick={() => cambiarFiltro(null)} />
        {conteos.map(({ tipo, cantidad }) => (
          <ChipFiltro
            key={tipo}
            etiqueta={`${ETIQUETA_TIPO_PENDIENTE[tipo]} (${cantidad})`}
            activo={filtro === tipo}
            onClick={() => cambiarFiltro(tipo)}
          />
        ))}
      </div>

      <div className="mb-3">
        <button
          type="button"
          onClick={tildarTodosLosVisibles}
          disabled={!seleccionarTodos.habilitado}
          title={seleccionarTodos.habilitado ? undefined : seleccionarTodos.motivo}
          className="text-sm text-logisalud-teal underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
        >
          {visibles.length > cuantasEntranAlLote(visibles.length)
            ? `Seleccionar los primeros ${MAXIMO_POR_LOTE} visibles`
            : 'Seleccionar todos los visibles'}
        </button>
        {/* El motivo también a la vista, no solo en el title: un botón
            apagado sin explicación hace dudar del sistema, y acá la salida
            está a un clic en los chips de arriba. */}
        {!seleccionarTodos.habilitado ? (
          <span className="ml-2 text-xs text-gray-500">{seleccionarTodos.motivo}</span>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <th className="px-3 py-2 font-medium" />
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Concepto</th>
              <th className="px-3 py-2 font-medium">Quién lo creó</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 text-right font-medium">Monto</th>
              <th className="px-3 py-2 font-medium">Esperando hace</th>
              <th className="px-3 py-2 font-medium">Fecha requerida</th>
              <th className="px-3 py-2 font-medium">Decide</th>
              <th className="px-3 py-2 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const check = estadoDelCheckbox(f, { elegidas })
              return (
                <tr
                  key={`${f.tipo}-${f.id}`}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox" name="pendienteId" value={f.id}
                      checked={elegidas.has(f.id)}
                      onChange={() => alternar(f.id)}
                      disabled={!check.habilitado}
                      // El motivo va en el title Y debajo de la fila que lo
                      // necesita: un checkbox apagado sin explicación es de
                      // las cosas que más hacen dudar de un sistema.
                      title={check.habilitado ? `Incluir ${f.codigo}` : check.motivo}
                      aria-label={check.habilitado ? `Incluir ${f.codigo}` : check.motivo}
                      className="h-5 w-5 disabled:opacity-30"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {ETIQUETA_TIPO_PENDIENTE[f.tipo]}
                    {f.tipo === 'propuesta' ? (
                      <span className="block text-xs text-gray-500">libera el pago de su lote</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={f.href} className="font-medium text-logisalud-teal underline">
                      {f.codigo}
                    </Link>
                  </td>
                  <td className="px-3 py-2 max-w-[260px] truncate" title={f.concepto ?? undefined}>
                    {f.concepto ?? '—'}
                  </td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{f.quienLoCreo ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{f.esperandoDesde.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money valor={f.monto} moneda={f.moneda} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Espera dias={f.diasEsperando} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {f.fechaRequerida ?? '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{f.quienDecide}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={f.href} className="text-logisalud-teal underline">
                      Revisar y decidir
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {elegidas.size > 0 ? (
        <div className="card mt-4 space-y-3">
          {/* Con propuestas el total deja de ser un dato al pie: cada una
              libera el desembolso de un lote entero, así que tres pueden
              ser cien obligaciones. Se lee ANTES de decidir, no después. */}
          {totalEnGrande ? (
            <div className="rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                Total que se libera al aprobar
              </p>
              <p className="font-heading mt-1 flex flex-wrap gap-x-6 text-2xl text-amber-900">
                {totales.map((t) => (
                  <span key={t.moneda} className="tabular-nums">
                    <Money valor={t.monto} moneda={t.moneda} />
                  </span>
                ))}
              </p>
              <p className="mt-1 text-xs text-amber-900">
                {elegidas.size === 1
                  ? 'Es el total de la propuesta seleccionada, con todas sus obligaciones.'
                  : `Es la suma de las ${elegidas.size} propuestas seleccionadas, con todas sus obligaciones.`}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-sm text-gray-600">
              {elegidas.size} de {MAXIMO_POR_LOTE} como máximo por lote
            </span>
            {totalEnGrande ? null : (
              <span className="flex flex-wrap gap-x-4 font-semibold tabular-nums">
                {totales.map((t) => (
                  <Money key={t.moneda} valor={t.monto} moneda={t.moneda} />
                ))}
              </span>
            )}
          </div>

          {confirmando ? (
            <>
              <ResumenDeConfirmacion resumen={resumen} />
              <div className="flex flex-wrap gap-2">
                <BotonConfirmar texto={etiquetaBotonLote(seleccionadas)} />
                <button
                  type="button" onClick={() => setConfirmando(false)}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <button
              type="button" onClick={() => setConfirmando(true)}
              className="btn-primary w-full sm:w-auto"
            >
              {etiquetaBotonLote(seleccionadas)}
            </button>
          )}
        </div>
      ) : null}
    </form>
  )
}

/** Los tipos que hay hoy en la bandeja, con cuántas filas tiene cada uno —
 * en el orden de la tabla, que es por antigüedad. */
function contarPorTipo(
  filas: readonly FilaPendiente[]
): { tipo: TipoPendiente; cantidad: number }[] {
  const mapa = new Map<TipoPendiente, number>()
  for (const f of filas) mapa.set(f.tipo, (mapa.get(f.tipo) ?? 0) + 1)
  return [...mapa.entries()].map(([tipo, cantidad]) => ({ tipo, cantidad }))
}

function BotonConfirmar({ texto }: { texto: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Aprobando…' : `Sí, ${texto.toLowerCase()}`}
    </button>
  )
}

/** Tres tonos según cuánto lleva esperando — no es adorno: la bandeja
 * existe para atacar primero lo más viejo. */
function Espera({ dias }: { dias: number }) {
  const clase = dias >= 7 ? 'text-red-700 font-medium' : dias >= 3 ? 'text-amber-700' : 'text-gray-600'
  return <span className={clase}>{etiquetaEspera(dias)}</span>
}

/**
 * Lo que se lee ANTES de ejecutar.
 *
 * El monto es lo que decide: aprobar 4 pagos directos puede ser S/ 800 o
 * S/ 80.000. Y con tipos mezclados el total solo ya no alcanza — "S/ 51,500"
 * no deja ver que S/ 41,900 de eso son dos propuestas que liberan
 * desembolsos enteros y el resto son seis firmas chicas. De ahí el desglose
 * por tipo y, destacado aparte, cuánto sale de Propuestas de pago.
 */
function ResumenDeConfirmacion({ resumen }: { resumen: ResumenSeleccion }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <p className="font-medium">
        Vas a aprobar {resumen.cantidad}{' '}
        {resumen.cantidad === 1 ? 'registro' : 'registros'}
        {resumen.mezclaTipos ? ' de distintos tipos' : ''}.
      </p>

      {/* Una línea por tipo, en el ORDEN EN QUE SE VAN A EJECUTAR: así la
          lista no es solo un inventario, también dice qué pasa primero. */}
      <ul className="mt-2 space-y-0.5">
        {resumen.porTipo.map(({ tipo, cantidad, totalPorMoneda }) => (
          <li key={tipo} className="flex flex-wrap justify-between gap-x-4">
            <span>
              {cantidad}{' '}
              {cantidad === 1
                ? ETIQUETA_TIPO_PENDIENTE[tipo]
                : ETIQUETA_TIPO_PENDIENTE_PLURAL[tipo]}
            </span>
            <span className="tabular-nums">
              {totalPorMoneda.map((t) => `${t.moneda} ${t.monto.toFixed(2)}`).join(' · ')}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 border-t border-amber-200 pt-2">
        <p className="flex flex-wrap justify-between gap-x-4 font-semibold">
          <span>TOTAL</span>
          <span className="tabular-nums">
            {resumen.total.map((t) => `${t.moneda} ${t.monto.toFixed(2)}`).join(' · ')}
          </span>
        </p>

        {/* El desglose de Propuestas, destacado. Es el pedido explícito de
            Mariela y el número que más importa: una propuesta no es una
            firma, libera el desembolso de su lote entero. */}
        {resumen.dePropuestas ? (
          <p className="mt-1 flex flex-wrap justify-between gap-x-4 font-semibold text-amber-950">
            <span>
              └─ de Propuestas de pago ({resumen.dePropuestas.cantidad})
            </span>
            <span className="tabular-nums">
              {resumen.dePropuestas.totalPorMoneda
                .map((t) => `${t.moneda} ${t.monto.toFixed(2)}`)
                .join(' · ')}
            </span>
          </p>
        ) : null}
        {resumen.delResto ? (
          <p className="flex flex-wrap justify-between gap-x-4">
            <span>└─ del resto ({resumen.delResto.cantidad})</span>
            <span className="tabular-nums">
              {resumen.delResto.totalPorMoneda
                .map((t) => `${t.moneda} ${t.monto.toFixed(2)}`)
                .join(' · ')}
            </span>
          </p>
        ) : null}
      </div>

      <p className="mt-2">
        {resumen.dePropuestas
          ? 'Aprobar una propuesta libera el desembolso de todas sus obligaciones. '
          : ''}
        Esta decisión no se deshace desde aquí.
      </p>
    </div>
  )
}
