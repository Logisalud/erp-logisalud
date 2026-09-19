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
import {
  etiquetaBotonCorte, ETIQUETA_ACCION, filasQueNoAdmiten, filasSinRastroDelMotivo,
  validarMotivo, type AccionCorte,
} from '@/domain/corte-en-lote'
import { ChipFiltro } from '@/components/chip-filtro'
import { decidirEnLoteAction, type EstadoLote } from './actions'

/** Las tres decisiones que la bandeja puede tomar sobre una selección. */
type Modo = 'aprobar' | AccionCorte

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
  const [estado, accion] = useFormState<EstadoLote, FormData>(decidirEnLoteAction, null)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  // `null` = todavía no se eligió qué hacer. Reemplaza al viejo booleano
  // `confirmando`: ahora hay tres salidas y el panel de confirmación cambia
  // según cuál sea.
  const [modo, setModo] = useState<Modo | null>(null)
  const [motivo, setMotivo] = useState('')
  // Filtro por tipo, en el cliente: las filas ya están todas cargadas, así
  // que filtrar no necesita ir al servidor.
  const [filtro, setFiltro] = useState<TipoPendiente | null>(null)

  const visibles = filtro ? filas.filter((f) => f.tipo === filtro) : filas
  const conteos = contarPorTipo(filas)
  const seleccionarTodos = estadoDelSeleccionarTodos(visibles.length)

  const cambiarFiltro = (nuevo: TipoPendiente | null) => {
    setFiltro(nuevo)
    setModo(null)
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

  const cerrarPanel = () => {
    setModo(null)
    setMotivo('')
  }

  const abrirCorte = (accion: AccionCorte) => {
    setModo(accion)
    setMotivo('')
  }

  /**
   * El atajo por fila. No abre un segundo mecanismo: deja esa fila como la
   * única seleccionada y abre el MISMO panel del lote. Así hay un solo camino
   * que mantener, un solo lugar donde vive la confirmación, y rechazar una
   * sola cosa valida exactamente igual que rechazar seis.
   */
  const cortarSoloEsta = (id: string, accion: AccionCorte) => {
    setElegidas(new Set([id]))
    abrirCorte(accion)
  }

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
                    {/* Los atajos: solo aparecen si ESE tipo admite esa
                        salida (ver CORTE_POR_TIPO). Un link que lleva a un
                        "no se puede" es peor que no tenerlo. */}
                    <span className="ml-2 inline-flex gap-2">
                      <AtajoCorte fila={f} accion="rechazar" onElegir={cortarSoloEsta} />
                      <AtajoCorte fila={f} accion="anular" onElegir={cortarSoloEsta} />
                    </span>
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

          {modo === null ? (
            // Las tres salidas, juntas y con el mismo peso visual que su
            // consecuencia: aprobar es el botón primario, rechazar y anular
            // son secundarios en rojo. Ninguna ejecuta nada todavía.
            <div className="flex flex-wrap gap-2">
              <button
                type="button" onClick={() => setModo('aprobar')}
                className="btn-primary w-full sm:w-auto"
              >
                {etiquetaBotonLote(seleccionadas)}
              </button>
              <BotonAbrirCorte accion="rechazar" filas={seleccionadas} onElegir={abrirCorte} />
              <BotonAbrirCorte accion="anular" filas={seleccionadas} onElegir={abrirCorte} />
            </div>
          ) : modo === 'aprobar' ? (
            <>
              <ResumenDeConfirmacion resumen={resumen} />
              <div className="flex flex-wrap gap-2">
                <BotonConfirmar accion="aprobar" texto={etiquetaBotonLote(seleccionadas)} />
                <button type="button" onClick={cerrarPanel} className="btn-secondary">
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <PanelCorte
              accion={modo}
              filas={seleccionadas}
              motivo={motivo}
              onMotivo={setMotivo}
              onCancelar={cerrarPanel}
            />
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

/**
 * El botón que de verdad envía. Lleva `name="accion"`, así que el servidor
 * sabe cuál de las tres decisiones se apretó sin que haya tres formularios
 * ni tres Server Actions.
 */
function BotonConfirmar({
  accion, texto, deshabilitado,
}: {
  accion: Modo
  texto: string
  deshabilitado?: boolean
}) {
  const { pending } = useFormStatus()
  const enCurso = accion === 'aprobar' ? 'Aprobando…' : `${ETIQUETA_ACCION[accion].verbo}…`
  return (
    <button
      type="submit" name="accion" value={accion}
      disabled={pending || deshabilitado}
      className={accion === 'aprobar' ? 'btn-primary' : 'btn-peligro'}
    >
      {pending ? enCurso : `Sí, ${texto.toLowerCase()}`}
    </button>
  )
}

/** Abre el panel de rechazo o anulación. Se apaga si NINGUNA de las filas
 *  seleccionadas admite esa salida — con el motivo a la vista. */
function BotonAbrirCorte({
  accion, filas, onElegir,
}: {
  accion: AccionCorte
  filas: readonly FilaPendiente[]
  onElegir: (accion: AccionCorte) => void
}) {
  const ninguna = filasQueNoAdmiten(filas, accion).length === filas.length
  const motivo = `Ninguno de los tipos seleccionados se puede ${accion} desde la bandeja.`
  return (
    <button
      type="button"
      onClick={() => onElegir(accion)}
      disabled={ninguna}
      title={ninguna ? motivo : undefined}
      className="btn-peligro disabled:cursor-not-allowed disabled:opacity-40"
    >
      {etiquetaBotonCorte(filas, accion)}
    </button>
  )
}

/** El atajo de una fila. No se renderiza si ese tipo no admite la acción. */
function AtajoCorte({
  fila, accion, onElegir,
}: {
  fila: FilaPendiente
  accion: AccionCorte
  onElegir: (id: string, accion: AccionCorte) => void
}) {
  if (filasQueNoAdmiten([fila], accion).length > 0) return null
  return (
    <button
      type="button"
      onClick={() => onElegir(fila.id, accion)}
      className="text-red-700 underline"
    >
      {ETIQUETA_ACCION[accion].verbo}
    </button>
  )
}

/**
 * El panel de rechazo / anulación.
 *
 * Dice tres cosas ANTES de ejecutar, y las tres son incómodas a propósito:
 * cuántas filas NO admiten esta salida y van a quedar afuera, en cuántas el
 * motivo no se va a guardar, y que el motivo es el mismo para todas.
 * Enterarse de eso en el resumen, después, es enterarse tarde.
 */
function PanelCorte({
  accion, filas, motivo, onMotivo, onCancelar,
}: {
  accion: AccionCorte
  filas: readonly FilaPendiente[]
  motivo: string
  onMotivo: (v: string) => void
  onCancelar: () => void
}) {
  const fuera = filasQueNoAdmiten(filas, accion)
  // Por id y no por identidad de objeto: `filas` se recalcula en cada render
  // y comparar referencias acá es el tipo de cosa que funciona hasta que
  // alguien mete un `.map()` en el medio.
  const idsFuera = new Set(fuera.map((f) => f.id))
  const aplican = filas.filter((f) => !idsFuera.has(f.id))
  const sinRastro = filasSinRastroDelMotivo(filas, accion)
  const problema = validarMotivo(motivo, accion)
  const { elSustantivo, verbo } = ETIQUETA_ACCION[accion]

  return (
    <div className="rounded-md border-2 border-red-300 bg-red-50 px-4 py-3 space-y-3">
      <p className="font-heading text-lg text-red-900">
        {verbo} {aplican.length} {aplican.length === 1 ? 'registro' : 'registros'}
      </p>

      {fuera.length > 0 ? (
        <p className="text-sm text-red-900">
          {fuera.length === 1 ? 'Queda afuera' : `Quedan afuera ${fuera.length}`}:{' '}
          {fuera.map((f) => `${f.codigo} (${ETIQUETA_TIPO_PENDIENTE[f.tipo]})`).join(', ')} — ese
          tipo no se {accion} desde acá.
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="font-medium text-red-900">Motivo {accion === 'anular' ? 'de la anulación' : 'del rechazo'}</span>
        <textarea
          name="motivo" rows={2} value={motivo} onChange={(e) => onMotivo(e.target.value)}
          placeholder="Qué está mal, con suficiente detalle para que quien lo reciba entienda."
          className="mt-1 w-full rounded-md border border-red-300 px-3 py-2 text-sm"
        />
      </label>

      <p className="text-sm text-red-900">
        Ese motivo se aplica <strong>igual a las {aplican.length}</strong> — no hay uno por fila.
        {sinRastro.length > 0 ? (
          <>
            {' '}Y en {sinRastro.length}{' '}
            ({sinRastro.map((f) => ETIQUETA_TIPO_PENDIENTE[f.tipo]).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
            ) {elSustantivo} se registra pero el motivo <strong>no queda guardado</strong>.
          </>
        ) : null}
      </p>

      {problema ? <p className="text-sm font-medium text-red-900">{problema}</p> : null}

      <div className="flex flex-wrap gap-2">
        <BotonConfirmar
          accion={accion}
          texto={etiquetaBotonCorte(aplican, accion)}
          deshabilitado={!!problema || aplican.length === 0}
        />
        <button type="button" onClick={onCancelar} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </div>
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
