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
  estadoDelCheckbox, etiquetaBotonLote, MAXIMO_POR_LOTE,
} from '@/domain/aprobacion-en-lote'
import { aprobarEnLoteAction, type EstadoLote } from './actions'

/**
 * La bandeja, con selección múltiple para aprobar varios juntos (pedido de
 * Mariela: entrar de a uno a seis pagos directos es el dolor real).
 *
 * La selección está limitada a UN TIPO por vez, y las propuestas de pago no
 * entran nunca. El porqué está en domain/aprobacion-en-lote.ts — en corto:
 * no hay transacciones, cada tipo lo decide alguien distinto, y aprobar una
 * propuesta libera el desembolso de decenas de obligaciones.
 *
 * Nunca se llega a una selección inválida: los checkbox que no corresponden
 * se deshabilitan con el motivo a la vista, así no hay un error que explicar
 * DESPUÉS de tildar.
 */
export function TablaPendientes({ filas }: { filas: FilaPendiente[] }) {
  const [estado, accion] = useFormState<EstadoLote, FormData>(aprobarEnLoteAction, null)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [confirmando, setConfirmando] = useState(false)

  const tipoActivo: TipoPendiente | null =
    filas.find((f) => elegidas.has(f.id))?.tipo ?? null

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const seleccionadas = filas.filter((f) => elegidas.has(f.id))
  const totales = totalesPorMoneda(seleccionadas)

  return (
    <form action={accion}>
      <input type="hidden" name="tipo" value={tipoActivo ?? ''} />

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
            {filas.map((f) => {
              const check = estadoDelCheckbox(f, { tipoActivo, elegidas })
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
                    {!check.habilitado && f.tipo === 'propuesta' ? (
                      <span className="block text-xs text-gray-500">se aprueba de a una</span>
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
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-sm text-gray-600">
              {elegidas.size} de {MAXIMO_POR_LOTE} como máximo por lote
            </span>
            <span className="flex flex-wrap gap-x-4 font-semibold tabular-nums">
              {totales.map((t) => (
                <Money key={t.moneda} valor={t.monto} moneda={t.moneda} />
              ))}
            </span>
          </div>

          {confirmando ? (
            <>
              {/* El monto es lo que decide: aprobar 4 pagos directos puede
                  ser S/800 o S/80.000. Se ve ANTES de ejecutar. */}
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                Vas a aprobar {elegidas.size}{' '}
                {tipoActivo
                  ? (elegidas.size === 1
                      ? ETIQUETA_TIPO_PENDIENTE[tipoActivo]
                      : ETIQUETA_TIPO_PENDIENTE_PLURAL[tipoActivo]
                    ).toLowerCase()
                  : 'registros'}{' '}
                por{' '}
                {totales.map((t) => `${t.moneda} ${t.monto.toFixed(2)}`).join(' + ')}. Esta
                decisión no se deshace desde aquí.
              </p>
              <div className="flex flex-wrap gap-2">
                <BotonConfirmar
                  texto={etiquetaBotonLote(tipoActivo, elegidas.size)}
                />
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
              {etiquetaBotonLote(tipoActivo, elegidas.size)}
            </button>
          )}
        </div>
      ) : null}
    </form>
  )
}

function BotonConfirmar({ texto }: { texto: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Aprobando…' : `Sí, ${texto.toLowerCase()}`}
    </button>
  )
}

function totalesPorMoneda(
  filas: readonly { moneda: string; monto: number }[]
): { moneda: string; monto: number }[] {
  const mapa = new Map<string, number>()
  for (const f of filas) mapa.set(f.moneda, (mapa.get(f.moneda) ?? 0) + f.monto)
  return [...mapa.entries()]
    .map(([moneda, monto]) => ({ moneda, monto: Math.round(monto * 100) / 100 }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda))
}

/** Tres tonos según cuánto lleva esperando — no es adorno: la bandeja
 * existe para atacar primero lo más viejo. */
function Espera({ dias }: { dias: number }) {
  const clase = dias >= 7 ? 'text-red-700 font-medium' : dias >= 3 ? 'text-amber-700' : 'text-gray-600'
  return <span className={clase}>{etiquetaEspera(dias)}</span>
}
