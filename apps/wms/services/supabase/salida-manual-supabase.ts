import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import { puedePrepararSalidas } from '@/domain/despacho'
import { buscarProductosPorCodigos, partirPorMotivo, type CodigoProducto, type EntradaOrdenManual, type LoteParaSalida, type ProductoHallado, type TipoCodigoProducto } from '@/domain/salida-manual'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { OrdenCreada, OrdenDelPedido, RepositorioSalidaManual, ResumenOrdenesPendientes } from '../repositorio-salida-manual'
import { LiberacionSupabase } from './liberacion-supabase'
import { mensajeHumano, rpc, s, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás). Está verificado contra el contrato de las funciones SQL de la migración 0028 (probadas en
// Postgres local: tests/db/salida-manual.test.ts) y por tipos. Las reglas las aplica la base de datos con la sesión de la persona.

const sch = () => crearClienteServidor().schema('wms')
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const dia = (v: unknown) => (v == null ? null : String(v).slice(0, 10))
/** El texto que se busca, sin los caracteres que PostgREST entiende como parte del filtro. */
const patron = (q: string) => `%${q.trim().replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ')}%`

export class SalidaManualSupabase extends LiberacionSupabase implements RepositorioSalidaManual {
  async buscarProductosParaSalida(consulta: string, propietarioId?: string): Promise<ProductoHallado[]> {
    const q = consulta.trim()
    if (q.length < 2) return []
    const like = patron(q)
    const cat = () => crearClienteServidor().schema('catalogo')
    const [porNombre, porCodigo] = await Promise.all([
      cat().from('productos').select('id, codigo, descripcion, presentacion, principio_activo, estado').or(`codigo.ilike.${like},descripcion.ilike.${like},principio_activo.ilike.${like}`).limit(40),
      sch().from('producto_codigos').select('producto_id, tipo, codigo, propietario_id').ilike('codigo', like).limit(40),
    ])
    if (porNombre.error) throw new Error(`No se pudo buscar el producto: ${porNombre.error.message}`)
    if (porCodigo.error) throw new Error(`No se pudo buscar el código: ${porCodigo.error.message}`)
    const codigos = ((porCodigo.data ?? []) as Fila[]).map((f): CodigoProducto => ({ productoId: String(f.producto_id), tipo: String(f.tipo) as TipoCodigoProducto, codigo: String(f.codigo), propietarioId: s(f.propietario_id) }))
    const productos = new Map(((porNombre.data ?? []) as Fila[]).map((f) => [String(f.id), f]))
    const faltan = [...new Set(codigos.map((c) => c.productoId))].filter((id) => !productos.has(id))
    if (faltan.length) {
      const { data } = await cat().from('productos').select('id, codigo, descripcion, presentacion, principio_activo, estado').in('id', faltan)
      for (const f of (data ?? []) as Fila[]) productos.set(String(f.id), f)
    }
    return buscarProductosPorCodigos(
      [...productos.values()].map((f) => ({ id: String(f.id), codigo: String(f.codigo), descripcion: String(f.descripcion), presentacion: s(f.presentacion), principioActivo: s(f.principio_activo), estado: s(f.estado) })),
      codigos, q, propietarioId,
    )
  }

  /** Arma los lotes con lo que tienen para sacar (Aprobado), lo que ya está en Bajas y si están en Reserva. */
  private async armarLotes(filas: Fila[]): Promise<LoteParaSalida[]> {
    if (filas.length === 0) return []
    const propietarios = new Map<string, string>()
    const { data: props } = await sch().from('propietarios').select('id, razon_social')
    for (const p of (props ?? []) as Fila[]) propietarios.set(String(p.id), String(p.razon_social))
    const pares = [...new Set(filas.map((f) => `${f.propietario_id}|${f.producto_id}`))]
    const disponibles = new Map<string, number>()
    await Promise.all(pares.map(async (par) => {
      const [prop, prod] = par.split('|')
      const { data, error } = await rpc('disponibilidad_por_lote', { p_propietario: prop, p_producto: prod })
      if (error) throw new Error(mensajeHumano(error))
      for (const d of (data ?? []) as Fila[]) disponibles.set(String(d.lote_id), Number(d.disponible))
    }))
    const bajas = new Map<string, number>()
    for (const prop of new Set(filas.map((f) => String(f.propietario_id)))) {
      for (const b of await this.stockEnBajas(prop)) if (b.enAreaBajas) bajas.set(b.loteId, (bajas.get(b.loteId) ?? 0) + b.cantidad)
    }
    const ids = filas.map((f) => String(f.id))
    const { data: res } = await sch().from('reservas_lote').select('lote_id').in('lote_id', ids).is('quitada_en', null)
    const enReserva = new Set(((res ?? []) as Fila[]).map((r) => String(r.lote_id)))
    return filas.map((f): LoteParaSalida => ({
      loteId: String(f.id), codigo: String(f.codigo), productoId: String(f.producto_id), propietarioId: String(f.propietario_id), propietario: propietarios.get(String(f.propietario_id)) ?? '',
      vence: dia(f.vence), disponibleAprobado: Math.max(disponibles.get(String(f.id)) ?? 0, 0), enBajas: bajas.get(String(f.id)) ?? 0, enReserva: enReserva.has(String(f.id)),
    }))
  }

  async lotesParaSalida(propietarioId: string, productoId: string): Promise<LoteParaSalida[]> {
    const { data, error } = await sch().from('lotes').select('id, codigo, vence, producto_id, propietario_id').eq('propietario_id', propietarioId).eq('producto_id', productoId)
    if (error) throw new Error(`No se pudieron leer los lotes: ${error.message}`)
    return this.armarLotes((data ?? []) as Fila[])
  }

  async lotesPorCodigo(codigo: string, _productoId: string): Promise<LoteParaSalida[]> {
    const c = codigo.trim()
    if (!c) return []
    const { data, error } = await sch().from('lotes').select('id, codigo, vence, producto_id, propietario_id').ilike('codigo', c.replace(/[%_\\]/g, (x) => `\\${x}`)).limit(50)
    if (error) throw new Error(`No se pudieron leer los lotes: ${error.message}`)
    return this.armarLotes((data ?? []) as Fila[])
  }

  async ordenDelPedido(numeroPedido: string): Promise<OrdenDelPedido | null> {
    if (!numeroPedido.trim()) return null
    const { data, error } = await rpc('orden_del_pedido', { p_numero: numeroPedido })
    if (error) throw new Error(mensajeHumano(error))
    const r = data as { tipo?: string; id?: string; numero?: string; estado?: string; pedido_numero?: string } | null
    if (!r) return null
    return r.tipo === 'ORDEN' ? { tipo: 'ORDEN', id: String(r.id), numero: String(r.numero), estado: r.estado as 'ABIERTA' | 'CONFIRMADA' } : { tipo: 'EN_BANDEJA', pedidoNumero: String(r.pedido_numero) }
  }

  async crearOrdenManual(entrada: EntradaOrdenManual, _actor: Actor): Promise<ResultadoAccion<{ ordenes: OrdenCreada[] }>> {
    const grupos = entrada.clase === 'B' ? partirPorMotivo(entrada.lineas) : [{ motivo: entrada.motivo, lineas: entrada.lineas }]
    if (grupos.length === 0) return { ok: false, mensaje: 'Agrega al menos una línea', errores: { lineas: 'Agrega al menos una línea.' } }
    const creadas: OrdenCreada[] = []
    for (const g of grupos) {
      const { data, error } = await rpc('crear_orden_salida_manual', {
        p_clase: entrada.clase, p_motivo: g.motivo ?? null, p_propietario: entrada.propietarioId ?? null,
        p_lineas: g.lineas.map((l) => ({ producto_id: l.productoId, cantidad: l.cantidad, lote_id: l.loteId ?? null })),
        p_pedido_numero: entrada.pedidoNumero?.trim() || null,
        p_cliente: entrada.cliente ? { ruc: entrada.cliente.ruc.trim(), razon_social: entrada.cliente.razonSocial.trim(), direccion: entrada.cliente.direccion.trim(), ubigeo: entrada.cliente.ubigeo.trim(), vendedor: entrada.cliente.vendedor?.trim() || null } : null,
        p_gre_numero: entrada.greNumero?.trim() || null, p_gre_archivo: entrada.greArchivo ?? null,
        p_token: entrada.token ? (grupos.length > 1 ? `${entrada.token}:${g.motivo}` : entrada.token) : null,
      })
      if (error) {
        const aviso = creadas.length ? ` (La orden ${creadas.map((c) => c.numero).join(', ')} ya se creó: no la repitas)` : ''
        return { ok: false, mensaje: `${mensajeHumano(error)}${aviso}` }
      }
      const id = String(data)
      const { data: fila } = await sch().from('salidas').select('numero, motivo').eq('id', id).maybeSingle()
      creadas.push({ id, numero: String((fila as Fila | null)?.numero ?? ''), motivo: (s((fila as Fila | null)?.motivo) ?? g.motivo) as OrdenCreada['motivo'] })
    }
    return { ok: true, ordenes: creadas }
  }

  async crearOrdenDePedido(pedidoId: string, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string; yaExistia: boolean; faltaStock: boolean }>> {
    if (!puedePrepararSalidas(actor.roles)) return { ok: false, mensaje: 'No tienes permiso para crear órdenes de salida' }
    const { data, error } = await rpc('crear_orden_de_pedido', { p_pedido_id: pedidoId })
    if (error) return mal(error)
    const r = data as { salida_id: string; numero: string; ya_existia: boolean; falta_stock: boolean }
    return { ok: true, id: String(r.salida_id), numero: String(r.numero), yaExistia: Boolean(r.ya_existia), faltaStock: Boolean(r.falta_stock) }
  }

  async crearOrdenesPendientes(actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenOrdenesPendientes }>> {
    if (!puedePrepararSalidas(actor.roles)) return { ok: false, mensaje: 'No tienes permiso para crear órdenes de salida' }
    const { data, error } = await rpc('crear_ordenes_pendientes', {})
    if (error) return mal(error)
    const r = data as { creadas: number; unidas: number; con_falta_stock: number; errores: { pedido: string; motivo: string }[]; ordenes: { pedido: string; orden: string; falta_stock: boolean; unida: boolean }[] }
    return {
      ok: true,
      resumen: {
        creadas: r.creadas, unidas: r.unidas, conFaltaStock: r.con_falta_stock, errores: r.errores ?? [],
        ordenes: (r.ordenes ?? []).map((o) => ({ pedido: o.pedido, orden: o.orden, faltaStock: o.falta_stock, unida: o.unida })),
      },
    }
  }

  async cancelarOrden(salidaId: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    if (!motivo.trim()) return { ok: false, mensaje: 'La cancelación necesita un motivo', errores: { motivo: 'Escribe el motivo.' } }
    const { error } = await rpc('cancelar_orden_salida', { p_salida: salidaId, p_motivo: motivo.trim() })
    return error ? mal(error) : { ok: true }
  }
}
