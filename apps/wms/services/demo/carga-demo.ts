// S8 en memoria (modo demostración): carga por bultos, conciliación, liberar la unidad y salida confirmada. Mismas reglas que la migración 0021.
import {
  ITEMS_CHECKLIST_POR_DEFECTO, motivosNoLiberar, normalizarCodigoBulto, puedeCargar, puedeConfirmarSalida, puedeLiberarUnidad,
  type CargaResumen, type CargaRuta, type ItemChecklist, type PedidoCarga,
} from '@/domain/carga'
import type { ExtrasLsFr } from '@/domain/ls-fr-43-03'
import { registrar, type EstadoDemo } from './estado'
import { ahora, estadoE, falla } from './entradas-demo'
import { desp, type CargaDemo, type RutaDemo, type SalidaDemo } from './despacho-demo'
import { EmbalajeDemo, bultosVigentes } from './embalaje-demo'
import { quitarSaldo } from './inventario-demo'
import { anotar } from './libro'
import { origenDe } from './inventario-demo'
import type { RepositorioCarga } from '../repositorio-carga'
import type { Actor, ResultadoAccion } from '../repositorio'

const cargas = (e: EstadoDemo) => (desp(e).carga ??= {})
const cargaDe = (e: EstadoDemo, rutaId: string): CargaDemo => (cargas(e)[rutaId] ??= { cargados: [], exclusiones: [] })
const vivos = (c: CargaDemo) => c.cargados.filter((x) => x.estado === 'CARGADO')
const enCarga = (r: RutaDemo) => r.estado === 'PLANIFICADA' || r.estado === 'LISTA_PARA_CARGA'

export class CargaDemo_ extends EmbalajeDemo implements RepositorioCarga {
  private ruta(e: EstadoDemo, id: string) { return desp(e).rutas.find((r) => r.id === id) }
  private paradasConSalida(r: RutaDemo) { return r.paradas.filter((p) => p.activa && p.salidaId).sort((a, b) => a.secuencia - b.secuencia) }

  private pedidosDe(e: EstadoDemo, r: RutaDemo): PedidoCarga[] {
    const c = cargaDe(e, r.id)
    return this.paradasConSalida(r).map((p) => {
      const s = desp(e).salidas.find((x) => x.id === p.salidaId)!
      const res = this.resumenSalida(e, s)
      const ex = c.exclusiones.find((x) => x.salidaId === s.id)
      const listo = !ex && ['LISTA_PARA_CARGA', 'CARGADA'].includes(res.etapa)
      const bultos = ex ? [] : bultosVigentes(e, s.id).map((b) => ({ bultoId: b.id, codigo: b.codigo, secuencia: b.secuencia, total: b.total, cargado: vivos(c).some((x) => x.codigo === b.codigo) }))
      return { salidaId: s.id, salidaNumero: s.numero, pedidoNumero: res.pedidoNumero, cliente: res.cliente, secuencia: p.secuencia, listo, excluida: !!ex, motivoExclusion: ex?.motivo, bultos }
    })
  }

  private resumenCarga(e: EstadoDemo, r: RutaDemo): CargaResumen {
    const c = cargaDe(e, r.id); const ps = this.pedidosDe(e, r).filter((p) => !p.excluida)
    return {
      rutaId: r.id, rutaNumero: r.numero, fecha: r.fecha, estado: r.estado === 'EN_RUTA' ? 'EN_RUTA' : r.estado === 'LIBERADA' ? 'LIBERADA' : 'EN_CARGA', placa: desp(e).vehiculos.find((v) => v.id === r.vehiculoId)?.placa,
      pedidos: ps.length, bultosEsperados: ps.reduce((t, p) => t + p.bultos.length, 0), bultosCargados: ps.reduce((t, p) => t + p.bultos.filter((b) => b.cargado).length, 0),
    }
  }

  async colaCarga(): Promise<CargaResumen[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    return structuredClone(desp(e).rutas.filter((r) => ['PLANIFICADA', 'LISTA_PARA_CARGA', 'LIBERADA', 'EN_RUTA'].includes(r.estado) && this.paradasConSalida(r).length > 0).map((r) => this.resumenCarga(e, r)).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.rutaNumero.localeCompare(b.rutaNumero)))
  }

  async cargaRuta(rutaId: string): Promise<CargaRuta | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const r = this.ruta(e, rutaId)
    if (!r) return null
    const c = cargaDe(e, r.id)
    const base: Omit<CargaRuta, 'motivosNoLiberar'> = {
      ...this.resumenCarga(e, r), conductor: desp(e).personal.find((p) => p.id === r.conductorId)?.nombre, tieneVehiculoYConductor: !!r.vehiculoId && !!r.conductorId,
      checklist: c.checklist ?? null, checklistPor: c.checklistPor, itemsChecklist: [...ITEMS_CHECKLIST_POR_DEFECTO], pedidosDetalle: this.pedidosDe(e, r), liberadaEn: c.liberadaEn, salioEn: c.salioEn,
    }
    return structuredClone({ ...base, motivosNoLiberar: r.estado === 'LIBERADA' || r.estado === 'EN_RUTA' ? [] : motivosNoLiberar(base) })
  }

  private exigirEnCarga(e: EstadoDemo, rutaId: string, permiso: boolean, mensaje: string): { r: RutaDemo } | { error: ResultadoAccion } {
    if (!permiso) return { error: falla(mensaje) }
    const r = this.ruta(e, rutaId)
    if (!r) return { error: falla('No encontramos esa ruta') }
    if (!enCarga(r)) return { error: falla(`La ruta ya no está en carga (está ${r.estado === 'LIBERADA' ? 'liberada' : r.estado === 'EN_RUTA' ? 'en ruta' : r.estado.toLowerCase().replace('_', ' ')})`) }
    return { r }
  }

  async guardarChecklist(rutaId: string, items: ItemChecklist[], actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const x = this.exigirEnCarga(e, rutaId, puedeCargar(actor.roles), 'No tienes permiso para cargar la unidad')
    if ('error' in x) return x.error
    if (items.length === 0) return falla('El checklist no tiene puntos')
    for (const i of items) if (!i.ok && !i.nota.trim()) return falla(`Cuenta qué pasa con «${i.item}»: un punto en no necesita su nota`)
    const c = cargaDe(e, rutaId); c.checklist = items.map((i) => ({ item: i.item, ok: i.ok, nota: i.nota.trim() })); c.checklistPor = actor.nombre
    registrar(e, actor, 'checklist_vehicular_guardado', 'rutas', rutaId, x.r.numero)
    return { ok: true }
  }

  async cargarBulto(rutaId: string, codigo: string, actor: Actor): Promise<ResultadoAccion<{ resultado: 'CARGADO' | 'YA_CARGADO' }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const x = this.exigirEnCarga(e, rutaId, puedeCargar(actor.roles), 'No tienes permiso para cargar la unidad')
    if ('error' in x) return x.error as ResultadoAccion<{ resultado: 'CARGADO' | 'YA_CARGADO' }>
    const cod = normalizarCodigoBulto(codigo)
    if (!cod) return falla('Escanea o escribe el código del bulto')
    const todos = (desp(e).bultos ?? []).find((b) => b.codigo === cod && b.estado === 'EMBALADO')
    if (!todos) return falla((desp(e).bultos ?? []).some((b) => b.codigo === cod) ? 'Ese bulto se anuló al reabrir el embalaje: usa la etiqueta nueva' : `No encontramos el bulto ${cod}`)
    const s = desp(e).salidas.find((y) => y.id === todos.salidaId)!
    const parada = x.r.paradas.find((p) => p.activa && p.salidaId === s.id)
    if (!parada) {
      const otra = desp(e).rutas.find((r) => r.id !== rutaId && r.paradas.some((p) => p.activa && p.salidaId === s.id))
      return falla(`El bulto ${cod} es del pedido de la salida ${s.numero}, que no está en esta ruta${otra ? ` (va en ${otra.numero})` : ''}`)
    }
    const c = cargaDe(e, rutaId)
    if (c.exclusiones.some((y) => y.salidaId === s.id)) return falla(`El pedido de la salida ${s.numero} se dejó fuera de esta salida`)
    const pedido = this.pedidosDe(e, x.r).find((p) => p.salidaId === s.id)!
    if (!pedido.listo) return falla(`El pedido de la salida ${s.numero} todavía no está listo para carga: faltan la guía, el paquete documental completo o el embalaje`)
    if (vivos(c).some((y) => y.codigo === cod)) return { ok: true, resultado: 'YA_CARGADO' }
    for (const [id, otro] of Object.entries(cargas(e))) if (id !== rutaId && vivos(otro).some((y) => y.codigo === cod)) return falla(`El bulto ${cod} ya está cargado en otra ruta`)
    c.cargados.push({ codigo: cod, estado: 'CARGADO' })
    return { ok: true, resultado: 'CARGADO' }
  }

  async retirarBulto(rutaId: string, codigo: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const x = this.exigirEnCarga(e, rutaId, puedeCargar(actor.roles), 'No tienes permiso para cargar la unidad')
    if ('error' in x) return x.error
    if (!motivo.trim()) return falla('Cuenta por qué se retira el bulto de la carga')
    const fila = vivos(cargaDe(e, rutaId)).find((y) => y.codigo === normalizarCodigoBulto(codigo))
    if (!fila) return falla('Ese bulto no está cargado en esta ruta')
    fila.estado = 'RETIRADO'; fila.motivo = motivo.trim()
    return { ok: true }
  }

  async excluirPedido(rutaId: string, salidaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const x = this.exigirEnCarga(e, rutaId, puedeLiberarUnidad(actor.roles), 'No tienes permiso para dejar un pedido fuera de la salida')
    if ('error' in x) return x.error
    if (!motivo.trim()) return falla('Cuenta por qué el pedido se deja fuera de la salida')
    if (!x.r.paradas.some((p) => p.activa && p.salidaId === salidaId)) return falla('Ese pedido no está en esta ruta')
    const c = cargaDe(e, rutaId)
    if (c.exclusiones.some((y) => y.salidaId === salidaId)) return falla('Ese pedido ya se dejó fuera de la salida')
    c.exclusiones.push({ salidaId, motivo: motivo.trim(), por: actor.nombre, en: ahora() })
    const codigos = new Set(bultosVigentes(e, salidaId).map((b) => b.codigo))
    for (const y of vivos(c)) if (codigos.has(y.codigo)) { y.estado = 'RETIRADO'; y.motivo = `El pedido se dejó fuera de la salida: ${motivo.trim()}` }
    registrar(e, actor, 'pedido_fuera_de_la_salida', 'rutas', rutaId, x.r.numero, motivo.trim())
    return { ok: true }
  }

  async liberarUnidad(rutaId: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const x = this.exigirEnCarga(e, rutaId, puedeLiberarUnidad(actor.roles), 'No tienes permiso para liberar la unidad')
    if ('error' in x) return x.error
    const carga = await this.cargaRuta(rutaId)
    if (carga && carga.motivosNoLiberar.length) return falla(carga.motivosNoLiberar[0])
    x.r.estado = 'LIBERADA'; cargaDe(e, rutaId).liberadaEn = ahora()
    registrar(e, actor, 'unidad_liberada', 'rutas', rutaId, x.r.numero)
    return { ok: true }
  }

  async confirmarSalidaRuta(rutaId: string, actor: Actor): Promise<ResultadoAccion<{ reservas: number }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeConfirmarSalida(actor.roles)) return falla('No tienes permiso para confirmar la salida')
    const r = this.ruta(e, rutaId)
    if (!r) return falla('No encontramos esa ruta')
    if (r.estado === 'EN_RUTA') return { ok: true, reservas: 0 }                                      // idempotente
    if (r.estado !== 'LIBERADA') return falla('La unidad todavía no está liberada: libérala antes de confirmar la salida')
    const c = cargaDe(e, rutaId); let n = 0
    for (const p of this.paradasConSalida(r)) {
      if (c.exclusiones.some((y) => y.salidaId === p.salidaId)) continue
      n += this.descontar(e, desp(e).salidas.find((s) => s.id === p.salidaId)!, actor)
    }
    r.estado = 'EN_RUTA'; c.salioEn = ahora()
    registrar(e, actor, 'salida_de_ruta_confirmada', 'rutas', rutaId, `${r.numero}: ${n} reservas`)
    return { ok: true, reservas: n }
  }

  /** El stock SALE: cada reserva en la zona de conformidad baja del saldo y queda en el libro como SALIDA. */
  private descontar(e: EstadoDemo, s: SalidaDemo, actor: Actor): number {
    let n = 0
    for (const rv of desp(e).reservas.filter((x) => x.estado === 'EN_STAGING' && s.lineas.some((l) => l.id === x.lineaId))) {
      const lt = e.panorama.lotes.find((l) => l.id === rv.loteId)!
      if (!quitarSaldo(e, { loteId: rv.loteId, estado: 'APROBADO', procedenciaId: rv.procedenciaId, posicionId: rv.posicionId, cantidad: rv.cantidad })) continue
      anotar(e.inv, `sal-${s.numero}-${rv.id.slice(-6)}`, 'SALIDA', ahora(), { motivo: `Salida ${s.numero}`, ejecutorId: actor.id, referenciaTipo: 'salida_linea', referenciaId: rv.lineaId },
        [{ productoId: rv.productoId, loteId: rv.loteId, propietarioId: lt.propietarioId, estado: 'APROBADO', origen: origenDe(e, rv.loteId, rv.procedenciaId), procedenciaId: rv.procedenciaId, posicionId: rv.posicionId, delta: -rv.cantidad }])
      rv.estado = 'CONSUMIDA'; n += 1
    }
    for (const l of s.lineas) if (l.estado === 'CONFORME' && !desp(e).reservas.some((x) => x.lineaId === l.id && ['ACTIVA', 'EN_TRANSITO', 'EN_STAGING'].includes(x.estado))) l.estado = 'CONFIRMADA'
    if (s.lineas.every((l) => l.estado === 'CONFIRMADA' || l.estado === 'CANCELADA')) s.estado = 'CONFIRMADA'
    return n
  }

  protected override bloqueoReabrir(e: EstadoDemo, s: SalidaDemo): string | null {
    const codigos = new Set(bultosVigentes(e, s.id).map((b) => b.codigo))
    return Object.values(cargas(e)).some((c) => vivos(c).some((x) => codigos.has(x.codigo))) ? 'Hay bultos de este pedido cargados en una ruta: retíralos de la carga antes de reabrir el embalaje' : null
  }

  protected override avanceExtra(e: EstadoDemo, s: SalidaDemo): { embalada?: boolean; cargada?: boolean } {
    const b = bultosVigentes(e, s.id)
    const cargada = b.length > 0 && b.every((x) => Object.values(cargas(e)).some((c) => vivos(c).some((y) => y.codigo === x.codigo)))
    return { ...super.avanceExtra(e, s), cargada }
  }

  /** La hora real de salida (LS-FR.43.03) es la de la salida confirmada. */
  protected override extrasLsFr(e: EstadoDemo, r: RutaDemo): ExtrasLsFr {
    return { ...super.extrasLsFr(e, r), horaSalida: cargas(e)[r.id]?.salioEn }
  }
}
