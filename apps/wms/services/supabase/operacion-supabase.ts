import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import type {
  Cobertura, EntradaPendiente, EstadoPendiente, FilaExactitud, FocoRevision, PendienteVista, PersonaEquipo, ProgramacionVista, ResultadoFoco, RevisionDiaria,
} from '@/domain/operacion'
import type { Rol } from '@/domain/tipos'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { RepositorioOperacion } from '../repositorio-operacion'
import { nombresDe } from './entradas-supabase'
import { InventarioSupabase } from './inventario-supabase'
import { mensajeHumano, num, rpc, s, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que el de entradas e inventario). Está verificado contra el contrato de las
// funciones SQL de la migración 0009 (probada en Postgres local) y por tipos. Las reglas las aplica la base de datos con la sesión de la persona.

const ok = <T extends object>(extra?: T) => ({ ok: true as const, ...(extra as T) })
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const sch = () => crearClienteServidor().schema('wms')
const dia = (v: unknown) => String(v).slice(0, 10)

export class OperacionSupabase extends InventarioSupabase implements RepositorioOperacion {
  // ── Revisión diaria ─────────────────────────────────────────────────────
  private async armarRevisiones(limite: number): Promise<RevisionDiaria[]> {
    const { data, error } = await sch().from('revisiones_diarias').select('*').order('fecha', { ascending: false }).limit(limite)
    if (error) throw new Error(`No se pudieron leer las revisiones: ${error.message}`)
    const revs = (data ?? []) as Fila[]
    if (revs.length === 0) return []
    const ids = revs.map((r) => String(r.id))
    const [focos, pend] = await Promise.all([
      sch().from('revision_focos').select('*').in('revision_id', ids),
      sch().from('revision_pendientes').select('*').in('revision_id', ids).order('creado_en'),
    ])
    if (focos.error) throw new Error(`No se pudieron leer los focos: ${focos.error.message}`)
    if (pend.error) throw new Error(`No se pudieron leer los pendientes: ${pend.error.message}`)
    const pendientes = await this.mapearPendientes((pend.data ?? []) as Fila[], new Map(revs.map((r) => [String(r.id), r])))
    const nombres = await nombresDe([...revs.map((r) => s(r.responsable_id)), ...((focos.data ?? []) as Fila[]).map((f) => s(f.revisado_por))])
    return revs.map((r) => ({
      id: String(r.id), numero: String(r.numero), fecha: dia(r.fecha), responsableId: String(r.responsable_id), responsable: nombres.get(String(r.responsable_id)) ?? 'Usuario',
      estado: r.estado as 'ABIERTA' | 'CERRADA', notaCierre: s(r.nota_cierre),
      focos: ((focos.data ?? []) as Fila[]).filter((f) => f.revision_id === r.id).map((f) => ({ foco: f.foco as FocoRevision, resultado: f.resultado as ResultadoFoco, revisadoPor: String(f.revisado_por) })),
      pendientes: pendientes.filter((p) => p.revisionId === String(r.id)),
    }))
  }

  private async mapearPendientes(filas: Fila[], revs: Map<string, Fila>): Promise<PendienteVista[]> {
    const nombres = await nombresDe(filas.flatMap((p) => [s(p.responsable_id), s(p.creado_por), s(p.resuelto_por), s(p.verificado_por)]))
    const nom = (v: unknown) => (v ? nombres.get(String(v)) ?? 'Usuario' : undefined)
    return filas.map((p) => {
      const r = revs.get(String(p.revision_id))
      return {
        id: String(p.id), revisionId: String(p.revision_id), revision: String(r?.numero ?? ''), fecha: dia(r?.fecha ?? p.creado_en), foco: p.foco as FocoRevision, descripcion: String(p.descripcion),
        responsableId: String(p.responsable_id), responsable: nom(p.responsable_id)!, critico: Boolean(p.critico), afectaProducto: Boolean(p.afecta_producto), ubicacion: s(p.ubicacion),
        estado: p.estado as EstadoPendiente, creadoPor: nom(p.creado_por)!, notaResolucion: s(p.nota_resolucion), resueltoPor: nom(p.resuelto_por), verificadoPor: nom(p.verificado_por),
      }
    })
  }

  async revisionDeHoy(): Promise<RevisionDiaria | null> {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const todas = await this.armarRevisiones(3)
    return todas.find((r) => r.fecha === hoy) ?? null
  }
  async listarRevisiones(limite = 30): Promise<RevisionDiaria[]> { return this.armarRevisiones(limite) }

  async pendientesVivos(): Promise<PendienteVista[]> {
    const { data, error } = await sch().from('revision_pendientes').select('*').neq('estado', 'VERIFICADO').order('creado_en')
    if (error) throw new Error(`No se pudieron leer los pendientes: ${error.message}`)
    const filas = (data ?? []) as Fila[]
    if (filas.length === 0) return []
    const { data: rs } = await sch().from('revisiones_diarias').select('id, numero, fecha').in('id', [...new Set(filas.map((p) => String(p.revision_id)))])
    return this.mapearPendientes(filas, new Map(((rs ?? []) as Fila[]).map((r) => [String(r.id), r])))
  }

  async personasDelEquipo(): Promise<PersonaEquipo[]> {
    const { data, error } = await rpc('personas_del_equipo', {})
    if (error) throw new Error(`No se pudo leer el equipo: ${error.message}`)
    const filas = (data ?? []) as Fila[]
    const nombres = await nombresDe(filas.map((f) => s(f.user_id)))
    return filas.map((f) => ({ id: String(f.user_id), nombre: nombres.get(String(f.user_id)) ?? 'Usuario', rol: f.rol as Rol }))
  }

  async iniciarRevision(_a: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const { data, error } = await rpc('iniciar_revision_diaria', {})
    return error ? mal(error) : ok({ id: String(data) })
  }
  async marcarFoco(revisionId: string, foco: FocoRevision, resultado: ResultadoFoco, _a: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('marcar_foco', { p_revision: revisionId, p_foco: foco, p_resultado: resultado })
    return error ? mal(error) : ok()
  }
  async registrarPendiente(revisionId: string, d: EntradaPendiente, _a: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const { data, error } = await rpc('registrar_pendiente', {
      p_revision: revisionId, p_foco: d.foco, p_descripcion: d.descripcion, p_responsable: d.responsableId, p_critico: d.critico, p_afecta_producto: d.afectaProducto, p_ubicacion: d.ubicacion ?? null,
    })
    return error ? mal(error) : ok({ id: String(data) })
  }
  async resolverPendiente(id: string, nota: string | undefined, _a: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('resolver_pendiente', { p_pendiente: id, p_nota: nota ?? null })
    return error ? mal(error) : ok()
  }
  async verificarPendiente(id: string, conforme: boolean, nota: string | undefined, _a: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('verificar_pendiente', { p_pendiente: id, p_conforme: conforme, p_nota: nota ?? null })
    return error ? mal(error) : ok()
  }
  async cerrarRevision(id: string, nota: string | undefined, _a: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('cerrar_revision_diaria', { p_revision: id, p_nota: nota ?? null })
    return error ? mal(error) : ok()
  }

  // ── Programación de los inventarios cíclicos ────────────────────────────
  async programacionDeSemana(lunes: string): Promise<ProgramacionVista[]> {
    const { data, error } = await sch().from('programacion_conteos').select('*').eq('semana', lunes).order('orden', { nullsFirst: false })
    if (error) throw new Error(`No se pudo leer la programación: ${error.message}`)
    const filas = (data ?? []) as Fila[]
    const ids = [...new Set(filas.flatMap((p) => (p.posiciones as string[]) ?? []))]
    const conteoIds = filas.map((p) => s(p.conteo_id)).filter((x): x is string => !!x)
    const [pos, cts] = await Promise.all([
      ids.length ? sch().from('posiciones').select('id, codigo').in('id', ids) : Promise.resolve({ data: [] as Fila[] }),
      conteoIds.length ? sch().from('conteos').select('id, numero').in('id', conteoIds) : Promise.resolve({ data: [] as Fila[] }),
    ])
    const cod = new Map(((pos.data ?? []) as Fila[]).map((p) => [String(p.id), String(p.codigo)]))
    const num_ = new Map(((cts.data ?? []) as Fila[]).map((c) => [String(c.id), String(c.numero)]))
    return filas.map((p) => ({
      id: String(p.id), semana: dia(p.semana), tipo: p.tipo as 'ROTATIVO' | 'EXTRA', orden: num(p.orden), posiciones: ((p.posiciones as string[]) ?? []).map((id) => ({ id, codigo: cod.get(id) ?? id })),
      nota: s(p.nota), estado: p.estado as ProgramacionVista['estado'], conteoId: s(p.conteo_id), conteoNumero: p.conteo_id ? num_.get(String(p.conteo_id)) : undefined, motivoCancelacion: s(p.motivo_cancelacion),
    }))
  }
  async ultimaCobertura(): Promise<Cobertura[]> {
    const { data, error } = await rpc('ultima_cobertura_por_posicion', {})
    if (error) throw new Error(`No se pudo leer la cobertura: ${error.message}`)
    return ((data ?? []) as Fila[]).map((r) => ({ posicionId: String(r.posicion_id), ultima: s(r.ultima) }))
  }
  async programarConteoSemanal(lunes: string, orden: number, posicionIds: string[], nota: string | undefined, _a: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const { data, error } = await rpc('programar_conteo_semanal', { p_semana: lunes, p_orden: orden, p_posiciones: posicionIds, p_nota: nota ?? null })
    return error ? mal(error) : ok({ id: String(data) })
  }
  async programarConteoExtra(posicionIds: string[], incidencia: string, _a: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const { data, error } = await rpc('programar_conteo_extra', { p_posiciones: posicionIds, p_incidencia: incidencia })
    return error ? mal(error) : ok({ id: String(data) })
  }
  async cancelarProgramacion(id: string, motivo: string, _a: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('cancelar_programacion', { p_id: id, p_motivo: motivo })
    return error ? mal(error) : ok()
  }
  async generarConteoProgramado(id: string, _a: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const { data, error } = await rpc('generar_conteo_programado', { p_id: id })
    if (error) return mal(error)
    const { data: c } = await sch().from('conteos').select('numero').eq('id', String(data)).single()
    return ok({ id: String(data), numero: String((c as Fila | null)?.numero ?? '') })
  }

  // ── Exactitud ───────────────────────────────────────────────────────────
  async exactitudConteos(desde: string | undefined, hasta: string | undefined, _a: Actor): Promise<FilaExactitud[]> {
    const { data, error } = await rpc('exactitud_conteos', { p_desde: desde ?? null, p_hasta: hasta ?? null })
    if (error) throw new Error(`No se pudo leer la exactitud: ${error.message}`)
    return ((data ?? []) as Fila[]).map((r) => ({
      conteo: String(r.conteo), cerradoEn: String(r.cerrado_en), posicion: String(r.posicion), producto: String(r.producto), lote: String(r.lote), propietario: String(r.propietario), estado: String(r.estado),
      cantidadSistema: Number(r.cantidad_sistema), cantidadContada: Number(r.cantidad_contada), diferencia: Number(r.diferencia), resultado: String(r.resultado ?? ''), causa: s(r.causa),
    }))
  }
}
