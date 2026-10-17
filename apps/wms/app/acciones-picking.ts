'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import type { AsignacionLote } from '@/domain/salidas'
import type { TipoNoConformidad } from '@/domain/despacho'
import type { Actor } from '@/services/repositorio'

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}

export async function lotesParaEditarAccion(lineaId: string) { await exigirContexto(); return repositorio().lotesParaEditar(lineaId) }
export async function editarAsignacionAccion(lineaId: string, asignaciones: AsignacionLote[]) { return repositorio().editarAsignacion(lineaId, asignaciones, undefined, await quien()) }
export async function generarOrdenPickingAccion(salidaId: string) { return repositorio().generarOrdenPicking(salidaId, await quien()) }
export async function registrarPickingAccion(ordenLineaId: string, resultado: 'PICKEADA' | 'DISCREPANCIA', nota?: string) { return repositorio().registrarPicking(ordenLineaId, resultado, nota, await quien()) }
export async function proponerReemplazoAccion(ordenLineaId: string) { await exigirContexto(); return repositorio().proponerReemplazo(ordenLineaId) }
export async function resolverDiscrepanciaAccion(ordenLineaId: string, loteId: string, posicionId: string | undefined, nota?: string) { return repositorio().resolverDiscrepancia(ordenLineaId, loteId, posicionId, nota, await quien()) }
export async function darConformidadAccion(ordenLineaId: string, resultado: 'CONFORME' | 'OBSERVADA', nota?: string, tipo?: TipoNoConformidad) { return repositorio().darConformidad(ordenLineaId, resultado, nota, tipo, await quien()) }
export async function reabrirObservadaAccion(ordenLineaId: string, nota?: string) { return repositorio().reabrirObservada(ordenLineaId, nota, await quien()) }

export async function registrarGreAccion(salidaId: string, numero: string, nota?: string) { return repositorio().registrarGre(salidaId, numero, nota, await quien()) }
export async function anularGreAccion(guiaId: string, motivo: string) { return repositorio().anularGre(guiaId, motivo, await quien()) }
