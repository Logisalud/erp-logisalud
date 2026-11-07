// «Mis rutas» en la demostración (memoria): mismas reglas que la migración 0043 (`wms.mis_rutas_del_dia` y `wms.registrar_evento_parada`).
import { datosParaLsFr, estadoDeParada, esTerminal, motivoNoSePuede, RUTA_PERMITE_MARCAR, todasResueltas, validarEventoParada, type EventoParada, type EventoParadaVista, type ParadaMia, type RutaMia } from '@/domain/mis-rutas'
import { puedeVerMisRutas } from '@/domain/mis-rutas'
import type { ExtrasLsFr } from '@/domain/ls-fr-43-03'
import { claveDeOrden } from '@/domain/rutas'
import { alertar, ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { desp, type RutaDemo } from './despacho-demo'
import { registrar, type EstadoDemo } from './estado'
import { PilotoDemo } from './piloto-demo'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { DatosEventoParada, RepositorioMisRutas } from '../repositorio-mis-rutas'

interface EventoGuardado extends EventoParadaVista { paradaId: string; rutaId: string; por: string; fotoRef?: string; fotoHash?: string }
const eventos = (e: EstadoDemo): EventoGuardado[] => ((e as EstadoDemo & { eventosParada?: EventoGuardado[] }).eventosParada ??= [])

export class MisRutasDemo extends PilotoDemo implements RepositorioMisRutas {
  private suya(e: EstadoDemo, r: RutaDemo, actor: Actor): boolean {
    const d = desp(e)
    return [r.conductorId, r.auxiliarId].some((id) => id && d.personal.find((p) => p.id === id)?.usuarioId === actor.id)
  }

  async misRutas(actor: Actor, fecha?: string): Promise<RutaMia[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeVerMisRutas(actor.roles)) return []
    const dia = fecha ?? e.panorama.hoy
    const panorama = await this.panoramaRutas()
    return panorama.rutas
      .filter((v) => v.fecha === dia && ['LIBERADA', 'EN_RUTA', 'PENDIENTE_CIERRE', 'CERRADA'].includes(v.estado))
      .filter((v) => { const r = desp(e).rutas.find((x) => x.id === v.id); return !!r && this.suya(e, r, actor) })
      .map((v) => {
        const puedeMarcar = RUTA_PERMITE_MARCAR.includes(v.estado)
        const paradas: ParadaMia[] = v.paradas.map((p) => {
          const ev = eventos(e).filter((x) => x.paradaId === p.id).map(({ paradaId: _a, rutaId: _b, por: _c, fotoRef: _d, fotoHash: _e, ...x }) => x as EventoParadaVista)
          return { id: p.id, secuencia: p.secuencia, cliente: p.cliente, direccion: p.direccion, distrito: p.distrito, ventanaCita: p.ventanaCita, pedidoNumero: p.pedidoNumero || undefined, ordenNumero: p.salidaNumero, unidades: p.unidades, eventos: ev, estado: estadoDeParada(ev) }
        })
        return { id: v.id, numero: v.numero, fecha: v.fecha, estado: v.estado, vehiculo: v.vehiculo?.placa, conductor: v.conductor?.nombre, auxiliar: v.auxiliar?.nombre, paradas, puedeMarcar }
      })
  }

  async registrarEventoParada(paradaId: string, evento: EventoParada, datos: DatosEventoParada, actor: Actor): Promise<ResultadoAccion<{ retornoPorOriginar: boolean; rutaPendienteDeCierre: boolean }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeVerMisRutas(actor.roles)) return falla('No tienes permiso para registrar entregas')
    const r = desp(e).rutas.find((x) => x.paradas.some((p) => p.id === paradaId && p.activa))
    if (!r) return falla('No encontramos esa parada')
    if (!this.suya(e, r, actor)) return falla('Esa parada no es de una ruta tuya')
    const v = (await this.panoramaRutas()).rutas.find((x) => x.id === r.id)!
    const pv = v.paradas.find((p) => p.id === paradaId)!
    const previos = eventos(e).filter((x) => x.paradaId === paradaId)
    const estado = estadoDeParada(previos)
    const no = motivoNoSePuede(evento, estado, RUTA_PERMITE_MARCAR.includes(r.estado))
    if (no) return falla(no)
    const errores = validarEventoParada(evento, { motivo: datos.motivo, recibioNombre: datos.recibioNombre, recibioDocumento: datos.recibioDocumento, tieneFoto: !!datos.foto })
    const primero = Object.values(errores)[0]
    if (primero) return falla(primero, errores)
    eventos(e).push({
      id: nuevoId(), paradaId, rutaId: r.id, evento, motivo: datos.motivo?.trim() || undefined,
      recibioNombre: evento === 'ENTREGADO' ? datos.recibioNombre!.trim() : undefined, recibioDocumento: evento === 'ENTREGADO' ? datos.recibioDocumento!.trim() : undefined,
      fotoNombre: evento === 'ENTREGADO' ? datos.foto!.nombre : undefined, fotoRef: evento === 'ENTREGADO' ? datos.foto!.ref : undefined, fotoHash: evento === 'ENTREGADO' ? datos.foto!.hash : undefined,
      hora: ahora(), por: actor.id,
    })
    let retornoPorOriginar = false
    if (evento === 'NO_ENTREGADO' || evento === 'RECHAZADO') {
      retornoPorOriginar = true
      alertar(e, 'RETORNO_POR_ORIGINAR', 'jefe_transporte', `${evento === 'RECHAZADO' ? 'Rechazado' : 'No entregado'} en la ruta ${r.numero} (${pv.cliente}): ${datos.motivo!.trim()}. Origina el retorno desde su Orden de Salida (Devoluciones).`, `retorno-parada:${paradaId}`)
    }
    // todas las paradas con resultado → la ruta queda pendiente de cierre (la cierra el Jefe de Transporte como siempre)
    let rutaPendienteDeCierre = false
    if (esTerminal(evento) && r.estado === 'EN_RUTA') {
      const todas = r.paradas.filter((p) => p.activa).map((p) => ({ estado: estadoDeParada(eventos(e).filter((x) => x.paradaId === p.id)) }))
      if (todasResueltas(todas)) { r.estado = 'PENDIENTE_CIERRE'; rutaPendienteDeCierre = true }
    }
    registrar(e, actor, 'parada_evento', 'ruta_paradas', paradaId, `${evento} · ${r.numero}`, datos.motivo)
    return { ok: true, retornoPorOriginar, rutaPendienteDeCierre }
  }

  /** Lo que marcó quien conduce alimenta el LS-FR.43.03: hora de entrega y observaciones por parada. */
  protected override extrasLsFr(e: EstadoDemo, r: RutaDemo): ExtrasLsFr {
    const base = super.extrasLsFr(e, r)
    const horaEntrega: Record<string, string> = { ...(base.horaEntrega ?? {}) }
    const observaciones: Record<string, string> = { ...(base.observaciones ?? {}) }
    for (const p of r.paradas.filter((x) => x.activa)) {
      const clave = p.pedidoId ?? (p.salidaId ? claveDeOrden(p.salidaId) : undefined)
      if (!clave) continue
      const d = datosParaLsFr(eventos(e).filter((x) => x.paradaId === p.id))
      if (d.horaEntrega) horaEntrega[clave] = d.horaEntrega
      if (d.observaciones) observaciones[clave] = d.observaciones
    }
    return { ...base, horaEntrega, observaciones }
  }
}
