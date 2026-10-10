'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { rehidratarBorradorAccion, ubicacionesProductoAccion, validarLineasAccion } from '@/app/acciones-inventario'
import type { CeldaDeProducto, LineaEjecutar, LineaParaChequear, ResultadoProducto, ValidacionLineaMov } from '@/domain/inventario'
import {
  disponibleReal, evaluarLinea, nuevoBorrador, repartirDestinoDefecto, resumenBarra,
  type BorradorMovimiento, type LineaResuelta, type MensajeLinea, type ResumenBarra,
} from '@/domain/movimiento-tabla'
import { lineaVacia, type DestinoLinea, type LineaForm } from './tipos'

export interface LineaCalculada {
  linea: LineaForm
  /** Número de la fila (1, 2, 3…). */
  num: number
  disponible: number
  mensaje: MensajeLinea | null
  lista: boolean
  cantidadNum: number
}

const comoChequeo = (l: LineaForm, clave: string, haciaPosicionId?: string): LineaParaChequear => ({
  clave, posicionId: l.celda!.posicionId, propietarioId: l.celda!.propietarioId, propietario: l.celda!.propietario, estado: l.celda!.estado, haciaPosicionId,
})

/** Todo el estado y las reglas del movimiento en modo tabla. Lo comparten la tabla (PC/tablet) y las filas con hoja inferior (teléfono). */
export function useMovimientoTabla() {
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia(1)])
  const siguiente = useRef(2)
  const [destinoDefecto, setDestinoDefecto] = useState<DestinoLinea | null>(null)
  const [notaDefecto, setNotaDefecto] = useState('Se aplica a las líneas sin destino. Puedes cambiar cualquier línea.')
  const [motivo, setMotivo] = useState('')
  const token = useRef<string>('')
  if (!token.current) token.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const [validacion, setValidacion] = useState<Map<number, ValidacionLineaMov>>(new Map())
  const ultima = useRef(0)

  // ── Validación de cada línea contra SU destino (propietario, área y estado), con descarte de respuestas viejas ─────
  const paraValidar = useMemo(() => lineas.filter((l) => l.celda && l.destino).map((l) => comoChequeo(l, String(l.id), l.destino!.posicionId)), [lineas])
  const firma = JSON.stringify(paraValidar)
  useEffect(() => {
    if (paraValidar.length === 0) { setValidacion(new Map()); return }
    const id = ++ultima.current
    void validarLineasAccion(paraValidar).then((r) => {
      if (id === ultima.current) setValidacion(new Map(r.map((x) => [Number(x.clave), x])))
    }).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma])

  // ── Lo que dice cada línea ─────────────────────────────────────────────────────────────────────────────────────
  const calculadas = useMemo<LineaCalculada[]>(() => lineas.map((l, i) => {
    const simples = lineas.map((x) => ({ id: x.id, celdaClave: x.celda?.clave, cantidad: x.cantidad }))
    const disponible = l.celda ? disponibleReal(l.celda.disponible, l.celda.clave, simples, l.id) : 0
    const v = validacion.get(l.id)
    const sinRespuesta = !!l.celda && !!l.destino && !v
    let mensaje = evaluarLinea({ tieneProducto: !!l.producto, origen: l.celda?.posicion, disponible, destino: l.destino?.codigo, razonDestino: v && !v.ok ? (v.mensaje ?? 'no sirve') : null, cantidad: l.cantidad })
    if (!mensaje && sinRespuesta) mensaje = { tipo: 'falta', texto: 'Validando el destino…' }
    return { linea: l, num: i + 1, disponible, mensaje, lista: !mensaje, cantidadNum: Number.parseInt(l.cantidad, 10) || 0 }
  }), [lineas, validacion])

  const resumen: ResumenBarra = useMemo(() => resumenBarra(calculadas.map((c): LineaResuelta => ({
    id: c.linea.id, lista: c.lista, cantidad: c.cantidadNum, destino: c.linea.destino?.codigo, producto: c.linea.producto?.descripcion ?? '',
    lote: c.linea.celda?.lote ?? '', propietario: c.linea.celda?.propietario ?? '', origen: c.linea.celda?.posicion ?? '',
  }))), [calculadas])

  // ── Cambios ────────────────────────────────────────────────────────────────────────────────────────────────────
  const actualizar = useCallback((id: number, patch: Partial<LineaForm>) => setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l))), [])
  const alternar = useCallback((id: number, cual: NonNullable<LineaForm['abierto']>) => setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, abierto: l.abierto === cual ? null : cual } : l))), [])
  const agregar = useCallback((): number => {
    const id = siguiente.current++
    setLineas((ls) => [...ls.map((l) => ({ ...l, abierto: null })), lineaVacia(id)])
    return id
  }, [])
  const quitar = useCallback((id: number) => setLineas((ls) => ls.filter((l) => l.id !== id)), [])

  const elegirProducto = useCallback(async (id: number, p: ResultadoProducto) => {
    const celdas = await ubicacionesProductoAccion(p.productoId)
    actualizar(id, { producto: { id: p.productoId, codigo: p.codigo, descripcion: p.descripcion, presentacion: p.presentacion }, celdas, celda: undefined, destino: undefined, cantidad: '', consulta: '', abierto: 'origen' })
  }, [actualizar])

  const elegirOrigen = useCallback(async (id: number, celda: CeldaDeProducto) => {
    const actual = lineas.find((l) => l.id === id)
    const otras = lineas.filter((l) => l.id !== id && l.celda?.clave === celda.clave).reduce((n, l) => n + (Number.parseInt(l.cantidad, 10) || 0), 0)
    const libre = Math.max(celda.disponible - otras, 0)
    // El destino que ya tenía la línea, o el de la cabecera, solo se conserva si SIRVE para el nuevo origen.
    const candidatos = [actual?.destino, destinoDefecto].filter((d): d is DestinoLinea => !!d)
    let elegido: DestinoLinea | undefined
    if (candidatos.length) {
      const base = { ...(actual ?? lineaVacia(id)), celda }
      const r = await validarLineasAccion(candidatos.map((d, i) => comoChequeo(base, String(i), d.posicionId)))
      elegido = candidatos.find((_, i) => r.find((x) => x.clave === String(i))?.ok)
    }
    actualizar(id, { celda, destino: elegido, cantidad: actual?.cantidad || String(libre), abierto: elegido ? null : 'destino' })
  }, [lineas, destinoDefecto, actualizar])

  const elegirDestino = useCallback((id: number, d: DestinoLinea) => actualizar(id, { destino: d, abierto: null }), [actualizar])
  const usarTodo = useCallback((id: number) => {
    const c = calculadas.find((x) => x.linea.id === id)
    if (c) actualizar(id, { cantidad: String(Math.max(c.disponible, 0)) })
  }, [calculadas, actualizar])

  /** Destino por defecto de la cabecera: se aplica a las líneas sin destino; las que no pueden ir ahí quedan sin destino y se avisa cuántas. */
  const fijarDestinoDefecto = useCallback(async (d: DestinoLinea) => {
    const candidatas = lineas.filter((l) => l.celda && !l.destino)
    const r = candidatas.length ? await validarLineasAccion(candidatas.map((l) => comoChequeo(l, String(l.id), d.posicionId))) : []
    const reparto = repartirDestinoDefecto(lineas.map((l) => ({ id: l.id, tieneOrigen: !!l.celda, tieneDestino: !!l.destino })), (id) => !!r.find((x) => x.clave === String(id))?.ok, d.codigo)
    setDestinoDefecto(d)
    setNotaDefecto(reparto.nota)
    setLineas((ls) => ls.map((l) => (reparto.asignar.includes(l.id) ? { ...l, destino: d, abierto: l.abierto === 'destino' ? null : l.abierto } : l)))
  }, [lineas])
  const quitarDestinoDefecto = useCallback(() => { setDestinoDefecto(null); setNotaDefecto('Se aplica a las líneas sin destino. Puedes cambiar cualquier línea.') }, [])

  // ── Borrador ──────────────────────────────────────────────────────────────────────────────────────────────────
  const aBorrador = useCallback((): BorradorMovimiento => ({
    ...nuevoBorrador(token.current), motivo, destinoDefectoId: destinoDefecto?.posicionId, siguienteId: siguiente.current,
    lineas: lineas.map((l) => ({ id: l.id, productoId: l.producto?.id, celdaClave: l.celda?.clave, destinoId: l.destino?.posicionId, cantidad: l.cantidad })),
  }), [lineas, motivo, destinoDefecto])

  const recuperar = useCallback(async (b: BorradorMovimiento) => {
    token.current = b.token
    siguiente.current = b.siguienteId
    setMotivo(b.motivo)
    const datos = await rehidratarBorradorAccion(b.lineas.map((l) => ({ productoId: l.productoId, celdaClave: l.celdaClave, destinoId: l.destinoId })))
    const dd = b.destinoDefectoId ? (await rehidratarBorradorAccion([{ destinoId: b.destinoDefectoId }]))[0]?.destino : undefined
    if (dd) setDestinoDefecto(dd)
    // Las celdas de cada producto se vuelven a pedir al abrir el origen; aquí solo se restaura lo elegido.
    const conCeldas = await Promise.all(b.lineas.map(async (l, i): Promise<LineaForm> => {
      const d = datos[i]
      return {
        id: l.id, producto: d.producto, celdas: d.producto ? await ubicacionesProductoAccion(d.producto.id) : undefined, celda: d.celda, destino: d.destino,
        cantidad: l.cantidad, consulta: '', abierto: null,
      }
    }))
    setLineas(conCeldas.length ? conCeldas : [lineaVacia(1)])
  }, [])

  const lineasParaEjecutar = useCallback((): LineaEjecutar[] => calculadas.filter((c) => c.lista).map((c) => ({
    desdePosicionId: c.linea.celda!.posicionId, haciaPosicionId: c.linea.destino!.posicionId, loteId: c.linea.celda!.loteId,
    estado: c.linea.celda!.estado, procedenciaId: c.linea.celda!.procedenciaId, cantidad: c.cantidadNum,
  })), [calculadas])

  const libreDe = useCallback((lineaId: number, c: CeldaDeProducto) => disponibleReal(c.disponible, c.clave, lineas.map((x) => ({ id: x.id, celdaClave: x.celda?.clave, cantidad: x.cantidad })), lineaId), [lineas])
  const chequeo = useCallback((l: LineaForm): LineaParaChequear => comoChequeo(l, String(l.id)), [])

  return {
    libreDe, comoChequeo: chequeo,
    lineas, calculadas, resumen, destinoDefecto, notaDefecto, motivo, setMotivo, token: token.current,
    actualizar, alternar, agregar, quitar, elegirProducto, elegirOrigen, elegirDestino, usarTodo, fijarDestinoDefecto, quitarDestinoDefecto,
    aBorrador, recuperar, lineasParaEjecutar,
  }
}
