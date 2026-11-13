// Seguimiento para el cliente en la demostración (memoria): mismas reglas que la migración 0047 (`wms.seguimiento_consultar`, `seguimiento_por_token`, enlaces con token que solo guardan su hash,
// límite de intentos por pedido, por IP y global). APAGADO en el piloto y con el interruptor apagado (el valor de fábrica).
import { createHash, randomUUID } from 'node:crypto'
import { puede } from '@/domain/permisos'
import { normalizarNombre, OPCIONES_POR_DEFECTO, telefonoPeruano, type ClaveOpcionSeguimiento, type ContactoSeguimiento, type ContactoVendedorVista, type EstadoDePagos, type ErrorFilaContacto, type HitoVista, type OpcionesSeguimiento, type RespuestaCarita, type RespuestaSeguimiento, type ValorCarita } from '@/domain/seguimiento'
import { ahora, estadoE, falla } from './entradas-demo'
import { desp } from './despacho-demo'
import { salidaConforme } from './documentacion-demo'
import type { EstadoDemo } from './estado'
import { registrar } from './estado'
import { MisRutasDemo } from './mis-rutas-demo'
import { modoPilotoDemo } from './piloto-estado'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioSeguimiento } from '../repositorio-seguimiento'

interface SegDemo {
  habilitado: boolean; deudaHabilitada?: boolean; intentos: { ip: string; clave: string; ok: boolean; en: number }[]
  tokens: { id: string; hash: string; pedidoId: string; numero: string; venceEn: number; revocado?: boolean }[]
  contactos: ContactoVendedorVista[]; opciones: OpcionesSeguimiento; respuestas: Record<string, ValorCarita>
}
/** En la demostración el seguimiento nace apagado (como en producción); `WMS_DEMO_SEGUIMIENTO=1` lo enciende para verlo en la Preview. Trae un contacto público y uno de prueba para ver el botón. */
const seg = (e: EstadoDemo): SegDemo => ((e as EstadoDemo & { seguimiento?: SegDemo }).seguimiento ??= {
  habilitado: process.env.WMS_DEMO_SEGUIMIENTO === '1', intentos: [], tokens: [], contactos: [], respuestas: {},
  opciones: { ...OPCIONES_POR_DEFECTO, whatsappPrueba: '+51900000001' },
})
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

  /** Pruebas: el interruptor `seguimiento_deuda_habilitado` (en la base solo lo cambia un administrador de la base). En la demo nace encendido para poder verlo. */
  fijarSeguimientoDeudaHabilitado(v: boolean) { seg(estadoE()).deudaHabilitada = v }
  /**
   * El estado de pagos en la demostración (no hay Cobranzas): según el último dígito del RUC, 0 a 3 «al día», 4 a 8 con documentos vencidos y 9 «Cobranzas no lo conoce» (no se dice nada).
   * Mismas reglas que `wms._deuda_cliente` (0068): lo más atrasado primero y el total.
   */
  private deudaDemo(e: EstadoDemo, ruc: string | undefined): EstadoDePagos | null {
    if (!(seg(e).deudaHabilitada ?? true) || !ruc || !/^\d{8,11}$/.test(ruc)) return null
    const d = Number(ruc.slice(-1)); const al = e.panorama.hoy
    if (d === 9) return null
    if (d <= 3) return { estado: 'AL_DIA', al }
    const dia = (n: number) => new Date(Date.parse(`${al}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)
    const documentos = [{ documento: `F001-00${100 + d}`, vence: dia(60 + d), dias: 60 + d, saldo: 1480.5 }, { documento: `F001-00${90 + d}`, vence: dia(12 + d), dias: 12 + d, saldo: 320 }]
    return { estado: 'MOROSO', al, total: 1800.5, maxDias: documentos[0].dias, cantidad: documentos.length, documentos }
  }

  /** Solo estado y hora: nunca precios, lotes ni personal. Los 5 pasos de la pantalla (0069), de lo que ya registra la demo. */
  private hitos(e: EstadoDemo, pedidoId: string): HitoVista[] {
    const filas = (e.pedidos?.filas ?? []).filter((f) => f.snapshot.pedidoId === pedidoId)
    const h: HitoVista[] = []
    const vigente = filas.find((f) => f.vigente)
    if (vigente?.snapshot.estado === 'CANCELLED') h.push({ estado: 'CANCELADO', en: vigente.importadoEn })
    const d = desp(e)
    const salida = vigente?.salida ? d.salidas.find((s) => s.numero === vigente.salida && s.estado !== 'CANCELADA') : undefined
    const ruta = d.rutas.find((r) => r.paradas.some((p) => p.activa && p.pedidoId === pedidoId))
    const carga = ruta ? (d.carga ?? {})[ruta.id] as { liberadaEn?: string; salioEn?: string } | undefined : undefined
    if (salida) {
      h.push({ estado: 'RECIBIDO', en: salida.creadaEn })
      if (salidaConforme(e, salida.id) || salida.estado === 'CONFIRMADA' || carga?.liberadaEn) h.push({ estado: 'PREPARANDO', en: carga?.liberadaEn ?? salida.creadaEn })
    }
    if (carga?.salioEn) h.push({ estado: 'EN_CAMINO', en: carga.salioEn })
    const parada = ruta?.paradas.find((p) => p.activa && p.pedidoId === pedidoId)
    const evs = ((e as EstadoDemo & { eventosParada?: { paradaId: string; evento: string; hora: string }[] }).eventosParada ?? []).filter((x) => x.paradaId === parada?.id)
    const llego = evs.find((x) => x.evento === 'LLEGUE'); if (llego) h.push({ estado: 'LLEGO', en: llego.hora })
    const fin = evs.find((x) => ['ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO'].includes(x.evento))
    if (fin) h.push({ estado: fin.evento === 'ENTREGADO' ? 'ENTREGADO' : 'NO_ENTREGADO', en: fin.hora })
    return h.sort((a, b) => a.en.localeCompare(b.en) || a.estado.localeCompare(b.estado))
  }

  /** Todo lo que la pantalla necesita de un pedido (espejo de `wms._seguimiento_datos`, 0069). */
  private datos(e: EstadoDemo, fila: NonNullable<ReturnType<typeof this.filaDe>>): Extract<RespuestaSeguimiento, { estado: 'OK' }> {
    const s = seg(e); const d = desp(e); const pedidoId = fila.snapshot.pedidoId
    const hitos = this.hitos(e, pedidoId)
    const entregado = hitos.some((x) => x.estado === 'ENTREGADO')
    const ruta = d.rutas.find((r) => r.estado !== 'CANCELADA' && r.paradas.some((p) => p.activa && p.pedidoId === pedidoId))
    const carga = ruta ? (d.carga ?? {})[ruta.id] as { salioEn?: string } | undefined : undefined
    const eventos = (e as EstadoDemo & { eventosParada?: { paradaId: string; evento: string }[] }).eventosParada ?? []
    const activas = ruta?.paradas.filter((p) => p.activa) ?? []
    const atendidas = activas.filter((p) => eventos.some((x) => x.paradaId === p.id && ['ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO'].includes(x.evento))).length
    const rutaVista = ruta && s.opciones.rutaVisible && activas.length >= 2 && carga?.salioEn ? { atendidas, total: activas.length } : null
    const vendedor = fila.snapshot.vendedor?.trim() || undefined
    const piloto = modoPilotoDemo(e) === 'si'
    const telVendedor = vendedor ? s.contactos.find((c) => normalizarNombre(c.nombre) === normalizarNombre(vendedor))?.telefono : undefined
    const telefono = piloto ? (vendedor ? telefonoPeruano(s.opciones.whatsappPrueba) : null) : telVendedor
    const contacto: ContactoSeguimiento | null = telefono && vendedor ? { nombre: vendedor, telefono } : null
    const salida = fila.salida ? d.salidas.find((x) => x.numero === fila.salida) : undefined
    const g = salida && (s.opciones.guiaVisible === 'SIEMPRE' || entregado) ? d.guias?.find((x) => x.salidaId === salida.id && x.guia.estado === 'VIGENTE' && x.guia.estadoSunat === 'ACEPTADA' && /^https?:\/\/\S+$/i.test(x.guia.enlace ?? '')) : undefined
    return { estado: 'OK', pedido: fila.snapshot.numero, cliente: fila.snapshot.cliente.nombre, hitos, tieneParada: !!ruta, ruta: rutaVista, contacto, guia: g ? { enlace: g.guia.enlace! } : null,
      respuesta: s.respuestas[pedidoId] ?? null, prueba: piloto, deuda: this.deudaDemo(e, fila.snapshot.cliente.ruc) }
  }
  private filaDe(e: EstadoDemo, clave: string, ruc: string) { return (e.pedidos?.filas ?? []).find((f) => f.vigente && f.snapshot.numero.toUpperCase() === clave && /^\d{11}$/.test(ruc) && f.snapshot.cliente.ruc === ruc) }

  async consultarSeguimiento(pedido: string, ruc: string, ipCruda: string): Promise<RespuestaSeguimiento> {
    const e = estadoE()
    if (!this.seguimientoDisponible()) return { estado: 'NO_DISPONIBLE' }
    await this.bandejaPedidos()   // siembra la bandeja de la demo
    const clave = pedido.trim().toUpperCase().slice(0, 60); const r = ruc.trim(); const ip = hash(ipCruda)
    if (!clave && !r) return { estado: 'LISTO' }   // solo pregunta si está disponible; no cuenta como intento
    const espera = this.espera(e, ip, clave)
    if (espera > 0) return { estado: 'ESPERA', esperaSegundos: espera }
    const fila = this.filaDe(e, clave, r)
    if (!fila) { this.intento(e, ip, clave, false); return { estado: 'NO_ENCONTRADO' } }   // la misma respuesta si el pedido no existe o el RUC no coincide
    this.intento(e, ip, clave, true)
    return this.datos(e, fila)
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
    return this.datos(e, fila)
  }

  async responderEntrega(pedido: string, ruc: string, valor: ValorCarita, ipCruda: string): Promise<RespuestaCarita> {
    const e = estadoE()
    if (!this.seguimientoDisponible()) return { estado: 'NO_DISPONIBLE' }
    await this.bandejaPedidos()
    const clave = pedido.trim().toUpperCase().slice(0, 60); const ip = hash(ipCruda)
    const espera = this.espera(e, ip, clave)
    if (espera > 0) return { estado: 'ESPERA', esperaSegundos: espera }
    const fila = this.filaDe(e, clave, ruc.trim())
    if (!fila) { this.intento(e, ip, clave, false); return { estado: 'NO_ENCONTRADO' } }
    this.intento(e, ip, clave, true)
    if (![1, 2, 3].includes(valor)) return { estado: 'ERROR' }
    if (!this.hitos(e, fila.snapshot.pedidoId).some((x) => x.estado === 'ENTREGADO')) return { estado: 'AUN_NO' }
    const s = seg(e)
    if (s.respuestas[fila.snapshot.pedidoId]) return { estado: 'YA_RESPONDIDA' }
    s.respuestas[fila.snapshot.pedidoId] = valor
    return { estado: 'OK' }
  }

  // ── Contactos de los vendedores y opciones (Administrador) ──
  async listarContactosVendedores(): Promise<ContactoVendedorVista[]> { return [...seg(estadoE()).contactos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }
  private guardarContacto(e: EstadoDemo, nombre: string, telefono: string): string | { error: string } {
    const n = nombre.trim(); const tel = telefonoPeruano(telefono)
    if (!n) return { error: 'Escribe el nombre del vendedor, tal como llega de Pedidos' }
    if (!tel) return { error: 'El teléfono debe ser de 9 dígitos, por ejemplo 987654321 o +51 987 654 321' }
    const s = seg(e); const previo = s.contactos.find((c) => normalizarNombre(c.nombre) === normalizarNombre(n))
    if (previo) { Object.assign(previo, { nombre: n, telefono: tel, actualizadoEn: new Date().toISOString() }); return previo.id }
    const c = { id: randomUUID(), nombre: n, telefono: tel, actualizadoEn: new Date().toISOString() }; s.contactos.push(c); return c.id
  }
  async guardarContactoVendedor(nombre: string, telefono: string, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE()
    if (!puede(actor.roles, 'configurar')) return falla('No tienes permiso para editar los contactos de los vendedores')
    const r = this.guardarContacto(e, nombre, telefono)
    if (typeof r !== 'string') return falla(r.error)
    registrar(e, actor, 'contacto_vendedor_guardado', 'contactos_vendedores', r, `Contacto de ${nombre.trim()}`)
    return { ok: true, id: r }
  }
  async cargarContactosVendedores(filas: { nombre: string; telefono: string }[], actor: Actor): Promise<ResultadoAccion<{ guardados: number; errores: ErrorFilaContacto[] }>> {
    const e = estadoE()
    if (!puede(actor.roles, 'configurar')) return falla('No tienes permiso para editar los contactos de los vendedores')
    if (filas.length > 2000) return falla('El archivo trae demasiadas filas (máximo 2000)')
    let guardados = 0; const errores: ErrorFilaContacto[] = []
    filas.forEach((f, i) => {
      if (!f.nombre.trim()) { errores.push({ fila: i + 1, nombre: '', motivo: 'Falta el nombre' }); return }
      if (!telefonoPeruano(f.telefono)) { errores.push({ fila: i + 1, nombre: f.nombre.trim(), motivo: 'El teléfono no tiene 9 dígitos' }); return }
      this.guardarContacto(e, f.nombre, f.telefono); guardados += 1
    })
    registrar(e, actor, 'contactos_vendedores_cargados', 'contactos_vendedores', 'csv', `${guardados} guardados, ${errores.length} con error`)
    return { ok: true, guardados, errores }
  }
  async opcionesSeguimiento(): Promise<OpcionesSeguimiento> { return { ...seg(estadoE()).opciones } }
  async guardarOpcionSeguimiento(clave: ClaveOpcionSeguimiento, valor: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE()
    if (!puede(actor.roles, 'configurar')) return falla('No tienes permiso para cambiar las opciones del seguimiento')
    const o = seg(e).opciones; const v = valor.trim()
    if (clave === 'seguimiento_ruta_visible') { if (!['true', 'false'].includes(v)) return falla('Elige si se muestra o no'); o.rutaVisible = v === 'true' }
    else if (clave === 'seguimiento_guia_visible') { const u = v.toUpperCase(); if (u !== 'SIEMPRE' && u !== 'DESPUES_ENTREGA') return falla('Elige «siempre» o «solo después de entregado»'); o.guiaVisible = u }
    else if (clave === 'seguimiento_whatsapp_prueba') {
      const tel = v === '' ? '' : telefonoPeruano(v); if (tel === null) return falla('El teléfono debe ser de 9 dígitos, por ejemplo 987654321')
      o.whatsappPrueba = tel
    } else if (clave === 'seguimiento_base_url') { if (v !== '' && !/^https:\/\/\S+$/i.test(v)) return falla('La dirección empieza con https://'); o.baseUrl = v }
    else return falla('Esa opción no se cambia aquí')
    registrar(e, actor, 'opcion_seguimiento_cambiada', 'parametros', clave, `Opción ${clave}`)
    return { ok: true }
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
