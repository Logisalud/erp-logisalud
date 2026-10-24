// OS-7 en memoria (modo demostración): cierre de ruta con el data logger, impresión registrada y escaneo firmado del LS-FR.43.03. Mismas reglas que la migración 0027.
import {
  conservarHasta, CONSERVACION_ANIOS_POR_DEFECTO, fueraDeRangoTemperatura, type CierreRutaVista, type EscaneoLsFr, type ExtrasLsFr, type ImpresionLsFr,
} from '@/domain/ls-fr-43-03'
import { motivoNoSeCierra, motivoNoSeEscanea, puedeCerrarRuta, puedeRegistrarLsFr, validarCierre } from '@/domain/cierre-ruta'
import { detalleUsoConductor } from '@/domain/conductor-documentos'
import { registrar, type EstadoDemo } from './estado'
import { ahora, estadoE, falla } from './entradas-demo'
import { desp, type RutaDemo } from './despacho-demo'
import { BajasDemo } from './bajas-demo'
import type { ArchivoGuardado, DatosCierreRuta, RepositorioCierreRuta } from '../repositorio-cierre-ruta'
import type { Actor, ResultadoAccion } from '../repositorio'

export interface LsFrDemo {
  impresiones: ImpresionLsFr[]
  escaneos: (EscaneoLsFr & { ref: string })[]
  cierres: (CierreRutaVista & { ref: string })[]
}
const lsfr = (e: EstadoDemo, rutaId: string): LsFrDemo => ((desp(e).lsFr ??= {})[rutaId] ??= { impresiones: [], escaneos: [], cierres: [] })
const nuevasPrimero = <T extends { version: number }>(l: T[]) => [...l].sort((a, b) => b.version - a.version)
const hoyLima = (iso: string) => new Date(Date.parse(iso) - 5 * 3_600_000).toISOString().slice(0, 10)
void hoyLima

export class CierreRutaDemo extends BajasDemo implements RepositorioCierreRuta {
  private rutaDe(e: EstadoDemo, id: string): RutaDemo | undefined { return desp(e).rutas.find((r) => r.id === id) }

  /** El registro sigue a lo que pasó: impreso → completo (cerrada con su data logger) → archivado (con el escaneo firmado). */
  private sincronizar(e: EstadoDemo, r: RutaDemo) {
    const l = lsfr(e, r.id)
    const cierre = l.cierres.some((c) => c.vigente); const escaneo = l.escaneos.some((x) => x.vigente)
    if (cierre && escaneo) r.registroLsFr = 'ARCHIVADO'
    else if (cierre) r.registroLsFr = 'COMPLETO'
    else if (l.impresiones.length) r.registroLsFr = 'GENERADO'
  }

  protected override extrasLsFr(e: EstadoDemo, r: RutaDemo): ExtrasLsFr {
    const l = lsfr(e, r.id)
    const sinRef = <T extends { ref: string }>({ ref: _ref, ...x }: T) => { void _ref; return x }
    return {
      ...super.extrasLsFr(e, r), usuario: r.creadaPor, impresiones: [...l.impresiones].reverse(),
      escaneos: nuevasPrimero(l.escaneos).map(sinRef) as EscaneoLsFr[], cierres: nuevasPrimero(l.cierres).map(sinRef) as CierreRutaVista[],
    }
  }

  async registrarImpresionLsFr(rutaId: string, actor: Actor): Promise<ResultadoAccion<{ impresiones: number }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeRegistrarLsFr(actor.roles)) return falla('No tienes permiso para imprimir el formato de la ruta')
    const r = this.rutaDe(e, rutaId)
    if (!r) return falla('No encontramos esa ruta')
    if (!r.registroLsFr) return falla('El formato nace al confirmar la ruta')
    const l = lsfr(e, rutaId)
    l.impresiones.push({ por: actor.nombre, en: ahora(), antesDeSalir: ['PLANIFICADA', 'LISTA_PARA_CARGA', 'LIBERADA'].includes(r.estado) })
    this.sincronizar(e, r)
    registrar(e, actor, 'ls_fr_impreso', 'rutas', r.numero, `Formato LS-FR.43.03 impreso (${l.impresiones.length})`)
    // D-156: cada uso del conductor en documentos se audita junto al conductor real
    registrar(e, actor, 'conductor_en_documento', 'rutas', r.numero, detalleUsoConductor(`LS-FR.43.03 impreso (${l.impresiones.length})`, this.quienFigura(e, r.conductorId)))
    return { ok: true, impresiones: l.impresiones.length }
  }

  async subirEscaneoLsFr(rutaId: string, archivo: ArchivoGuardado, motivo: string | undefined, actor: Actor): Promise<ResultadoAccion<{ version: number; conservarHasta: string }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeRegistrarLsFr(actor.roles)) return falla('No tienes permiso para subir el formato firmado')
    const r = this.rutaDe(e, rutaId)
    if (!r) return falla('No encontramos esa ruta')
    if (!r.registroLsFr) return falla('El formato nace al confirmar la ruta')
    const no = motivoNoSeEscanea(r.estado)
    if (no) return falla(no.replace('ya fue liberada', `ya fue liberada (la ruta está ${r.estado.toLowerCase().replace(/_/g, ' ')})`))
    const l = lsfr(e, rutaId)
    const vigente = l.escaneos.find((x) => x.vigente)
    const mot = motivo?.trim() || undefined
    if (vigente && !mot) return falla('Ya hay un escaneo firmado: para cambiarlo cuenta por qué (el anterior se conserva)')
    if (vigente) vigente.vigente = false
    const version = (vigente?.version ?? 0) + 1
    const hasta = conservarHasta(r.fecha, CONSERVACION_ANIOS_POR_DEFECTO)
    l.escaneos.push({ version, nombre: archivo.nombre, bytes: archivo.bytes, tipo: archivo.tipo, subidoPor: actor.nombre, subidoEn: ahora(), conservarHasta: hasta, motivo: mot, vigente: true, ref: archivo.ref })
    this.sincronizar(e, r)
    registrar(e, actor, 'ls_fr_escaneo_subido', 'rutas', r.numero, `Escaneo del LS-FR.43.03 firmado subido (versión ${version})`, mot)
    return { ok: true, version, conservarHasta: hasta }
  }

  private validarDatos(datos: DatosCierreRuta): string | null {
    const errores = validarCierre(datos)
    return Object.values(errores)[0] ?? null
  }

  async cerrarRuta(rutaId: string, datos: DatosCierreRuta, actor: Actor): Promise<ResultadoAccion<{ fueraDeRango: boolean }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeCerrarRuta(actor.roles)) return falla('Solo el Jefe de Transporte cierra la ruta')
    const r = this.rutaDe(e, rutaId)
    if (!r) return falla('No encontramos esa ruta')
    const no = motivoNoSeCierra(r.estado)
    if (no) return falla(r.estado === 'CERRADA' ? 'La ruta ya está cerrada. Si algo del cierre está mal, corrígelo con su motivo' : no.replace('todavía no salió', `todavía no salió (está ${r.estado.toLowerCase().replace(/_/g, ' ')})`))
    const mal = this.validarDatos(datos)
    if (mal) return falla(mal)
    const fuera = fueraDeRangoTemperatura(datos.tempMin, datos.tempMax)
    lsfr(e, rutaId).cierres.push({
      version: 1, tempMin: datos.tempMin, tempMax: datos.tempMax, fueraDeRango: fuera, archivoNombre: datos.archivo.nombre, archivoBytes: datos.archivo.bytes, archivoTipo: datos.archivo.tipo,
      observaciones: datos.observaciones?.trim() || undefined, cerradoPor: actor.nombre, cerradoEn: ahora(), vigente: true, ref: datos.archivo.ref,
    })
    r.estado = 'CERRADA'
    this.sincronizar(e, r)
    registrar(e, actor, 'ruta_cerrada', 'rutas', r.numero, `Ruta cerrada: ${datos.tempMin} – ${datos.tempMax} °C${fuera ? ' (fuera del rango del formato)' : ''}`, datos.observaciones?.trim() || undefined)
    return { ok: true, fueraDeRango: fuera }
  }

  async corregirCierreRuta(rutaId: string, datos: DatosCierreRuta, motivo: string, actor: Actor): Promise<ResultadoAccion<{ version: number; fueraDeRango: boolean }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeCerrarRuta(actor.roles)) return falla('Solo el Jefe de Transporte corrige el cierre de la ruta')
    const r = this.rutaDe(e, rutaId)
    if (!r) return falla('No encontramos esa ruta')
    if (r.estado !== 'CERRADA') return falla('La ruta todavía no está cerrada')
    if (!motivo.trim()) return falla('Cuenta por qué se corrige el cierre', { motivo: 'Cuenta por qué se corrige el cierre.' })
    const mal = this.validarDatos(datos)
    if (mal) return falla(mal)
    const l = lsfr(e, rutaId)
    const actual = l.cierres.find((c) => c.vigente)
    if (actual) actual.vigente = false
    const version = (actual?.version ?? 0) + 1
    const fuera = fueraDeRangoTemperatura(datos.tempMin, datos.tempMax)
    l.cierres.push({
      version, tempMin: datos.tempMin, tempMax: datos.tempMax, fueraDeRango: fuera, archivoNombre: datos.archivo.nombre, archivoBytes: datos.archivo.bytes, archivoTipo: datos.archivo.tipo,
      observaciones: datos.observaciones?.trim() || undefined, motivo: motivo.trim(), cerradoPor: actor.nombre, cerradoEn: ahora(), vigente: true, ref: datos.archivo.ref,
    })
    registrar(e, actor, 'cierre_de_ruta_corregido', 'rutas', r.numero, `Cierre corregido (versión ${version})`, motivo.trim())
    return { ok: true, version, fueraDeRango: fuera }
  }

  async archivoLsFr(rutaId: string, que: 'ESCANEO' | 'DATA_LOGGER', version?: number): Promise<{ ref: string; nombre: string; tipo?: string } | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const l = lsfr(e, rutaId)
    if (que === 'ESCANEO') { const x = l.escaneos.find((y) => (version ? y.version === version : y.vigente)); return x ? { ref: x.ref, nombre: x.nombre, tipo: x.tipo } : null }
    const x = l.cierres.find((y) => (version ? y.version === version : y.vigente))
    return x ? { ref: x.ref, nombre: x.archivoNombre, tipo: x.archivoTipo } : null
  }
}
