import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import type {
  Asignacion, DocumentoSustento, EventoAuditoria, Lote, Posicion, Propietario, Regulatorio, Saldo,
} from '@/domain/tipos'
import type { Panorama, ProductoConReg } from '@/domain/panorama'
import { validarEntradaProducto, type EntradaProducto } from '@/domain/productos'
import type { Actor, Repositorio, ResultadoAccion } from '../repositorio'

// PostgREST no embebe entre schemas: cada tabla se lee por separado y se une acá
// (mismo criterio que mapaProductos() en apps/compras). Las lecturas pasan por RLS
// con la sesión de la persona; ningún cliente usa service role.

const PAGINA = 1000

type Fila = Record<string, unknown>

async function traerTodo(
  tabla: string,
  schema: 'wms' | 'catalogo',
  seleccion = '*',
  orden?: string,
): Promise<Fila[]> {
  const supabase = crearClienteServidor()
  const out: Fila[] = []
  for (let desde = 0; ; desde += PAGINA) {
    let q = supabase.schema(schema).from(tabla).select(seleccion)
    if (orden) q = q.order(orden)
    const { data, error } = await q.range(desde, desde + PAGINA - 1)
    if (error) throw new Error(`No se pudo leer ${schema}.${tabla}: ${error.message}`)
    out.push(...((data ?? []) as unknown as Fila[]))
    if (!data || data.length < PAGINA) break
  }
  return out
}

const s = (v: unknown) => (v == null ? undefined : String(v))
const n = (v: unknown) => (v == null ? null : Number(v))

export function mapearPosicion(r: Fila): Posicion {
  return {
    id: String(r.id), codigo: String(r.codigo), rack: String(r.rack), posicion: n(r.posicion), nivel: n(r.nivel),
    subnivel: n(r.subnivel), forma: r.forma as Posicion['forma'], tipoArea: r.tipo_area as Posicion['tipoArea'],
    activa: Boolean(r.activa), porVerificar: Boolean(r.por_verificar), notaVerificacion: s(r.nota_verificacion),
  }
}

export function mapearRegulatorio(r: Fila): Regulatorio {
  return {
    productoId: String(r.producto_id), registroSanitario: s(r.registro_sanitario), rsVence: s(r.rs_vence),
    fabricante: s(r.fabricante), formaPresentacion: s(r.forma_presentacion),
    estadoValidacion: r.estado_validacion as Regulatorio['estadoValidacion'], observacion: s(r.observacion),
    creadoPor: s(r.creado_por), validadoPor: s(r.validado_por), validadoEn: s(r.validado_en),
  }
}

export class RepositorioSupabase implements Repositorio {
  async panorama(): Promise<Panorama> {
    const [props, poss, asigs, docs, prods, regs, lotes, saldos] = await Promise.all([
      traerTodo('propietarios', 'wms'),
      traerTodo('posiciones', 'wms'),
      traerTodo('asignaciones_posicion', 'wms'),
      traerTodo('documentos_sustento', 'wms'),
      traerTodo('productos', 'catalogo', 'id, codigo, descripcion, presentacion, marca, principio_activo, unidad_medida, estado'),
      traerTodo('producto_regulatorio', 'wms'),
      traerTodo('lotes', 'wms'),
      traerTodo('saldos', 'wms'),
    ])
    const regPorProducto = new Map(regs.map((r) => [String(r.producto_id), mapearRegulatorio(r)]))
    const productos: ProductoConReg[] = prods.map((r) => ({
      id: String(r.id), codigo: String(r.codigo), descripcion: String(r.descripcion), presentacion: s(r.presentacion),
      marca: s(r.marca), principioActivo: s(r.principio_activo), unidadMedida: String(r.unidad_medida ?? 'UND'),
      estado: r.estado === 'inactivo' ? 'inactivo' : 'activo', reg: regPorProducto.get(String(r.id)),
    }))
    return {
      hoy: new Date().toISOString().slice(0, 10),
      propietarios: props.map((r): Propietario => ({
        id: String(r.id), codigo: String(r.codigo), razonSocial: String(r.razon_social), ruc: s(r.ruc),
        esDuenoAlmacen: Boolean(r.es_dueno_almacen),
      })),
      posiciones: poss.map(mapearPosicion),
      asignaciones: asigs.map((r): Asignacion => ({
        id: String(r.id), posicionId: String(r.posicion_id), propietarioId: String(r.propietario_id),
        desde: String(r.desde), hasta: s(r.hasta), documentoId: s(r.documento_id),
      })),
      documentos: docs.map((r): DocumentoSustento => ({
        id: String(r.id), codigo: String(r.titulo), tipo: r.tipo as DocumentoSustento['tipo'], titulo: String(r.titulo),
        vigenteDesde: s(r.vigente_desde), archivoRef: s(r.archivo_ref),
        estadoConfirmacion: r.estado_confirmacion as DocumentoSustento['estadoConfirmacion'], nota: s(r.nota),
      })),
      productos,
      lotes: lotes.map((r): Lote => ({
        id: String(r.id), productoId: String(r.producto_id), codigo: String(r.codigo), vence: s(r.vence),
        propietarioId: String(r.propietario_id),
      })),
      saldos: saldos.map((r): Saldo => ({
        posicionId: String(r.posicion_id), productoId: String(r.producto_id), loteId: String(r.lote_id),
        propietarioId: String(r.propietario_id), estado: r.estado as Saldo['estado'],
        procedenciaId: String(r.procedencia_id), cantidad: Number(r.cantidad),
      })),
    }
  }

  async auditoria(limite = 100): Promise<EventoAuditoria[]> {
    const supabase = crearClienteServidor()
    const { data, error } = await supabase.schema('wms').from('audit_events').select('*').order('id', { ascending: false }).limit(limite)
    if (error) throw new Error(`No se pudo leer la auditoría: ${error.message}`)
    return (data ?? []).map((r: Fila) => ({
      id: Number(r.id), ts: String(r.ts), actor: s(r.actor) ?? 'Sistema', evento: String(r.evento), entidad: String(r.entidad),
      entidadId: s(r.entidad_id), motivo: s(r.motivo),
    }))
  }

  async crearProducto(entrada: EntradaProducto, _actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const v = validarEntradaProducto(entrada)
    if (!v.ok) return { ok: false, mensaje: 'Revisa los campos marcados.', errores: v.errores as Record<string, string> }
    const supabase = crearClienteServidor()
    const { data, error } = await supabase.schema('wms').rpc('crear_producto', {
      p_codigo: entrada.codigo, p_descripcion: entrada.descripcion, p_presentacion: entrada.presentacion ?? null,
      p_marca: entrada.marca ?? null, p_principio_activo: entrada.principioActivo ?? null,
      p_unidad_medida: entrada.unidadMedida ?? 'UND', p_registro_sanitario: entrada.registroSanitario ?? null,
      p_rs_vence: v.rsVence ?? null, p_fabricante: entrada.fabricante ?? null,
      p_forma_presentacion: entrada.formaPresentacion ?? null,
    })
    if (error) return { ok: false, mensaje: mensajeHumano(error) }
    return { ok: true, id: String(data) }
  }

  async decidirProducto(
    id: string, decision: 'VALIDADO' | 'OBSERVADO', observacion: string | undefined, _actor: Actor,
  ): Promise<ResultadoAccion> {
    const supabase = crearClienteServidor()
    const { error } = await supabase.schema('wms').rpc('validar_producto', {
      p_producto: id, p_decision: decision, p_observacion: observacion ?? null,
    })
    return error ? { ok: false, mensaje: mensajeHumano(error) } : { ok: true }
  }
}

/** Los mensajes de las funciones SQL ya están en español para personas; el resto, un texto genérico. */
export function mensajeHumano(error: { code?: string; message: string }): string {
  if (error.code === '42501') return error.message || 'No tienes permiso para hacer esto.'
  if (error.code === '23505' || error.code === 'P0001' || error.code === 'P0002') return error.message
  return 'No pudimos guardar el cambio. Intenta de nuevo; si sigue igual, avisa a quien administra el WMS.'
}
