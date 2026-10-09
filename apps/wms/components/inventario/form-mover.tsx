'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Send } from 'lucide-react'
import { ejecutarMovimientoAccion, validarLineasAccion } from '@/app/acciones-inventario'
import type { CeldaDeProducto, LineaParaChequear, ValidacionLineaMov } from '@/domain/inventario'
import { PILDORA_ACTIVA, PILDORA_INACTIVA_HOVER } from '../estilos-opcion'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { AgregarLineas } from './mover/agregar-lineas'
import { BuscarDestino, DestinoActual, type DestinoElegido } from './mover/destino'
import { BuscarOrigen, OrigenActual, type OrigenElegido } from './mover/origen'
import { errorDeCantidad, ListaLineas, type LineaCarrito } from './mover/lista-lineas'
import type { CeldaElegida } from './mover/panel-celdas'
import { nLineas, nUnidades } from './mover/piezas'

const MOTIVOS = ['Acomodo', 'Acercar al despacho', 'Liberar la ubicación', 'Reubicar por espacio']

/**
 * Mover: UNA operación con las líneas que haga falta, cada una con su propio producto, origen y destino (como en Odoo). Quien la registra
 * es quien mueve la mercadería (el «ejecutor»); otra persona la verifica. No hay autorización previa en el sistema.
 * Las líneas se agregan buscando el PRODUCTO (y viendo dónde está) o partiendo de una UBICACIÓN (y viendo qué hay). El origen y el destino
 * de la cabecera son opcionales: agilizan el caso común y cualquier línea puede cambiarse. Cada línea se valida contra SU destino antes de enviar.
 */
export function FormMover() {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [lineas, setLineas] = useState<LineaCarrito[]>([])
  const [destino, setDestino] = useState<DestinoElegido | null>(null)
  const [origenDefecto, setOrigenDefecto] = useState<OrigenElegido | null>(null)
  const [cambiandoOrigen, setCambiandoOrigen] = useState(false)
  const [cambiandoDestino, setCambiandoDestino] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [avisoAgregado, setAvisoAgregado] = useState('')
  const [validacion, setValidacion] = useState<Map<string, ValidacionLineaMov>>(new Map())
  const [validando, setValidando] = useState(false)
  const ultima = useRef(0)
  // El aviso de «agregamos…» es solo un acuse: se va solo para no quedar suelto entre secciones.
  useEffect(() => {
    if (!avisoAgregado) return
    const t = setTimeout(() => setAvisoAgregado(''), 4000)
    return () => clearTimeout(t)
  }, [avisoAgregado])

  const enMovimiento = useMemo(() => new Set(lineas.map((l) => l.celda.clave)), [lineas])
  const efectivo = (l: LineaCarrito) => l.destino ?? destino
  const paraChequear = useMemo<LineaParaChequear[]>(
    () => lineas.map((l) => ({ clave: l.celda.clave, posicionId: l.celda.posicionId, propietarioId: l.celda.propietarioId, propietario: l.celda.propietario, estado: l.celda.estado, haciaPosicionId: (l.destino ?? destino)?.posicionId })),
    [lineas, destino],
  )
  // Cada cambio de líneas o de destino vuelve a validar todo; se descartan las respuestas viejas.
  const firma = JSON.stringify(paraChequear)
  useEffect(() => {
    if (paraChequear.length === 0) { setValidacion(new Map()); setValidando(false); return }
    const id = ++ultima.current
    setValidando(true)
    void validarLineasAccion(paraChequear).then((r) => {
      if (id !== ultima.current) return
      setValidacion(new Map(r.map((x) => [x.clave, x])))
    }).catch(() => undefined).finally(() => { if (id === ultima.current) setValidando(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma])

  function agregar(elegidas: CeldaElegida[]) {
    setLineas((actuales) => {
      const ya = new Set(actuales.map((l) => l.celda.clave))
      return [...actuales, ...elegidas.filter((e) => !ya.has(e.celda.clave)).map((e): LineaCarrito => ({ celda: e.celda, cantidad: String(e.cantidad) }))]
    })
    setAvisoAgregado(`Agregamos ${nLineas(elegidas.length)} al movimiento.`)
  }
  const cambiar = (clave: string, c: Partial<Pick<LineaCarrito, 'cantidad' | 'destino'>>) => setLineas((ls) => ls.map((l) => (l.celda.clave === clave ? { ...l, ...c } : l)))
  const cambiarOrigen = (claveVieja: string, nueva: CeldaDeProducto) => setLineas((ls) => ls.map((l) => (l.celda.clave === claveVieja ? { ...l, celda: nueva, cantidad: String(Math.min(Number(l.cantidad) || nueva.disponible, nueva.disponible)) } : l)))
  const quitar = (clave: string) => { setLineas((ls) => ls.filter((l) => l.celda.clave !== clave)); setAvisoAgregado('Quitamos la línea.') }

  const total = lineas.reduce((n, l) => n + (Number(l.cantidad) || 0), 0)
  const sinDestino = lineas.filter((l) => !efectivo(l)).length
  const malas = lineas.filter((l) => { const v = validacion.get(l.celda.clave); return efectivo(l) && v && !v.ok }).length
  const motivoFinal = motivo.trim()
  const falta =
    lineas.length === 0 ? 'Agrega al menos una línea.'
    : lineas.some((l) => errorDeCantidad(l)) ? 'Corrige las cantidades.'
    : sinDestino > 0 ? (destino ? 'Hay líneas sin destino.' : 'Elige el destino por defecto (o uno por línea).')
    : validando || validacion.size !== lineas.length ? 'Validando…'
    : malas > 0 ? `${malas === 1 ? 'Una línea no sirve' : `${malas} líneas no sirven`} para su destino.`
    : !motivoFinal ? 'Elige o escribe el motivo.' : ''

  const heredan = lineas.filter((l) => !l.destino)
  const minimasDestino = heredan.map((l) => ({ clave: l.celda.clave, posicionId: l.celda.posicionId, propietarioId: l.celda.propietarioId, propietario: l.celda.propietario, estado: l.celda.estado }))
  const heredanMalas = heredan.filter((l) => { const v = validacion.get(l.celda.clave); return v && !v.ok }).length

  function preparar() {
    ejecutar(() => ejecutarMovimientoAccion(lineas.map((l) => ({
      desdePosicionId: l.celda.posicionId, haciaPosicionId: efectivo(l)!.posicionId, loteId: l.celda.loteId, estado: l.celda.estado, procedenciaId: l.celda.procedenciaId, cantidad: Number(l.cantidad),
    })), motivoFinal), { exito: 'Movimiento registrado: ahora lo verifica otra persona.', refrescar: false, alExito: (r) => router.push(`/movimientos/${r.id}`) })
  }

  return (
    <div className="space-y-8 pb-48 md:pb-28" data-testid="form-mover">
      {/* 1 · Origen y destino por defecto (opcionales) */}
      <section aria-labelledby="h-defecto" className="space-y-3">
        <h2 id="h-defecto" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Origen y destino por defecto</h2>
        <p className="text-sm text-gray-700">Opcional. Si casi todo sale de un mismo lugar o va a un mismo lugar, elígelo aquí para ahorrar pasos. Cada línea puede cambiarse.</p>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2" data-testid="mover-defecto-origen">
            <h3 className="text-sm font-medium text-gray-900">De dónde sale</h3>
            {origenDefecto && !cambiandoOrigen
              ? <OrigenActual o={origenDefecto} onCambiar={() => setCambiandoOrigen(true)} onQuitar={() => setOrigenDefecto(null)} testid="mover-origen-defecto" />
              : <>
                  <BuscarOrigen id="q-origen-defecto" etiqueta="Ubicación de origen" ayuda="Código, producto o lote. Déjalo vacío si cada línea sale de un lugar distinto." testid="mover-buscar-origen-defecto" alElegir={(o) => { setOrigenDefecto(o); setCambiandoOrigen(false) }} />
                  {cambiandoOrigen && <button type="button" className="btn-secondary btn-sm" onClick={() => setCambiandoOrigen(false)}>Cancelar</button>}
                </>}
          </div>
          <div className="space-y-2" data-testid="mover-defecto-destino">
            <h3 className="text-sm font-medium text-gray-900">A dónde va</h3>
            {destino && !cambiandoDestino ? (
              <div className="space-y-2">
                <DestinoActual d={destino} onCambiar={() => setCambiandoDestino(true)} testid="mover-destino-elegido" />
                {heredan.length > 0 && (heredanMalas === 0
                  ? <Aviso tipo="ok" testid="mover-destino-ok">{destino.codigo} recibe {heredan.length === 1 ? 'la línea' : `las ${heredan.length} líneas`} que no tienen destino propio.</Aviso>
                  : <Aviso tipo="atencion" testid="mover-destino-problemas">{destino.codigo} no recibe {heredanMalas === 1 ? 'una línea' : `${heredanMalas} líneas`}: mira el motivo en cada una. Puedes quitarla o darle otro destino.</Aviso>)}
              </div>
            ) : (
              <div className="space-y-2">
                <BuscarDestino id="q-destino" etiqueta="Ubicación de destino" ayuda="Te avisamos al instante si no sirve para lo que ya agregaste (propietario, área y estado)." lineas={minimasDestino} testid="mover-buscar-destino"
                  alElegir={(d) => { setDestino(d); setCambiandoDestino(false) }} />
                {cambiandoDestino && <button type="button" className="btn-secondary btn-sm" onClick={() => setCambiandoDestino(false)}>Cancelar</button>}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2 · Agregar líneas */}
      <section aria-labelledby="h-agregar" className="space-y-3">
        <h2 id="h-agregar" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">¿Qué se mueve?</h2>
        <p className="text-sm text-gray-700">Cada línea es un producto con su propio origen, destino y cantidad.</p>
        <AgregarLineas enMovimiento={enMovimiento} alAgregar={agregar} origenDefecto={origenDefecto} />
        <p aria-live="polite" className="min-h-5 text-sm font-medium text-green-800" data-testid="mover-agregado">{avisoAgregado}</p>
      </section>

      {/* 3 · Las líneas */}
      <section aria-labelledby="h-lineas" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="h-lineas" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Líneas del movimiento</h2>
          <p className="tabular text-sm text-gray-700" data-testid="mover-totales">{lineas.length === 0 ? 'Todavía no hay líneas' : `${nLineas(lineas.length)} · ${nUnidades(total)}`}</p>
        </div>
        {lineas.length === 0
          ? <p className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-700" data-testid="mover-lista-vacia"><ClipboardList className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />Las líneas que agregues aparecerán aquí, con su cantidad y su destino.</p>
          : <ListaLineas lineas={lineas} destinoDefecto={destino} validacion={validacion} validando={validando} alCambiar={cambiar} alQuitar={quitar} alCambiarOrigen={cambiarOrigen} />}
      </section>

      {/* 4 · Motivo */}
      {lineas.length > 0 && (
        <section aria-labelledby="h-motivo" className="space-y-3">
          <h2 id="h-motivo" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">¿Por qué se mueve?</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Motivos frecuentes">
            {MOTIVOS.map((m) => <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)} className={`min-h-11 rounded-full border px-4 text-sm font-medium ${motivo === m ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`} data-testid="mover-motivo-rapido">{m}</button>)}
          </div>
          <div><label htmlFor="mover-motivo" className="etiqueta">O escríbelo</label><input id="mover-motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" data-testid="mover-motivo" /></div>
        </section>
      )}

      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}

      {/* Acción principal, siempre a la vista (sobre la barra de navegación en el teléfono) */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-16 xl:left-60" data-testid="mover-barra">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2">
          <p className="tabular min-w-0 flex-1 text-sm text-gray-800" aria-live="polite" data-testid="mover-resumen">
            {lineas.length > 0 ? <><strong>{nLineas(lineas.length)} · {nUnidades(total)}</strong>{destino ? ` · hacia ${destino.codigo}` : ''}</> : 'Nada agregado todavía.'}
            {falta && <span className="block text-xs text-gray-600" data-testid="mover-falta">{falta}</span>}
          </p>
          <button type="button" className="btn-primary w-full sm:w-auto" disabled={pendiente || !!falta} onClick={preparar} data-testid="mover-registrar"><Send className="h-5 w-5" aria-hidden />{pendiente ? 'Registrando…' : 'Registrar el movimiento'}</button>
        </div>
      </div>
    </div>
  )
}
