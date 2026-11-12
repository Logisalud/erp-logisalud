import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import { datosParaLsFr, quedoSinEntregar, estadoDeParada, esTerminal, RUTA_PERMITE_MARCAR, todasResueltas, type EventoParada, type EventoParadaVista, type ParadaMia, type RutaMia } from '@/domain/mis-rutas'
import { claveDeOrden, type EstadoRuta } from '@/domain/rutas'
import { condicionDeParada } from '@/domain/ruta-del-dia'
import type { ExtrasLsFr } from '@/domain/ls-fr-43-03'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { DatosEventoParada, RepositorioMisRutas } from '../repositorio-mis-rutas'
import { PilotoSupabase } from './piloto-supabase'
import { mensajeHumano, rpc, s, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás). Está verificado contra el contrato de las funciones SQL de la migración 0043 (probada en
// Postgres local, tests/db/mis-rutas.test.ts) y por tipos. Quien conduce no lee tablas: solo `mis_rutas_del_dia` y `registrar_evento_parada`, que reconocen a la persona.

const sch = () => crearClienteServidor().schema('wms')

function eventoDe(x: Fila): EventoParadaVista {
  return { id: String(x.id), evento: String(x.evento) as EventoParada, motivo: s(x.motivo), recibioNombre: s(x.recibio_nombre), recibioDocumento: s(x.recibio_documento), fotoNombre: s(x.foto_nombre), hora: String(x.hora), conforme: typeof x.conforme === 'boolean' ? x.conforme : undefined, tipoDiferencia: s(x.tipo_diferencia) as EventoParadaVista['tipoDiferencia'], detalleDiferencia: s(x.detalle_diferencia) }
}
function rutaDe(r: Fila): RutaMia {
  const estado = String(r.estado) as EstadoRuta
  const paradas: ParadaMia[] = ((r.paradas ?? []) as Fila[]).map((p) => {
    const eventos = ((p.eventos ?? []) as Fila[]).map(eventoDe)
    return { id: String(p.id), secuencia: Number(p.secuencia), cliente: String(p.cliente), direccion: s(p.direccion), distrito: s(p.distrito), ventanaCita: s(p.ventana), pedidoNumero: s(p.pedido_numero), ordenNumero: s(p.orden_numero), unidades: Number(p.unidades ?? 0), telefono: s(p.telefono), condicion: p.condicion ? condicionDeParada(String(p.condicion)) : undefined, guia: s(p.guia), representante: s(p.representante), formaPago: s(p.forma_pago), eventos, estado: estadoDeParada(eventos) }
  })
  return { id: String(r.id), numero: String(r.numero), fecha: String(r.fecha).slice(0, 10), estado, vehiculo: s(r.vehiculo), conductor: s(r.conductor), auxiliar: s(r.auxiliar), paradas, puedeMarcar: RUTA_PERMITE_MARCAR.includes(estado) }
}

export class MisRutasSupabase extends PilotoSupabase implements RepositorioMisRutas {
  async misRutas(_actor: Actor, fecha?: string): Promise<RutaMia[]> {
    const { data, error } = await rpc('mis_rutas_del_dia', { p_fecha: fecha ?? null })
    if (error) throw new Error(mensajeHumano(error))
    return ((data ?? []) as Fila[]).map(rutaDe)
  }

  async rutaComoLaVeElTransportista(rutaId: string): Promise<RutaMia | null> {
    const { data, error } = await rpc('ruta_como_la_ve_el_transportista', { p_ruta: rutaId })
    if (error) throw new Error(mensajeHumano(error))
    return data ? { ...rutaDe(data as Fila), puedeMarcar: false } : null
  }

  async registrarEventoParada(paradaId: string, evento: EventoParada, datos: DatosEventoParada, _actor: Actor): Promise<ResultadoAccion<{ retornoPorOriginar: boolean; rutaPendienteDeCierre: boolean }>> {
    const f = datos.foto
    const { error } = await rpc('registrar_evento_parada', {
      p_parada: paradaId, p_evento: evento,
      p_datos: { motivo: datos.motivo ?? null, recibio_nombre: datos.recibioNombre ?? null, recibio_documento: datos.recibioDocumento ?? null, foto_ref: f?.ref ?? null, foto_nombre: f?.nombre ?? null, foto_hash: f?.hash ?? null, foto_bytes: f?.bytes ?? null, foto_tipo: f?.tipo ?? null, conforme: evento === 'ENTREGADO' ? (datos.conforme ?? true) : null, tipo_diferencia: datos.tipoDiferencia ?? null, detalle_diferencia: datos.detalleDiferencia ?? null },
    })
    if (error) return { ok: false, mensaje: mensajeHumano(error) }
    const rutas = await this.misRutas(_actor).catch(() => [])
    const ruta = rutas.find((r) => r.paradas.some((p) => p.id === paradaId))
    return { ok: true, retornoPorOriginar: evento === 'NO_ENTREGADO' || evento === 'RECHAZADO', rutaPendienteDeCierre: !!ruta && esTerminal(evento) && todasResueltas(ruta.paradas) }
  }

  /** Lo que marcó quien conduce alimenta el LS-FR.43.03: hora de entrega y observaciones por parada. */
  protected override async extrasLsFr(rutaId: string): Promise<ExtrasLsFr> {
    const [base, { data: paradas }, { data: ev }] = await Promise.all([
      super.extrasLsFr(rutaId),
      sch().from('ruta_paradas').select('id, pedido_id, salida_id').eq('ruta_id', rutaId).eq('activa', true),
      sch().from('ruta_paradas_eventos').select('*').eq('ruta_id', rutaId).order('creado_en'),
    ])
    const horaEntrega: Record<string, string> = { ...(base.horaEntrega ?? {}) }
    const observaciones: Record<string, string> = { ...(base.observaciones ?? {}) }
    const noEntregadas: string[] = []
    for (const p of (paradas ?? []) as Fila[]) {
      const clave = s(p.pedido_id) ?? (p.salida_id ? claveDeOrden(String(p.salida_id)) : undefined)
      if (!clave) continue
      const propios = ((ev ?? []) as Fila[]).filter((x) => String(x.parada_id) === String(p.id)).map(eventoDe)
      const d = datosParaLsFr(propios)
      if (quedoSinEntregar(propios)) noEntregadas.push(clave)
      if (d.horaEntrega) horaEntrega[clave] = d.horaEntrega
      if (d.observaciones) observaciones[clave] = d.observaciones
    }
    return { ...base, horaEntrega, observaciones, noEntregadas }
  }
}
