import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import type {
  Asignacion, CambioRegulatorio, CampoRegulatorio, DocumentoSustento, EventoAuditoria, Lote, Posicion, Propietario, Regulatorio, Saldo,
} from '@/domain/tipos'
import type { Panorama, ProductoConReg } from '@/domain/panorama'
import { validarEdicionRegulatoria, validarEntradaProducto, validarMotivoRegulatorio, type DatosRegulatorios, type EntradaProducto } from '@/domain/productos'
import type { Actor, Repositorio, ResultadoAccion } from '../repositorio'
import { mensajeHumano, n, s, traerTodo, type Fila } from './util'
import { InventarioSupabase } from './inventario-supabase'

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
    formaPresentacion: s(r.forma_presentacion), concentracion: s(r.concentracion), fabricante: s(r.fabricante),
    condicionAlmacenamiento: s(r.condicion_almacenamiento), creadoPor: s(r.creado_por),
  }
}

export class RepositorioSupabase extends InventarioSupabase implements Repositorio {
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
      p_forma_presentacion: entrada.formaPresentacion ?? null, p_concentracion: entrada.concentracion ?? null,
      p_condicion_almacenamiento: entrada.condicionAlmacenamiento ?? null,
    })
    if (error) return { ok: false, mensaje: mensajeHumano(error) }
    return { ok: true, id: String(data) }
  }

  async editarRegulatorio(id: string, datos: DatosRegulatorios, motivo: string, _actor: Actor): Promise<ResultadoAccion<{ cambios: number }>> {
    const errMotivo = validarMotivoRegulatorio(motivo)
    if (errMotivo) return { ok: false, mensaje: errMotivo, errores: { motivo: errMotivo } }
    const supabase = crearClienteServidor()
    const { data: act } = await supabase.schema('wms').from('producto_regulatorio').select('registro_sanitario, rs_vence').eq('producto_id', id).maybeSingle()
    const v = validarEdicionRegulatoria(datos, act ? { registroSanitario: s(act.registro_sanitario), rsVence: s(act.rs_vence) } : undefined)
    if (!v.ok) return { ok: false, mensaje: 'Revisa los campos marcados.', errores: v.errores as Record<string, string> }
    const columnas: Record<keyof DatosRegulatorios, string> = {
      registroSanitario: 'registro_sanitario', rsVence: 'rs_vence', formaPresentacion: 'forma_presentacion',
      concentracion: 'concentracion', fabricante: 'fabricante', condicionAlmacenamiento: 'condicion_almacenamiento',
    }
    const json: Record<string, string> = {}
    for (const [k, col] of Object.entries(columnas)) {
      const x = v.datos[k as keyof DatosRegulatorios]
      if (x !== undefined) json[col] = x
    }
    const { data, error } = await supabase.schema('wms').rpc('editar_regulatorio', { p_producto: id, p_datos: json, p_motivo: motivo })
    return error ? { ok: false, mensaje: mensajeHumano(error) } : { ok: true, cambios: Number(data ?? 0) }
  }

  async historialRegulatorio(id: string): Promise<CambioRegulatorio[]> {
    const supabase = crearClienteServidor()
    const { data, error } = await supabase.schema('wms').from('producto_regulatorio_cambios').select('*').eq('producto_id', id).order('id', { ascending: false })
    if (error) throw new Error(`No se pudo leer el historial: ${error.message}`)
    const ids = [...new Set((data ?? []).map((r: Fila) => String(r.usuario)))]
    const nombres = new Map<string, string>()
    if (ids.length) {
      const { data: perfiles } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
      for (const r of (perfiles ?? []) as Fila[]) nombres.set(String(r.id), String(r.nombre ?? r.id))
    }
    return (data ?? []).map((r: Fila) => ({
      id: String(r.id), productoId: String(r.producto_id), campo: r.campo as CampoRegulatorio, antes: s(r.antes), despues: s(r.despues),
      usuario: nombres.get(String(r.usuario)) ?? 'Usuario', ts: String(r.ts), motivo: String(r.motivo),
    }))
  }
}
