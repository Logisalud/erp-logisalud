'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import type { EntradaPendiente, FocoRevision, ResultadoFoco } from '@/domain/operacion'
import type { Actor, ResultadoAccion } from '@/services/repositorio'

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}

// ── Revisión diaria (INV-04) ────────────────────────────────────────────────
export async function iniciarRevisionAccion(): Promise<ResultadoAccion<{ id: string }>> { return repositorio().iniciarRevision(await quien()) }
export async function marcarFocoAccion(revisionId: string, foco: FocoRevision, resultado: ResultadoFoco): Promise<ResultadoAccion> { return repositorio().marcarFoco(revisionId, foco, resultado, await quien()) }
export async function registrarPendienteAccion(revisionId: string, datos: EntradaPendiente): Promise<ResultadoAccion<{ id: string }>> { return repositorio().registrarPendiente(revisionId, datos, await quien()) }
export async function resolverPendienteAccion(id: string, nota: string | undefined): Promise<ResultadoAccion> { return repositorio().resolverPendiente(id, nota, await quien()) }
export async function verificarPendienteAccion(id: string, conforme: boolean, nota: string | undefined): Promise<ResultadoAccion> { return repositorio().verificarPendiente(id, conforme, nota, await quien()) }
export async function cerrarRevisionAccion(id: string, nota: string | undefined): Promise<ResultadoAccion> { return repositorio().cerrarRevision(id, nota, await quien()) }

// ── Programación de los inventarios cíclicos (INV-05) ───────────────────────
export async function programarConteoSemanalAccion(lunes: string, orden: number, posicionIds: string[], nota: string | undefined): Promise<ResultadoAccion<{ id: string }>> { return repositorio().programarConteoSemanal(lunes, orden, posicionIds, nota, await quien()) }
export async function programarConteoExtraAccion(posicionIds: string[], incidencia: string): Promise<ResultadoAccion<{ id: string }>> { return repositorio().programarConteoExtra(posicionIds, incidencia, await quien()) }
export async function cancelarProgramacionAccion(id: string, motivo: string): Promise<ResultadoAccion> { return repositorio().cancelarProgramacion(id, motivo, await quien()) }
export async function generarConteoProgramadoAccion(id: string): Promise<ResultadoAccion<{ id: string; numero: string }>> { return repositorio().generarConteoProgramado(id, await quien()) }

/** Conteo extra por una incidencia: queda registrado como programación EXTRA y se genera enseguida (no espera al lunes). */
export async function conteoExtraAccion(posicionIds: string[], incidencia: string): Promise<ResultadoAccion<{ id: string; numero: string }>> {
  const actor = await quien()
  const repo = repositorio()
  const r = await repo.programarConteoExtra(posicionIds, incidencia, actor)
  if (!r.ok) return r
  return repo.generarConteoProgramado(r.id, actor)
}
