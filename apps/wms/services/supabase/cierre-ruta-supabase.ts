import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import type { InformeLogger, LecturaLogger, LecturasLoggerVista } from '@/domain/data-logger'
import type { CierreRutaVista, EscaneoLsFr, ExtrasLsFr, ImpresionLsFr } from '@/domain/ls-fr-43-03'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { ArchivoGuardado, DatosCierreRuta, RepositorioCierreRuta } from '../repositorio-cierre-ruta'
import { nombresDe } from './entradas-supabase'
import { BajasSupabase } from './bajas-supabase'
import { mensajeHumano, rpc, s, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás). Está verificado contra el contrato de las funciones SQL de la migración
// 0027 (probada en Postgres local: tests/db/ls-fr-y-carga-inicial.test.ts) y por tipos. Las reglas las aplica la base de datos.

const dia = (v: unknown) => String(v).slice(0, 10)
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const sch = () => crearClienteServidor().schema('wms')

export class CierreRutaSupabase extends BajasSupabase implements RepositorioCierreRuta {
  /** USUARIO del formato (quien preparó la ruta), las impresiones, el escaneo firmado y el cierre con su data logger. */
  protected override async extrasLsFr(rutaId: string): Promise<ExtrasLsFr> {
    const [base, { data: ruta }, { data: imp }, { data: esc }, { data: cie }, logger] = await Promise.all([
      super.extrasLsFr(rutaId),
      sch().from('rutas').select('creada_por').eq('id', rutaId).maybeSingle(),
      sch().from('ls_fr_impresiones').select('por, en, antes_de_salir').eq('ruta_id', rutaId).order('en', { ascending: false }),
      sch().from('ls_fr_escaneos').select('*').eq('ruta_id', rutaId).order('version', { ascending: false }),
      sch().from('ruta_cierres').select('*').eq('ruta_id', rutaId).order('version', { ascending: false }),
      this.lecturasLogger(rutaId),
    ])
    const filasImp = (imp ?? []) as Fila[]; const filasEsc = (esc ?? []) as Fila[]; const filasCie = (cie ?? []) as Fila[]
    const nombres = await nombresDe([s((ruta as Fila | null)?.creada_por), ...filasImp.map((x) => s(x.por)), ...filasEsc.map((x) => s(x.subido_por)), ...filasCie.map((x) => s(x.cerrado_por))])
    const nom = (id: unknown) => nombres.get(String(id)) ?? 'Usuario'
    const impresiones: ImpresionLsFr[] = filasImp.map((x) => ({ por: nom(x.por), en: String(x.en), antesDeSalir: Boolean(x.antes_de_salir) }))
    const escaneos: EscaneoLsFr[] = filasEsc.map((x) => ({
      version: Number(x.version), nombre: String(x.archivo_nombre), bytes: Number(x.archivo_bytes), tipo: s(x.archivo_tipo), subidoPor: nom(x.subido_por), subidoEn: String(x.subido_en),
      conservarHasta: dia(x.conservar_hasta), motivo: s(x.motivo), vigente: Boolean(x.vigente),
    }))
    const cierres: CierreRutaVista[] = filasCie.map((x) => ({
      version: Number(x.version), tempMin: Number(x.temp_min), tempMax: Number(x.temp_max), fueraDeRango: Boolean(x.fuera_de_rango), archivoNombre: String(x.archivo_nombre),
      archivoBytes: Number(x.archivo_bytes), archivoTipo: s(x.archivo_tipo), observaciones: s(x.observaciones), motivo: s(x.motivo), cerradoPor: nom(x.cerrado_por), cerradoEn: String(x.cerrado_en),
      vigente: Boolean(x.vigente),
    }))
    return { ...base, usuario: (ruta as Fila | null)?.creada_por ? nom((ruta as Fila).creada_por) : undefined, impresiones, escaneos, cierres, logger }
  }

  async registrarImpresionLsFr(rutaId: string, _actor: Actor): Promise<ResultadoAccion<{ impresiones: number }>> {
    const { data, error } = await rpc('registrar_impresion_ls_fr', { p_ruta: rutaId })
    return error ? mal(error) : { ok: true, impresiones: Number(data) }
  }

  async subirEscaneoLsFr(rutaId: string, a: ArchivoGuardado, motivo: string | undefined, _actor: Actor): Promise<ResultadoAccion<{ version: number; conservarHasta: string }>> {
    const { error } = await rpc('subir_escaneo_ls_fr', { p_ruta: rutaId, p_archivo_ref: a.ref, p_archivo_nombre: a.nombre, p_archivo_hash: a.hash, p_archivo_bytes: a.bytes, p_motivo: motivo?.trim() || null, p_archivo_tipo: a.tipo ?? null })
    if (error) return mal(error)
    const { data } = await sch().from('ls_fr_escaneos').select('version, conservar_hasta').eq('ruta_id', rutaId).eq('vigente', true).maybeSingle()
    return { ok: true, version: Number((data as Fila | null)?.version ?? 1), conservarHasta: dia((data as Fila | null)?.conservar_hasta ?? '') }
  }

  async cerrarRuta(rutaId: string, d: DatosCierreRuta, _actor: Actor): Promise<ResultadoAccion<{ fueraDeRango: boolean }>> {
    const { error } = await rpc('cerrar_ruta', {
      p_ruta: rutaId, p_temp_min: d.tempMin, p_temp_max: d.tempMax, p_archivo_ref: d.archivo.ref, p_archivo_nombre: d.archivo.nombre, p_archivo_hash: d.archivo.hash,
      p_archivo_bytes: d.archivo.bytes, p_archivo_tipo: d.archivo.tipo ?? null, p_observaciones: d.observaciones?.trim() || null,
    })
    if (error) return mal(error)
    const { data } = await sch().from('ruta_cierres').select('fuera_de_rango').eq('ruta_id', rutaId).eq('vigente', true).maybeSingle()
    return { ok: true, fueraDeRango: Boolean((data as Fila | null)?.fuera_de_rango) }
  }

  async corregirCierreRuta(rutaId: string, d: DatosCierreRuta, motivo: string, _actor: Actor): Promise<ResultadoAccion<{ version: number; fueraDeRango: boolean }>> {
    const { error } = await rpc('corregir_cierre_ruta', {
      p_ruta: rutaId, p_temp_min: d.tempMin, p_temp_max: d.tempMax, p_archivo_ref: d.archivo.ref, p_archivo_nombre: d.archivo.nombre, p_archivo_hash: d.archivo.hash,
      p_archivo_bytes: d.archivo.bytes, p_motivo: motivo, p_archivo_tipo: d.archivo.tipo ?? null,
    })
    if (error) return mal(error)
    const { data } = await sch().from('ruta_cierres').select('version, fuera_de_rango').eq('ruta_id', rutaId).eq('vigente', true).maybeSingle()
    return { ok: true, version: Number((data as Fila | null)?.version ?? 2), fueraDeRango: Boolean((data as Fila | null)?.fuera_de_rango) }
  }

  async archivoLsFr(rutaId: string, que: 'ESCANEO' | 'DATA_LOGGER', version?: number): Promise<{ ref: string; nombre: string; tipo?: string } | null> {
    const tabla = que === 'ESCANEO' ? 'ls_fr_escaneos' : 'ruta_cierres'
    let q = sch().from(tabla).select('archivo_ref, archivo_nombre, archivo_tipo').eq('ruta_id', rutaId)
    q = version ? q.eq('version', version) : q.eq('vigente', true)
    const { data } = await q.maybeSingle()
    const f = data as Fila | null
    return f ? { ref: String(f.archivo_ref), nombre: String(f.archivo_nombre), tipo: s(f.archivo_tipo) } : null
  }

  /** SB-C: la base recalcula mínima, máxima y minutos sobre el límite desde las lecturas; aquí solo se mandan (hora del equipo, temperatura, humedad). */
  async importarLecturasLogger(rutaId: string, i: InformeLogger, a: { nombre: string; hash: string; ref?: string }, _actor: Actor): Promise<ResultadoAccion<{ excede: boolean; coincide: boolean | null; dentroDeFecha: boolean }>> {
    const { data, error } = await rpc('registrar_lecturas_logger', {
      p_ruta: rutaId, p_archivo_nombre: a.nombre, p_archivo_hash: a.hash, p_formato: i.formato, p_modelo: i.modelo ?? null, p_serie: i.serie ?? null, p_intervalo_min: i.intervaloMin ?? null,
      p_umbral_alto: i.umbralAlto ?? null, p_umbral_bajo: i.umbralBajo ?? null, p_lecturas: i.lecturas.map((x) => ({ t: x.momento, c: x.temperatura, h: x.humedad ?? null })), p_archivo_ref: a.ref ?? null,
    })
    if (error) return mal(error)
    const { data: fila } = await sch().from('ruta_logger_importes').select('excede, coincide_con_cierre, dentro_de_fecha_ruta').eq('id', String(data)).maybeSingle()
    const f = fila as Fila | null
    return { ok: true, excede: Boolean(f?.excede), coincide: f?.coincide_con_cierre == null ? null : Boolean(f.coincide_con_cierre), dentroDeFecha: f ? Boolean(f.dentro_de_fecha_ruta) : true }
  }

  async lecturasLogger(rutaId: string): Promise<LecturasLoggerVista[]> {
    const { data } = await sch().from('ruta_logger_importes').select('*').eq('ruta_id', rutaId).order('importado_en', { ascending: false })
    const filas = (data ?? []) as Fila[]
    if (!filas.length) return []
    const nombres = await nombresDe(filas.map((x) => s(x.importado_por)))
    const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v))
    const lecturasDe = async (importeId: string): Promise<LecturaLogger[]> => {
      const out: LecturaLogger[] = []
      for (let desde = 0; ; desde += 1000) {
        const { data: pag } = await sch().from('ruta_logger_lecturas').select('momento, temperatura, humedad').eq('importe_id', importeId).order('momento').range(desde, desde + 999)
        const p = (pag ?? []) as Fila[]
        for (const x of p) out.push({ momento: String(x.momento).replace(' ', 'T').slice(0, 19), temperatura: Number(x.temperatura), ...(x.humedad == null ? {} : { humedad: Number(x.humedad) }) })
        if (p.length < 1000) break
      }
      return out
    }
    const hora = (v: unknown) => String(v).replace(' ', 'T').slice(0, 19)
    return Promise.all(filas.map(async (x): Promise<LecturasLoggerVista> => ({
      id: String(x.id), archivoNombre: String(x.archivo_nombre), formato: x.formato as 'PDF' | 'CSV', modelo: s(x.modelo), serie: s(x.serie), intervaloMin: num(x.intervalo_min),
      umbralEquipoAlto: num(x.umbral_alto), umbralEquipoBajo: num(x.umbral_bajo), primera: hora(x.primera_lectura), ultima: hora(x.ultima_lectura), puntos: Number(x.puntos),
      tempMin: Number(x.temp_min), tempMax: Number(x.temp_max), tempProm: Number(x.temp_prom), limite: Number(x.limite_c), excede: Boolean(x.excede), lecturasSobreLimite: Number(x.lecturas_sobre_limite),
      minutosSobreLimite: Number(x.minutos_sobre_limite), primeraExcedencia: x.primera_excedencia ? hora(x.primera_excedencia) : undefined,
      coincideConCierre: x.coincide_con_cierre == null ? null : Boolean(x.coincide_con_cierre), cierreMin: num(x.cierre_min), cierreMax: num(x.cierre_max), dentroDeFecha: Boolean(x.dentro_de_fecha_ruta),
      importadoPor: nombres.get(String(x.importado_por)) ?? 'Usuario', importadoEn: String(x.importado_en), vigente: Boolean(x.vigente), lecturas: x.vigente ? await lecturasDe(String(x.id)) : [],
    })))
  }
}
