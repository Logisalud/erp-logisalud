import 'server-only'

import type { BultoVista, ContenidoBulto, EmbalajeResumen, EmbalajeVista, PendienteEmbalar, RepartoBulto } from '@/domain/embalaje'
import { ETAPAS_CONFORMES } from '@/domain/despacho'
import { validarReparto } from '@/domain/embalaje'
import type { ExtrasLsFr } from '@/domain/ls-fr-43-03'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioEmbalaje } from '../repositorio-embalaje'
import { crearClienteServidor } from '@logisalud/auth/server'
import { nombresDe } from './entradas-supabase'
import { DocumentacionSupabase } from './documentacion-supabase'
import { mensajeHumano, rpc, s, traerTodo, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás). Está verificado contra el contrato de las funciones SQL de la migración
// 0020 (probada en Postgres local: tests/db/embalaje.test.ts) y por tipos.

const dia = (v: unknown) => String(v).slice(0, 10)
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const sch = () => crearClienteServidor().schema('wms')

export class EmbalajeSupabase extends DocumentacionSupabase implements RepositorioEmbalaje {
  /** Lo confirmado de un pedido, lote por lote. */
  private async pendientes(salidaId: string): Promise<PendienteEmbalar[]> {
    const { data: ordenes } = await sch().from('ordenes_picking').select('id').eq('salida_id', salidaId).neq('estado', 'CANCELADA')
    const ids = ((ordenes ?? []) as Fila[]).map((o) => String(o.id))
    if (!ids.length) return []
    const [{ data: ls }, lotes, prods] = await Promise.all([
      sch().from('ordenes_picking_lineas').select('linea_id, lote_id, producto_id, cantidad').in('orden_id', ids).eq('conformidad', 'CONFORME'),
      traerTodo('lotes', 'wms', 'id, codigo, vence'), traerTodo('productos', 'catalogo', 'id, codigo, descripcion'),
    ])
    const lote = new Map(lotes.map((l) => [String(l.id), l])); const prod = new Map(prods.map((p) => [String(p.id), p]))
    const por = new Map<string, PendienteEmbalar>()
    for (const l of (ls ?? []) as Fila[]) {
      const k = `${l.linea_id}|${l.lote_id}`
      const lt = lote.get(String(l.lote_id)); const p = prod.get(String(l.producto_id))
      const a = por.get(k) ?? { lineaId: String(l.linea_id), productoCodigo: String(p?.codigo ?? ''), producto: String(p?.descripcion ?? ''), loteId: String(l.lote_id), lote: String(lt?.codigo ?? ''), vence: lt?.vence ? dia(lt.vence) : null, cantidad: 0 }
      a.cantidad += Number(l.cantidad); por.set(k, a)
    }
    return [...por.values()].sort((a, b) => a.productoCodigo.localeCompare(b.productoCodigo) || (a.vence ?? '').localeCompare(b.vence ?? '') || a.lote.localeCompare(b.lote))
  }

  private async bultosDe(filtro: { salidaId?: string; codigo?: string }): Promise<BultoVista[]> {
    let q = sch().from('bultos').select('*').order('embalado_en').order('secuencia')
    if (filtro.salidaId) q = q.eq('salida_id', filtro.salidaId)
    if (filtro.codigo) q = q.eq('codigo', filtro.codigo).eq('estado', 'EMBALADO')
    const { data } = await q
    const filas = (data ?? []) as Fila[]
    if (!filas.length) return []
    const [{ data: cs }, lotes, prods, lineas, nombres] = await Promise.all([
      sch().from('bulto_contenido').select('*').in('bulto_id', filas.map((b) => String(b.id))),
      traerTodo('lotes', 'wms', 'id, codigo, vence, producto_id'), traerTodo('productos', 'catalogo', 'id, codigo, descripcion'),
      sch().from('salida_lineas').select('id, producto_id').in('salida_id', [...new Set(filas.map((b) => String(b.salida_id)))]),
      nombresDe(filas.map((b) => String(b.embalado_por))),
    ])
    const lote = new Map(lotes.map((l) => [String(l.id), l])); const prod = new Map(prods.map((p) => [String(p.id), p]))
    const prodDeLinea = new Map(((lineas.data ?? []) as Fila[]).map((l) => [String(l.id), String(l.producto_id)]))
    return filas.map((b) => {
      const contenido: ContenidoBulto[] = ((cs ?? []) as Fila[]).filter((c) => String(c.bulto_id) === String(b.id)).map((c) => {
        const lt = lote.get(String(c.lote_id)); const p = prod.get(prodDeLinea.get(String(c.linea_id)) ?? String(lt?.producto_id))
        return { lineaId: String(c.linea_id), productoCodigo: String(p?.codigo ?? ''), producto: String(p?.descripcion ?? ''), loteId: String(c.lote_id), lote: String(lt?.codigo ?? ''), vence: lt?.vence ? dia(lt.vence) : null, cantidad: Number(c.cantidad) }
      })
      return {
        id: String(b.id), salidaId: String(b.salida_id), codigo: String(b.codigo), secuencia: Number(b.secuencia), total: Number(b.total), estado: b.estado === 'ANULADO' ? 'ANULADO' : 'EMBALADO',
        contenido, unidades: contenido.reduce((t, c) => t + c.cantidad, 0), embaladoPor: nombres.get(String(b.embalado_por)) ?? 'Usuario', embaladoEn: String(b.embalado_en),
        anuladoMotivo: s(b.motivo_anulacion), anuladoEn: b.anulado_en ? String(b.anulado_en) : undefined,
      }
    })
  }

  async colaEmbalaje(): Promise<EmbalajeResumen[]> {
    const [salidas, bultos] = await Promise.all([this.listarSalidas(), sch().from('bultos').select('salida_id').eq('estado', 'EMBALADO')])
    const n = new Map<string, number>()
    for (const b of (bultos.data ?? []) as Fila[]) n.set(String(b.salida_id), (n.get(String(b.salida_id)) ?? 0) + 1)
    return salidas.filter((x) => ETAPAS_CONFORMES.includes(x.etapa)).map((x) => ({ salidaId: x.id, salidaNumero: x.numero, pedidoNumero: x.pedidoNumero, cliente: x.cliente, rutaNumero: x.rutaNumero, unidades: x.unidades, lineas: x.lineas, bultos: n.get(x.id) ?? 0 }))
      .sort((a, b) => a.bultos - b.bultos || a.salidaNumero.localeCompare(b.salidaNumero))
  }

  async embalajeSalida(salidaId: string): Promise<EmbalajeVista | null> {
    const salida = await this.obtenerSalida(salidaId)
    if (!salida) return null
    const [porEmbalar, todos] = await Promise.all([this.pendientes(salidaId), this.bultosDe({ salidaId })])
    const vigentes = todos.filter((b) => b.estado === 'EMBALADO')
    return {
      salidaId, salidaNumero: salida.numero, pedidoNumero: salida.pedidoNumero, cliente: salida.cliente, rutaNumero: salida.rutaNumero, unidades: salida.unidades, lineas: salida.lineas, bultos: vigentes.length,
      conforme: porEmbalar.length > 0 && ETAPAS_CONFORMES.includes(salida.etapa), porEmbalar, bultosVigentes: vigentes, bultosAnulados: todos.filter((b) => b.estado === 'ANULADO'),
    }
  }

  async embalarSalida(salidaId: string, reparto: RepartoBulto[], _actor: Actor): Promise<ResultadoAccion<{ bultos: number }>> {
    const err = validarReparto(await this.pendientes(salidaId), reparto)
    if (err) return { ok: false, mensaje: err }
    const { data, error } = await rpc('embalar_salida', { p_salida: salidaId, p_bultos: reparto.map((b) => ({ contenido: b.contenido.map((c) => ({ linea_id: c.lineaId, lote_id: c.loteId, cantidad: c.cantidad })) })) })
    return error ? mal(error) : { ok: true, bultos: Number(data) }
  }

  async reabrirEmbalaje(salidaId: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('reabrir_embalaje', { p_salida: salidaId, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }

  async bultoPorCodigo(codigo: string): Promise<BultoVista | null> { return (await this.bultosDe({ codigo: codigo.trim().toUpperCase() }))[0] ?? null }

  protected override async avancePorSalida() {
    const m = await super.avancePorSalida()
    const { data } = await sch().from('bultos').select('salida_id').eq('estado', 'EMBALADO')
    for (const b of (data ?? []) as Fila[]) m.set(String(b.salida_id), { ...m.get(String(b.salida_id)), embalada: true })
    return m
  }

  /** La columna «N.° cajas» del LS-FR.43.03 muestra los bultos del pedido. */
  protected override async extrasLsFr(rutaId: string): Promise<ExtrasLsFr> {
    const [base, { data: paradas }] = await Promise.all([super.extrasLsFr(rutaId), sch().from('ruta_paradas').select('pedido_id, salida_id').eq('ruta_id', rutaId).eq('activa', true)])
    const ps = ((paradas ?? []) as Fila[]).filter((p) => p.salida_id)
    const { data: bs } = await sch().from('bultos').select('salida_id').eq('estado', 'EMBALADO').in('salida_id', ps.length ? ps.map((p) => String(p.salida_id)) : ['00000000-0000-0000-0000-000000000000'])
    const n = new Map<string, number>()
    for (const b of (bs ?? []) as Fila[]) n.set(String(b.salida_id), (n.get(String(b.salida_id)) ?? 0) + 1)
    const cajas: Record<string, number> = {}
    for (const p of ps) { const c = n.get(String(p.salida_id)); if (c) cajas[String(p.pedido_id)] = c }
    return { ...base, cajas }
  }
}
