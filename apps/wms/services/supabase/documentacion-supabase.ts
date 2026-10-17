import 'server-only'

import {
  faltantesDelPaquete, paqueteDeItemsCompleto, validarNumeroGre, normalizarNumeroGre,
  type GuiaVista, type ItemPaquete, type LineaGuia, type PaqueteSalida,
} from '@/domain/documentacion'
import {
  type CasoAnulacion, type DatosGuia, type EventoPedidos, type EstadoSunat, type ModoNubefact, type OrigenGuia, type RespuestaEmision, type TrasladoGuia,
} from '@/domain/guia-electronica'
import { etapaConAvance, type SalidaResumen, type SalidaVista } from '@/domain/despacho'
import type { EstadoRequisito, TipoDocumento } from '@/domain/documentos'
import type { ExtrasLsFr } from '@/domain/ls-fr-43-03'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioDocumentacion } from '../repositorio-documentacion'
import { crearClienteServidor } from '@logisalud/auth/server'
import { nombresDe } from './entradas-supabase'
import { DocumentosSupabase } from './documentos-supabase'
import { mensajeHumano, rpc, s, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás). Está verificado contra el contrato de las funciones SQL de la migración
// 0019 (probada en Postgres local: tests/db/documentacion.test.ts) y por tipos.

const dia = (v: unknown) => String(v).slice(0, 10)
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const sch = () => crearClienteServidor().schema('wms')

function guiaVista(g: Fila, nombres: Map<string, string>): GuiaVista {
  return {
    id: String(g.id), numero: String(g.numero), estado: g.estado === 'ANULADA' ? 'ANULADA' : 'VIGENTE',
    lineas: ((Array.isArray(g.lineas) ? g.lineas : []) as { producto_codigo: string; producto: string; lote: string; vence: string | null; cantidad: number }[])
      .map((l): LineaGuia => ({ productoCodigo: l.producto_codigo, producto: l.producto, lote: l.lote, vence: l.vence ? dia(l.vence) : null, cantidad: Number(l.cantidad) })),
    placa: s(g.placa), fechaTraslado: g.fecha_traslado ? dia(g.fecha_traslado) : undefined, nota: s(g.nota), registradaPor: nombres.get(String(g.registrada_por)) ?? 'Usuario', registradaEn: String(g.registrada_en),
    anuladaMotivo: s(g.motivo_anulacion), anuladaEn: g.anulada_en ? String(g.anulada_en) : undefined,
    origen: (s(g.origen) ?? 'MANUAL') as OrigenGuia, entorno: s(g.entorno) as ModoNubefact | undefined, enlace: s(g.enlace), enlaceXml: s(g.enlace_xml), estadoSunat: s(g.estado_sunat) as EstadoSunat | undefined,
    bultos: g.bultos == null ? undefined : Number(g.bultos), pesoKg: g.peso_kg == null ? undefined : Number(g.peso_kg), fechaInicio: g.fecha_inicio_traslado ? dia(g.fecha_inicio_traslado) : undefined,
    casoAnulacion: g.caso_anulacion == null ? undefined : (Number(g.caso_anulacion) as CasoAnulacion), bajaSunat: s(g.baja_sunat) as GuiaVista['bajaSunat'],
  }
}

export class DocumentacionSupabase extends DocumentosSupabase implements RepositorioDocumentacion {
  async paqueteSalida(salidaId: string): Promise<PaqueteSalida | null> {
    const salida = await this.obtenerSalida(salidaId)
    if (!salida) return null
    const [pq, gs, ped, orden] = await Promise.all([
      sch().rpc('paquete_documental', { p_salida: salidaId }), sch().from('guias_remision').select('*').eq('salida_id', salidaId).order('registrada_en'),
      sch().from('pedidos_despacho').select('cliente_ruc').eq('salida_id', salidaId).eq('vigente', true).maybeSingle(),
      sch().from('ordenes_picking').select('id, ordenes_picking_lineas(conformidad)').eq('salida_id', salidaId).neq('estado', 'CANCELADA').maybeSingle(),
    ])
    if (pq.error) throw new Error(mensajeHumano(pq.error))
    const ruc = s((ped.data as Fila | null)?.cliente_ruc)
    const items = new Map<string, ItemPaquete>()
    for (const f of (pq.data ?? []) as Fila[]) {
      const k = `${f.linea_id}|${f.lote_id}`
      const it = items.get(k) ?? { lineaId: String(f.linea_id), productoId: String(f.producto_id), productoCodigo: String(f.producto_codigo), producto: String(f.producto), loteId: String(f.lote_id), lote: String(f.lote), cantidad: Number(f.cantidad), requisitos: [] }
      it.requisitos.push({ tipo: f.tipo as TipoDocumento, exigido: Boolean(f.exigido), estado: f.estado as EstadoRequisito, documentoId: s(f.documento_id), nombreArchivo: s(f.nombre_archivo), vigenteHasta: f.vigente_hasta ? dia(f.vigente_hasta) : undefined })
      items.set(k, it)
    }
    const filas = ((gs.data ?? []) as Fila[])
    const nombres = await nombresDe(filas.map((g) => String(g.registrada_por)))
    const todas = filas.map((g) => guiaVista(g, nombres))
    const lineasOrden = ((orden.data as { ordenes_picking_lineas?: { conformidad: string }[] } | null)?.ordenes_picking_lineas ?? [])
    let copias = 1
    if (ruc) { const { data } = await sch().from('perfil_documental_cliente').select('copias').eq('ruc', ruc).maybeSingle(); copias = Number((data as Fila | null)?.copias ?? 1) }
    const lista = [...items.values()]
    return {
      salidaId, salidaNumero: salida.numero, pedidoNumero: salida.pedidoNumero, cliente: salida.cliente, ruc, conforme: lineasOrden.length > 0 && lineasOrden.every((l) => l.conformidad === 'CONFORME'),
      guia: todas.find((g) => g.estado === 'VIGENTE'), guiasAnuladas: todas.filter((g) => g.estado === 'ANULADA'), items: lista, completo: paqueteDeItemsCompleto(lista), faltantes: faltantesDelPaquete(lista), copias,
    }
  }

  async registrarGre(salidaId: string, numero: string, nota: string | undefined, _actor: Actor, archivoRef?: string): Promise<ResultadoAccion<{ id: string }>> {
    const bloqueo = validarNumeroGre(numero)
    if (bloqueo) return { ok: false, mensaje: bloqueo, errores: { numero: bloqueo } }
    const { data, error } = await rpc('registrar_gre', { p_salida: salidaId, p_numero: normalizarNumeroGre(numero), p_nota: nota?.trim() || null, p_archivo_ref: archivoRef ?? null })
    return error ? mal(error) : { ok: true, id: String(data) }
  }

  async anularGre(guiaId: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('anular_gre', { p_guia: guiaId, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }

  async datosGuia(salidaId: string): Promise<DatosGuia | null> {
    const { data, error } = await rpc('contexto_guia', { p_salida: salidaId })
    if (error || !data) return null
    const c = data as Record<string, any>
    const cli = (c.pedido?.snapshot?.cliente ?? {}) as Record<string, unknown>
    const par = (c.parametros ?? {}) as Record<string, string>
    return {
      salidaId, salidaNumero: String(c.salida.numero), tipo: c.salida.tipo, conforme: Boolean(c.salida.conforme), pedidoNumero: s(c.pedido?.numero),
      destinatario: { nombre: s(c.pedido?.cliente) ?? s(cli.nombre), ruc: s(c.pedido?.ruc) ?? s(cli.ruc), direccion: s(cli.direccion), ubigeo: s(cli.ubigeo), distrito: s(cli.distrito) },
      lineas: ((c.lineas ?? []) as { producto_codigo: string; producto: string; lote: string; vence: string | null; cantidad: number }[])
        .map((l): LineaGuia => ({ productoCodigo: l.producto_codigo, producto: l.producto, lote: l.lote, vence: l.vence ? dia(l.vence) : null, cantidad: Number(l.cantidad) })),
      bultos: Number(c.bultos ?? 0),
      ruta: c.ruta ? { id: String(c.ruta.id), numero: String(c.ruta.numero), fecha: dia(c.ruta.fecha), placa: s(c.ruta.placa), conductor: s(c.ruta.conductor), conductorDni: s(c.ruta.conductor_dni), auxiliar: s(c.ruta.auxiliar) } : undefined,
      partida: { ubigeo: par.guia_partida_ubigeo ?? '', direccion: par.guia_partida_direccion ?? '' },
      motivoTraslado: par.guia_motivo_traslado ?? 'VENTA', modalidad: par.guia_modalidad_transporte ?? 'TRANSPORTE PRIVADO', serie: par.guia_serie ?? 'T001',
      reglasBaja: { plazoHoras: par.sunat_baja_plazo_horas ?? 'PENDIENTE', trasInicioTraslado: par.sunat_baja_tras_inicio_traslado ?? 'PENDIENTE', soportadaPorApi: par.nubefact_baja_soportada ?? 'PENDIENTE' },
    }
  }

  async registrarGuiaElectronica(salidaId: string, r: Extract<RespuestaEmision, { ok: true }>, t: TrasladoGuia, payload: unknown, _actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const { data, error } = await rpc('registrar_guia_electronica', {
      p_salida: salidaId, p_numero: r.numero, p_enlace: r.enlace, p_hash: r.hash, p_entorno: r.entorno, p_fecha_inicio: t.fechaInicio, p_peso: t.pesoKg,
      p_payload: payload ?? null, p_respuesta: r.cruda ?? null, p_enlace_xml: r.enlaceXml ?? null, p_estado_sunat: r.estadoSunat,
    })
    return error ? mal(error) : { ok: true, id: String(data), numero: r.numero }
  }

  async anularGuia(guiaId: string, caso: CasoAnulacion, motivo: string, _actor: Actor): Promise<ResultadoAccion<{ caso: CasoAnulacion; conformidadReabierta: boolean; bajaSunat: 'PENDIENTE' | 'NO_APLICA' }>> {
    const { data, error } = await rpc('anular_guia', { p_guia: guiaId, p_caso: caso, p_motivo: motivo })
    if (error) return mal(error)
    const r = (data ?? {}) as { conformidad_reabierta?: boolean; baja_sunat?: string }
    return { ok: true, caso, conformidadReabierta: Boolean(r.conformidad_reabierta), bajaSunat: r.baja_sunat === 'PENDIENTE' ? 'PENDIENTE' : 'NO_APLICA' }
  }

  async eventosPedidos(filtro?: { salidaId?: string; soloPendientes?: boolean }): Promise<EventoPedidos[]> {
    let q = sch().from('eventos_pedidos').select('*').order('creado_en', { ascending: false }).limit(200)
    if (filtro?.salidaId) q = q.eq('salida_id', filtro.salidaId)
    if (filtro?.soloPendientes) q = q.eq('estado', 'PENDIENTE')
    const { data } = await q
    return ((data ?? []) as Fila[]).map((f): EventoPedidos => ({
      id: String(f.id), tipo: f.tipo === 'GUIA_ANULADA' ? 'GUIA_ANULADA' : 'GUIA_EMITIDA', estado: f.estado === 'ENVIADO' ? 'ENVIADO' : 'PENDIENTE', intentos: Number(f.intentos ?? 0),
      ultimoError: s(f.ultimo_error), creadoEn: String(f.creado_en), salidaId: String(f.salida_id), guiaId: String(f.guia_id), payload: (f.payload ?? {}) as Record<string, unknown>,
    }))
  }

  async marcarEventoPedidos(id: string, enviado: boolean, error: string | undefined, _actor: Actor): Promise<ResultadoAccion> {
    const r = await rpc('marcar_evento_pedidos', { p_evento: id, p_enviado: enviado, p_error: error ?? null })
    return r.error ? mal(r.error) : { ok: true }
  }

  async salidasDeRuta(rutaId: string): Promise<string[]> {
    const { data } = await sch().from('ruta_paradas').select('salida_id, secuencia').eq('ruta_id', rutaId).eq('activa', true).order('secuencia')
    return ((data ?? []) as Fila[]).filter((p) => p.salida_id).map((p) => String(p.salida_id))
  }

  /** El formato LS-FR.43.03 toma el N.° de guía de lo registrado. */
  protected override async extrasLsFr(rutaId: string): Promise<ExtrasLsFr> {
    const [base, { data: paradas }] = await Promise.all([super.extrasLsFr(rutaId), sch().from('ruta_paradas').select('pedido_id, salida_id').eq('ruta_id', rutaId).eq('activa', true)])
    const salidas = ((paradas ?? []) as Fila[]).filter((p) => p.salida_id)
    const { data: gs } = await sch().from('guias_remision').select('salida_id, numero').eq('estado', 'VIGENTE').in('salida_id', salidas.length ? salidas.map((p) => String(p.salida_id)) : ['00000000-0000-0000-0000-000000000000'])
    const numero = new Map(((gs ?? []) as Fila[]).map((g) => [String(g.salida_id), String(g.numero)]))
    const guias: Record<string, string> = {}
    for (const p of salidas) { const n = numero.get(String(p.salida_id)); if (n) guias[String(p.pedido_id)] = n }
    return { ...base, guias }
  }

  /** Gancho para S7 y S8: lo que ya pasó con cada salida después de la conformidad (embalada, cargada). */
  protected async avancePorSalida(): Promise<Map<string, { embalada?: boolean; cargada?: boolean; sinEmbalaje?: boolean }>> { return new Map() }

  /** La lista de salidas suma lo de la documentación: la guía vigente y cuántos documentos exigidos faltan. */
  private async conDocumentacion<T extends SalidaResumen>(salidas: T[]): Promise<T[]> {
    if (salidas.length === 0) return salidas
    const [res, gs, extra] = await Promise.all([sch().rpc('documentacion_resumen'), sch().from('guias_remision').select('salida_id, numero').eq('estado', 'VIGENTE'), this.avancePorSalida()])
    const falta = new Map(((res.data ?? []) as Fila[]).map((r) => [String(r.salida_id), Number(r.faltantes)]))
    const guia = new Map(((gs.data ?? []) as Fila[]).map((g) => [String(g.salida_id), String(g.numero)]))
    return salidas.map((x) => {
      const conforme = x.etapa === 'CONFORME'
      const faltantes = conforme ? falta.get(x.id) : undefined
      const numero = guia.get(x.id)
      return { ...x, guia: numero, documentosFaltantes: faltantes, etapa: etapaConAvance(x.etapa, { guia: !!numero, paquete: faltantes === 0, ...extra.get(x.id) }) }
    })
  }

  override async listarSalidas(): Promise<SalidaResumen[]> { return this.conDocumentacion(await super.listarSalidas()) }

  override async obtenerSalida(id: string): Promise<SalidaVista | null> {
    const v = await super.obtenerSalida(id)
    return v ? (await this.conDocumentacion([v]))[0] : null
  }
}
