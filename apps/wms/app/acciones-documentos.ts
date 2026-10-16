'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { guardarArchivo } from '@/services/archivos'
import { TIPOS_DOCUMENTO, validarArchivo, validarVigencia, type PerfilDocumental, type ResumenCargaCoa, type TipoDocumento } from '@/domain/documentos'
import type { Actor, ResultadoAccion } from '@/services/repositorio'

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}
const falla = (mensaje: string, errores?: Record<string, string>): ResultadoAccion<never> => ({ ok: false, mensaje, errores })
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const archivoDe = (f: FormData, k = 'archivo') => { const a = f.get(k); return a instanceof File && a.size > 0 ? a : null }

/** Sube un documento (o su versión nueva): guarda el PDF y lo registra. Con «reemplazaA», la versión anterior queda en el historial. */
export async function subirDocumentoAccion(f: FormData): Promise<ResultadoAccion<{ id: string }>> {
  const tipo = texto(f, 'tipo') as TipoDocumento
  if (!TIPOS_DOCUMENTO.includes(tipo)) return falla('Elige qué documento es.', { tipo: 'Elige qué documento es.' })
  const alcanceId = texto(f, 'alcanceId')
  if (!alcanceId) return falla('Elige de qué es el documento.', { alcanceId: 'Elige de qué es el documento.' })
  const archivo = archivoDe(f)
  if (!archivo) return falla('Falta el archivo.', { archivo: 'Adjunta el PDF.' })
  const malo = validarArchivo(archivo.name, archivo.size)
  if (malo) return falla(malo, { archivo: malo })
  const desde = texto(f, 'vigenteDesde') || undefined
  const hasta = texto(f, 'vigenteHasta') || undefined
  const vig = validarVigencia(desde, hasta)
  if (vig) return falla(vig, { vigenteHasta: vig })
  const guardado = await guardarArchivo(tipo, archivo.name, new Uint8Array(await archivo.arrayBuffer()))
  return repositorio().subirDocumento({
    tipo, alcanceId, nombreArchivo: archivo.name, archivoRef: guardado.ref, hash: guardado.hash, bytes: archivo.size,
    vigenteDesde: desde, vigenteHasta: hasta, reemplazaA: texto(f, 'reemplazaA') || undefined, motivo: texto(f, 'motivo') || undefined,
  }, await quien())
}

/** Carga masiva: el navegador manda un PDF por llamada (así ninguno topa el límite de tamaño) y aquí se relaciona con su lote. */
export async function cargarCoaArchivoAccion(f: FormData): Promise<ResultadoAccion<{ resumen: ResumenCargaCoa }>> {
  const archivo = archivoDe(f)
  if (!archivo) return falla('Falta el archivo.')
  const malo = validarArchivo(archivo.name, archivo.size)
  if (malo) return falla(`${archivo.name}: ${malo}`)
  const g = await guardarArchivo('COA', archivo.name, new Uint8Array(await archivo.arrayBuffer()))
  return repositorio().cargarCoaEnBloque([{ nombre: archivo.name, hash: g.hash, bytes: archivo.size, ref: g.ref }], await quien())
}

export async function buscarAlcanceAccion(tipo: TipoDocumento, consulta: string) {
  await exigirContexto()
  return repositorio().buscarAlcanceDocumento(tipo, consulta)
}

export async function asignarItemCoaAccion(itemId: string, loteId: string) { return repositorio().asignarItemCoa(itemId, loteId, await quien()) }
export async function descartarItemCoaAccion(itemId: string, motivo: string) { return repositorio().descartarItemCoa(itemId, motivo, await quien()) }
export async function reintentarItemsCoaAccion() { return repositorio().reintentarItemsCoa(await quien()) }
export async function crearFabricanteAccion(nombre: string) { return repositorio().crearFabricante(nombre, await quien()) }
export async function guardarPerfilDocumentalAccion(perfil: PerfilDocumental) { return repositorio().guardarPerfilDocumental(perfil, await quien()) }
