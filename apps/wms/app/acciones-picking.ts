'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import type { AsignacionLote } from '@/domain/salidas'
import type { TipoNoConformidad } from '@/domain/despacho'
import type { RepartoBulto } from '@/domain/embalaje'
import type { ItemChecklist } from '@/domain/carga'
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

export async function embalarSalidaAccion(salidaId: string, reparto: RepartoBulto[]) { return repositorio().embalarSalida(salidaId, reparto, await quien()) }
export async function reabrirEmbalajeAccion(salidaId: string, motivo: string) { return repositorio().reabrirEmbalaje(salidaId, motivo, await quien()) }

export async function guardarChecklistAccion(rutaId: string, items: ItemChecklist[]) { return repositorio().guardarChecklist(rutaId, items, await quien()) }
export async function cargarBultoAccion(rutaId: string, codigo: string) { return repositorio().cargarBulto(rutaId, codigo, await quien()) }
export async function retirarBultoAccion(rutaId: string, codigo: string, motivo: string) { return repositorio().retirarBulto(rutaId, codigo, motivo, await quien()) }
export async function excluirPedidoAccion(rutaId: string, salidaId: string, motivo: string) { return repositorio().excluirPedido(rutaId, salidaId, motivo, await quien()) }
export async function liberarUnidadAccion(rutaId: string) { return repositorio().liberarUnidad(rutaId, await quien()) }
export async function confirmarSalidaRutaAccion(rutaId: string) { return repositorio().confirmarSalidaRuta(rutaId, await quien()) }
