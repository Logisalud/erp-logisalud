'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { guardarArchivo } from '@/services/archivos'
import { validarDictamenCliente, validarDocumentoDictamen } from '@/domain/liberacion'
import type { EntradaRetorno } from '@/domain/retornos'
import type { Actor, ResultadoAccion } from '@/services/repositorio'

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}
const falla = (mensaje: string, errores?: Record<string, string>): ResultadoAccion<never> => ({ ok: false, mensaje, errores })
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

// ── Muestreo (LS-TB.02.02) ──────────────────────────────────────────────────
export async function marcarAntecedentesAccion(productoId: string, motivo: string) { return repositorio().marcarAntecedentes(productoId, motivo, await quien()) }
export async function quitarAntecedentesAccion(productoId: string, motivo: string) { return repositorio().quitarAntecedentes(productoId, motivo, await quien()) }

// ── Liberación (LS-POE.04.05) ───────────────────────────────────────────────
export async function observarActaAccion(actaId: string, textoObservacion: string) { return repositorio().observarActa(actaId, textoObservacion, await quien()) }
export async function levantarObservacionAccion(actaId: string, nota: string) { return repositorio().levantarObservacion(actaId, nota, await quien()) }

/** Registra el dictamen del DT del cliente: el documento que llegó por correo se guarda en el bucket y aquí solo viaja su referencia y su huella. */
export async function registrarDictamenAccion(f: FormData): Promise<ResultadoAccion<{ id: string }>> {
  const actaId = texto(f, 'actaId')
  const repo = repositorio()
  const acta = await repo.obtenerOrganoleptica(actaId)
  if (!acta) return falla('No encontramos esa acta')
  const v = validarDictamenCliente({ liberada: texto(f, 'liberada'), rechazada: texto(f, 'rechazada'), fechaDictamen: texto(f, 'fechaDictamen') }, acta.pendienteDecision ?? acta.cantidadLote)
  if (!v.ok) return falla(v.mensaje, v.errores)
  const archivo = f.get('documento')
  const doc = archivo instanceof File && archivo.size > 0 ? archivo : null
  const malo = validarDocumentoDictamen(doc ? { name: doc.name, type: doc.type, size: doc.size } : null)
  if (malo || !doc) return falla(malo ?? 'Adjunta el documento del dictamen.', { documento: malo ?? 'Adjunta el documento del dictamen.' })
  const guardado = await guardarArchivo('DICTAMEN_CLIENTE', doc.name, new Uint8Array(await doc.arrayBuffer()), doc.type)
  return repo.registrarDictamen(actaId, {
    liberada: v.liberada, rechazada: v.rechazada, fechaDictamen: texto(f, 'fechaDictamen'), observacion: texto(f, 'observacion') || undefined,
    documento: { ref: guardado.ref, nombre: doc.name, tipo: doc.type, hash: guardado.hash },
  }, await quien())
}
export async function confirmarDictamenAccion(dictamenId: string) { return repositorio().confirmarDictamen(dictamenId, await quien()) }
export async function anularDictamenAccion(dictamenId: string, motivo: string) { return repositorio().anularDictamen(dictamenId, motivo, await quien()) }

// ── Retornos ────────────────────────────────────────────────────────────────
export async function crearRetornoAccion(entrada: EntradaRetorno, autorizar: boolean) { return repositorio().crearRetorno(entrada, autorizar, await quien()) }
