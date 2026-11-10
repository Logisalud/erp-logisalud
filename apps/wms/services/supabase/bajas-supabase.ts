import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import {
  PARAMETROS_FORMATO_BAJA, contenidoDeOrden, sustentoFaltante,
  type ContenidoOrdenBaja, type DatosEvaluacionBaja, type EntradaBaja, type EstadoOrdenBaja, type EvaluacionBajaVista, type LineaBajaVista, type MotivoBaja,
  type OrdenBajaResumen, type OrdenBajaVista, type ParametrosFormatoBaja, type StockEnBajasVista, type StockParaBaja, type SustentoBajaVista, type TipoSustentoBaja,
} from '@/domain/bajas'
import type { Checklist } from '@/domain/entradas'
import { hoyEnLima } from '@/domain/fechas'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioBajas } from '../repositorio-bajas'
import { CargaSupabase } from './carga-supabase'
import { nombresDe } from './entradas-supabase'
import { mensajeHumano, rpc, s, traerTodo, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás). Está verificado contra el contrato de las funciones SQL de la migración
// 0026 (probada en Postgres local: tests/db/bajas.test.ts) y por tipos.

const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const sch = () => crearClienteServidor().schema('wms')
const dia = (v: unknown) => (v == null ? undefined : String(v).slice(0, 10))
const TROZO = 80

/** Las filas de una tabla hija de varias Órdenes (en trozos: el filtro `in` viaja en la dirección de la consulta). */
async function hijasDe(tabla: string, ids: string[]): Promise<Fila[]> {
  const out: Fila[] = []
  for (let i = 0; i < ids.length; i += TROZO) {
    const { data, error } = await sch().from(tabla).select('*').in('orden_id', ids.slice(i, i + TROZO)).order('id')
    if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`)
    out.push(...((data ?? []) as Fila[]))
  }
  return out
}

function mapearContenido(j: Record<string, unknown>): ContenidoOrdenBaja {
  const sol = (j.solicitante ?? {}) as Record<string, string>
  const vb = (j.visto_bueno ?? {}) as Record<string, string>
  const prop = (j.propietario ?? {}) as Record<string, string>
  return {
    formato: String(j.formato ?? PARAMETROS_FORMATO_BAJA.formato), poe: String(j.poe ?? PARAMETROS_FORMATO_BAJA.poe), vigencia: String(j.vigencia ?? PARAMETROS_FORMATO_BAJA.vigencia),
    numero: String(j.numero), fecha: String(j.fecha).slice(0, 10), reemite: j.reemite ? String(j.reemite) : undefined,
    solicitante: { nombre: String(sol.nombre ?? ''), cargo: String(sol.cargo ?? '') },
    // Las Órdenes emitidas antes de la 0033 no traen `visto_bueno`: se imprime el vigente (Katia Zapata).
    vistoBueno: { nombre: String(vb.nombre ?? PARAMETROS_FORMATO_BAJA.vistoBuenoNombre), cargo: String(vb.cargo ?? PARAMETROS_FORMATO_BAJA.vistoBuenoCargo) }, motivoTraslado: String(j.motivo_traslado ?? PARAMETROS_FORMATO_BAJA.motivoTraslado),
    propietario: { codigo: String(prop.codigo ?? ''), razonSocial: String(prop.razon_social ?? '') },
    lineas: ((j.lineas ?? []) as Record<string, unknown>[]).map((l) => ({
      n: Number(l.n), productoCodigo: String(l.producto_codigo ?? ''), producto: String(l.producto ?? ''), presentacion: s(l.presentacion), registroSanitario: s(l.registro_sanitario), lote: String(l.lote ?? ''),
      vence: dia(l.vence), cantidad: Number(l.cantidad), motivo: l.motivo as MotivoBaja, motivoTexto: String(l.motivo_texto ?? ''), detalle: s(l.detalle),
      estadoOrigen: l.estado_origen as 'APROBADO' | 'CUARENTENA' | 'DEVOLUCIONES', ubicacion: String(l.ubicacion ?? ''), sustento: s(l.sustento),
    })),
  }
}

export class BajasSupabase extends CargaSupabase implements RepositorioBajas {
  /** Arma las Órdenes (con sus líneas, sustentos y evaluaciones) a partir de las filas ya leídas. */
  private async armar(ordenes: Fila[]): Promise<OrdenBajaVista[]> {
    if (ordenes.length === 0) return []
    const ids = ordenes.map((o) => String(o.id))
    const [lineas, sustentos, evals, lotes, productos, regs, posiciones, propietarios] = await Promise.all([
      hijasDe('ordenes_baja_lineas', ids), hijasDe('ordenes_baja_sustentos', ids), hijasDe('ordenes_baja_evaluaciones', ids),
      traerTodo('lotes', 'wms', 'id, codigo, vence'), traerTodo('productos', 'catalogo', 'id, codigo, descripcion, presentacion'),
      traerTodo('producto_regulatorio', 'wms', 'producto_id, registro_sanitario'), traerTodo('posiciones', 'wms', 'id, codigo'), traerTodo('propietarios', 'wms', 'id, codigo, razon_social'),
    ])
    const idsMov = [...new Set(ordenes.map((o) => (o.orden_movimiento_id ? String(o.orden_movimiento_id) : '')).filter(Boolean))]
    const movimientos = new Map<string, Fila>()
    if (idsMov.length) {
      const { data } = await sch().from('ordenes_movimiento').select('id, numero, estado').in('id', idsMov)
      for (const m of (data ?? []) as Fila[]) movimientos.set(String(m.id), m)
    }
    const personas = await nombresDe([...ordenes.flatMap((o) => [o.solicitada_por, o.cerrada_por, o.emitida_por, o.anulada_por]), ...sustentos.map((x) => x.agregado_por), ...evals.map((x) => x.evaluada_por), ...lineas.map((l) => l.vence_confirmada_por)].map((x) => (x ? String(x) : undefined)))
    const nombre = (v: unknown) => (v ? personas.get(String(v)) ?? 'Usuario' : undefined)
    const lote = new Map(lotes.map((l) => [String(l.id), l])); const prod = new Map(productos.map((p) => [String(p.id), p]))
    const rs = new Map(regs.map((r) => [String(r.producto_id), s(r.registro_sanitario)])); const pos = new Map(posiciones.map((p) => [String(p.id), String(p.codigo)]))
    const prop = new Map(propietarios.map((p) => [String(p.id), p])); const hoy = hoyEnLima()
    const numeroDe = new Map(ordenes.map((o) => [String(o.id), String(o.numero)]))

    return ordenes.map((o): OrdenBajaVista => {
      const mis = lineas.filter((l) => String(l.orden_id) === String(o.id)).sort((a, b) => Number(a.n) - Number(b.n)).map((l): LineaBajaVista => {
        const lt = lote.get(String(l.lote_id)); const p = prod.get(String(l.producto_id))
        const sus: SustentoBajaVista[] = sustentos.filter((x) => String(x.linea_id) === String(l.id)).map((x) => ({
          id: String(x.id), tipo: x.tipo as TipoSustentoBaja, nombreArchivo: String(x.nombre_archivo), archivoRef: String(x.archivo_ref), referencia: s(x.referencia), bytes: x.bytes == null ? undefined : Number(x.bytes),
          agregadoPor: nombre(x.agregado_por) ?? 'Usuario', agregadoEn: String(x.agregado_en),
        }))
        const evs: EvaluacionBajaVista[] = evals.filter((x) => String(x.linea_id) === String(l.id)).sort((a, b) => Number(a.version) - Number(b.version)).map((x) => ({
          id: String(x.id), version: Number(x.version), checklist: (x.checklist ?? {}) as Checklist, certAnalisis: x.cert_analisis == null ? null : Boolean(x.cert_analisis), observacion: String(x.observacion),
          conclusion: x.conclusion as 'CONFORME' | 'NO_CONFORME', evaluadaPor: nombre(x.evaluada_por) ?? 'Usuario', evaluadaEn: String(x.evaluada_en),
        }))
        const base = {
          id: String(l.id), n: Number(l.n), productoId: String(l.producto_id), productoCodigo: String(p?.codigo ?? ''), producto: String(p?.descripcion ?? ''), presentacion: s(p?.presentacion),
          registroSanitario: rs.get(String(l.producto_id)), loteId: String(l.lote_id), lote: String(lt?.codigo ?? ''), vence: dia(lt?.vence), posicionId: String(l.posicion_id), posicion: pos.get(String(l.posicion_id)) ?? '',
          estadoOrigen: l.estado_origen as LineaBajaVista['estadoOrigen'], cantidad: Number(l.cantidad), motivo: l.motivo as MotivoBaja, detalle: s(l.detalle), vencePropuesta: dia(l.vence_propuesta),
          venceConfirmada: dia(l.vence_confirmada), venceConfirmadaPor: nombre(l.vence_confirmada_por), sustentos: sus, evaluacion: evs.at(-1), evaluaciones: evs.length,
        }
        return { ...base, faltante: sustentoFaltante(base, hoy) }
      })
      const pr = prop.get(String(o.propietario_id)); const mv = o.orden_movimiento_id ? movimientos.get(String(o.orden_movimiento_id)) : undefined
      const previa = o.reemite_de ? String(o.reemite_de) : undefined
      const siguiente = ordenes.find((x) => String(x.reemite_de) === String(o.id))
      return {
        id: String(o.id), numero: String(o.numero), estado: o.estado as EstadoOrdenBaja, propietarioId: String(o.propietario_id), propietarioCodigo: String(pr?.codigo ?? ''), propietario: String(pr?.razon_social ?? ''),
        nota: s(o.nota), solicitadaPor: nombre(o.solicitada_por) ?? 'Usuario', solicitadaPorId: String(o.solicitada_por), solicitadaEn: String(o.solicitada_en), cerradaPor: nombre(o.cerrada_por), cerradaEn: s(o.cerrada_en),
        motivoCierre: s(o.motivo_cierre), emitidaPor: nombre(o.emitida_por), emitidaEn: s(o.emitida_en), fechaDocumento: dia(o.fecha_documento), hash: s(o.hash_contenido), anuladaPor: nombre(o.anulada_por), anuladaEn: s(o.anulada_en),
        motivoAnulacion: s(o.motivo_anulacion), reemiteDe: previa ? { id: previa, numero: numeroDe.get(previa) ?? '' } : undefined, reemitidaPor: siguiente ? { id: String(siguiente.id), numero: String(siguiente.numero) } : undefined,
        traslado: mv ? { ordenMovimientoId: String(mv.id), numero: String(mv.numero), estado: String(mv.estado), destino: o.posicion_destino_id ? pos.get(String(o.posicion_destino_id)) : undefined } : undefined,
        lineas: mis, unidades: mis.reduce((t, l) => t + l.cantidad, 0),
      }
    })
  }

  async listarBajas(): Promise<OrdenBajaResumen[]> {
    const { data, error } = await sch().from('ordenes_baja').select('*').order('solicitada_en', { ascending: false }).limit(500)
    if (error) throw new Error(`No se pudieron leer las bajas: ${error.message}`)
    const vistas = await this.armar((data ?? []) as Fila[])
    return vistas.map((v): OrdenBajaResumen => ({
      id: v.id, numero: v.numero, estado: v.estado, propietario: v.propietario, propietarioCodigo: v.propietarioCodigo, lineas: v.lineas.length, unidades: v.unidades,
      motivos: [...new Set(v.lineas.map((l) => l.motivo))], productos: [...new Set(v.lineas.map((l) => l.producto))], solicitadaPor: v.solicitadaPor, solicitadaEn: v.solicitadaEn,
      conFaltantes: v.estado === 'SOLICITADA' ? v.lineas.filter((l) => l.faltante).length : 0, porTrasladar: v.estado === 'EMITIDA' && !v.traslado,
    }))
  }

  async obtenerBaja(id: string): Promise<OrdenBajaVista | null> {
    const { data, error } = await sch().from('ordenes_baja').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`No se pudo leer la baja: ${error.message}`)
    if (!data) return null
    const extra: Fila[] = []
    const d = data as Fila
    for (const ref of [d.reemite_de]) if (ref) { const { data: x } = await sch().from('ordenes_baja').select('*').eq('id', String(ref)).maybeSingle(); if (x) extra.push(x as Fila) }
    const { data: sig } = await sch().from('ordenes_baja').select('*').eq('reemite_de', id).maybeSingle()
    if (sig) extra.push(sig as Fila)
    const todas = await this.armar([d, ...extra])
    return todas.find((v) => v.id === id) ?? null
  }

  async contenidoBaja(id: string) {
    const { data, error } = await sch().from('ordenes_baja').select('id, estado, contenido, hash_contenido').eq('id', id).maybeSingle()
    if (error) throw new Error(`No se pudo leer la baja: ${error.message}`)
    if (!data) return null
    const d = data as Fila
    if (d.contenido) return { contenido: mapearContenido(d.contenido as Record<string, unknown>), borrador: false, estado: d.estado as EstadoOrdenBaja, hash: s(d.hash_contenido) }
    const v = await this.obtenerBaja(id)
    if (!v) return null
    const params = await this.parametrosFormato()
    return { contenido: contenidoDeOrden(v, hoyEnLima(), params), borrador: true, estado: v.estado }
  }

  private async parametrosFormato(): Promise<ParametrosFormatoBaja> {
    const filas = await traerTodo('parametros', 'wms', 'clave, valor')
    const v = (k: string, def: string) => String(filas.find((f) => f.clave === k)?.valor ?? def)
    const d = PARAMETROS_FORMATO_BAJA
    return {
      formato: v('baja_codigo_formato', d.formato), poe: v('baja_codigo_poe', d.poe), vigencia: v('baja_vigencia_formato', d.vigencia), solicitanteNombre: v('baja_solicitante_nombre', d.solicitanteNombre),
      solicitanteCargo: v('baja_solicitante_cargo', d.solicitanteCargo), vistoBuenoNombre: v('baja_vb_nombre', d.vistoBuenoNombre), vistoBuenoCargo: v('baja_vb_cargo', d.vistoBuenoCargo), motivoTraslado: v('baja_motivo_traslado', d.motivoTraslado),
    }
  }

  async stockParaBaja(propietarioId: string, consulta = '', limite = 40): Promise<StockParaBaja[]> {
    const { data, error } = await rpc('stock_para_baja', { p_propietario: propietarioId, p_consulta: consulta.trim() || null, p_limite: limite })
    if (error) throw new Error(mensajeHumano(error))
    return ((data ?? []) as Fila[]).map((f): StockParaBaja => ({
      posicionId: String(f.posicion_id), posicion: String(f.posicion), loteId: String(f.lote_id), lote: String(f.lote), vence: dia(f.vence), vencido: Boolean(f.vencido), productoId: String(f.producto_id),
      productoCodigo: String(f.producto_codigo), producto: String(f.producto), estado: f.estado as StockParaBaja['estado'], disponible: Number(f.disponible),
    }))
  }

  async stockEnBajas(propietarioId?: string): Promise<StockEnBajasVista[]> {
    const filas = await traerTodo('v_stock_en_bajas', 'wms', '*', ['propietario_codigo', 'producto', 'lote'])
    return filas.filter((f) => !propietarioId || String(f.propietario_id) === propietarioId).map((f): StockEnBajasVista => ({
      propietarioId: String(f.propietario_id), propietarioCodigo: String(f.propietario_codigo), propietario: String(f.propietario), productoId: String(f.producto_id), productoCodigo: String(f.producto_codigo),
      producto: String(f.producto), loteId: String(f.lote_id), lote: String(f.lote), vence: dia(f.vence), vencido: Boolean(f.vencido), posicionId: String(f.posicion_id), posicion: String(f.posicion),
      enAreaBajas: Boolean(f.en_area_bajas), cantidad: Number(f.cantidad), ordenesBaja: ((f.ordenes_baja ?? []) as string[]).map(String), motivos: ((f.motivos ?? []) as string[]) as MotivoBaja[],
    }))
  }

  async ubicacionesDeBajas(propietarioId: string) {
    const [posiciones, asignaciones] = await Promise.all([traerTodo('posiciones', 'wms', 'id, codigo, tipo_area, activa'), traerTodo('asignaciones_posicion', 'wms')])
    const hoy = hoyEnLima()
    return posiciones.filter((p) => p.tipo_area === 'BAJAS_RECHAZADOS' && p.activa
      && asignaciones.some((a) => String(a.posicion_id) === String(p.id) && String(a.propietario_id) === propietarioId && dia(a.desde)! <= hoy && (!a.hasta || hoy < dia(a.hasta)!)))
      .map((p) => ({ id: String(p.id), codigo: String(p.codigo) })).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  }

  async solicitarBaja(entrada: EntradaBaja, _actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const lineas = entrada.lineas.map((l) => ({ lote_id: l.loteId, posicion_id: l.posicionId, estado: l.estado, cantidad: l.cantidad, motivo: l.motivo, detalle: l.detalle ?? null }))
    const { data, error } = await rpc('solicitar_baja', { p_propietario: entrada.propietarioId, p_lineas: lineas, p_nota: entrada.nota ?? null })
    if (error) return mal(error)
    const id = String(data)
    const { data: o } = await sch().from('ordenes_baja').select('numero').eq('id', id).maybeSingle()
    return { ok: true, id, numero: String((o as Fila | null)?.numero ?? '') }
  }

  async confirmarVencimientoBaja(lineaId: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('confirmar_vencimiento_baja', { p_linea: lineaId })
    return error ? mal(error) : { ok: true }
  }

  async registrarEvaluacionBaja(lineaId: string, d: DatosEvaluacionBaja, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('registrar_evaluacion_baja', { p_linea: lineaId, p_datos: { checklist: d.checklist, cert_analisis: d.certAnalisis, observacion: d.observacion, conclusion: d.conclusion } })
    return error ? mal(error) : { ok: true }
  }

  async adjuntarSustentoBaja(lineaId: string, a: { tipo: TipoSustentoBaja; nombre: string; ref: string; hash?: string; bytes?: number; referencia?: string }, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('adjuntar_sustento_baja', { p_linea: lineaId, p_tipo: a.tipo, p_nombre: a.nombre, p_ref: a.ref, p_hash: a.hash ?? null, p_bytes: a.bytes ?? null, p_referencia: a.referencia ?? null })
    return error ? mal(error) : { ok: true }
  }

  async autorizarBaja(id: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('autorizar_baja', { p_orden: id })
    return error ? mal(error) : { ok: true }
  }

  async cerrarSolicitudBaja(id: string, decision: 'RECHAZADA' | 'CANCELADA', motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    if (!motivo.trim()) return { ok: false, mensaje: 'Cuéntanos el motivo', errores: { motivo: 'Cuéntanos el motivo.' } }
    const { error } = await rpc('cerrar_solicitud_baja', { p_orden: id, p_decision: decision, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }

  async anularOrdenBaja(id: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    if (!motivo.trim()) return { ok: false, mensaje: 'La anulación necesita un motivo', errores: { motivo: 'Cuéntanos por qué se anula.' } }
    const { error } = await rpc('anular_orden_baja', { p_orden: id, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }

  async reemitirOrdenBaja(id: string, _actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const { data, error } = await rpc('reemitir_orden_baja', { p_orden_anulada: id })
    if (error) return mal(error)
    const nuevo = String(data)
    const { data: o } = await sch().from('ordenes_baja').select('numero').eq('id', nuevo).maybeSingle()
    return { ok: true, id: nuevo, numero: String((o as Fila | null)?.numero ?? '') }
  }

  async trasladarBaja(id: string, destinoId: string | undefined, _actor: Actor): Promise<ResultadoAccion<{ movimiento: string }>> {
    const { data, error } = await rpc('trasladar_baja', { p_orden: id, p_destino: destinoId ?? null })
    if (error) return mal(error)
    const { data: m } = await sch().from('ordenes_movimiento').select('numero').eq('id', String(data)).maybeSingle()
    return { ok: true, movimiento: String((m as Fila | null)?.numero ?? '') }
  }
}
