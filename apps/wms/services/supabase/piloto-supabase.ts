import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import { normalizarModoPiloto, type ModoPiloto } from '@/domain/modo-piloto'
import { situacionOc, TEXTO_ERROR_SINCRONIZACION, type EstadoSincronizacionOc, type OcPilotoVista, type ResultadoSincronizacionAuto, type ResumenSincronizacion } from '@/domain/oc-versiones'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioPiloto } from '../repositorio-piloto'
import { SalidaManualSupabase } from './salida-manual-supabase'
import { mensajeHumano, rpc, s, traerTodo, type Fila } from './util'

/** Compras puede no estar en la misma base (las vistas no existen): entonces no hay nada que mostrar. */
const leerOpcional = async (tabla: string): Promise<Fila[]> => { try { return await traerTodo(tabla, 'wms') } catch { return [] } }

export class PilotoSupabase extends SalidaManualSupabase implements RepositorioPiloto {
  async modoPiloto(): Promise<ModoPiloto | undefined> {
    try {
      const { data } = await crearClienteServidor().schema('wms').from('parametros').select('valor').eq('clave', 'modo_piloto').maybeSingle()
      return normalizarModoPiloto(s((data as Fila | null)?.valor))
    } catch { return undefined }
  }

  async ocsDelPiloto(): Promise<OcPilotoVista[]> {
    const [abiertas, vigentes, avisos] = await Promise.all([
      leerOpcional('v_oc_items'),
      leerOpcional('v_oc_versiones_vigentes'),
      crearClienteServidor().schema('wms').from('alertas').select('clave').eq('tipo', 'OC_CAMBIADA').eq('estado', 'ABIERTA').then((r) => ((r.data ?? []) as Fila[]).map((f) => String(f.clave))),
    ])
    const enCompras = new Map<string, Fila[]>()
    for (const f of abiertas) enCompras.set(String(f.oc_id), [...(enCompras.get(String(f.oc_id)) ?? []), f])
    const copia = new Map(vigentes.map((v) => [String(v.oc_id), v]))
    const ids = [...new Set([...enCompras.keys(), ...copia.keys()])]
    return ids.map((id): OcPilotoVista => {
      const ls = enCompras.get(id) ?? []
      const v = copia.get(id)
      const enc = (v?.encabezado ?? {}) as Record<string, unknown>
      const versionVigente = v ? Number(v.version) : 0
      const cambios = Math.max(0, versionVigente - 1)
      const avisoAbierto = avisos.some((c) => c.startsWith(`oc-cambiada:${id}:`))
      const eliminadaEnCompras = Boolean(v?.eliminada_en_compras)
      return {
        ocId: id, codigo: String(ls[0]?.oc_codigo ?? v?.oc_codigo ?? '—'), proveedorNombre: String(ls[0]?.proveedor_nombre ?? enc.proveedor_nombre ?? '—'),
        estadoCompras: s(ls[0]?.estado_oc) ?? s(v?.estado_oc), lineasEnCompras: ls.length, versionVigente, copiadaEn: s(v?.creada_en),
        lineasCopia: Array.isArray(v?.lineas) ? (v!.lineas as unknown[]).length : 0, cambios, avisoAbierto, eliminadaEnCompras,
        situacion: situacionOc({ versionVigente, cambios, avisoAbierto, eliminadaEnCompras }),
      }
    }).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  }

  async sincronizarOcs(actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenSincronizacion }>> {
    // «Revisar Compras ahora»: la misma función con 0 minutos (siempre corre y deja la hora de la última sincronización)
    const r = await this.sincronizarOcsSiToca(actor, 0)
    if (r.estado === 'SIN_PERMISO') return { ok: false, mensaje: 'No tienes permiso para copiar órdenes de compra' }
    if (r.estado === 'EN_CURSO') return { ok: false, mensaje: 'Otra persona está revisando Compras en este momento. Espera un minuto y mira el resultado.' }
    if (r.estado === 'ERROR' || !r.resumen) return { ok: false, mensaje: r.mensaje ?? TEXTO_ERROR_SINCRONIZACION }
    return { ok: true, resumen: r.resumen }
  }

  async estadoSincronizacionOcs(): Promise<EstadoSincronizacionOc> {
    try {
      const { data } = await crearClienteServidor().schema('wms').from('oc_sincronizacion').select('*').maybeSingle()
      const f = (data ?? {}) as Fila
      const r = (f.ultimo_resumen ?? undefined) as Record<string, number> | undefined
      return { ultimaEn: s(f.ultima_en), ultimoIntentoEn: s(f.ultimo_intento_en), ultimoError: s(f.ultimo_error), ultimoResumen: r ? { revisadas: r.revisadas ?? 0, nuevas: r.nuevas ?? 0, cambiadas: r.cambiadas ?? 0, eliminadas: r.eliminadas ?? 0, sinCambios: r.sin_cambios ?? 0 } : undefined }
    } catch { return {} }
  }

  async sincronizarOcsSiToca(_actor: Actor, minutos = 30): Promise<ResultadoSincronizacionAuto> {
    try {
      const { data, error } = await rpc('sincronizar_ocs_si_toca', { p_minutos: minutos })
      if (error) return { estado: 'ERROR', actual: await this.estadoSincronizacionOcs(), mensaje: TEXTO_ERROR_SINCRONIZACION }
      const r = (data ?? {}) as Record<string, unknown>
      const x = r.resumen as Record<string, number> | undefined
      return {
        estado: String(r.estado) as ResultadoSincronizacionAuto['estado'], actual: await this.estadoSincronizacionOcs(), mensaje: s(r.error),
        resumen: x ? { revisadas: x.revisadas ?? 0, nuevas: x.nuevas ?? 0, cambiadas: x.cambiadas ?? 0, eliminadas: x.eliminadas ?? 0, sinCambios: x.sin_cambios ?? 0 } : undefined,
      }
    } catch { return { estado: 'ERROR', actual: {}, mensaje: TEXTO_ERROR_SINCRONIZACION } }
  }
}
