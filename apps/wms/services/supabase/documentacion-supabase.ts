import 'server-only'

import {
  faltantesDelPaquete, paqueteDeItemsCompleto, validarNumeroGre, normalizarNumeroGre,
  type GuiaVista, type ItemPaquete, type LineaGuia, type PaqueteSalida,
} from '@/domain/documentacion'
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

  async registrarGre(salidaId: string, numero: string, nota: string | undefined, _actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const bloqueo = validarNumeroGre(numero)
    if (bloqueo) return { ok: false, mensaje: bloqueo, errores: { numero: bloqueo } }
    const { data, error } = await rpc('registrar_gre', { p_salida: salidaId, p_numero: normalizarNumeroGre(numero), p_nota: nota?.trim() || null })
    return error ? mal(error) : { ok: true, id: String(data) }
  }

  async anularGre(guiaId: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('anular_gre', { p_guia: guiaId, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
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

  /** La lista de salidas suma lo de la documentación: la guía vigente y cuántos documentos exigidos faltan. */
  private async conDocumentacion<T extends SalidaResumen>(salidas: T[]): Promise<T[]> {
    if (salidas.length === 0) return salidas
    const [res, gs] = await Promise.all([sch().rpc('documentacion_resumen'), sch().from('guias_remision').select('salida_id, numero').eq('estado', 'VIGENTE')])
    const falta = new Map(((res.data ?? []) as Fila[]).map((r) => [String(r.salida_id), Number(r.faltantes)]))
    const guia = new Map(((gs.data ?? []) as Fila[]).map((g) => [String(g.salida_id), String(g.numero)]))
    return salidas.map((x) => {
      const conforme = x.etapa === 'CONFORME'
      const faltantes = conforme || x.etapa === 'DOCUMENTACION_COMPLETA' ? falta.get(x.id) : undefined
      const numero = guia.get(x.id)
      return { ...x, guia: numero, documentosFaltantes: faltantes, etapa: etapaConAvance(x.etapa, { guia: !!numero, paquete: faltantes === 0 }) }
    })
  }

  override async listarSalidas(): Promise<SalidaResumen[]> { return this.conDocumentacion(await super.listarSalidas()) }

  override async obtenerSalida(id: string): Promise<SalidaVista | null> {
    const v = await super.obtenerSalida(id)
    return v ? (await this.conDocumentacion([v]))[0] : null
  }
}
