import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import type { OrganolepticaVista } from '@/domain/entradas-vistas'
import { ESTADO_INICIAL } from '@/domain/entradas'
import { tablaRige, type AntecedenteCalidadVista, type PanoramaMuestreo, type TablaMuestreoVista, type TramoMuestreo } from '@/domain/muestreo'
import { validarRetorno, type EntradaRetorno, type LineaRetornable, type ResumenSalidaRetorno, type RetornoVista, type SalidaParaRetorno } from '@/domain/retornos'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { DatosRegistroDictamen, RepositorioLiberacion } from '../repositorio-liberacion'
import { CierreRutaSupabase } from './cierre-ruta-supabase'
import { nombresDe } from './entradas-supabase'
import { mensajeHumano, rpc, s, traerTodo, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás). Está verificado contra el contrato de las funciones SQL de la migración
// 0025 (probada en Postgres local: tests/db/os5-*.test.ts) y por tipos.

const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const sch = () => crearClienteServidor().schema('wms')
const dia = (v: unknown) => String(v).slice(0, 10)

export class LiberacionSupabase extends CierreRutaSupabase implements RepositorioLiberacion {
  // ── Muestreo ────────────────────────────────────────────────────────────────
  async panoramaMuestreo(): Promise<PanoramaMuestreo> {
    const [tablas, tramos, marcas, prods] = await Promise.all([
      traerTodo('tablas_muestreo', 'wms'), traerTodo('tablas_muestreo_tramos', 'wms'), traerTodo('antecedentes_calidad', 'wms', '*', ['marcado_en']),
      traerTodo('productos', 'catalogo', 'id, codigo, descripcion, estado'),
    ])
    const hoy = new Date().toISOString().slice(0, 10)
    const nombres = await nombresDe(marcas.flatMap((m) => [s(m.marcado_por), s(m.quitado_por)]))
    const prod = new Map(prods.map((p) => [String(p.id), p]))
    const lista = (tabla: Fila, regimen: string): TramoMuestreo[] => tramos.filter((t) => String(t.tabla_id) === String(tabla.id) && t.regimen === regimen)
      .map((t) => ({ desde: Number(t.desde), hasta: t.hasta == null ? null : Number(t.hasta), muestra: Number(t.muestra) })).sort((a, b) => a.desde - b.desde)
    const vistas: TablaMuestreoVista[] = tablas.map((t) => {
      const base = { codigo: String(t.codigo), vigenteDesde: dia(t.vigente_desde), vigenteHasta: t.vigente_hasta ? dia(t.vigente_hasta) : undefined, umbralTotal: Number(t.umbral_total), simplificada: lista(t, 'SIMPLIFICADA'), normal: lista(t, 'NORMAL') }
      return { ...base, nota: s(t.nota), vigente: tablaRige(base, hoy) }
    }).sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))
    const antecedentes: AntecedenteCalidadVista[] = marcas.map((m) => ({
      id: String(m.id), productoId: String(m.producto_id), productoCodigo: String(prod.get(String(m.producto_id))?.codigo ?? ''), producto: String(prod.get(String(m.producto_id))?.descripcion ?? ''),
      motivo: String(m.motivo), marcadoPor: nombres.get(String(m.marcado_por)) ?? 'Usuario', marcadoEn: String(m.marcado_en),
      quitadoPor: m.quitado_por ? nombres.get(String(m.quitado_por)) ?? 'Usuario' : undefined, quitadoEn: s(m.quitado_en), motivoQuita: s(m.motivo_quita),
    })).sort((a, b) => Number(!!a.quitadoEn) - Number(!!b.quitadoEn) || b.marcadoEn.localeCompare(a.marcadoEn))
    return { hoy, tablas: vistas, antecedentes, productos: prods.filter((p) => p.estado !== 'inactivo').map((p) => ({ id: String(p.id), codigo: String(p.codigo), descripcion: String(p.descripcion) })) }
  }

  async marcarAntecedentes(productoId: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('marcar_muestreo_estricto', { p_producto: productoId, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }

  async quitarAntecedentes(productoId: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('quitar_muestreo_estricto', { p_producto: productoId, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }

  // ── Liberación ─────────────────────────────────────────────────────────────
  override async obtenerOrganoleptica(id: string): Promise<OrganolepticaVista | null> {
    const o = await super.obtenerOrganoleptica(id)
    if (!o) return null
    if (o.estado === 'FIRMADA') return { ...o, pendienteDecision: 0 }
    const { data } = await sch().from('saldos').select('cantidad').eq('procedencia_id', o.ingresoLoteId).eq('estado', ESTADO_INICIAL[o.ingresoTipo]).gt('cantidad', 0)
    return { ...o, pendienteDecision: ((data ?? []) as Fila[]).reduce((t, r) => t + Number(r.cantidad), 0) }
  }

  async observarActa(actaId: string, texto: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('observar_acta_organoleptica', { p_acta: actaId, p_texto: texto })
    return error ? mal(error) : { ok: true }
  }

  async levantarObservacion(actaId: string, nota: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('levantar_observacion_acta', { p_acta: actaId, p_nota: nota })
    return error ? mal(error) : { ok: true }
  }

  async registrarDictamen(actaId: string, d: DatosRegistroDictamen, _actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const { data, error } = await rpc('registrar_dictamen_cliente', {
      p_acta: actaId, p_liberada: d.liberada, p_rechazada: d.rechazada, p_fecha: d.fechaDictamen, p_observacion: d.observacion?.trim() || null,
      p_documento_ref: d.documento.ref, p_documento_nombre: d.documento.nombre, p_documento_hash: d.documento.hash, p_documento_tipo: d.documento.tipo,
    })
    return error ? mal(error) : { ok: true, id: String(data) }
  }

  async confirmarDictamen(dictamenId: string, _actor: Actor): Promise<ResultadoAccion<{ firmada: boolean }>> {
    const { error } = await rpc('confirmar_dictamen_cliente', { p_dictamen: dictamenId })
    if (error) return mal(error)
    const { data: d } = await sch().from('dictamenes_cliente').select('acta_id').eq('id', dictamenId).maybeSingle()
    const { data: a } = d ? await sch().from('actas_organolepticas').select('estado').eq('id', String((d as Fila).acta_id)).maybeSingle() : { data: null }
    return { ok: true, firmada: (a as Fila | null)?.estado === 'FIRMADA' }
  }

  async anularDictamen(dictamenId: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('anular_dictamen_cliente', { p_dictamen: dictamenId, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }

  // ── Retornos ───────────────────────────────────────────────────────────────
  private async retornosDe(salidaIds: string[]): Promise<Map<string, RetornoVista[]>> {
    const por = new Map<string, RetornoVista[]>()
    if (salidaIds.length === 0) return por
    const { data } = await sch().from('solicitudes_ingreso').select('id, numero, estado, retorno_motivo, creado_en, guia_numero, salida_id').in('salida_id', salidaIds)
    const filas = (data ?? []) as Fila[]
    const { data: ls } = filas.length ? await sch().from('solicitud_ingreso_lineas').select('solicitud_id, cantidad').in('solicitud_id', filas.map((f) => String(f.id))) : { data: [] }
    const unidades = new Map<string, number>()
    for (const l of (ls ?? []) as Fila[]) unidades.set(String(l.solicitud_id), (unidades.get(String(l.solicitud_id)) ?? 0) + Number(l.cantidad))
    for (const f of filas) {
      const k = String(f.salida_id)
      por.set(k, [...(por.get(k) ?? []), {
        solicitudId: String(f.id), solicitudNumero: String(f.numero), motivo: f.retorno_motivo as RetornoVista['motivo'], estado: f.estado as RetornoVista['estado'],
        unidades: unidades.get(String(f.id)) ?? 0, creadoEn: String(f.creado_en), guiaNumero: s(f.guia_numero),
      }])
    }
    for (const v of por.values()) v.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
    return por
  }

  async salidasConRetorno(): Promise<ResumenSalidaRetorno[]> {
    const confirmadas = (await this.listarSalidas()).filter((x) => x.etapa === 'CONFIRMADA')
    const retornos = await this.retornosDe(confirmadas.map((x) => x.id))
    return confirmadas.map((x) => ({ salidaId: x.id, numero: x.numero, pedidoNumero: x.pedidoNumero, cliente: x.cliente, fecha: x.fecha, unidades: x.unidades, retornos: retornos.get(x.id) ?? [] }))
  }

  async salidaParaRetorno(salidaId: string): Promise<SalidaParaRetorno | null> {
    const { data: sal } = await sch().from('salidas').select('id, numero, estado, propietario_id').eq('id', salidaId).maybeSingle()
    if (!sal) return null
    const [{ data: lr, error }, { data: prop }, { data: guia }, retornos] = await Promise.all([
      rpc('lotes_retornables', { p_salida: salidaId }),
      sch().from('propietarios').select('razon_social').eq('id', String((sal as Fila).propietario_id)).maybeSingle(),
      sch().from('guias_remision').select('numero').eq('salida_id', salidaId).eq('estado', 'VIGENTE').maybeSingle(),
      this.retornosDe([salidaId]),
    ])
    if (error) throw new Error(mensajeHumano(error))
    const filas = (lr ?? []) as Fila[]
    const prods = filas.length ? await traerTodo('productos', 'catalogo', 'id, codigo, descripcion') : []
    const prod = new Map(prods.map((p) => [String(p.id), p]))
    const lineas: LineaRetornable[] = filas.map((f) => ({
      productoId: String(f.producto_id), productoCodigo: String(prod.get(String(f.producto_id))?.codigo ?? ''), producto: String(prod.get(String(f.producto_id))?.descripcion ?? ''),
      loteId: String(f.lote_id), lote: String(f.lote), vence: f.vence ? dia(f.vence) : undefined, despachado: Number(f.despachado), yaRetornado: Number(f.ya_retornado), retornable: Number(f.retornable),
    }))
    return {
      salidaId, numero: String((sal as Fila).numero), propietarioId: String((sal as Fila).propietario_id), propietario: String((prop as Fila | null)?.razon_social ?? ''),
      guiaNumero: guia ? String((guia as Fila).numero) : undefined, confirmada: (sal as Fila).estado === 'CONFIRMADA', lineas, retornos: retornos.get(salidaId) ?? [],
    }
  }

  async crearRetorno(entrada: EntradaRetorno, autorizar: boolean, _actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string; autorizada: boolean }>> {
    const info = await this.salidaParaRetorno(entrada.salidaId)
    if (!info) return { ok: false, mensaje: 'No encontramos esa Orden de Salida' }
    const v = validarRetorno(entrada, info)
    if (!v.ok) return { ok: false, mensaje: v.mensaje, errores: v.errores as Record<string, string> }
    const { data, error } = await rpc('crear_retorno', {
      p_salida: entrada.salidaId, p_motivo: entrada.motivo,
      p_datos: { doc_original_tipo: entrada.docOriginalTipo, doc_original_numero: entrada.docOriginalNumero?.trim(), guia_numero: entrada.guiaNumero?.trim() || null, observaciones: entrada.observaciones?.trim() || null },
      p_lineas: v.lineas.map((l) => ({ lote_id: l.loteId, cantidad: l.cantidad })), p_autorizar: autorizar,
    })
    if (error) return mal(error)
    const { data: sol } = await sch().from('solicitudes_ingreso').select('numero, estado').eq('id', String(data)).maybeSingle()
    return { ok: true, id: String(data), numero: String((sol as Fila | null)?.numero ?? ''), autorizada: (sol as Fila | null)?.estado === 'PROGRAMADA' }
  }
}
