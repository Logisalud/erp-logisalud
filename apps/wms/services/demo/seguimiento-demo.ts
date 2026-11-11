// Seguimiento para el cliente en la demostración (memoria): mismas reglas que la migración 0047 (`wms.seguimiento_consultar`, `seguimiento_por_token`, enlaces con token que solo guardan su hash,
// límite de intentos por pedido, por IP y global). APAGADO en el piloto y con el interruptor apagado (el valor de fábrica).
import { createHash, randomUUID } from 'node:crypto'
import { puede } from '@/domain/permisos'
import type { HitoVista, RespuestaSeguimiento } from '@/domain/seguimiento'
import { ahora, estadoE, falla } from './entradas-demo'
import { desp } from './despacho-demo'
import type { EstadoDemo } from './estado'
import { registrar } from './estado'
import { MisRutasDemo } from './mis-rutas-demo'
import { modoPilotoDemo } from './piloto-estado'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioSeguimiento } from '../repositorio-seguimiento'

interface SegDemo { habilitado: boolean; intentos: { ip: string; clave: string; ok: boolean; en: number }[]; tokens: { id: string; hash: string; pedidoId: string; numero: string; venceEn: number; revocado?: boolean }[] }
const seg = (e: EstadoDemo): SegDemo => ((e as EstadoDemo & { seguimiento?: SegDemo }).seguimiento ??= { habilitado: false, intentos: [], tokens: [] })
const hash = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')
const QUINCE_MIN = 15 * 60_000

export class SeguimientoDemo extends MisRutasDemo implements RepositorioSeguimiento {
  /** Pruebas: el interruptor `seguimiento_cliente_habilitado` (en la base solo lo cambia un administrador de la base). */
  fijarSeguimientoHabilitado(v: boolean) { seg(estadoE()).habilitado = v }
  /** Pruebas: mueve en el tiempo los intentos (para probar que a los 15 minutos se puede volver a intentar). */
  envejecerIntentosSeguimiento(ms: number) { for (const i of seg(estadoE()).intentos) i.en -= ms }
  seguimientoDisponible(): boolean { const e = estadoE(); return seg(e).habilitado }   // 0054: basta el interruptor (también en el piloto)

  /** Segundos de espera si hubo demasiados fallos (por pedido 5, por IP 8, global 300 en 15 minutos); 0 si puede intentar. */
  private espera(e: EstadoDemo, ip: string, clave: string): number {
    const t = Date.now(); const f = seg(e).intentos.filter((i) => !i.ok && t - i.en < QUINCE_MIN)
    let max = 0
    const regla = (lista: typeof f, tope: number) => { if (lista.length >= tope) max = Math.max(max, Math.ceil((Math.min(...lista.map((i) => i.en)) + QUINCE_MIN - t) / 1000)) }
    regla(f.filter((i) => i.clave === clave), 5); regla(f.filter((i) => i.ip === ip), 8); regla(f, 300)
    return Math.max(0, max)
  }
  private intento(e: EstadoDemo, ip: string, clave: string, ok: boolean) {
    const s = seg(e); s.intentos.push({ ip, clave, ok, en: Date.now() }); s.intentos = s.intentos.filter((i) => Date.now() - i.en < 2 * 24 * 3600_000)
  }

  /** Solo estado y hora: nunca precios, lotes ni personal. */
  private hitos(e: EstadoDemo, pedidoId: string): HitoVista[] {
    const filas = (e.pedidos?.filas ?? []).filter((f) => f.snapshot.pedidoId === pedidoId)
    const h: HitoVista[] = []
    const primera = filas.map((f) => f.importadoEn).sort()[0]
    if (primera) h.push({ estado: 'RECIBIDO', en: primera })
    const vigente = filas.find((f) => f.vigente)
    if (vigente?.snapshot.estado === 'CANCELLED') h.push({ estado: 'CANCELADO', en: vigente.importadoEn })
    const d = desp(e)
    const salida = vigente?.salida ? d.salidas.find((s) => s.numero === vigente.salida && s.estado !== 'CANCELADA') : undefined
    if (salida) h.push({ estado: 'EN_PREPARACION', en: salida.creadaEn })
    const ruta = d.rutas.find((r) => r.paradas.some((p) => p.activa && p.pedidoId === pedidoId))
    const carga = ruta ? (d.carga ?? {})[ruta.id] as { liberadaEn?: string; salioEn?: string } | undefined : undefined
    if (carga?.liberadaEn) h.push({ estado: 'LISTO', en: carga.liberadaEn })
    if (carga?.salioEn) h.push({ estado: 'EN_RUTA', en: carga.salioEn })
    const parada = ruta?.paradas.find((p) => p.activa && p.pedidoId === pedidoId)
    const eventos = ((e as EstadoDemo & { eventosParada?: { paradaId: string; evento: string; hora: string }[] }).eventosParada ?? []).filter((x) => x.paradaId === parada?.id && ['ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO'].includes(x.evento))
    if (eventos[0]) h.push({ estado: eventos[0].evento === 'ENTREGADO' ? 'ENTREGADO' : 'NO_ENTREGADO', en: eventos[0].hora })
    return h.sort((a, b) => a.en.localeCompare(b.en) || a.estado.localeCompare(b.estado))
  }

  async consultarSeguimiento(pedido: string, ruc: string, ipCruda: string): Promise<RespuestaSeguimiento> {
    const e = estadoE()
    if (!this.seguimientoDisponible()) return { estado: 'NO_DISPONIBLE' }
    await this.bandejaPedidos()   // siembra la bandeja de la demo
    const clave = pedido.trim().toUpperCase().slice(0, 60); const r = ruc.trim(); const ip = hash(ipCruda)
    if (!clave && !r) return { estado: 'LISTO' }   // solo pregunta si está disponible; no cuenta como intento
    const espera = this.espera(e, ip, clave)
    if (espera > 0) return { estado: 'ESPERA', esperaSegundos: espera }
    const fila = (e.pedidos?.filas ?? []).find((f) => f.vigente && f.snapshot.numero.toUpperCase() === clave && /^\d{11}$/.test(r) && f.snapshot.cliente.ruc === r)
    if (!fila) { this.intento(e, ip, clave, false); return { estado: 'NO_ENCONTRADO' } }   // la misma respuesta si el pedido no existe o el RUC no coincide
    this.intento(e, ip, clave, true)
    return { estado: 'OK', pedido: fila.snapshot.numero, hitos: this.hitos(e, fila.snapshot.pedidoId) }
  }

  async consultarSeguimientoPorToken(token: string, ipCruda: string): Promise<RespuestaSeguimiento> {
    const e = estadoE()
    if (!this.seguimientoDisponible()) return { estado: 'NO_DISPONIBLE' }
    const ip = hash(ipCruda)
    const espera = this.espera(e, ip, 'token')
    if (espera > 0) return { estado: 'ESPERA', esperaSegundos: espera }
    const t = seg(e).tokens.find((x) => x.hash === hash(token.trim()) && !x.revocado && x.venceEn > Date.now())
    const fila = t ? (e.pedidos?.filas ?? []).find((f) => f.vigente && f.snapshot.pedidoId === t.pedidoId) : undefined
    if (!t || !fila) { this.intento(e, ip, 'token', false); return { estado: 'NO_ENCONTRADO' } }
    return { estado: 'OK', pedido: fila.snapshot.numero, hitos: this.hitos(e, fila.snapshot.pedidoId) }
  }

  async crearEnlaceSeguimiento(pedidoNumero: string, dias: number, actor: Actor): Promise<ResultadoAccion<{ token: string; venceEn: string }>> {
    const e = estadoE()
    if (!puede(actor.roles, 'preparar_salidas')) return falla('No tienes permiso para generar enlaces de seguimiento')
    if (!this.seguimientoDisponible()) return falla('Seguimiento aún no disponible')
    if (!Number.isInteger(dias) || dias < 1 || dias > 90) return falla('El enlace dura entre 1 y 90 días')
    await this.bandejaPedidos()
    const fila = (e.pedidos?.filas ?? []).find((f) => f.vigente && f.snapshot.numero.toUpperCase() === pedidoNumero.trim().toUpperCase())
    if (!fila) return falla('No encontramos ese pedido')
    const token = (randomUUID() + randomUUID() + randomUUID() + randomUUID()).replace(/-/g, '')
    const id = randomUUID(); const vence = Date.now() + dias * 24 * 3600_000
    seg(e).tokens.push({ id, hash: hash(token), pedidoId: fila.snapshot.pedidoId, numero: fila.snapshot.numero, venceEn: vence })
    registrar(e, actor, 'seguimiento_enlace_creado', 'seguimiento_tokens', id, `Enlace de seguimiento del pedido ${fila.snapshot.numero} (${dias} días)`)
    return { ok: true, token, venceEn: new Date(vence).toISOString() }
  }

  async revocarEnlacesSeguimiento(pedidoNumero: string, actor: Actor): Promise<ResultadoAccion<{ revocados: number }>> {
    const e = estadoE()
    if (!puede(actor.roles, 'preparar_salidas')) return falla('No tienes permiso para revocar enlaces de seguimiento')
    let n = 0
    for (const t of seg(e).tokens) if (t.numero.toUpperCase() === pedidoNumero.trim().toUpperCase() && !t.revocado) { t.revocado = true; n += 1 }
    registrar(e, actor, 'seguimiento_enlaces_revocados', 'seguimiento_tokens', pedidoNumero, `Enlaces revocados: ${n}`)
    return { ok: true, revocados: n }
  }
  /** Pruebas: lo que la demo guarda de los enlaces (solo hashes). */
  tokensGuardadosSeguimiento() { return seg(estadoE()).tokens.map((t) => ({ ...t })) }
  /** Pruebas: hace vencer un enlace. */
  vencerEnlacesSeguimiento() { for (const t of seg(estadoE()).tokens) t.venceEn = Date.now() - 1000 }
  /** Pruebas: la hora de ahora de la demo (para fijar eventos). */
  ahoraSeguimiento() { return ahora() }
}
