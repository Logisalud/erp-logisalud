import 'server-only'

import { ITEMS_CHECKLIST_POR_DEFECTO, motivosNoLiberar, normalizarCodigoBulto, type BultoCarga, type CargaResumen, type CargaRuta, type EstadoCarga, type ItemChecklist, type PedidoCarga } from '@/domain/carga'
import type { ExtrasLsFr } from '@/domain/ls-fr-43-03'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioCarga } from '../repositorio-carga'
import { crearClienteServidor } from '@logisalud/auth/server'
import { nombresDe } from './entradas-supabase'
import { EmbalajeSupabase } from './embalaje-supabase'
import { mensajeHumano, rpc, s, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás). Está verificado contra el contrato de las funciones SQL de la migración
// 0021 (probada en Postgres local: tests/db/carga.test.ts) y por tipos.

const dia = (v: unknown) => String(v).slice(0, 10)
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const sch = () => crearClienteServidor().schema('wms')
const ESTADOS_CARGA = ['PLANIFICADA', 'LISTA_PARA_CARGA', 'LIBERADA', 'EN_RUTA']

export class CargaSupabase extends EmbalajeSupabase implements RepositorioCarga {
  private async pedidos(rutaId: string): Promise<PedidoCarga[]> {
    const [{ data: conc, error }, { data: ex }] = await Promise.all([sch().rpc('conciliacion_carga', { p_ruta: rutaId }), sch().from('carga_exclusiones').select('salida_id, motivo').eq('ruta_id', rutaId)])
    if (error) throw new Error(mensajeHumano(error))
    const motivo = new Map(((ex ?? []) as Fila[]).map((x) => [String(x.salida_id), String(x.motivo)]))
    const por = new Map<string, PedidoCarga>()
    for (const f of (conc ?? []) as Fila[]) {
      const id = String(f.salida_id)
      const p = por.get(id) ?? { salidaId: id, salidaNumero: String(f.salida_numero), pedidoNumero: s(f.pedido_numero), secuencia: Number(f.secuencia), listo: Boolean(f.listo), excluida: Boolean(f.excluida), motivoExclusion: motivo.get(id), bultos: [] }
      if (f.bulto_id) p.bultos.push({ bultoId: String(f.bulto_id), codigo: String(f.codigo), secuencia: Number(f.bulto_secuencia), total: Number(f.bulto_total), cargado: Boolean(f.cargado) } satisfies BultoCarga)
      por.set(id, p)
    }
    return [...por.values()].sort((a, b) => a.secuencia - b.secuencia)
  }

  private resumenDe(r: Fila, pedidos: PedidoCarga[], placa?: string): CargaResumen {
    const salen = pedidos.filter((p) => !p.excluida)
    const estado: EstadoCarga = ['EN_RUTA', 'PENDIENTE_CIERRE', 'CERRADA'].includes(String(r.estado)) ? 'EN_RUTA' : r.estado === 'LIBERADA' ? 'LIBERADA' : 'EN_CARGA'
    return {
      rutaId: String(r.id), rutaNumero: String(r.numero), fecha: dia(r.fecha), estado, placa, pedidos: salen.length,
      bultosEsperados: salen.reduce((t, p) => t + p.bultos.length, 0), bultosCargados: salen.reduce((t, p) => t + p.bultos.filter((b) => b.cargado).length, 0),
    }
  }

  async colaCarga(): Promise<CargaResumen[]> {
    const { data } = await sch().from('rutas').select('id, numero, fecha, estado, vehiculo_id').in('estado', ESTADOS_CARGA).order('fecha', { ascending: false }).limit(30)
    const rutas = (data ?? []) as Fila[]
    const { data: vs } = await sch().from('vehiculos').select('id, placa')
    const placa = new Map(((vs ?? []) as Fila[]).map((v) => [String(v.id), String(v.placa)]))
    const out: CargaResumen[] = []
    for (const r of rutas) { const ps = await this.pedidos(String(r.id)); if (ps.length) out.push(this.resumenDe(r, ps, placa.get(String(r.vehiculo_id)))) }
    return out
  }

  async cargaRuta(rutaId: string): Promise<CargaRuta | null> {
    const { data: r } = await sch().from('rutas').select('*').eq('id', rutaId).maybeSingle()
    if (!r) return null
    const fila = r as Fila
    const [pedidos, { data: v }, { data: c }, { data: pm }] = await Promise.all([
      this.pedidos(rutaId), sch().from('vehiculos').select('placa').eq('id', String(fila.vehiculo_id ?? '00000000-0000-0000-0000-000000000000')).maybeSingle(),
      sch().from('personal_transporte').select('nombre').eq('id', String(fila.conductor_id ?? '00000000-0000-0000-0000-000000000000')).maybeSingle(),
      sch().from('parametros').select('valor').eq('clave', 'checklist_vehicular_items').maybeSingle(),
    ])
    let items: string[] = [...ITEMS_CHECKLIST_POR_DEFECTO]
    try { const p = JSON.parse(String((pm as Fila | null)?.valor ?? '[]')); if (Array.isArray(p) && p.length) items = p.map(String) } catch { /* se usa la lista por defecto */ }
    const nombres = await nombresDe(fila.checklist_por ? [String(fila.checklist_por)] : [])
    const base: Omit<CargaRuta, 'motivosNoLiberar'> = {
      ...this.resumenDe(fila, pedidos, s((v as Fila | null)?.placa)), conductor: s((c as Fila | null)?.nombre), tieneVehiculoYConductor: !!fila.vehiculo_id && !!fila.conductor_id,
      checklist: Array.isArray(fila.checklist) ? (fila.checklist as ItemChecklist[]) : null, checklistPor: fila.checklist_por ? nombres.get(String(fila.checklist_por)) : undefined,
      itemsChecklist: items, pedidosDetalle: pedidos, liberadaEn: fila.liberada_en ? String(fila.liberada_en) : undefined, salioEn: fila.salio_en ? String(fila.salio_en) : undefined,
    }
    return { ...base, motivosNoLiberar: fila.estado === 'LIBERADA' || fila.estado === 'EN_RUTA' ? [] : motivosNoLiberar(base) }
  }

  async guardarChecklist(rutaId: string, items: ItemChecklist[], _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('guardar_checklist_vehicular', { p_ruta: rutaId, p_items: items })
    return error ? mal(error) : { ok: true }
  }

  async cargarBulto(rutaId: string, codigo: string, _actor: Actor): Promise<ResultadoAccion<{ resultado: 'CARGADO' | 'YA_CARGADO' }>> {
    const { data, error } = await rpc('cargar_bulto', { p_ruta: rutaId, p_codigo: normalizarCodigoBulto(codigo) })
    return error ? mal(error) : { ok: true, resultado: data === 'YA_CARGADO' ? 'YA_CARGADO' : 'CARGADO' }
  }

  async retirarBulto(rutaId: string, codigo: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('retirar_bulto_carga', { p_ruta: rutaId, p_codigo: normalizarCodigoBulto(codigo), p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }

  async excluirPedido(rutaId: string, salidaId: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('excluir_pedido_de_carga', { p_ruta: rutaId, p_salida: salidaId, p_motivo: motivo })
    return error ? mal(error) : { ok: true }
  }

  async liberarUnidad(rutaId: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('liberar_unidad', { p_ruta: rutaId })
    return error ? mal(error) : { ok: true }
  }

  async confirmarSalidaRuta(rutaId: string, _actor: Actor): Promise<ResultadoAccion<{ reservas: number }>> {
    const { data, error } = await rpc('confirmar_salida_ruta', { p_ruta: rutaId, p_token: null })
    return error ? mal(error) : { ok: true, reservas: Number(data) }
  }

  protected override async avancePorSalida() {
    const m = await super.avancePorSalida()
    const { data } = await sch().from('carga_bultos').select('bulto_id, bultos(salida_id)').eq('estado', 'CARGADO')
    const cargados = new Map<string, number>()
    for (const c of (data ?? []) as unknown as { bultos: { salida_id: string } | null }[]) if (c.bultos) cargados.set(c.bultos.salida_id, (cargados.get(c.bultos.salida_id) ?? 0) + 1)
    const { data: bs } = await sch().from('bultos').select('salida_id').eq('estado', 'EMBALADO')
    const total = new Map<string, number>()
    for (const b of (bs ?? []) as Fila[]) total.set(String(b.salida_id), (total.get(String(b.salida_id)) ?? 0) + 1)
    for (const [id, n] of total) if ((cargados.get(id) ?? 0) >= n) m.set(id, { ...m.get(id), cargada: true })
    return m
  }

  /** La hora real de salida del LS-FR.43.03 es la de la salida confirmada. */
  protected override async extrasLsFr(rutaId: string): Promise<ExtrasLsFr> {
    const [base, { data }] = await Promise.all([super.extrasLsFr(rutaId), sch().from('rutas').select('salio_en').eq('id', rutaId).maybeSingle()])
    const salio = (data as Fila | null)?.salio_en
    return { ...base, horaSalida: salio ? String(salio) : undefined }
  }
}
