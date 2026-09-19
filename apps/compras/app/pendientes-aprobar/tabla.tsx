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
  MAXIMO_POR_LOTE, resumenDeLaSeleccion, type ResumenSeleccion,
} from '@/domain/aprobacion-en-lote'
import {
  admiteCorte, avisoMotivoSinRastro, AYUDA_ACCION, BAJADA_SECCION, ETIQUETA_ACCION,
  filasDeSeccion, SECCIONES_BANDEJA, TITULO_SECCION, validarMotivo,
  type AccionCorte, type SeccionBandeja,
} from '@/domain/corte'
import { ChipFiltro } from '@/components/chip-filtro'
import {
  aprobarEnLoteAction, cortarUnoAction, type EstadoCorte, type EstadoLote,
} from './actions'

/**
 * La bandeja, partida en DOS SECCIONES (Sebas, 2026-09-19).
 *
 * Antes era una sola tabla donde una propuesta de S/ 41,900 se leía igual
 * que un reembolso de taxi de S/ 20, y el total en ámbar aparecía y
 * desaparecía según lo que estuviera tildado. Ahora son dos preguntas
 * distintas en dos lugares distintos — ver SECCION_POR_TIPO en
 * domain/corte.ts:
 *
 *  1. Documentos por aprobar — "¿este documento está bien?"
 *  2. Lotes de pago por aprobar — "¿autorizo que salga esta plata?"
 *
 * APROBAR puede ser en lote, en las dos secciones. RECHAZAR y ANULAR son
 * SIEMPRE de a uno: el motivo viaja por correo a quien cargó el registro, y
 * en un lote deja de ser un motivo. Existió en lote unas horas el mismo día
 * y se revirtió — el razonamiento completo está en domain/corte.ts.
 *
 * Cada sección tiene su propia selección y su propio estado: tildar cinco
 * documentos no debería arrastrar un lote de pago, ni al revés.
 */
export function TablaPendientes({ filas }: { filas: FilaPendiente[] }) {
  // Un solo aviso de resultado arriba de todo, compartido por las dos
  // secciones y por las dos acciones: después de decidir, la pantalla se
  // recarga entera y dos avisos en lugares distintos sería peor.
  const [estadoCorte, ejecutarCorte] = useFormState<EstadoCorte, FormData>(cortarUnoAction, null)
  const [corte, setCorte] = useState<{ fila: FilaPendiente; accion: AccionCorte } | null>(null)

  return (
    <>
      {estadoCorte ? <Aviso ok={estadoCorte.ok} texto={estadoCorte.ok ? estadoCorte.resumen : estadoCorte.error} /> : null}

      {SECCIONES_BANDEJA.map((seccion) => {
        const suyas = filasDeSeccion(filas, seccion)
        if (suyas.length === 0) return null
        return (
          <Seccion
            key={seccion}
            seccion={seccion}
            filas={suyas}
            corte={corte}
            onAbrirCorte={(fila, accion) => setCorte({ fila, accion })}
            onCerrarCorte={() => setCorte(null)}
            ejecutarCorte={ejecutarCorte}
          />
        )
      })}
    </>
  )
}

function Aviso({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <div
      role="status"
      className={`mb-4 rounded-md border px-3 py-2.5 text-sm ${
        ok ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-900'
      }`}
    >
      {texto}
    </div>
  )
}

function Seccion({
  seccion, filas, corte, onAbrirCorte, onCerrarCorte, ejecutarCorte,
}: {
  seccion: SeccionBandeja
  filas: FilaPendiente[]
  corte: { fila: FilaPendiente; accion: AccionCorte } | null
  onAbrirCorte: (fila: FilaPendiente, accion: AccionCorte) => void
  onCerrarCorte: () => void
  ejecutarCorte: (form: FormData) => void
}) {
  const [estadoLote, aprobar] = useFormState<EstadoLote, FormData>(aprobarEnLoteAction, null)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [confirmando, setConfirmando] = useState(false)
  const [filtro, setFiltro] = useState<TipoPendiente | null>(null)

  const visibles = filtro ? filas.filter((f) => f.tipo === filtro) : filas
  const conteos = contarPorTipo(filas)
  const seleccionarTodos = estadoDelSeleccionarTodos(visibles.length)
  const seleccionadas = filas.filter((f) => elegidas.has(f.id))
  const resumen = resumenDeLaSeleccion(seleccionadas)

  // El total en ámbar es fijo por sección, no depende de lo tildado: en
  // "Lotes de pago" SIEMPRE se muestra en grande, porque cada fila libera el
  // desembolso de un lote entero. Antes aparecía solo si la selección
  // contenía una propuesta, y esa condición desapareció al separar.
  const totalEnGrande = seccion === 'lote'
  // El panel de corte pertenece a la fila abierta, no a la sección: se
  // renderiza en la sección donde vive esa fila.
  const corteAca = corte && filas.some((f) => f.id === corte.fila.id) ? corte : null

  const cambiarFiltro = (nuevo: TipoPendiente | null) => {
    setFiltro(nuevo)
    setConfirmando(false)
  }

  const tildarTodosLosVisibles = () => {
    if (!seleccionarTodos.habilitado) return
    setElegidas((prev) => {
      const todosTildados = visibles.length > 0 && visibles.every((f) => prev.has(f.id))
      if (todosTildados) return new Set()
      return new Set(visibles.slice(0, cuantasEntranAlLote(visibles.length)).map((f) => f.id))
    })
  }

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <section className="mb-10">
      <header className="mb-3">
        <h2 className="font-heading text-xl">
          {TITULO_SECCION[seccion]} <span className="text-gray-400">({filas.length})</span>
        </h2>
        <p className="text-sm text-gray-600">
          {BAJADA_SECCION[seccion]}
          {seccion === 'lote' ? (
            <span className="ml-1 text-gray-500">Solo Contabilidad (rol admin) y Administración.</span>
          ) : null}
        </p>
      </header>

      {estadoLote ? (
        <Aviso ok={estadoLote.ok} texto={estadoLote.ok ? estadoLote.resumen : estadoLote.error} />
      ) : null}

      {/* Los chips solo tienen sentido con más de un tipo — en "Lotes de
          pago" siempre hay uno solo, así que no se dibujan. */}
      {conteos.length > 1 ? (
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
      ) : null}

      <form action={aprobar}>
        <div className="mb-3">
          <button
            type="button"
            onClick={tildarTodosLosVisibles}
            disabled={!seleccionarTodos.habilitado}
            className="text-sm text-logisalud-teal underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
          >
            {visibles.length > cuantasEntranAlLote(visibles.length)
              ? `Seleccionar los primeros ${MAXIMO_POR_LOTE} visibles`
              : 'Seleccionar todos los visibles'}
          </button>
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
                <th className="px-3 py-2 font-medium">Decide</th>
                <th className="px-3 py-2 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const check = estadoDelCheckbox(f, { elegidas })
                return (
                  <tr key={f.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox" name="pendienteId" value={f.id}
                        checked={elegidas.has(f.id)}
                        onChange={() => alternar(f.id)}
                        disabled={!check.habilitado}
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
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{f.quienDecide}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link href={f.href} className="text-logisalud-teal underline">
                        Revisar
                      </Link>
                      {/* Los atajos de UNA fila. Solo aparecen si ESE tipo
                          admite esa salida (ver CORTE_POR_TIPO): un link que
                          lleva a un "no se puede" es peor que no tenerlo. */}
                      <span className="ml-2 inline-flex gap-2">
                        <AtajoCorte fila={f} accion="rechazar" onElegir={onAbrirCorte} />
                        <AtajoCorte fila={f} accion="anular" onElegir={onAbrirCorte} />
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
            {totalEnGrande ? (
              <div className="rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                  Total que se libera al aprobar
                </p>
                <p className="font-heading mt-1 flex flex-wrap gap-x-6 text-2xl text-amber-900">
                  {resumen.total.map((t) => (
                    <span key={t.moneda} className="tabular-nums">
                      <Money valor={t.monto} moneda={t.moneda} />
                    </span>
                  ))}
                </p>
                <p className="mt-1 text-xs text-amber-900">
                  {elegidas.size === 1
                    ? 'Es el total del lote seleccionado, con todas sus obligaciones.'
                    : `Es la suma de los ${elegidas.size} lotes seleccionados, con todas sus obligaciones.`}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="text-sm text-gray-600">
                {elegidas.size} de {MAXIMO_POR_LOTE} como máximo por lote
              </span>
              {totalEnGrande ? null : (
                <span className="flex flex-wrap gap-x-4 font-semibold tabular-nums">
                  {resumen.total.map((t) => (
                    <Money key={t.moneda} valor={t.monto} moneda={t.moneda} />
                  ))}
                </span>
              )}
            </div>

            {confirmando ? (
              <>
                <ResumenDeConfirmacion resumen={resumen} />
                <div className="flex flex-wrap gap-2">
                  <BotonAprobar texto={etiquetaBotonLote(seleccionadas)} />
                  <button type="button" onClick={() => setConfirmando(false)} className="btn-secondary">
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

      {/* FUERA del formulario de aprobar: los formularios no se anidan, y
          además son dos decisiones que no comparten nada. */}
      {corteAca ? (
        <PanelCorte
          fila={corteAca.fila}
          accion={corteAca.accion}
          ejecutar={ejecutarCorte}
          onCancelar={onCerrarCorte}
        />
      ) : null}
    </section>
  )
}

/** El atajo de una fila. No se renderiza si ese tipo no admite la acción. */
function AtajoCorte({
  fila, accion, onElegir,
}: {
  fila: FilaPendiente
  accion: AccionCorte
  onElegir: (fila: FilaPendiente, accion: AccionCorte) => void
}) {
  if (!admiteCorte(fila.tipo, accion)) return null
  return (
    <button
      type="button"
      onClick={() => onElegir(fila, accion)}
      className="text-red-700 underline"
    >
      {ETIQUETA_ACCION[accion].verbo}
    </button>
  )
}

/**
 * Rechazar o anular UNA fila, con su motivo.
 *
 * El texto que separa las dos salidas va ACÁ DENTRO y no en un tooltip: es
 * justo el momento en que alguien duda entre rechazar y anular. Y si el
 * tipo no guarda el motivo, lo dice antes de enviar — prometer un rastro
 * que no va a existir es peor que no ofrecer el campo.
 */
function PanelCorte({
  fila, accion, ejecutar, onCancelar,
}: {
  fila: FilaPendiente
  accion: AccionCorte
  ejecutar: (form: FormData) => void
  onCancelar: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const problema = validarMotivo(motivo, accion)
  const sinRastro = avisoMotivoSinRastro(fila.tipo, accion)
  const { verbo } = ETIQUETA_ACCION[accion]

  return (
    <form action={ejecutar} className="mt-4 space-y-3 rounded-md border-2 border-red-300 bg-red-50 px-4 py-3">
      <input type="hidden" name="pendienteId" value={fila.id} />
      <input type="hidden" name="accion" value={accion} />

      <p className="font-heading text-lg text-red-900">
        {verbo} {fila.codigo} — {ETIQUETA_TIPO_PENDIENTE[fila.tipo]} de {fila.quienLoCreo ?? 'alguien'}
      </p>

      <p className="text-sm text-red-900">{AYUDA_ACCION[accion]}</p>

      <label className="block text-sm">
        <span className="font-medium text-red-900">
          Motivo {accion === 'anular' ? 'de la anulación' : 'del rechazo'}
        </span>
        <textarea
          name="motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
          placeholder="Qué está mal, con suficiente detalle para que quien lo reciba entienda."
          className="mt-1 w-full rounded-md border border-red-300 px-3 py-2 text-sm"
        />
      </label>

      {sinRastro ? <p className="text-sm font-medium text-red-900">{sinRastro}</p> : null}
      {problema && motivo.length > 0 ? (
        <p className="text-sm font-medium text-red-900">{problema}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <BotonCortar accion={accion} codigo={fila.codigo} deshabilitado={!!problema} />
        <button type="button" onClick={onCancelar} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function BotonAprobar({ texto }: { texto: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Aprobando…' : `Sí, ${texto.toLowerCase()}`}
    </button>
  )
}

function BotonCortar({
  accion, codigo, deshabilitado,
}: {
  accion: AccionCorte
  codigo: string
  deshabilitado?: boolean
}) {
  const { pending } = useFormStatus()
  const { verbo } = ETIQUETA_ACCION[accion]
  return (
    <button
      type="submit" disabled={pending || deshabilitado}
      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? `${verbo}…` : `${verbo} ${codigo}`}
    </button>
  )
}

/** Los tipos que hay en esta sección, con cuántas filas tiene cada uno —
 * en el orden de la tabla, que es por antigüedad. */
function contarPorTipo(
  filas: readonly FilaPendiente[]
): { tipo: TipoPendiente; cantidad: number }[] {
  const mapa = new Map<TipoPendiente, number>()
  for (const f of filas) mapa.set(f.tipo, (mapa.get(f.tipo) ?? 0) + 1)
  return [...mapa.entries()].map(([tipo, cantidad]) => ({ tipo, cantidad }))
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
