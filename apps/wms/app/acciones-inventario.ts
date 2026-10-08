'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import type { FilaCargaInicial, ErrorFilaCarga, LineaPreparar } from '@/domain/inventario'
import type { Actor, ResultadoAccion } from '@/services/repositorio'

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}

// ── Movimientos internos ────────────────────────────────────────────────────
export async function prepararMovimientoAccion(lineas: LineaPreparar[], motivo: string): Promise<ResultadoAccion<{ id: string; numero: string }>> {
  return repositorio().prepararMovimiento(lineas, motivo, await quien())
}
export async function autorizarMovimientoAccion(id: string): Promise<ResultadoAccion> { return repositorio().autorizarMovimiento(id, await quien()) }
export async function ejecutarMovimientoAccion(id: string): Promise<ResultadoAccion> { return repositorio().ejecutarMovimiento(id, await quien()) }
export async function confirmarMovimientoAccion(id: string): Promise<ResultadoAccion> { return repositorio().confirmarMovimiento(id, await quien()) }
export async function diferenciaMovimientoAccion(id: string, nota: string): Promise<ResultadoAccion> { return repositorio().registrarDiferenciaMovimiento(id, nota, await quien()) }
export async function resolverMovimientoAccion(id: string, accion: 'REINTENTAR' | 'ANULAR', nota: string): Promise<ResultadoAccion> { return repositorio().resolverMovimiento(id, accion, nota, await quien()) }
export async function anularMovimientoAccion(id: string, motivo: string): Promise<ResultadoAccion> { return repositorio().anularMovimiento(id, motivo, await quien()) }

// ── Conteos y ajustes ───────────────────────────────────────────────────────
export async function programarConteoAccion(posicionIds: string[], nota: string | undefined): Promise<ResultadoAccion<{ id: string; numero: string }>> {
  return repositorio().programarConteo(posicionIds, nota, await quien())
}
export async function registrarConteoAccion(lineaId: string, cantidad: number): Promise<ResultadoAccion<{ resultado: string }>> { return repositorio().registrarConteo(lineaId, cantidad, await quien()) }
export async function registrarCausaConteoAccion(lineaId: string, causa: string): Promise<ResultadoAccion> { return repositorio().registrarCausaConteo(lineaId, causa, await quien()) }
export async function proponerAjusteAccion(lineaId: string, motivo: string): Promise<ResultadoAccion<{ id: string }>> { return repositorio().proponerAjuste(lineaId, motivo, await quien()) }
export async function decidirAjusteAccion(ajusteId: string, decision: 'AUTORIZAR' | 'RECHAZAR', nota: string | undefined): Promise<ResultadoAccion> { return repositorio().decidirAjuste(ajusteId, decision, nota, await quien()) }
export async function escalarLineaConteoAccion(lineaId: string, nota: string): Promise<ResultadoAccion> { return repositorio().escalarLineaConteo(lineaId, nota, await quien()) }
export async function cerrarConteoAccion(id: string, causa: string | undefined, accion: string | undefined): Promise<ResultadoAccion> { return repositorio().cerrarConteo(id, causa, accion, await quien()) }

// ── Carga inicial ───────────────────────────────────────────────────────────
export async function validarCargaInicialAccion(filas: FilaCargaInicial[]): Promise<ErrorFilaCarga[]> { return repositorio().validarCargaInicial(filas, await quien()) }
export async function crearCargaInicialAccion(filas: FilaCargaInicial[], nota: string | undefined): Promise<ResultadoAccion<{ id: string; numero: string }>> { return repositorio().crearCargaInicial(filas, nota, await quien()) }
export async function decidirEstadoCargaInicialAccion(estado: 'APROBADO' | 'CUARENTENA'): Promise<ResultadoAccion> { return repositorio().decidirEstadoCargaInicial(estado, await quien()) }
export async function confirmarCargaInicialAccion(id: string): Promise<ResultadoAccion> { return repositorio().confirmarCargaInicial(id, await quien()) }
