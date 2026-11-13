// Stock del cliente en la demostración (memoria): mismas reglas que la migración 0067 (`stock_cliente_por_token`, `kardex_cliente_por_token`, enlaces que solo guardan su hash,
// límite de intentos, solo clientes que guardan su mercadería, nada de ubicaciones). En la demo el interruptor nace ENCENDIDO (en producción nace apagado) para poder verlo en la Preview.
import { createHash, randomUUID } from 'node:crypto'
import { puede } from '@/domain/permisos'
import { TRAMOS_POR_DEFECTO } from '@/domain/inventario'
import { estadoDeEnlace, type EnlaceStockVista, type FiltroKardexCliente, type KardexProducto, type LoteStock, type ProductoStock, type RespuestaKardexCliente, type RespuestaStockCliente } from '@/domain/stock-cliente'
import { modoEjemplos } from '@/lib/demo'
import { estadoE, falla } from './entradas-demo'
import { sembrarInventario } from './inventario-demo'
import { comprometidoEn } from './despacho-demo'
import type { EstadoDemo } from './estado'
import { registrar } from './estado'
import { InspeccionesDemo } from './inspecciones-demo'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioStockCliente } from '../repositorio-stock-cliente'

interface EnlaceDemo { id: string; propietarioId: string; etiqueta?: string; hash: string; creadoEn: number; venceEn: number; revocadoEn?: number; ultimaVistaEn?: number }
interface StockDemo { habilitado: boolean; enlaces: EnlaceDemo[]; intentos: { ip: string; en: number }[]; sembrado?: boolean }
const sc = (e: EstadoDemo): StockDemo => ((e as EstadoDemo & { stockCliente?: StockDemo }).stockCliente ??= { habilitado: true, enlaces: [], intentos: [] })
/** En la demostración cada cliente ya trae su enlace de prueba (`/stock/demo-stock-ajr_labs`): así se ve sin generar nada. Nunca existe en producción. */
export const tokenDemoStock = (codigoCliente: string) => `demo-stock-${codigoCliente.toLowerCase()}`
const hash = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')
const QUINCE_MIN = 15 * 60_000
const DIA = 24 * 3600_000
const iso = (ms: number | undefined) => (ms === undefined ? undefined : new Date(ms).toISOString())
const diasEntre = (hasta: string, desde: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA)

export class StockClienteDemo extends InspeccionesDemo implements RepositorioStockCliente {
  /** Pruebas: el interruptor `stock_cliente_habilitado` (en la base solo lo cambia un administrador de la base). En la demo nace encendido. */
  fijarStockClienteHabilitado(v: boolean) { sc(estadoE()).habilitado = v }
  /** Pruebas: lo que la demo guarda de los enlaces (solo hashes). */
  enlacesStockGuardados() { return sc(estadoE()).enlaces.map((x) => ({ ...x })) }
  /** Pruebas: hace vencer todos los enlaces. */
  vencerEnlacesStockCliente() { for (const x of sc(estadoE()).enlaces) x.venceEn = Date.now() - 1000 }

  /** Lo mismo que hace `panorama()` antes de leer el stock: las órdenes de ejemplo (si están encendidas) y el historial del inventario, para que todo sea consistente. */
  private async prepararInventario(): Promise<EstadoDemo> {
    const e = estadoE()
    if (modoEjemplos() === 'si') await this.sembrarDespacho(e)
    sembrarInventario(e)
    const s = sc(e)
    if (!s.sembrado) {
      s.sembrado = true
      for (const o of e.panorama.propietarios.filter((x) => !x.esDuenoAlmacen)) s.enlaces.push({ id: `demo-enlace-${o.codigo}`, propietarioId: o.id, etiqueta: 'Enlace de prueba (demo)', hash: hash(tokenDemoStock(o.codigo)), creadoEn: Date.now(), venceEn: Date.now() + 365 * DIA })
    }
    return e
  }

  private esperaStock(e: EstadoDemo, ip: string): number {
    const t = Date.now(); const fallos = sc(e).intentos.filter((i) => t - i.en < QUINCE_MIN)
    const porIp = fallos.filter((i) => i.ip === ip)
    let max = 0
    for (const lista of [porIp.length >= 5 ? porIp : [], fallos.length >= 300 ? fallos : []]) if (lista.length) max = Math.max(max, Math.ceil((Math.min(...lista.map((i) => i.en)) + QUINCE_MIN - t) / 1000))
    return Math.max(0, max)
  }

  /** El propietario del enlace, o la respuesta si no vale. */
  private acceso(e: EstadoDemo, token: string, ipCruda: string): { propietarioId: string } | { resp: { estado: 'NO_DISPONIBLE' } | { estado: 'ESPERA'; esperaSegundos: number } | { estado: 'NO_ENCONTRADO' } } {
    if (!sc(e).habilitado) return { resp: { estado: 'NO_DISPONIBLE' } }
    const ip = hash(ipCruda)
    const espera = this.esperaStock(e, ip)
    if (espera > 0) return { resp: { estado: 'ESPERA', esperaSegundos: espera } }
    const x = sc(e).enlaces.find((y) => y.hash === hash(token.trim()) && !y.revocadoEn && y.venceEn > Date.now())
    const dueno = x ? e.panorama.propietarios.find((p) => p.id === x.propietarioId) : undefined
    if (!x || !dueno || dueno.esDuenoAlmacen) {
      sc(e).intentos.push({ ip, en: Date.now() }); sc(e).intentos = sc(e).intentos.filter((i) => Date.now() - i.en < 2 * DIA)
      return { resp: { estado: 'NO_ENCONTRADO' } }
    }
    x.ultimaVistaEn = Date.now()
    return { propietarioId: x.propietarioId }
  }

  async consultarStockCliente(token: string, ipCruda: string): Promise<RespuestaStockCliente> {
    const e = await this.prepararInventario()
    const a = this.acceso(e, token, ipCruda)
    if ('resp' in a) return a.resp
    const p = e.panorama; const hoy = p.hoy
    const cliente = p.propietarios.find((x) => x.id === a.propietarioId)!
    const posicion = new Map(p.posiciones.map((x) => [x.id, x]))
    const lote = new Map(p.lotes.map((x) => [x.id, x]))
    const porLote = new Map<string, { productoId: string; stock: number; revision: number; disponible: number }>()
    for (const s of p.saldos) {
      if (s.propietarioId !== a.propietarioId || s.cantidad <= 0) continue
      const f = porLote.get(s.loteId) ?? { productoId: s.productoId, stock: 0, revision: 0, disponible: 0 }
      if (s.estado !== 'BAJAS_RECHAZADOS') f.stock += s.cantidad
      if (s.estado === 'CUARENTENA' || s.estado === 'DEVOLUCIONES') f.revision += s.cantidad
      if (s.estado === 'APROBADO' && posicion.get(s.posicionId)?.tipoArea === 'APROBADOS') f.disponible += s.cantidad - comprometidoEn(e, s.posicionId, s.loteId, s.procedenciaId)
      porLote.set(s.loteId, f)
    }
    const productos = new Map<string, ProductoStock>()
    for (const [loteId, f] of porLote) {
      if (f.stock <= 0) continue
      const l = lote.get(loteId); const pr = p.productos.find((x) => x.id === f.productoId)
      if (!l || !pr) continue
      const dias = l.vence ? diasEntre(l.vence, hoy) : undefined
      const vencido = dias !== undefined && dias < 0
      const item: LoteStock = { loteId, lote: l.codigo, vence: l.vence, dias, vencido, stock: f.stock, disponible: Math.max(0, f.disponible), enRevision: f.revision }
      const actual = productos.get(pr.id) ?? { productoId: pr.id, codigo: pr.codigo, codigoCliente: this.codigoClienteDemo(e, pr.id, a.propietarioId), descripcion: pr.descripcion, presentacion: pr.presentacion || undefined, stock: 0, disponible: 0, enRevision: 0, vencido: 0, lotes: [] }
      actual.stock += item.stock; actual.disponible += item.disponible; actual.enRevision += item.enRevision; actual.vencido += vencido ? item.stock : 0; actual.lotes.push(item)
      productos.set(pr.id, actual)
    }
    const lista = [...productos.values()].sort((x, y) => x.codigo.localeCompare(y.codigo, 'es', { numeric: true }))
    for (const pr of lista) pr.lotes.sort((x, y) => (x.vence ?? '9999').localeCompare(y.vence ?? '9999') || x.lote.localeCompare(y.lote))
    return { estado: 'OK', cliente: { codigo: cliente.codigo, nombre: cliente.razonSocial }, hoy, actualizadoEn: new Date().toISOString(), tramos: [...TRAMOS_POR_DEFECTO], productos: lista }
  }

  /** El código propio del cliente para un producto (AJR0026): la demo lo deriva del código del producto para poder verlo en pantalla. */
  private codigoClienteDemo(e: EstadoDemo, productoId: string, propietarioId: string): string | undefined {
    const cliente = e.panorama.propietarios.find((x) => x.id === propietarioId); const pr = e.panorama.productos.find((x) => x.id === productoId)
    if (!cliente || !pr) return undefined
    const sigla = cliente.codigo.replace(/[^A-Z]/g, '').slice(0, 3)
    return `${sigla}${pr.codigo.replace(/\D/g, '').slice(-4).padStart(4, '0')}`
  }

  async consultarKardexCliente(token: string, f: FiltroKardexCliente, ipCruda: string): Promise<RespuestaKardexCliente> {
    const e = await this.prepararInventario()
    const a = this.acceso(e, token, ipCruda)
    if ('resp' in a) return a.resp
    const p = e.panorama
    const ids = [...new Set(p.lotes.filter((l) => l.propietarioId === a.propietarioId && (!f.productoId || l.productoId === f.productoId)).map((l) => l.productoId))]
    const productos: KardexProducto[] = []
    for (const id of ids) {
      const pr = p.productos.find((x) => x.id === id)
      if (!pr) continue
      const filas = (await this.kardex({ productoId: id, propietarioId: a.propietarioId, desde: f.desde, hasta: f.hasta })).map(({ posicion: _pos, partidaId: _p, movimientoId: _m, motivo: _mo, ...resto }) => { void _pos; void _p; void _m; void _mo; return resto })
      productos.push({ productoId: id, codigo: pr.codigo, descripcion: pr.descripcion, filas })
    }
    productos.sort((x, y) => x.codigo.localeCompare(y.codigo, 'es', { numeric: true }))
    const cliente = p.propietarios.find((x) => x.id === a.propietarioId)!
    return { estado: 'OK', cliente: { codigo: cliente.codigo, nombre: cliente.razonSocial }, hoy: p.hoy, formato: 'LS-FR.41', productos }
  }

  async crearEnlaceStockCliente(propietarioId: string, dias: number, etiqueta: string | undefined, actor: Actor): Promise<ResultadoAccion<{ token: string; venceEn: string }>> {
    const e = await this.prepararInventario()
    if (!puede(actor.roles, 'configurar')) return falla('No tienes permiso para generar el enlace de stock de un cliente')
    if (!sc(e).habilitado) return falla('El stock para el cliente aún no está disponible')
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) return falla('El enlace dura entre 1 y 365 días')
    const dueno = e.panorama.propietarios.find((x) => x.id === propietarioId)
    if (!dueno) return falla('No encontramos a ese cliente')
    if (dueno.esDuenoAlmacen) return falla('El enlace es para clientes que guardan su mercadería, no para el stock propio')
    const token = (randomUUID() + randomUUID() + randomUUID() + randomUUID()).replace(/-/g, '')
    const id = randomUUID(); const ahora = Date.now()
    sc(e).enlaces.push({ id, propietarioId, etiqueta: etiqueta?.trim() || undefined, hash: hash(token), creadoEn: ahora, venceEn: ahora + dias * DIA })
    registrar(e, actor, 'stock_cliente_enlace_creado', 'enlaces_stock_cliente', id, `Enlace de stock de ${dueno.codigo} (${dias} días)`)
    return { ok: true, token, venceEn: new Date(ahora + dias * DIA).toISOString() }
  }

  async revocarEnlaceStockCliente(enlaceId: string, actor: Actor): Promise<ResultadoAccion<{ revocado: boolean }>> {
    const e = estadoE()
    if (!puede(actor.roles, 'configurar')) return falla('No tienes permiso para revocar el enlace de stock de un cliente')
    const x = sc(e).enlaces.find((y) => y.id === enlaceId && !y.revocadoEn)
    if (!x) return { ok: true, revocado: false }
    x.revocadoEn = Date.now()
    registrar(e, actor, 'stock_cliente_enlace_revocado', 'enlaces_stock_cliente', x.id, 'Enlace de stock revocado')
    return { ok: true, revocado: true }
  }

  async listarEnlacesStockCliente(): Promise<EnlaceStockVista[]> {
    const e = estadoE()
    return sc(e).enlaces.map((x): EnlaceStockVista => {
      const base = { venceEn: iso(x.venceEn)!, revocadoEn: iso(x.revocadoEn) }
      return { id: x.id, propietarioId: x.propietarioId, etiqueta: x.etiqueta, creadoEn: iso(x.creadoEn)!, ...base, ultimaVistaEn: iso(x.ultimaVistaEn), estado: estadoDeEnlace(base) }
    }).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
  }
}
