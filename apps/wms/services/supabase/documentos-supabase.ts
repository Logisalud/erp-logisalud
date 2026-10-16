import 'server-only'

import {
  estadoDocumento, relacionarCoa, resumirDocumentos,
  type ArchivoCarga, type CandidatoCoa, type DocumentoVista, type EntradaSubida, type EstadoItemCoa, type ItemCoaVista, type LoteParaRelacionar, type OpcionAlcance,
  type PanoramaDocumentos, type PerfilDocumental, type RequisitoDocumental, type ResumenCargaCoa, type TipoDocumento,
} from '@/domain/documentos'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioDocumentos } from '../repositorio-documentos'
import { crearClienteServidor } from '@logisalud/auth/server'
import { nombresDe } from './entradas-supabase'
import { PickingSupabase } from './picking-supabase'
import { mensajeHumano, rpc, s, traerTodo, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás) y NO TOCA Storage: el archivo ya está subido y aquí solo se registra su
// referencia. Está verificado contra el contrato de las funciones SQL de la migración 0016 (probada en Postgres local) y por tipos.

const dia = (v: unknown) => String(v).slice(0, 10)
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const sch = () => crearClienteServidor().schema('wms')

export class DocumentosSupabase extends PickingSupabase implements RepositorioDocumentos {
  private async lotesParaRelacionar(): Promise<LoteParaRelacionar[]> {
    const [lotes, prods] = await Promise.all([traerTodo('lotes', 'wms', 'id, codigo, producto_id'), traerTodo('productos', 'catalogo', 'id, codigo, descripcion')])
    const p = new Map(prods.map((x) => [String(x.id), x]))
    return lotes.map((l) => ({
      id: String(l.id), codigo: String(l.codigo), productoId: String(l.producto_id),
      productoCodigo: String(p.get(String(l.producto_id))?.codigo ?? ''), productoDescripcion: String(p.get(String(l.producto_id))?.descripcion ?? ''),
    }))
  }

  async panoramaDocumentos(): Promise<PanoramaDocumentos> {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const [docs, lotes, prods, fabs, perfiles, items, sinCoa] = await Promise.all([
      traerTodo('documentos_regulatorios', 'wms', '*', ['subido_en']), traerTodo('lotes', 'wms', 'id, codigo, producto_id'), traerTodo('productos', 'catalogo', 'id, codigo, descripcion'),
      traerTodo('fabricantes', 'wms', 'id, nombre', ['nombre']), traerTodo('perfil_documental_cliente', 'wms', '*', ['ruc']),
      sch().from('cargas_coa_items').select('*').neq('estado', 'IMPORTADO').order('id', { ascending: false }).limit(300),
      sch().rpc('lotes_sin_coa'),
    ])
    const lote = new Map(lotes.map((l) => [String(l.id), l])); const prod = new Map(prods.map((p) => [String(p.id), p])); const fab = new Map(fabs.map((f) => [String(f.id), f]))
    const nombres = await nombresDe(docs.map((d) => s(d.subido_por)))
    const reemplazos = new Map(docs.filter((d) => d.reemplaza_a).map((d) => [String(d.reemplaza_a), String(d.id)]))
    const alcanceDe = (d: Fila): { id: string; etiqueta: string } => {
      if (d.tipo === 'COA') { const l = lote.get(String(d.lote_id)); return { id: String(d.lote_id), etiqueta: `${l?.codigo ?? '?'} · ${prod.get(String(l?.producto_id))?.descripcion ?? ''}` } }
      if (d.tipo === 'REGISTRO_SANITARIO') { const p = prod.get(String(d.producto_id)); return { id: String(d.producto_id), etiqueta: `${p?.codigo ?? '?'} · ${p?.descripcion ?? ''}` } }
      return { id: String(d.fabricante_id), etiqueta: String(fab.get(String(d.fabricante_id))?.nombre ?? '?') }
    }
    const documentos: DocumentoVista[] = docs.map((d) => {
      const a = alcanceDe(d)
      const base = {
        id: String(d.id), tipo: d.tipo as TipoDocumento, alcanceId: a.id, alcance: a.etiqueta, nombreArchivo: String(d.nombre_archivo), archivoRef: String(d.archivo_ref), hash: String(d.hash_sha256),
        bytes: Number(d.tamano_bytes), vigenteDesde: dia(d.vigente_desde), vigenteHasta: d.vigente_hasta ? dia(d.vigente_hasta) : undefined, subidoPor: String(d.subido_por), subidoEn: String(d.subido_en),
        reemplazaA: s(d.reemplaza_a), motivoReemplazo: s(d.motivo_reemplazo),
      }
      return { ...base, estado: estadoDocumento(base, hoy, reemplazos.has(base.id)), reemplazadoPor: reemplazos.get(base.id), subidoPorNombre: nombres.get(base.subidoPor) ?? 'Usuario' }
    })
    const itemsVista: ItemCoaVista[] = ((items.data ?? []) as Fila[]).map((i) => ({
      id: String(i.id), nombreArchivo: String(i.nombre_archivo), estado: i.estado as EstadoItemCoa, loteId: s(i.lote_id), motivo: s(i.motivo),
      candidatos: (Array.isArray(i.candidatos) ? i.candidatos : []) as CandidatoCoa[], cargadoEn: new Date().toISOString(),
    }))
    const lotesSinCoa = ((sinCoa.data ?? []) as Fila[]).map((r) => ({
      loteId: String(r.lote_id), lote: String(r.lote), productoId: String(r.producto_id), producto: `${r.producto_codigo} · ${r.producto}`, unidades: Number(r.unidades), vence: r.vence ? dia(r.vence) : undefined,
    }))
    return {
      hoy, documentos, fabricantes: fabs.map((f) => ({ id: String(f.id), nombre: String(f.nombre) })),
      perfiles: perfiles.map((p): PerfilDocumental => ({ ruc: String(p.ruc), exigeCoa: Boolean(p.exige_coa), exigeRegistroSanitario: Boolean(p.exige_registro_sanitario), exigeBpm: Boolean(p.exige_bpm), copias: Number(p.copias), nota: s(p.nota) })),
      lotesSinCoa, itemsCoa: itemsVista, resumen: resumirDocumentos(documentos, lotesSinCoa.length, itemsVista.filter((i) => i.estado === 'POR_REVISAR').length),
    }
  }

  async buscarAlcanceDocumento(tipo: TipoDocumento, consulta: string): Promise<OpcionAlcance[]> {
    const q = consulta.trim().replace(/[%,()]/g, ' ')
    const sb = crearClienteServidor()
    if (tipo === 'BPM') {
      let c = sb.schema('wms').from('fabricantes').select('id, nombre').eq('activo', true).order('nombre').limit(12)
      if (q) c = c.ilike('nombre', `%${q}%`)
      const { data } = await c
      return ((data ?? []) as Fila[]).map((f) => ({ id: String(f.id), etiqueta: String(f.nombre) }))
    }
    if (tipo === 'REGISTRO_SANITARIO') {
      let c = sb.schema('catalogo').from('productos').select('id, codigo, descripcion').order('codigo').limit(12)
      if (q) c = c.or(`codigo.ilike.%${q}%,descripcion.ilike.%${q}%`)
      const { data } = await c
      return ((data ?? []) as Fila[]).map((p) => ({ id: String(p.id), etiqueta: String(p.descripcion), detalle: String(p.codigo) }))
    }
    let c = sb.schema('wms').from('lotes').select('id, codigo, producto_id').order('codigo').limit(12)
    if (q) c = c.ilike('codigo', `%${q}%`)
    const { data } = await c
    const lotes = (data ?? []) as Fila[]
    const { data: ps } = await sb.schema('catalogo').from('productos').select('id, descripcion').in('id', lotes.map((l) => String(l.producto_id)))
    const nombre = new Map(((ps ?? []) as Fila[]).map((p) => [String(p.id), String(p.descripcion)]))
    return lotes.map((l) => ({ id: String(l.id), etiqueta: String(l.codigo), detalle: nombre.get(String(l.producto_id)) }))
  }

  async subirDocumento(e: EntradaSubida, _actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const { data, error } = await rpc('subir_documento_regulatorio', {
      p_tipo: e.tipo, p_alcance: e.alcanceId, p_nombre_archivo: e.nombreArchivo, p_archivo_ref: e.archivoRef, p_hash: e.hash, p_bytes: e.bytes,
      p_desde: e.vigenteDesde ?? null, p_hasta: e.vigenteHasta ?? null, p_reemplaza: e.reemplazaA ?? null, p_motivo: e.motivo ?? null,
    })
    return error ? mal(error) : { ok: true, id: String(data) }
  }

  async crearFabricante(nombre: string, _actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const { data, error } = await rpc('crear_fabricante', { p_nombre: nombre })
    return error ? mal(error) : { ok: true, id: String(data) }
  }

  async guardarPerfilDocumental(p: PerfilDocumental, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('guardar_perfil_documental', { p_ruc: p.ruc, p_exige_coa: p.exigeCoa, p_exige_rs: p.exigeRegistroSanitario, p_exige_bpm: p.exigeBpm, p_copias: p.copias, p_nota: p.nota ?? null })
    return error ? mal(error) : { ok: true }
  }

  async requisitosDocumentales(loteId: string, ruc?: string, entrega?: string): Promise<RequisitoDocumental[]> {
    const { data, error } = await rpc('estado_documental', { p_lote: loteId, p_ruc: ruc ?? null, p_entrega: entrega ?? null })
    if (error) throw new Error(mensajeHumano(error))
    return ((data ?? []) as Fila[]).map((r) => ({
      tipo: r.tipo as TipoDocumento, exigido: Boolean(r.exigido), estado: r.estado as RequisitoDocumental['estado'], documentoId: s(r.documento_id), nombreArchivo: s(r.nombre_archivo),
      vigenteHasta: r.vigente_hasta ? dia(r.vigente_hasta) : undefined,
    }))
  }

  async cargarCoaEnBloque(archivos: ArchivoCarga[], _actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenCargaCoa }>> {
    if (archivos.length === 0) return { ok: false, mensaje: 'No hay archivos para cargar' }
    const lotes = await this.lotesParaRelacionar()
    const items = archivos.map((a) => {
      const r = relacionarCoa(a.nombre, lotes)
      return { nombre: a.nombre, ref: a.ref, hash: a.hash, bytes: a.bytes, lote_id: r.estado === 'RELACIONADO' ? r.loteId : null, motivo: r.estado === 'POR_REVISAR' ? r.motivo : null,
        candidatos: r.candidatos.map((c) => ({ lote_id: c.loteId, lote: c.lote, producto: c.producto })) }
    })
    const { data, error } = await rpc('registrar_carga_coa', { p_items: items })
    if (error) return mal(error)
    const d = data as { total: number; importados: number; por_revisar: number; duplicados: number }
    return { ok: true, resumen: { total: d.total, importados: d.importados, porRevisar: d.por_revisar, duplicados: d.duplicados } }
  }

  async asignarItemCoa(itemId: string, loteId: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('asignar_item_coa', { p_item: itemId, p_lote: loteId })
    return error ? mal(error) : { ok: true }
  }

  async descartarItemCoa(itemId: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('descartar_item_coa', { p_item: itemId, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }

  async reintentarItemsCoa(actor: Actor): Promise<ResultadoAccion<{ asignados: number }>> {
    const { data } = await sch().from('cargas_coa_items').select('id, nombre_archivo').eq('estado', 'POR_REVISAR').limit(500)
    const lotes = await this.lotesParaRelacionar()
    let n = 0
    for (const it of (data ?? []) as Fila[]) {
      const r = relacionarCoa(String(it.nombre_archivo), lotes)
      if (r.estado === 'RELACIONADO') { const x = await this.asignarItemCoa(String(it.id), r.loteId, actor); if (x.ok) n++ }
    }
    return { ok: true, asignados: n }
  }
}
