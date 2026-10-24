'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import type { DocumentoTipo, PersonalTransporte, PlanRuta, VehiculoVista } from '@/domain/rutas'
import type { Actor, ResultadoAccion } from '@/services/repositorio'
import type { DatosCierreRuta } from '@/services/repositorio-cierre-ruta'
import { guardarArchivo } from '@/services/archivos'
import { leerTemperatura, validarArchivoLogger, validarCierre, validarEscaneo } from '@/domain/cierre-ruta'

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}

export async function crearRutaAccion(datos: { fecha: string; vehiculoId?: string; conductorId?: string; auxiliarId?: string }) { return repositorio().crearRuta(datos, await quien()) }
export async function planificarRutaAccion(id: string, plan: PlanRuta) { return repositorio().planificarRuta(id, plan, await quien()) }
export async function confirmarRutaAccion(id: string) { return repositorio().confirmarRuta(id, await quien()) }
export async function cancelarRutaAccion(id: string, motivo: string) { return repositorio().cancelarRuta(id, motivo, await quien()) }
export async function guardarPersonalAccion(p: { id?: string; nombre: string; funcion: PersonalTransporte['funcion']; activo: boolean }) { return repositorio().guardarPersonal(p, await quien()) }
/** D-155 (temporal): quién figura como conductor en la guía y en el LS-FR.43.03 (`null` = el conductor real de cada ruta). */
export async function cambiarConductorEnDocumentosAccion(personaId: string | null, motivo: string) { return repositorio().cambiarConductorEnDocumentos(personaId, motivo, await quien()) }
export async function guardarDocumentosPersonalAccion(p: { id: string; documentoTipo: DocumentoTipo; dni: string; licencia?: string }) { return repositorio().guardarDocumentosPersonal(p, await quien()) }
export async function guardarVehiculoAccion(v: Pick<VehiculoVista, 'placa' | 'descripcion' | 'tipo' | 'calificado' | 'aptoCadenaFrio' | 'activo'> & { id?: string }) { return repositorio().guardarVehiculo(v, await quien()) }

// ── OS-7: LS-FR.43.03 (impresión, escaneo firmado) y cierre de ruta con el data logger ──────────────────────────────────────────────
const falla = (mensaje: string, errores?: Record<string, string>): ResultadoAccion<never> => ({ ok: false, mensaje, errores })
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const archivoDe = (f: FormData, k = 'archivo') => { const a = f.get(k); return a instanceof File && a.size > 0 ? a : null }

/** Registra que se imprimió el formato (quién y cuándo); la pantalla abre el PDF después. */
export async function registrarImpresionLsFrAccion(rutaId: string) { return repositorio().registrarImpresionLsFr(rutaId, await quien()) }

/** Sube el escaneo del formato firmado por el conductor y Dirección Técnica; queda ligado a la ruta y se conserva 5 años. */
export async function subirEscaneoLsFrAccion(f: FormData): Promise<ResultadoAccion<{ version: number; conservarHasta: string }>> {
  const archivo = archivoDe(f)
  if (!archivo) return falla('Falta el archivo.', { archivo: 'Adjunta el escaneo del formato firmado.' })
  const malo = validarEscaneo({ nombre: archivo.name, bytes: archivo.size })
  if (malo) return falla(malo, { archivo: malo })
  const g = await guardarArchivo('LS_FR_ESCANEO', archivo.name, new Uint8Array(await archivo.arrayBuffer()), archivo.type || 'application/pdf')
  return repositorio().subirEscaneoLsFr(texto(f, 'rutaId'), { ref: g.ref, nombre: archivo.name, hash: g.hash, bytes: archivo.size, tipo: archivo.type || undefined }, texto(f, 'motivo') || undefined, await quien())
}

async function datosCierre(f: FormData): Promise<{ datos: DatosCierreRuta } | { error: ResultadoAccion<never> }> {
  const tempMin = leerTemperatura(texto(f, 'tempMin')); const tempMax = leerTemperatura(texto(f, 'tempMax'))
  const errores = validarCierre({ tempMin, tempMax })
  const archivo = archivoDe(f)
  if (!archivo) errores.archivo = 'Adjunta el archivo que descargaste del data logger.'
  else { const malo = validarArchivoLogger({ nombre: archivo.name, bytes: archivo.size }); if (malo) errores.archivo = malo }
  if (Object.keys(errores).length) return { error: falla('Revisa los campos marcados.', errores) }
  const g = await guardarArchivo('DATA_LOGGER', archivo!.name, new Uint8Array(await archivo!.arrayBuffer()), archivo!.type || 'application/octet-stream')
  return { datos: { tempMin: tempMin!, tempMax: tempMax!, observaciones: texto(f, 'observaciones') || undefined, archivo: { ref: g.ref, nombre: archivo!.name, hash: g.hash, bytes: archivo!.size, tipo: archivo!.type || undefined } } }
}

/** Cierra la ruta: guarda el archivo del data logger tal cual (sin leerlo) y registra la temperatura mínima y máxima. */
export async function cerrarRutaAccion(f: FormData): Promise<ResultadoAccion<{ fueraDeRango: boolean }>> {
  const d = await datosCierre(f)
  if ('error' in d) return d.error
  return repositorio().cerrarRuta(texto(f, 'rutaId'), d.datos, await quien())
}

/** Corrige el cierre de una ruta cerrada (versión nueva con su motivo; la anterior queda). */
export async function corregirCierreRutaAccion(f: FormData): Promise<ResultadoAccion<{ version: number; fueraDeRango: boolean }>> {
  const motivo = texto(f, 'motivo')
  if (!motivo) return falla('Cuenta por qué se corrige el cierre.', { motivo: 'Cuenta por qué se corrige el cierre.' })
  const d = await datosCierre(f)
  if ('error' in d) return d.error
  return repositorio().corregirCierreRuta(texto(f, 'rutaId'), d.datos, motivo, await quien())
}
