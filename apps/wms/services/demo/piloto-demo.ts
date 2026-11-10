// El modo piloto y la copia de las órdenes de compra, en memoria (modo demostración). Aplica las mismas reglas que la migración 0038 (`wms.sincronizar_oc` y compañía).
import type { ModoPiloto } from '@/domain/modo-piloto'
import {
  describirCambioOc, mensajeOcEliminada, situacionOc, tocaSincronizar, TEXTO_ERROR_SINCRONIZACION,
  type EstadoSincronizacionOc, type ResultadoSincronizacionAuto, type ContenidoOc, type OcPilotoVista, type ResumenSincronizacion, type VersionOc,
} from '@/domain/oc-versiones'
import { hashDeContenidoOc } from '@/lib/oc-hash'
import { puede } from '@/domain/permisos'
import { alertar, ahora, estadoE, falla, nuevoId } from './entradas-demo'
import type { EstadoDemo, OcDemo } from './estado'
import { modoPilotoDemo, piloto } from './piloto-estado'
import { SalidaManualDemo } from './salida-manual-demo'
import { registrar } from './estado'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioPiloto } from '../repositorio-piloto'

const ABIERTAS = new Set(['enviada', 'confirmada', 'parcialmente_recibida'])
const esAbierta = (o: OcDemo) => ABIERTAS.has(o.estado ?? 'confirmada')

function contenido(e: EstadoDemo, o: OcDemo): ContenidoOc {
  const prod = (id: string) => e.panorama.productos.find((p) => p.id === id)
  return {
    encabezado: { ocId: o.ocId, codigo: o.codigo, proveedorId: o.proveedorRuc, proveedorNombre: o.proveedorNombre, proveedorRuc: o.proveedorRuc, anulada: o.estado === 'anulada' },
    lineas: o.items.map((i) => ({ ocItemId: i.ocItemId, productoId: i.productoId, productoCodigo: prod(i.productoId)?.codigo ?? '', productoDescripcion: prod(i.productoId)?.descripcion ?? '', cantidadPedida: i.pedida })),
  }
}

const vigente = (e: EstadoDemo, ocId: string): VersionOc | undefined => piloto(e).versiones.filter((v) => v.encabezado.ocId === ocId).sort((a, b) => b.version - a.version)[0]

/** Espejo de `wms._sincronizar_oc`. */
function sincronizarUna(e: EstadoDemo, ocId: string, actor: Actor): 'CREADA' | 'SIN_CAMBIOS' | 'CAMBIADA' | 'ELIMINADA' | 'AUSENTE' {
  const ult = vigente(e, ocId)
  const oc = e.compras.find((o) => o.ocId === ocId)
  const agregar = (c: ContenidoOc, estadoOc: string | undefined, eliminada: boolean): VersionOc => {
    const v: VersionOc = { id: nuevoId(), version: (ult?.version ?? 0) + 1, ...c, estadoOc, hash: hashDeContenidoOc(c), eliminadaEnCompras: eliminada, creadaEn: ahora(), creadaPor: actor.nombre }
    piloto(e).versiones.push(v)
    registrar(e, actor, 'oc_version_creada', 'oc_versiones', v.id, `Copia de la orden ${c.encabezado.codigo}: versión ${v.version}`)
    return v
  }
  if (!oc) {
    if (!ult) return 'AUSENTE'
    if (ult.eliminadaEnCompras) return 'SIN_CAMBIOS'
    const v = agregar({ encabezado: { ...ult.encabezado, eliminada: true }, lineas: [] }, undefined, true)
    alertar(e, 'OC_CAMBIADA', 'asistente_dt', mensajeOcEliminada(ult.encabezado.codigo, ult.version), `oc-cambiada:${ocId}:${v.version}`)
    return 'ELIMINADA'
  }
  const c = contenido(e, oc)
  if (ult && ult.hash === hashDeContenidoOc(c)) return 'SIN_CAMBIOS'
  const v = agregar(c, oc.estado, false)
  if (ult) alertar(e, 'OC_CAMBIADA', 'asistente_dt', describirCambioOc(c.encabezado.codigo, v.version, ult, c), `oc-cambiada:${ocId}:${v.version}`)
  return ult ? 'CAMBIADA' : 'CREADA'
}

export class PilotoDemo extends SalidaManualDemo implements RepositorioPiloto {
  async modoPiloto(): Promise<ModoPiloto | undefined> { return modoPilotoDemo(estadoE()) }
  /** Pruebas: enciende o apaga el modo piloto de la demostración. */
  fijarModoPiloto(modo: ModoPiloto) { piloto(estadoE()).modo = modo }

  async ocsDelPiloto(): Promise<OcPilotoVista[]> {
    const e = estadoE()
    const ids = [...new Set([...e.compras.filter(esAbierta).map((o) => o.ocId), ...piloto(e).versiones.map((v) => v.encabezado.ocId)])]
    return ids.map((id): OcPilotoVista => {
      const oc = e.compras.find((o) => o.ocId === id)
      const v = vigente(e, id)
      const versionVigente = v?.version ?? 0
      const cambios = Math.max(0, versionVigente - 1)
      const avisoAbierto = e.alertas.some((a) => a.tipo === 'OC_CAMBIADA' && a.estado === 'ABIERTA' && ((a as { clave?: string }).clave ?? '').startsWith(`oc-cambiada:${id}:`))
      const eliminadaEnCompras = !!v?.eliminadaEnCompras
      return {
        ocId: id, codigo: oc?.codigo ?? v?.encabezado.codigo ?? '—', proveedorNombre: oc?.proveedorNombre ?? v?.encabezado.proveedorNombre ?? '—', estadoCompras: oc?.estado ?? v?.estadoOc,
        lineasEnCompras: oc?.items.length ?? 0, versionVigente, copiadaEn: v?.creadaEn, copiadaPor: v?.creadaPor, lineasCopia: v?.lineas.length ?? 0, cambios, avisoAbierto, eliminadaEnCompras,
        situacion: situacionOc({ versionVigente, cambios, avisoAbierto, eliminadaEnCompras }),
      }
    }).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  }

  private correrSincronizacion(e: EstadoDemo, actor: Actor): ResumenSincronizacion {
    const ids = [...new Set([...e.compras.filter(esAbierta).map((o) => o.ocId), ...piloto(e).versiones.map((v) => v.encabezado.ocId)])]
    const r: ResumenSincronizacion = { revisadas: 0, nuevas: 0, cambiadas: 0, eliminadas: 0, sinCambios: 0 }
    for (const id of ids) {
      const a = sincronizarUna(e, id, actor)
      if (a === 'AUSENTE') continue
      r.revisadas += 1
      if (a === 'CREADA') r.nuevas += 1; else if (a === 'CAMBIADA') r.cambiadas += 1; else if (a === 'ELIMINADA') r.eliminadas += 1; else r.sinCambios += 1
    }
    return r
  }

  async sincronizarOcs(actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenSincronizacion }>> {
    // «Revisar Compras ahora»: siempre corre (0 minutos) y deja la hora de la última sincronización
    const r = await this.sincronizarOcsSiToca(actor, 0)
    if (r.estado === 'SIN_PERMISO') return falla('No tienes permiso para copiar órdenes de compra')
    if (r.estado === 'EN_CURSO') return falla('Otra persona está revisando Compras en este momento. Espera un minuto y mira el resultado.')
    if (r.estado === 'ERROR' || !r.resumen) return falla(r.mensaje ?? TEXTO_ERROR_SINCRONIZACION)
    return { ok: true, resumen: r.resumen }
  }

  /** Pruebas: simula que Compras no responde / vuelve, y fija la hora de la última sincronización. */
  fijarFallaSincronizacionOcs(falla: boolean) { (piloto(estadoE()).sync ??= {}).falla = falla }
  fijarUltimaSincronizacionOcs(iso: string | undefined) { const s = (piloto(estadoE()).sync ??= {}); s.ultimaEn = iso; s.ultimoIntentoEn = iso; s.error = undefined }
  fijarSincronizacionEnCurso(enCurso: boolean) { (piloto(estadoE()).sync ??= {}).enCurso = enCurso }

  async estadoSincronizacionOcs(): Promise<EstadoSincronizacionOc> {
    const s = piloto(estadoE()).sync ?? {}
    return { ultimaEn: s.ultimaEn, ultimoIntentoEn: s.ultimoIntentoEn, ultimoError: s.error, ultimoResumen: s.resumen }
  }

  /** Espejo de `wms.sincronizar_ocs_si_toca` (migración 0045). */
  async sincronizarOcsSiToca(actor: Actor, minutos = 30): Promise<ResultadoSincronizacionAuto> {
    const e = estadoE()
    const s = (piloto(e).sync ??= {})
    const actual = async () => this.estadoSincronizacionOcs()
    if (!puede(actor.roles, 'ejecutar')) return { estado: 'SIN_PERMISO', actual: await actual() }
    if (s.enCurso) return { estado: 'EN_CURSO', actual: await actual() }
    if (minutos > 0 && !tocaSincronizar(s.ultimaEn, new Date(), minutos)) return { estado: 'AL_DIA', actual: await actual() }
    if (minutos > 0 && s.error && s.ultimoIntentoEn && Date.now() - Date.parse(s.ultimoIntentoEn) < 5 * 60_000) return { estado: 'ERROR', actual: await actual(), mensaje: s.error }
    s.enCurso = true
    try {
      if (s.falla) { s.ultimoIntentoEn = ahora(); s.error = TEXTO_ERROR_SINCRONIZACION; return { estado: 'ERROR', actual: await actual(), mensaje: TEXTO_ERROR_SINCRONIZACION } }
      const r = this.correrSincronizacion(e, actor)
      s.ultimaEn = ahora(); s.ultimoIntentoEn = s.ultimaEn; s.error = undefined; s.resumen = r
      if (r.nuevas + r.cambiadas + r.eliminadas > 0) registrar(e, actor, 'oc_sincronizacion', 'oc_sincronizacion', 'true', `Sincronización con Compras: ${r.nuevas} nuevas, ${r.cambiadas} cambiadas, ${r.eliminadas} eliminadas`, minutos === 0 ? 'manual' : 'automatica')
      return { estado: 'SINCRONIZADA', actual: await actual(), resumen: r }
    } finally { s.enCurso = false }
  }
}
