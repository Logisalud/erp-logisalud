'use server'

import { cookies } from 'next/headers'
import { exigirContexto } from '@/lib/contexto'
import { modoDemoActivo } from '@/lib/demo'
import { COOKIE_ROL_DEMO, rolDemoDesdeCookie } from '@/lib/sesion-demo'
import { repositorio } from '@/services/repositorio-actual'
import { buscar } from '@/domain/panorama'
import type { Decision, EntradaIngreso, EntradaLote } from '@/domain/entradas'
import type { DatosEdicionIngreso, DatosOrganolepticaGuardar, FirmaEntrada } from '@/domain/entradas-vistas'
import type { Actor, ResultadoAccion } from '@/services/repositorio'

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}

// ── Ingresos ────────────────────────────────────────────────────────────────

export async function crearIngresoAccion(entrada: EntradaIngreso): Promise<ResultadoAccion<{ id: string }>> {
  return repositorio().crearIngreso(entrada, await quien())
}
export async function editarIngresoAccion(id: string, datos: DatosEdicionIngreso): Promise<ResultadoAccion> {
  return repositorio().editarIngreso(id, datos, await quien())
}
export async function guardarLotesAccion(id: string, lineaId: string, lotes: EntradaLote[]): Promise<ResultadoAccion> {
  return repositorio().guardarLotes(id, lineaId, lotes, await quien())
}
export async function editarSolicitudAccion(id: string, datos: Record<string, unknown>, motivo: string | undefined): Promise<ResultadoAccion<{ version: number }>> {
  return repositorio().editarSolicitud(id, datos, motivo, await quien())
}
export async function generarActaAccion(id: string): Promise<ResultadoAccion<{ actaId: string }>> {
  return repositorio().generarActa(id, await quien())
}
export async function firmarActaAccion(actaId: string, firma: FirmaEntrada): Promise<ResultadoAccion<{ completa: boolean }>> {
  return repositorio().firmarActa(actaId, firma, await quien())
}
export async function anularActaAccion(actaId: string, motivo: string): Promise<ResultadoAccion> {
  return repositorio().anularActa(actaId, motivo, await quien())
}
export async function reemitirActaAccion(actaId: string): Promise<ResultadoAccion<{ actaId: string }>> {
  return repositorio().reemitirActa(actaId, await quien())
}
export async function confirmarIngresoAccion(id: string): Promise<ResultadoAccion> {
  return repositorio().confirmarIngreso(id, await quien())
}

// ── Calidad ─────────────────────────────────────────────────────────────────

export async function guardarOrganolepticaAccion(id: string, datos: DatosOrganolepticaGuardar, enviar: boolean): Promise<ResultadoAccion> {
  return repositorio().guardarOrganoleptica(id, datos, enviar, await quien())
}
export async function decidirOrganolepticaAccion(id: string, decision: Decision, observacion: string | undefined): Promise<ResultadoAccion> {
  return repositorio().decidirOrganoleptica(id, decision, observacion, await quien())
}

// ── Alertas y expediente ────────────────────────────────────────────────────

export async function atenderAlertaAccion(id: string, nota: string | undefined): Promise<ResultadoAccion> {
  return repositorio().atenderAlerta(id, nota, await quien())
}
export async function agregarDocumentoAccion(expedienteId: string, tipo: string, descripcion: string): Promise<ResultadoAccion> {
  return repositorio().agregarDocumento(expedienteId, tipo, descripcion, await quien())
}
export async function agregarFaltanteAccion(expedienteId: string, documento: string, responsable: string): Promise<ResultadoAccion> {
  return repositorio().agregarFaltante(expedienteId, documento, responsable, await quien())
}
export async function resolverFaltanteAccion(faltanteId: string, nota: string | undefined): Promise<ResultadoAccion> {
  return repositorio().resolverFaltante(faltanteId, nota, await quien())
}
export async function cerrarExpedienteAccion(expedienteId: string): Promise<ResultadoAccion> {
  return repositorio().cerrarExpediente(expedienteId, await quien())
}

// ── Apoyo ───────────────────────────────────────────────────────────────────

/** Productos para el selector de líneas (el catálogo real tiene ~500: se busca, no se precarga). */
export async function buscarProductosAccion(consulta: string): Promise<{ id: string; codigo: string; descripcion: string; presentacion?: string }[]> {
  await exigirContexto()
  if (consulta.trim().length < 2) return []
  const p = await repositorio().panorama()
  const ids = buscar(p, consulta, 12).filter((r) => r.tipo === 'producto').map((r) => r.id)
  return ids.map((id) => p.productos.find((x) => x.id === id)!).filter(Boolean)
    .map((x) => ({ id: x.id, codigo: x.codigo, descripcion: x.descripcion, presentacion: x.presentacion }))
}

/** Solo demostración: cambiar de rol sin volver al inicio de sesión (para probar el flujo con varias personas). */
export async function cambiarRolDemoAccion(rol: string): Promise<void> {
  if (!modoDemoActivo()) return
  const r = rolDemoDesdeCookie(rol)
  if (!r) return
  cookies().set(COOKIE_ROL_DEMO, r, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
}
