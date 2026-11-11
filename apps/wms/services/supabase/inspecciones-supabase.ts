import 'server-only'

import type { InspeccionVista, Items, TipoInspeccion } from '@/domain/inspecciones'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { DatosInspeccion, RepositorioInspecciones, VehiculoInspeccion } from '../repositorio-inspecciones'
import { nombresDe } from './entradas-supabase'
import { SeguimientoSupabase } from './seguimiento-supabase'
import { mensajeHumano, rpc, s, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL. Verificado contra el contrato de las funciones de la migración 0058 (probadas en Postgres local, tests/db/inspecciones.test.ts) y por tipos.
// Quien conduce no lee tablas: solo `vehiculos_para_inspeccion`, `registrar_inspeccion_unidad`, `supervisar_inspeccion_unidad` e `inspecciones_del_mes`, que reconocen a la persona.

export class InspeccionesSupabase extends SeguimientoSupabase implements RepositorioInspecciones {
  async vehiculosParaInspeccion(_actor: Actor): Promise<VehiculoInspeccion[]> {
    const { data, error } = await rpc('vehiculos_para_inspeccion', {})
    if (error) throw new Error(mensajeHumano(error))
    return ((data ?? []) as Fila[]).map((v) => ({ id: String(v.id), placa: String(v.placa), descripcion: s(v.descripcion) }))
  }

  async inspeccionesDelMes(tipo: TipoInspeccion, vehiculoId: string, mes: string, _actor: Actor): Promise<InspeccionVista[]> {
    const { data, error } = await rpc('inspecciones_del_mes', { p_tipo: tipo, p_vehiculo: vehiculoId, p_mes: `${mes}-01` })
    if (error) throw new Error(mensajeHumano(error))
    const filas = (data ?? []) as Fila[]
    const sinNombre = filas.flatMap((f) => [f.realizada_nombre ? undefined : s(f.realizada_por), f.supervisada_nombre ? undefined : s(f.supervisada_por)])
    const nombres = sinNombre.some(Boolean) ? await nombresDe(sinNombre) : new Map<string, string>()
    return filas.map((f) => ({
      id: String(f.id), tipo, vehiculoId, fecha: String(f.fecha), items: (f.items ?? {}) as Items, conforme: Boolean(f.conforme), observaciones: s(f.observaciones),
      realizadaPor: String(f.realizada_por), realizadaNombre: s(f.realizada_nombre) ?? nombres.get(String(f.realizada_por)) ?? 'Usuario', realizadaEn: String(f.realizada_en),
      supervisadaPor: s(f.supervisada_por), supervisadaNombre: f.supervisada_por ? (s(f.supervisada_nombre) ?? nombres.get(String(f.supervisada_por)) ?? 'Usuario') : undefined, supervisadaEn: s(f.supervisada_en),
    }))
  }

  async registrarInspeccion(d: DatosInspeccion, _actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const { data, error } = await rpc('registrar_inspeccion_unidad', { p_tipo: d.tipo, p_vehiculo: d.vehiculoId, p_fecha: d.fecha, p_items: d.items, p_observaciones: d.observaciones ?? null })
    if (error) return { ok: false, mensaje: mensajeHumano(error) }
    return { ok: true, id: String(data) }
  }

  async supervisarInspeccion(id: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('supervisar_inspeccion_unidad', { p_id: id })
    return error ? { ok: false, mensaje: mensajeHumano(error) } : { ok: true }
  }
}
