'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { FileText, Frown, Meh, MessageCircle, Smile, Truck } from 'lucide-react'
import { refrescarPorTokenAccion, refrescarSeguimientoAccion, responderEntregaAccion } from '@/app/seguimiento/acciones'
import {
  CARITAS, enlaceWhatsApp, esEstadoFinal, INTERVALO_SEGUIMIENTO_MS, mensajeDelEstado, TEXTO_CARITA_GRACIAS, TEXTO_CARITA_PREGUNTA, TEXTO_ERROR, TEXTO_PRUEBA, textoEspera, textoVanDeRuta,
  type RespuestaSeguimiento, type ValorCarita,
} from '@/domain/seguimiento'
import { EstadoDePagosCliente } from './estado-de-pagos'
import { LineaDeTiempo } from './linea-de-tiempo'

type Datos = Extract<RespuestaSeguimiento, { estado: 'OK' }>
/** De dónde se vuelve a pedir el estado: pedido + RUC (el acceso de siempre) o el enlace con token. */
export type OrigenSeguimiento = { tipo: 'consulta'; pedido: string; ruc: string } | { tipo: 'token'; token: string }

const horaCorta = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Lima' })
const ICONO_CARITA = { 3: Smile, 2: Meh, 1: Frown } as const

/**
 * La pantalla del cliente (0069), pensada primero para el celular: el mensaje grande, los 5 pasos, «Van X de Y», escribir al vendedor, la guía y la carita.
 * Se actualiza sola cada pocos segundos mientras la pestaña está visible (se pausa si está oculta) y se detiene en un estado final. Sin cookies ni dependencias nuevas.
 */
export function PantallaSeguimiento({ inicial, origen }: { inicial: Datos; origen: OrigenSeguimiento }) {
  const [d, setD] = useState<Datos>(inicial)
  const [actualizado, setActualizado] = useState(() => new Date().toISOString())
  const [aviso, setAviso] = useState<string | null>(null)
  const final = esEstadoFinal(d.hitos, d.tieneParada ?? true)
  const ocupado = useRef(false)

  const refrescar = useCallback(async () => {
    if (ocupado.current) return
    ocupado.current = true
    try {
      const r = origen.tipo === 'consulta' ? await refrescarSeguimientoAccion(origen.pedido, origen.ruc) : await refrescarPorTokenAccion(origen.token)
      if (r.estado === 'OK') { setD(r); setActualizado(new Date().toISOString()); setAviso(null) }
      else if (r.estado === 'ESPERA') setAviso(textoEspera(r.esperaSegundos))
      else setAviso(r.estado === 'ERROR' ? TEXTO_ERROR : null)
    } catch { setAviso(TEXTO_ERROR) } finally { ocupado.current = false }
  }, [origen])

  useEffect(() => {
    if (final) return
    const tick = () => { if (!document.hidden) void refrescar() }
    const id = window.setInterval(tick, INTERVALO_SEGUIMIENTO_MS)
    const alVolver = () => { if (!document.hidden) void refrescar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', alVolver) }
  }, [final, refrescar])

  const m = mensajeDelEstado(d.hitos, d.tieneParada ?? true)
  const entregado = m.clave === 'ENTREGADO'
  return (
    <div className="space-y-5" data-testid="pantalla-seguimiento" data-estado={m.clave}>
      {d.prueba && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-semibold uppercase tracking-wide text-amber-950" data-testid="seguimiento-prueba">{TEXTO_PRUEBA}</p>}

      <header>
        <h2 className="font-heading text-lg font-medium uppercase tracking-wide text-gray-700" data-testid="seguimiento-encabezado">Pedido <span className="tabular">{d.pedido}</span>{d.cliente ? <> · {d.cliente}</> : null}</h2>
      </header>

      <section aria-live="polite" className="rounded-lg border border-gray-200 bg-white p-5" data-testid="seguimiento-mensaje">
        <p className="font-heading text-3xl font-semibold leading-tight text-gray-900" data-testid="mensaje-titulo">{m.titulo}{entregado && <span aria-hidden> ✓</span>}</p>
        {m.detalle && <p className="mt-2 text-lg text-gray-700" data-testid="mensaje-detalle">{m.detalle}</p>}
        {m.hora && <p className="tabular mt-2 text-gray-700" data-testid="mensaje-hora">{horaCorta(m.hora)}</p>}
      </section>

      {m.clave !== 'CANCELADO' && m.clave !== 'REGISTRADO' && (
        <section aria-label="Línea de tiempo" className="rounded-lg border border-gray-200 bg-white p-5">
          <LineaDeTiempo hitos={d.hitos} tieneParada={d.tieneParada ?? true} />
        </section>
      )}

      {d.ruta && !final && (
        <p className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-gray-900" data-testid="seguimiento-ruta"><Truck className="h-5 w-5 shrink-0 text-gray-600" aria-hidden />{textoVanDeRuta(d.ruta)}</p>
      )}

      {entregado && <Carita d={d} origen={origen} onRespondida={(v) => setD({ ...d, respuesta: v })} />}

      {(d.contacto || d.guia) && (
        <div className="flex flex-col gap-3 sm:flex-row" data-testid="seguimiento-acciones">
          {d.contacto && <a href={enlaceWhatsApp(d.contacto, d.pedido)} target="_blank" rel="noopener noreferrer" className="btn-primary" data-testid="boton-escribir"><MessageCircle className="h-5 w-5" aria-hidden />Escribir a mi vendedor</a>}
          {d.guia && <a href={d.guia.enlace} target="_blank" rel="noopener noreferrer" className="btn-secondary" data-testid="boton-guia"><FileText className="h-5 w-5" aria-hidden />Ver guía de remisión</a>}
        </div>
      )}

      {d.deuda && <EstadoDePagosCliente deuda={d.deuda} />}

      {aviso && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="seguimiento-aviso">{aviso}</p>}
      <p className="text-center text-sm text-gray-600" data-testid="seguimiento-actualizado">{final ? 'Última actualización' : 'Se actualiza sola'} · <span className="tabular">{horaCorta(actualizado)}</span></p>
    </div>
  )
}

/** «¿Cómo fue tu entrega?»: tres caritas con texto, un toque, una sola respuesta. Solo con pedido + RUC (la respuesta se valida con ellos). */
function Carita({ d, origen, onRespondida }: { d: Datos; origen: OrigenSeguimiento; onRespondida: (v: ValorCarita) => void }) {
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  if (d.respuesta) return <p className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-950" role="status" data-testid="carita-gracias">{TEXTO_CARITA_GRACIAS}</p>
  if (origen.tipo !== 'consulta') return null
  const enviar = (v: ValorCarita) => empezar(async () => {
    setError(null)
    const r = await responderEntregaAccion(origen.pedido, origen.ruc, v)
    if (r.estado === 'OK' || r.estado === 'YA_RESPONDIDA') onRespondida(v)
    else setError('No pudimos guardar tu respuesta. Intenta de nuevo en un momento.')
  })
  return (
    <section aria-labelledby="h-carita" className="rounded-lg border border-gray-200 bg-white p-5" data-testid="carita">
      <h3 id="h-carita" className="text-lg font-medium text-gray-900">{TEXTO_CARITA_PREGUNTA}</h3>
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={TEXTO_CARITA_PREGUNTA}>
        {CARITAS.map((c) => {
          const Icono = ICONO_CARITA[c.valor]
          return (
            <button key={c.valor} type="button" disabled={pendiente} onClick={() => enviar(c.valor)} data-testid={`carita-${c.valor}`}
              className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60 disabled:opacity-60">
              <Icono className="h-7 w-7" aria-hidden />{c.etiqueta}
            </button>
          )
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-800" data-testid="carita-error">{error}</p>}
    </section>
  )
}
