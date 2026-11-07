'use client'

import { useRef, useState } from 'react'
import { Camera, CheckCircle2, CircleAlert, MapPin, PackageCheck, PackageX, RefreshCw, TriangleAlert, Truck, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { registrarEventoParadaAccion } from '@/app/acciones-mis-rutas'
import {
  AVISO_RETORNO_POR_ORIGINAR, ETIQUETA_ESTADO_PARADA, ETIQUETA_EVENTO, TEXTO_PILOTO_MIS_RUTAS, eventosPosibles, motivoNoSePuede,
  type EventoParada, type EstadoParadaMia, type ParadaMia, type RutaMia,
} from '@/domain/mis-rutas'
import { Aviso } from '../entradas/aviso'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'

const ROJO = 'border-red-200 bg-red-50 text-red-800'
const ESTADO_ESTILO: Record<EstadoParadaMia, { cls: string; I: typeof CheckCircle2 }> = {
  PENDIENTE: { cls: CHIP_NEUTRO, I: MapPin }, LLEGUE: { cls: CHIP_AVISO, I: MapPin }, ENTREGADO: { cls: CHIP_OK, I: PackageCheck }, NO_ENTREGADO: { cls: ROJO, I: PackageX }, RECHAZADO: { cls: ROJO, I: Undo2 },
}
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })

function Parada({ p, puedeMarcar }: { p: ParadaMia; puedeMarcar: boolean }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<EventoParada | null>(null)
  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState<{ texto: string; campos?: Record<string, string> } | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const formulario = useRef<HTMLFormElement>(null)
  const E = ESTADO_ESTILO[p.estado]
  const posibles = eventosPosibles(p.estado, puedeMarcar)

  async function enviar(evento: EventoParada, form?: HTMLFormElement | null) {
    setPendiente(true); setError(null); setExito(null)
    const datos = form ? new FormData(form) : new FormData()
    datos.set('paradaId', p.id); datos.set('evento', evento)
    try {
      const r = await registrarEventoParadaAccion(datos)
      if (r.ok) {
        setAbierto(null)
        setExito(evento === 'LLEGUE' ? 'Listo: avisamos que llegaste.' : evento === 'ENTREGADO' ? 'Entrega registrada con su foto.' : evento === 'INCIDENCIA' ? 'Incidencia anotada.' : `${ETIQUETA_EVENTO[evento]} registrado. ${r.retornoPorOriginar ? AVISO_RETORNO_POR_ORIGINAR : ''}`.trim())
        router.refresh()
      } else setError({ texto: r.mensaje, campos: r.errores })
    } catch { setError({ texto: 'No se pudo guardar. Revisa tu señal y vuelve a intentarlo.' }) }
    setPendiente(false)
  }
  const pulsar = (ev: EventoParada) => {
    const no = motivoNoSePuede(ev, p.estado, puedeMarcar)
    if (no) { setError({ texto: no }); return }
    setError(null); setExito(null)
    if (ev === 'LLEGUE') void enviar(ev); else setAbierto(abierto === ev ? null : ev)
  }
  const campoError = (k: string) => error?.campos?.[k]

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4" data-testid="mi-parada" data-estado={p.estado}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="tabular text-xs font-medium text-gray-600">Parada {p.secuencia}{p.pedidoNumero ? ` · ${p.pedidoNumero}` : ''}</p>
          <h3 className="font-medium text-gray-900">{p.cliente}</h3>
          <p className="text-sm text-gray-700">{[p.direccion, p.distrito].filter(Boolean).join(' · ') || 'Sin dirección'}</p>
          {p.ventanaCita && <p className="text-sm text-gray-600">Cita: {p.ventanaCita}</p>}
          <p className="tabular text-sm text-gray-600">{p.unidades.toLocaleString('es-PE')} unidades</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none ${E.cls}`} data-testid="mi-parada-estado"><E.I className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ESTADO_PARADA[p.estado]}</span>
      </div>

      {p.eventos.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-gray-700" data-testid="mi-parada-historial">
          {p.eventos.map((e) => (
            <li key={e.id}><span className="tabular">{hora(e.hora)}</span> · <strong>{ETIQUETA_EVENTO[e.evento]}</strong>{e.evento === 'ENTREGADO' ? ` · recibió ${e.recibioNombre} (DNI ${e.recibioDocumento})` : e.motivo ? ` · ${e.motivo}` : ''}</li>
          ))}
        </ul>
      )}

      {posibles.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={`Qué pasó en ${p.cliente}`}>
          {posibles.map((ev) => (
            <button key={ev} type="button" disabled={pendiente} onClick={() => pulsar(ev)} aria-pressed={abierto === ev}
              className={`${ev === 'ENTREGADO' ? 'btn-primary' : 'btn-secondary'} !min-h-14 text-base`} data-testid={`parada-${ev}`}>{pendiente && ev === 'LLEGUE' ? 'Guardando…' : ETIQUETA_EVENTO[ev]}</button>
          ))}
        </div>
      ) : !puedeMarcar ? <p className="mt-3 text-sm text-gray-600" data-testid="parada-aun-no">La ruta todavía no salió: aquí marcarás tus entregas cuando esté en ruta.</p> : null}

      {abierto && (
        <form ref={formulario} noValidate className="mt-3 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3" onSubmit={(e) => { e.preventDefault(); void enviar(abierto, formulario.current) }} data-testid={`form-${abierto}`}>
          {abierto === 'ENTREGADO' ? (
            <>
              <div>
                <label className="etiqueta" htmlFor={`rn-${p.id}`}>¿Quién recibió? (nombre)</label>
                <input id={`rn-${p.id}`} name="recibioNombre" className="campo" autoComplete="off" aria-invalid={!!campoError('recibioNombre')} data-testid="recibio-nombre" />
                {campoError('recibioNombre') && <p role="alert" className="mt-1 text-sm text-red-800">{campoError('recibioNombre')}</p>}
              </div>
              <div>
                <label className="etiqueta" htmlFor={`rd-${p.id}`}>DNI de quien recibió</label>
                <input id={`rd-${p.id}`} name="recibioDocumento" inputMode="numeric" maxLength={8} pattern="[0-9]{8}" className="campo tabular" autoComplete="off" aria-invalid={!!campoError('recibioDocumento')} data-testid="recibio-dni" />
                {campoError('recibioDocumento') && <p role="alert" className="mt-1 text-sm text-red-800">{campoError('recibioDocumento')}</p>}
              </div>
              <div>
                <label className="btn-secondary cursor-pointer" htmlFor={`rf-${p.id}`}><Camera className="h-5 w-5" aria-hidden />Tomar la foto de la entrega</label>
                <input id={`rf-${p.id}`} name="foto" type="file" accept="image/*" capture="environment" className="sr-only" data-testid="foto-entrega" />
                {campoError('foto') && <p role="alert" className="mt-1 text-sm text-red-800">{campoError('foto')}</p>}
              </div>
            </>
          ) : (
            <div>
              <label className="etiqueta" htmlFor={`mo-${p.id}`}>{abierto === 'INCIDENCIA' ? '¿Qué pasó?' : abierto === 'RECHAZADO' ? '¿Por qué lo rechazó el cliente?' : '¿Por qué no se entregó?'}</label>
              <textarea id={`mo-${p.id}`} name="motivo" rows={3} className="campo !min-h-24 py-2" aria-invalid={!!campoError('motivo')} data-testid="motivo-parada" />
              {campoError('motivo') && <p role="alert" className="mt-1 text-sm text-red-800">{campoError('motivo')}</p>}
              {(abierto === 'RECHAZADO' || abierto === 'NO_ENTREGADO') && <p className="mt-1 text-xs text-gray-700">{AVISO_RETORNO_POR_ORIGINAR}</p>}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary !min-h-12 flex-1" disabled={pendiente} data-testid="parada-confirmar">{pendiente ? 'Guardando…' : `Guardar: ${ETIQUETA_EVENTO[abierto]}`}</button>
            <button type="button" className="btn-secondary !min-h-12" onClick={() => { setAbierto(null); setError(null) }}>Cancelar</button>
          </div>
        </form>
      )}
      {error && <div className="mt-3"><Aviso tipo="error" testid="parada-error">{error.texto}</Aviso></div>}
      {exito && !error && <div className="mt-3"><Aviso tipo="ok" testid="parada-exito">{exito}</Aviso></div>}
    </li>
  )
}

/** «Mis rutas» en el celular (390 px): las rutas del día de quien conduce o ayuda, paradas en lista de una columna y botones grandes. Vacío, cargando, error y éxito. */
export function MisRutas({ rutas, error }: { rutas: RutaMia[]; error?: string | null }) {
  const router = useRouter()
  return (
    <div className="mx-auto max-w-xl space-y-4" data-testid="mis-rutas">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Mis rutas</h1>
        <p className="mt-1 text-gray-700">Las rutas de hoy en las que vas como conductor o auxiliar.</p>
      </header>
      <Aviso tipo="atencion" testid="mis-rutas-piloto"><p className="font-medium">PILOTO, no reemplaza el proceso actual</p><p>{TEXTO_PILOTO_MIS_RUTAS}</p></Aviso>

      {error ? (
        <Aviso tipo="error" testid="mis-rutas-error"><p className="font-medium">No pudimos traer tus rutas.</p><p>{error}</p>
          <button type="button" className="btn-secondary mt-2" onClick={() => router.refresh()} data-testid="mis-rutas-reintentar"><RefreshCw className="h-4 w-4" aria-hidden />Volver a intentar</button></Aviso>
      ) : rutas.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="mis-rutas-vacio">
          <Truck className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
          <p className="mt-3 font-medium text-gray-900">Hoy no tienes rutas</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">Cuando el Jefe de Transporte te asigne una ruta para hoy, aparecerá aquí. Si esperabas una, avísale.</p>
        </div>
      ) : (
        rutas.map((r) => (
          <section key={r.id} className="space-y-3" aria-labelledby={`h-${r.id}`} data-testid="mi-ruta">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 id={`h-${r.id}`} className="font-heading text-xl font-medium tracking-wide text-gray-900"><span className="tabular">{r.numero}</span></h2>
              <p className="text-sm text-gray-700">{[r.vehiculo && `Vehículo ${r.vehiculo}`, r.conductor && `Conductor ${r.conductor}`, r.auxiliar && `Auxiliar ${r.auxiliar}`].filter(Boolean).join(' · ')}</p>
              <p className="mt-1 text-sm font-medium text-gray-900" data-testid="mi-ruta-estado">{r.estado === 'EN_RUTA' ? 'En ruta' : r.estado === 'PENDIENTE_CIERRE' ? 'Todas las paradas tienen su resultado: el Jefe de Transporte cerrará la ruta' : r.estado === 'CERRADA' ? 'Ruta cerrada' : 'Liberada: todavía no sale'}</p>
              {r.paradas.length > 0 && <p className="tabular text-sm text-gray-600">{r.paradas.filter((p) => p.estado === 'ENTREGADO' || p.estado === 'NO_ENTREGADO' || p.estado === 'RECHAZADO').length} de {r.paradas.length} paradas con resultado</p>}
            </div>
            {r.paradas.length === 0 ? <p className="flex items-center gap-2 text-sm text-gray-700"><CircleAlert className="h-4 w-4" aria-hidden />Esta ruta no tiene paradas.</p>
              : <ul className="space-y-3">{r.paradas.map((p) => <Parada key={p.id} p={p} puedeMarcar={r.puedeMarcar} />)}</ul>}
          </section>
        ))
      )}
      <p className="flex items-start gap-2 text-xs text-gray-600"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Todo lo que marques queda con tu nombre, la hora y, en las entregas, la foto.</p>
    </div>
  )
}
