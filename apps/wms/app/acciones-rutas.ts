'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import type { PersonalTransporte, PlanRuta, VehiculoVista } from '@/domain/rutas'
import type { Actor, ResultadoAccion } from '@/services/repositorio'
import type { DatosCierreRuta } from '@/services/repositorio-cierre-ruta'
import { guardarArchivo } from '@/services/archivos'
import { leerInforme } from '@/services/logger/leer-informe'
import { resumenDeInforme, type ResumenLeido } from '@/domain/data-logger'
import { leerTemperatura, puedeCerrarRuta, validarArchivoLogger, validarCierre, validarEscaneo } from '@/domain/cierre-ruta'

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

/** Lo que pasó con las lecturas del archivo del data logger al cerrar o corregir: se guardaron (con su cruce) o no se pudieron leer (y por qué). */
export type ResultadoLogger =
  | { estado: 'GUARDADO'; excede: boolean; coincide: boolean | null; dentroDeFecha: boolean }
  | { estado: 'NO_LEIDO'; motivo: string }

/** Lee el archivo del cierre y guarda sus lecturas. Si no se puede leer o guardar, el cierre sigue valiendo: se dice por qué y se puede anotar a mano. */
async function guardarLecturas(f: FormData, d: DatosCierreRuta, actor: Actor): Promise<ResultadoLogger> {
  const archivo = archivoDe(f)
  if (!archivo) return { estado: 'NO_LEIDO', motivo: 'Sin archivo.' }
  const lectura = leerInforme(archivo.name, archivo.type, Buffer.from(await archivo.arrayBuffer()))
  if (!lectura.ok) return { estado: 'NO_LEIDO', motivo: lectura.mensaje }
  const r = await repositorio().importarLecturasLogger(texto(f, 'rutaId'), lectura.informe, { nombre: d.archivo.nombre, hash: d.archivo.hash, ref: d.archivo.ref }, actor)
  return r.ok ? { estado: 'GUARDADO', excede: r.excede, coincide: r.coincide, dentroDeFecha: r.dentroDeFecha } : { estado: 'NO_LEIDO', motivo: r.mensaje }
}

/** Solo lee el archivo (no guarda nada): la pantalla muestra lo que encontró y rellena la mínima y la máxima. */
export async function leerLoggerAccion(f: FormData): Promise<ResultadoAccion<{ resumen: ResumenLeido }>> {
  const ctx = await exigirContexto()
  if (!puedeCerrarRuta(ctx.roles)) return falla('Solo el Jefe de Transporte lee el archivo del data logger.')
  const archivo = archivoDe(f)
  if (!archivo) return falla('Falta el archivo.', { archivo: 'Adjunta el archivo que descargaste del data logger.' })
  const malo = validarArchivoLogger({ nombre: archivo.name, bytes: archivo.size })
  if (malo) return falla(malo, { archivo: malo })
  const lectura = leerInforme(archivo.name, archivo.type, Buffer.from(await archivo.arrayBuffer()))
  return lectura.ok ? { ok: true, resumen: resumenDeInforme(lectura.informe) } : falla(lectura.mensaje, { archivo: lectura.mensaje })
}

/** Cierra la ruta: guarda el archivo del data logger tal cual, registra la mínima y la máxima y, si es un informe del RC-61 (PDF o CSV), guarda sus lecturas y las cruza con el cierre. */
export async function cerrarRutaAccion(f: FormData): Promise<ResultadoAccion<{ fueraDeRango: boolean; logger: ResultadoLogger }>> {
  const d = await datosCierre(f)
  if ('error' in d) return d.error
  const actor = await quien()
  const r = await repositorio().cerrarRuta(texto(f, 'rutaId'), d.datos, actor)
  if (!r.ok) return r
  return { ...r, logger: await guardarLecturas(f, d.datos, actor) }
}

/** Corrige el cierre de una ruta cerrada (versión nueva con su motivo; la anterior queda) y vuelve a leer el archivo si es un informe del RC-61. */
export async function corregirCierreRutaAccion(f: FormData): Promise<ResultadoAccion<{ version: number; fueraDeRango: boolean; logger: ResultadoLogger }>> {
  const motivo = texto(f, 'motivo')
  if (!motivo) return falla('Cuenta por qué se corrige el cierre.', { motivo: 'Cuenta por qué se corrige el cierre.' })
  const d = await datosCierre(f)
  if ('error' in d) return d.error
  const actor = await quien()
  const r = await repositorio().corregirCierreRuta(texto(f, 'rutaId'), d.datos, motivo, actor)
  if (!r.ok) return r
  return { ...r, logger: await guardarLecturas(f, d.datos, actor) }
}

/** Importa las lecturas de un archivo suelto en una ruta que ya salió o ya se cerró (por ejemplo, una cerrada antes de que el WMS leyera el informe). No cambia el cierre. */
export async function importarLoggerAccion(f: FormData): Promise<ResultadoAccion<{ excede: boolean; coincide: boolean | null; dentroDeFecha: boolean }>> {
  const archivo = archivoDe(f)
  if (!archivo) return falla('Falta el archivo.', { archivo: 'Adjunta el archivo que descargaste del data logger.' })
  const malo = validarArchivoLogger({ nombre: archivo.name, bytes: archivo.size })
  if (malo) return falla(malo, { archivo: malo })
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const lectura = leerInforme(archivo.name, archivo.type, Buffer.from(bytes))
  if (!lectura.ok) return falla(lectura.mensaje, { archivo: lectura.mensaje })
  const g = await guardarArchivo('DATA_LOGGER', archivo.name, bytes, archivo.type || 'application/octet-stream')
  return repositorio().importarLecturasLogger(texto(f, 'rutaId'), lectura.informe, { nombre: archivo.name, hash: g.hash, ref: g.ref }, await quien())
}
