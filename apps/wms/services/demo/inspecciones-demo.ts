// Inspecciones de la unidad en la demostración (memoria): mismas reglas que la migración 0058 (`wms.registrar_inspeccion_unidad`, `supervisar_inspeccion_unidad`, `inspecciones_del_mes`).
import { hoyEnLima } from '@/domain/fechas'
import { esConforme, mesDe, puedeVerInspecciones, validarInspeccion, type InspeccionVista } from '@/domain/inspecciones'
import { ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { desp } from './despacho-demo'
import { registrar, type EstadoDemo } from './estado'
import { SeguimientoDemo } from './seguimiento-demo'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { DatosInspeccion, RepositorioInspecciones, VehiculoInspeccion } from '../repositorio-inspecciones'

const inspecciones = (e: EstadoDemo): InspeccionVista[] => ((e as EstadoDemo & { inspeccionesUnidad?: InspeccionVista[] }).inspeccionesUnidad ??= [])

export class InspeccionesDemo extends SeguimientoDemo implements RepositorioInspecciones {
  async vehiculosParaInspeccion(actor: Actor): Promise<VehiculoInspeccion[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeVerInspecciones(actor.roles)) return []
    return desp(e).vehiculos.filter((v) => v.activo).map((v) => ({ id: v.id, placa: v.placa, descripcion: v.descripcion })).sort((a, b) => a.placa.localeCompare(b.placa))
  }

  async inspeccionesDelMes(tipo: InspeccionVista['tipo'], vehiculoId: string, mes: string, actor: Actor): Promise<InspeccionVista[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeVerInspecciones(actor.roles)) return []
    return inspecciones(e).filter((i) => i.tipo === tipo && i.vehiculoId === vehiculoId && mesDe(i.fecha) === mes).sort((a, b) => a.fecha.localeCompare(b.fecha))
  }

  async registrarInspeccion(d: DatosInspeccion, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeVerInspecciones(actor.roles)) return falla('No tienes permiso para registrar inspecciones de la unidad')
    if (!desp(e).vehiculos.some((v) => v.id === d.vehiculoId && v.activo)) return falla('Elige un vehículo disponible')
    const errores = validarInspeccion({ tipo: d.tipo, vehiculoId: d.vehiculoId, fecha: d.fecha, hoy: hoyEnLima(), items: d.items, observaciones: d.observaciones })
    if (errores.length) return falla(errores[0])
    if (inspecciones(e).some((i) => i.tipo === d.tipo && i.vehiculoId === d.vehiculoId && i.fecha === d.fecha)) return falla('Ya hay una inspección de este vehículo en esa fecha')
    const id = nuevoId()
    inspecciones(e).push({ id, tipo: d.tipo, vehiculoId: d.vehiculoId, fecha: d.fecha, items: { ...d.items }, conforme: esConforme(d.tipo, d.items), observaciones: d.observaciones?.trim() || undefined, realizadaPor: actor.id, realizadaNombre: actor.nombre, realizadaEn: ahora() })
    registrar(e, actor, 'inspeccion_unidad', 'inspecciones_unidad', id, `${d.tipo} · ${d.fecha}`, d.observaciones)
    return { ok: true, id }
  }

  async supervisarInspeccion(id: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeVerInspecciones(actor.roles)) return falla('No tienes permiso para supervisar inspecciones')
    const i = inspecciones(e).find((x) => x.id === id)
    if (!i) return falla('No encontramos esa inspección')
    if (i.supervisadaPor) return falla('Esta inspección ya fue supervisada')
    if (i.realizadaPor === actor.id) return falla('La supervisa otra persona, no quien la hizo')
    Object.assign(i, { supervisadaPor: actor.id, supervisadaNombre: actor.nombre, supervisadaEn: ahora() })
    registrar(e, actor, 'inspeccion_supervisada', 'inspecciones_unidad', id, `${i.tipo} · ${i.fecha}`)
    return { ok: true }
  }
}
