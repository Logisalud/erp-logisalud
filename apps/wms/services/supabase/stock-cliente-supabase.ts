import 'server-only'

import type { FilaKardex } from '@/domain/inventario'
import { estadoDeEnlace, tramosDe, type EnlaceStockVista, type FiltroKardexCliente, type KardexProducto, type LoteStock, type ProductoStock, type RespuestaKardexCliente, type RespuestaStockCliente } from '@/domain/stock-cliente'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioStockCliente } from '../repositorio-stock-cliente'
import { InspeccionesSupabase } from './inspecciones-supabase'
import { mensajeHumano, num, rpc, s, traerTodo, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL. Verificado contra el contrato de las funciones de la migración 0067 (probadas en Postgres local, tests/db/stock-cliente.test.ts) y por tipos.
// La consulta pública corre SIN sesión (rol `anon`): solo puede llamar a `stock_cliente_por_token` y `kardex_cliente_por_token`; no hay service role.

const noOk = (r: Fila): RespuestaStockCliente & RespuestaKardexCliente | null => {
  switch (String(r.estado)) {
    case 'NO_ENCONTRADO': return { estado: 'NO_ENCONTRADO' }
    case 'NO_DISPONIBLE': return { estado: 'NO_DISPONIBLE' }
    case 'ESPERA': return { estado: 'ESPERA', esperaSegundos: Number(r.espera_segundos ?? 60) }
    case 'OK': return null
    default: return { estado: 'ERROR' }
  }
}

const lote = (l: Fila): LoteStock => ({
  loteId: String(l.lote_id), lote: String(l.lote), vence: s(l.vence), dias: num(l.dias), vencido: Boolean(l.vencido),
  stock: Number(l.stock), disponible: Number(l.disponible), enRevision: Number(l.en_revision),
})
const producto = (p: Fila): ProductoStock => ({
  productoId: String(p.producto_id), codigo: String(p.codigo), codigoCliente: s(p.codigo_cliente), descripcion: String(p.descripcion), presentacion: s(p.presentacion),
  stock: Number(p.stock), disponible: Number(p.disponible), enRevision: Number(p.en_revision), vencido: Number(p.vencido), lotes: ((p.lotes ?? []) as Fila[]).map(lote),
})
const filaKardex = (r: Fila): FilaKardex => ({
  orden: Number(r.orden), esSaldoInicial: Boolean(r.es_saldo_inicial), fecha: s(r.fecha), tipoDocumento: String(r.tipo_documento), numeroActa: s(r.numero_acta), fechaActa: s(r.fecha_acta),
  lote: s(r.lote), contraparte: s(r.contraparte), ruc: s(r.ruc), tipoDocRef: s(r.tipo_doc_ref), numeroDocRef: s(r.numero_doc_ref), entrada: num(r.entrada), salida: num(r.salida),
  saldo: Number(r.saldo), tipoIngreso: s(r.tipo_ingreso), propietario: s(r.propietario), esReversa: Boolean(r.es_reversa),
})

export class StockClienteSupabase extends InspeccionesSupabase implements RepositorioStockCliente {
  async consultarStockCliente(token: string, ip: string): Promise<RespuestaStockCliente> {
    try {
      const { data, error } = await rpc('stock_cliente_por_token', { p_token: token, p_ip: ip })
      if (error) return { estado: 'ERROR' }
      const r = (data ?? {}) as Fila
      const otro = noOk(r)
      if (otro) return otro as RespuestaStockCliente
      const c = (r.cliente ?? {}) as Fila
      return { estado: 'OK', cliente: { codigo: String(c.codigo), nombre: String(c.nombre) }, hoy: String(r.hoy), actualizadoEn: String(r.actualizado_en), tramos: tramosDe(s(r.tramos)), productos: ((r.productos ?? []) as Fila[]).map(producto) }
    } catch { return { estado: 'ERROR' } }
  }

  async consultarKardexCliente(token: string, f: FiltroKardexCliente, ip: string): Promise<RespuestaKardexCliente> {
    try {
      const { data, error } = await rpc('kardex_cliente_por_token', { p_token: token, p_producto: f.productoId ?? null, p_desde: f.desde ?? null, p_hasta: f.hasta ?? null, p_ip: ip })
      if (error) return { estado: 'ERROR' }
      const r = (data ?? {}) as Fila
      const otro = noOk(r)
      if (otro) return otro as RespuestaKardexCliente
      const c = (r.cliente ?? {}) as Fila
      return { estado: 'OK', cliente: { codigo: String(c.codigo), nombre: String(c.nombre) }, hoy: String(r.hoy), formato: String(r.formato ?? ''), productos: ((r.productos ?? []) as Fila[]).map((p): KardexProducto => ({ productoId: String(p.producto_id), codigo: String(p.codigo), descripcion: String(p.descripcion), filas: ((p.filas ?? []) as Fila[]).map(filaKardex) })) }
    } catch { return { estado: 'ERROR' } }
  }

  async crearEnlaceStockCliente(propietarioId: string, dias: number, etiqueta: string | undefined, _a: Actor): Promise<ResultadoAccion<{ token: string; venceEn: string }>> {
    const { data, error } = await rpc('crear_enlace_stock_cliente', { p_propietario: propietarioId, p_dias: dias, p_etiqueta: etiqueta?.trim() || null })
    if (error) return { ok: false, mensaje: mensajeHumano(error) }
    const r = (data ?? {}) as Fila
    return { ok: true, token: String(r.token), venceEn: String(r.vence_en) }
  }

  async revocarEnlaceStockCliente(enlaceId: string, _a: Actor): Promise<ResultadoAccion<{ revocado: boolean }>> {
    const { data, error } = await rpc('revocar_enlace_stock_cliente', { p_enlace: enlaceId })
    return error ? { ok: false, mensaje: mensajeHumano(error) } : { ok: true, revocado: Boolean(data) }
  }

  async listarEnlacesStockCliente(): Promise<EnlaceStockVista[]> {
    const filas = await traerTodo('enlaces_stock_cliente', 'wms', 'id, propietario_id, etiqueta, creado_en, vence_en, revocado_en, ultima_vista_en', ['creado_en'])
    return filas.map((f) => {
      const base = { venceEn: String(f.vence_en), revocadoEn: s(f.revocado_en) }
      return { id: String(f.id), propietarioId: String(f.propietario_id), etiqueta: s(f.etiqueta), creadoEn: String(f.creado_en), ...base, ultimaVistaEn: s(f.ultima_vista_en), estado: estadoDeEnlace(base) }
    }).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
  }
}
