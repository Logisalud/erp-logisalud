'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import type { PersonalTransporte, PlanRuta, VehiculoVista } from '@/domain/rutas'
import type { Actor } from '@/services/repositorio'

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}

export async function crearRutaAccion(datos: { fecha: string; vehiculoId?: string; conductorId?: string; auxiliarId?: string }) { return repositorio().crearRuta(datos, await quien()) }
export async function planificarRutaAccion(id: string, plan: PlanRuta) { return repositorio().planificarRuta(id, plan, await quien()) }
export async function confirmarRutaAccion(id: string) { return repositorio().confirmarRuta(id, await quien()) }
export async function cancelarRutaAccion(id: string, motivo: string) { return repositorio().cancelarRuta(id, motivo, await quien()) }
export async function guardarPersonalAccion(p: { id?: string; nombre: string; funcion: PersonalTransporte['funcion']; activo: boolean }) { return repositorio().guardarPersonal(p, await quien()) }
export async function guardarVehiculoAccion(v: Pick<VehiculoVista, 'placa' | 'descripcion' | 'tipo' | 'calificado' | 'aptoCadenaFrio' | 'activo'> & { id?: string }) { return repositorio().guardarVehiculo(v, await quien()) }
