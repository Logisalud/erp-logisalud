'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { guardarArchivo } from '@/services/archivos'
import { TIPO_SUSTENTO_DE_MOTIVO, contentTypeSustento, validarArchivoSustento, type DatosEvaluacionBaja, type EntradaBaja } from '@/domain/bajas'
import type { Actor, ResultadoAccion } from '@/services/repositorio'

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}
const falla = (mensaje: string, errores?: Record<string, string>): ResultadoAccion<never> => ({ ok: false, mensaje, errores })
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

export async function stockParaBajaAccion(propietarioId: string, consulta: string) { await exigirContexto(); return repositorio().stockParaBaja(propietarioId, consulta, 40) }
export async function solicitarBajaAccion(entrada: EntradaBaja) { return repositorio().solicitarBaja(entrada, await quien()) }
export async function confirmarVencimientoBajaAccion(lineaId: string) { return repositorio().confirmarVencimientoBaja(lineaId, await quien()) }
export async function registrarEvaluacionBajaAccion(lineaId: string, datos: DatosEvaluacionBaja) { return repositorio().registrarEvaluacionBaja(lineaId, datos, await quien()) }
export async function autorizarBajaAccion(id: string) { return repositorio().autorizarBaja(id, await quien()) }
export async function cerrarSolicitudBajaAccion(id: string, decision: 'RECHAZADA' | 'CANCELADA', motivo: string) { return repositorio().cerrarSolicitudBaja(id, decision, motivo, await quien()) }
export async function anularOrdenBajaAccion(id: string, motivo: string) { return repositorio().anularOrdenBaja(id, motivo, await quien()) }
export async function reemitirOrdenBajaAccion(id: string) { return repositorio().reemitirOrdenBaja(id, await quien()) }
export async function trasladarBajaAccion(id: string, destinoId?: string) { return repositorio().trasladarBaja(id, destinoId, await quien()) }
export async function ubicacionesDeBajasAccion(propietarioId: string) { await exigirContexto(); return repositorio().ubicacionesDeBajas(propietarioId) }

/** Adjunta la alerta de DIGEMID o la comunicación del proveedor a una línea: guarda el archivo y lo registra. */
export async function adjuntarSustentoBajaAccion(f: FormData): Promise<ResultadoAccion> {
  const lineaId = texto(f, 'lineaId')
  const tipo = texto(f, 'tipo') as 'ALERTA_DIGEMID' | 'COMUNICACION_PROVEEDOR'
  if (!lineaId || !Object.values(TIPO_SUSTENTO_DE_MOTIVO).includes(tipo)) return falla('No pudimos saber a qué línea va el archivo. Vuelve a intentarlo.')
  const archivo = f.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) return falla('Falta el archivo.', { archivo: 'Adjunta el archivo.' })
  const malo = validarArchivoSustento(archivo.name, archivo.size)
  if (malo) return falla(malo, { archivo: malo })
  const g = await guardarArchivo(`baja-${tipo}`, archivo.name, new Uint8Array(await archivo.arrayBuffer()), contentTypeSustento(archivo.name))
  return repositorio().adjuntarSustentoBaja(lineaId, { tipo, nombre: archivo.name, ref: g.ref, hash: g.hash, bytes: archivo.size, referencia: texto(f, 'referencia') || undefined }, await quien())
}
