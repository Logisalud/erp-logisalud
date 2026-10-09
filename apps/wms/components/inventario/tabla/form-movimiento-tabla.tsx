'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CloudOff, RotateCcw, Send, TriangleAlert, X } from 'lucide-react'
import { ejecutarMovimientoAccion } from '@/app/acciones-inventario'
import { textoBarra, textoResumenLargo } from '@/domain/movimiento-tabla'
import { formatoFecha } from '@/domain/fechas'
import { PILDORA_ACTIVA_FUERTE, PILDORA_INACTIVA_HOVER } from '../../estilos-opcion'
import { Aviso } from '../../entradas/aviso'
import { BuscarDestino, DestinoActual } from '../mover/destino'
import { ChipPropietario } from '../mover/piezas'
import { LineasMovil } from './lineas-movil'
import { TablaLineas } from './tabla-lineas'
import { MOTIVOS_RAPIDOS } from './tipos'
import { useBorrador, useEnLinea } from './usar-borrador'
import { useMovimientoTabla } from './usar-movimiento-tabla'
import type { usarMovimientoTablaTipo } from './tabla-tipos'

/** true desde `md` (≥768 px): tabla. Antes de saberlo no se pinta nada, para no pedir las búsquedas dos veces. */
function useEsAncho(): boolean | null {
  const [ancho, setAncho] = useState<boolean | null>(null)
  useEffect(() => {
    const q = window.matchMedia('(min-width: 768px)')
    const f = () => setAncho(q.matches)
    f(); q.addEventListener('change', f)
    return () => q.removeEventListener('change', f)
  }, [])
  return ancho
}

type Paso = 'editar' | 'revisar'

/** Crear un movimiento en modo tabla: una fila por producto, cada una con su origen y destino. Ejecutar → otra persona verifica. */
export function FormMovimientoTabla({ usuarioId }: { usuarioId: string }) {
  const router = useRouter()
  const m = useMovimientoTabla() as usarMovimientoTablaTipo
  const b = useBorrador(usuarioId)
  const enLinea = useEnLinea()
  const ancho = useEsAncho()
  const [paso, setPaso] = useState<Paso>('editar')
  const [editando, setEditando] = useState<number | null>(null)
  const [cambiandoDefecto, setCambiandoDefecto] = useState(false)
  const [otro, setOtro] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<{ texto: string; sinRespuesta: boolean } | null>(null)
  const [hecho, setHecho] = useState(false)

  useEffect(() => { if (!m.motivo && !otro) m.setMotivo(MOTIVOS_RAPIDOS[0]) }, [m, otro])

  // El borrador se guarda solo, sin esperar al servidor; no se toca mientras se decide qué hacer con uno recuperado.
  const { guardar, listo, recuperado } = b
  const borrador = m.aBorrador
  useEffect(() => { if (listo && !recuperado && !hecho) guardar(borrador()) }, [listo, recuperado, hecho, guardar, borrador])

  const usarRecuperado = useCallback(async () => {
    if (!b.recuperado) return
    await m.recuperar(b.recuperado)
    setOtro(!MOTIVOS_RAPIDOS.slice(0, -1).includes(b.recuperado.motivo) && !!b.recuperado.motivo)
    b.soltarRecuperado()
  }, [b, m])

  const motivoOk = m.motivo.trim().length > 0
  const puedeRevisar = m.resumen.puedeRevisar && motivoOk && !enviando
  const conOrigen = m.lineas.filter((l) => l.celda)

  async function ejecutar() {
    setEnviando(true); setError(null)
    try {
      const r = await ejecutarMovimientoAccion(m.lineasParaEjecutar(), m.motivo.trim(), m.token)
      if (!r.ok) { setError({ texto: r.mensaje, sinRespuesta: false }); return }
      // Solo ahora, con la confirmación del servidor, el movimiento cuenta como ejecutado y el borrador se borra.
      setHecho(true)
      b.descartar()
      router.push(`/movimientos/${r.id}`)
    } catch {
      setError({ texto: 'No pudimos confirmar con el servidor si el movimiento se registró. No se perdió nada: tu borrador sigue aquí. Vuelve a intentarlo; no se duplicará.', sinRespuesta: true })
    } finally { setEnviando(false) }
  }

  if (paso === 'revisar') return <Revision m={m} enviando={enviando} error={error} enLinea={enLinea} volver={() => { setPaso('editar'); setError(null) }} ejecutar={ejecutar} />

  return (
    <div className="min-w-0 max-w-full space-y-4" data-testid="form-tabla">
      {b.recuperado && (
        <Aviso tipo="info" testid="borrador-recuperado">
          <span className="block font-medium">Encontramos un movimiento a medias.</span>
          <span className="block">Lo dejaste con {b.recuperado.lineas.length} {b.recuperado.lineas.length === 1 ? 'línea' : 'líneas'}. Puedes seguir donde lo dejaste.</span>
          <span className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" onClick={() => void usarRecuperado()} data-testid="borrador-seguir"><RotateCcw className="h-4 w-4" aria-hidden />Seguir con ese borrador</button>
            <button type="button" className="btn-secondary btn-sm" onClick={b.descartar} data-testid="borrador-descartar">Empezar de cero</button>
          </span>
        </Aviso>
      )}
      {!enLinea && <Aviso tipo="atencion" testid="sin-conexion"><span className="flex items-center gap-1.5 font-medium"><CloudOff className="h-4 w-4" aria-hidden />Sin conexión.</span>Tu borrador se guarda en este dispositivo. Para ejecutar necesitas volver a tener conexión.</Aviso>}

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 md:p-5" aria-label="Datos del movimiento">
        <div>
          <p className="etiqueta">Destino por defecto <span className="font-normal text-gray-700">(opcional)</span></p>
          {m.destinoDefecto && !cambiandoDefecto ? (
            <DestinoActual d={m.destinoDefecto} testid="destino-defecto" onCambiar={() => setCambiandoDefecto(true)} />
          ) : (
            <BuscarDestino id="q-destino-defecto" etiqueta="Buscar ubicación" lineas={conOrigen.map((l) => m.comoChequeo(l))} testid="defecto-buscar" ayuda="Se aplica a las líneas que aún no tienen destino."
              alElegir={(d) => { void m.fijarDestinoDefecto(d); setCambiandoDefecto(false) }} />
          )}
          {m.destinoDefecto && <p className="mt-1.5 text-sm text-gray-700" data-testid="nota-defecto" aria-live="polite">{m.notaDefecto}</p>}
          {m.destinoDefecto && <button type="button" onClick={m.quitarDestinoDefecto} className="mt-1 inline-flex min-h-10 items-center gap-1 text-sm text-gray-800 underline underline-offset-2" data-testid="defecto-quitar"><X className="h-4 w-4" aria-hidden />Quitar el destino por defecto</button>}
        </div>
        <div>
          <p className="etiqueta" id="et-motivo">Motivo</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="et-motivo">
            {MOTIVOS_RAPIDOS.map((t) => {
              const activo = t === 'Otro' ? otro : !otro && m.motivo === t
              return (
                <button key={t} type="button" aria-pressed={activo} data-testid="motivo-rapido"
                  onClick={() => { if (t === 'Otro') { setOtro(true); m.setMotivo('') } else { setOtro(false); m.setMotivo(t) } }}
                  className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm ${activo ? PILDORA_ACTIVA_FUERTE : PILDORA_INACTIVA_HOVER}`}>{t}</button>
              )
            })}
          </div>
          {otro && <input className="campo mt-2" aria-label="Motivo del movimiento" placeholder="¿Por qué se mueve?" value={m.motivo} onChange={(e) => m.setMotivo(e.target.value)} autoComplete="off" data-testid="motivo-otro" />}
        </div>
      </section>

      {ancho === true && <TablaLineas m={m} />}
      {ancho === false && <LineasMovil m={m} editando={editando} alEditar={setEditando} />}

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t border-gray-200 bg-white px-4 py-3 md:bottom-0 md:mx-0 md:rounded-xl md:border" data-testid="barra-inferior">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            <p className="tabular text-sm font-medium text-gray-900" data-testid="barra-resumen" aria-live="polite">{textoBarra(m.resumen)}</p>
            {!puedeRevisar && <p className="text-xs text-gray-700" data-testid="barra-falta">{!m.resumen.puedeRevisar ? (m.resumen.total === 0 ? 'Añade un producto.' : `Faltan ${m.resumen.pendientes} por completar.`) : 'Indica el motivo.'}</p>}
          </div>
          <button type="button" className="btn-primary w-full sm:w-auto" disabled={!puedeRevisar} onClick={() => setPaso('revisar')} data-testid="revisar-ejecutar"><Send className="h-5 w-5" aria-hidden />Revisar y ejecutar</button>
        </div>
      </div>
    </div>
  )
}

function Revision({ m, enviando, error, enLinea, volver, ejecutar }: { m: usarMovimientoTablaTipo; enviando: boolean; error: { texto: string; sinRespuesta: boolean } | null; enLinea: boolean; volver: () => void; ejecutar: () => void }) {
  const listas = m.calculadas.filter((c) => c.lista)
  return (
    <div className="space-y-4" data-testid="revision-previa">
      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <h2 className="font-heading text-xl font-medium tracking-wide text-gray-900">Revisa antes de ejecutar</h2>
        <p className="text-base text-gray-900" data-testid="resumen-largo">{textoResumenLargo(m.resumen, m.motivo.trim())}</p>
        <p className="text-sm text-gray-700">Al ejecutar, las unidades quedan reservadas y en tránsito hasta que otra persona verifique cada línea. Tú no puedes verificarlas.</p>
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200" data-testid="resumen-lineas">
          {listas.map((c) => (
            <li key={c.linea.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="resumen-linea">
              <span className="min-w-0">
                <strong className="block text-[15px] text-gray-900"><span className="tabular">{c.cantidadNum} u</span> · {c.linea.producto?.descripcion}</strong>
                <span className="tabular block text-sm text-gray-700">Lote {c.linea.celda?.lote} · vence {formatoFecha(c.linea.celda!.vence)} · <ChipPropietario codigo={c.linea.celda!.propietario} /></span>
              </span>
              <span className="tabular flex items-center gap-1.5 text-sm font-medium text-gray-900">{c.linea.celda?.posicion}<ArrowRight className="h-4 w-4 text-gray-500" aria-hidden />{c.linea.destino?.codigo}</span>
            </li>
          ))}
        </ul>
      </section>
      {error && <Aviso tipo="error" testid="error-ejecutar"><span className="flex items-start gap-1.5"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error.texto}</span></Aviso>}
      {!enLinea && <Aviso tipo="atencion" testid="sin-conexion"><span className="flex items-center gap-1.5 font-medium"><CloudOff className="h-4 w-4" aria-hidden />Sin conexión.</span>Para ejecutar necesitas volver a tener conexión. Tu borrador está guardado.</Aviso>}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 flex flex-col-reverse gap-2 border-t border-gray-200 bg-white px-4 py-3 sm:flex-row sm:justify-between md:bottom-0 md:mx-0 md:rounded-xl md:border">
        <button type="button" className="btn-secondary w-full sm:w-auto" onClick={volver} disabled={enviando} data-testid="volver-editar"><ArrowLeft className="h-5 w-5" aria-hidden />Volver a editar</button>
        <button type="button" className="btn-primary w-full sm:w-auto" onClick={ejecutar} disabled={enviando || !enLinea} data-testid="ejecutar-movimiento"><Send className="h-5 w-5" aria-hidden />{enviando ? 'Ejecutando…' : error?.sinRespuesta ? 'Reintentar' : 'Ejecutar movimiento'}</button>
      </div>
    </div>
  )
}
