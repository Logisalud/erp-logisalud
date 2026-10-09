import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import type {
  AjusteVista, CargaInicialVista, ConteoVista, ErrorFilaCarga, EstadoConteo, EstadoOrden, FilaCargaInicial, FilaHistoriaLote, FilaKardex,
  FiltroKardex, LineaConteoVista, LineaEjecutar, LineaOrdenMovimiento, OrdenMovimiento, ReporteVista, VistaGuardada, ResultadoLinea, RevisionLinea, TipoMovimientoLedger,
} from '@/domain/inventario'
import { parsearTramos } from '@/domain/inventario'
import type { Estado, Origen } from '@/domain/tipos'
import type { Actor, ResultadoAccion } from '../repositorio'
import { EntradasSupabase, nombresDe } from './entradas-supabase'
import { mensajeHumano, num, rpc, s, traerTodo, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que el de entradas). Está verificado contra el contrato de las
// funciones SQL de la migración 0007 (probada en Postgres local) y por tipos. Las reglas las aplica la base de datos con la sesión de la persona.

const ok = <T extends object>(extra?: T) => ({ ok: true as const, ...(extra as T) })
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const por = <T extends Fila>(filas: T[], clave: string) => {
  const m = new Map<string, T[]>()
  for (const f of filas) { const k = String(f[clave]); m.set(k, [...(m.get(k) ?? []), f]) }
  return m
}

export class InventarioSupabase extends EntradasSupabase {
  // ── Kardex ──────────────────────────────────────────────────────────────
  async kardex(f: FiltroKardex): Promise<FilaKardex[]> {
    const { data, error } = await rpc('kardex_filas', { p_producto: f.productoId, p_lote: f.loteId ?? null, p_propietario: f.propietarioId ?? null, p_desde: f.desde ?? null, p_hasta: f.hasta ?? null })
    if (error) throw new Error(`No se pudo leer el Kardex: ${error.message}`)
    return ((data ?? []) as Fila[]).map((r) => ({
      orden: Number(r.orden), esSaldoInicial: Boolean(r.es_saldo_inicial), partidaId: num(r.partida_id), fecha: s(r.fecha), tipoDocumento: String(r.tipo_documento),
      numeroActa: s(r.numero_acta), fechaActa: s(r.fecha_acta), lote: s(r.lote), contraparte: s(r.contraparte), ruc: s(r.ruc), tipoDocRef: s(r.tipo_doc_ref),
      numeroDocRef: s(r.numero_doc_ref), posicion: s(r.posicion), entrada: num(r.entrada), salida: num(r.salida), saldo: Number(r.saldo), tipoIngreso: s(r.tipo_ingreso),
      propietario: s(r.propietario), producto: s(r.producto), movimientoId: s(r.movimiento_id), esReversa: Boolean(r.es_reversa), motivo: s(r.motivo),
    }))
  }

  async historiaLote(loteId: string): Promise<FilaHistoriaLote[]> {
    const { data, error } = await rpc('historia_lote', { p_lote: loteId })
    if (error) throw new Error(`No se pudo leer la historia del lote: ${error.message}`)
    const filas = (data ?? []) as Fila[]
    const nombres = await nombresDe(filas.flatMap((r) => [s(r.ejecutor_id), s(r.verificador_id)]))
    const nom = (v: unknown) => (v ? nombres.get(String(v)) ?? 'Usuario' : undefined)
    return filas.map((r) => ({
      partidaId: Number(r.partida_id), fecha: String(r.fecha), tipo: r.tipo as TipoMovimientoLedger, motivo: s(r.motivo), posicion: String(r.posicion), estado: r.estado as Estado,
      origen: r.origen as Origen, delta: Number(r.delta), ejecutor: nom(r.ejecutor_id), verificador: nom(r.verificador_id),
      movimientoId: String(r.movimiento_id), reversaDe: s(r.reversa_de), referencia: s(r.referencia_id), sustento: s(r.sustento_id), saldoLote: Number(r.saldo_lote),
    }))
  }

  async parametrosInventario() {
    const filas = await traerTodo('parametros', 'wms')
    const v = (clave: string) => s(filas.find((f) => f.clave === clave)?.valor)
    return { tramosVencimiento: parsearTramos(v('vencimiento_tramos_dias')), kardexCodigoFormato: v('kardex_codigo_formato') || 'LS-FR-KDX (provisional)', movimientoSinVerificarHoras: Number(v('movimiento_sin_verificar_horas')) || 24, diasAlertaVencimiento: Number(v('lote_dias_alerta_vencimiento')) || 90 }
  }

  // ── Movimientos internos ────────────────────────────────────────────────
  private async cargarOrdenes(id?: string): Promise<OrdenMovimiento[]> {
    const supabase = crearClienteServidor()
    let q = supabase.schema('wms').from('ordenes_movimiento').select('*').order('ejecutado_en', { ascending: false })
    if (id) q = q.eq('id', id)
    const { data, error } = await q
    if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`)
    const ordenes = (data ?? []) as Fila[]
    if (ordenes.length === 0) return []
    const ids = ordenes.map((o) => String(o.id))
    const { data: ls, error: e2 } = await supabase.schema('wms').from('ordenes_movimiento_lineas').select('*').in('orden_id', ids)
    if (e2) throw new Error(`No se pudieron leer las líneas: ${e2.message}`)
    const lineas = (ls ?? []) as Fila[]
    const [posiciones, lotes, propietarios, productos, nombres] = await Promise.all([
      traerTodo('posiciones', 'wms', 'id, codigo'), traerTodo('lotes', 'wms', 'id, codigo, vence'), traerTodo('propietarios', 'wms', 'id, codigo'),
      traerTodo('productos', 'catalogo', 'id, codigo, descripcion'),
      nombresDe(ordenes.flatMap((o) => [s(o.ejecutor_id), s(o.verificador_id)])),
    ])
    const pos = new Map(posiciones.map((p) => [String(p.id), String(p.codigo)]))
    const lot = new Map(lotes.map((l) => [String(l.id), l]))
    const pro = new Map(propietarios.map((p) => [String(p.id), String(p.codigo)]))
    const prd = new Map(productos.map((p) => [String(p.id), `${p.codigo} · ${p.descripcion}`]))
    const nom = (v: unknown) => (v ? nombres.get(String(v)) ?? 'Usuario' : undefined)
    const porOrden = por(lineas, 'orden_id')
    return ordenes.map((o) => ({
      id: String(o.id), numero: String(o.numero), estado: o.estado as EstadoOrden, motivo: String(o.motivo), ejecutorId: String(o.ejecutor_id), ejecutor: nom(o.ejecutor_id) ?? 'Usuario',
      ejecutadoEn: String(o.ejecutado_en), verificadorId: s(o.verificador_id), verificador: nom(o.verificador_id), verificadoEn: s(o.verificado_en), notaDiferencia: s(o.nota_diferencia),
      motivoAnulacion: s(o.motivo_anulacion), movimientoId: s(o.movimiento_id),
      lineas: (porOrden.get(String(o.id)) ?? []).map((l): LineaOrdenMovimiento => ({
        id: String(l.id), productoId: String(l.producto_id), producto: prd.get(String(l.producto_id)) ?? '—', loteId: String(l.lote_id), lote: String(lot.get(String(l.lote_id))?.codigo ?? '—'),
        vence: s(lot.get(String(l.lote_id))?.vence), propietario: pro.get(String(l.propietario_id)) ?? '—', estado: l.estado as Estado, procedenciaId: String(l.procedencia_id),
        desdePosicionId: String(l.desde_posicion_id), desde: pos.get(String(l.desde_posicion_id)) ?? '—', haciaPosicionId: String(l.hasta_posicion_id), hacia: pos.get(String(l.hasta_posicion_id)) ?? '—',
        cantidad: Number(l.cantidad), verificacion: l.verificacion as LineaOrdenMovimiento['verificacion'], notaDiferencia: s(l.nota_diferencia), movimientoId: s(l.movimiento_id),
      })),
    }))
  }

  async listarMovimientos() { return this.cargarOrdenes() }
  async obtenerMovimiento(id: string) { return (await this.cargarOrdenes(id))[0] ?? null }

  async ejecutarMovimiento(lineas: LineaEjecutar[], motivo: string, _actor: Actor, token?: string): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const { data, error } = await rpc('ejecutar_movimiento', {
      p_lineas: lineas.map((l) => ({ desde_posicion_id: l.desdePosicionId, hasta_posicion_id: l.haciaPosicionId, lote_id: l.loteId, estado: l.estado, procedencia_id: l.procedenciaId, cantidad: l.cantidad })),
      p_motivo: motivo, p_token: token ?? null,
    })
    if (error) return mal(error)
    const o = await this.obtenerMovimiento(String(data))
    return ok({ id: String(data), numero: o?.numero ?? '' })
  }
  async confirmarMovimiento(id: string, _a: Actor): Promise<ResultadoAccion> { const { error } = await rpc('confirmar_movimiento', { p_orden: id }); return error ? mal(error) : ok() }
  async revisarMovimiento(id: string, revision: RevisionLinea[], _a: Actor): Promise<ResultadoAccion<{ confirmadas: number; conDiferencia: number }>> {
    const { error } = await rpc('revisar_movimiento', { p_orden: id, p_revision: revision.map((r) => ({ linea_id: r.lineaId, resultado: r.resultado, nota: r.nota ?? null })) })
    return error ? mal(error) : ok({ confirmadas: revision.filter((r) => r.resultado === 'COINCIDE').length, conDiferencia: revision.filter((r) => r.resultado === 'DIFERENCIA').length })
  }
  async resolverMovimiento(lineaId: string, accion: 'REINTENTAR' | 'ANULAR', nota: string, _a: Actor): Promise<ResultadoAccion> { const { error } = await rpc('resolver_movimiento', { p_linea: lineaId, p_accion: accion, p_nota: nota }); return error ? mal(error) : ok() }
  async posicionesBloqueadas(): Promise<Record<string, string>> {
    const { data, error } = await rpc('posiciones_bloqueadas', {})
    if (error) throw new Error(`No se pudieron leer las ubicaciones bloqueadas: ${error.message}`)
    const out: Record<string, string> = {}
    for (const r of (data ?? []) as Fila[]) out[String(r.posicion_id)] ??= String(r.motivo)
    return out
  }
  async anularMovimiento(id: string, motivo: string, _a: Actor): Promise<ResultadoAccion> { const { error } = await rpc('anular_movimiento', { p_orden: id, p_motivo: motivo }); return error ? mal(error) : ok() }

  // ── Vistas guardadas (cada persona ve y borra solo las suyas: lo aplica la base con RLS) ─────────────
  async listarVistas(reporte: ReporteVista, _a: Actor): Promise<VistaGuardada[]> {
    const { data, error } = await crearClienteServidor().schema('wms').from('vistas_guardadas').select('id, reporte, nombre, filtros').eq('reporte', reporte).order('nombre')
    if (error) throw new Error(`No se pudieron leer las vistas guardadas: ${error.message}`)
    return ((data ?? []) as Fila[]).map((r) => ({ id: String(r.id), reporte: r.reporte as ReporteVista, nombre: String(r.nombre), filtros: (r.filtros ?? {}) as Record<string, string> }))
  }
  async guardarVista(reporte: ReporteVista, nombre: string, filtros: Record<string, string>, _a: Actor): Promise<ResultadoAccion<{ id: string }>> {
    if (!nombre.trim()) return { ok: false, mensaje: 'Ponle un nombre a la vista.' }
    const { data, error } = await crearClienteServidor().schema('wms').from('vistas_guardadas').insert({ reporte, nombre: nombre.trim(), filtros }).select('id').single()
    if (error) return error.code === '23505' ? { ok: false, mensaje: 'Ya tienes una vista con ese nombre.' } : mal(error)
    return ok({ id: String((data as Fila).id) })
  }
  async borrarVista(id: string, _a: Actor): Promise<ResultadoAccion> {
    const { error } = await crearClienteServidor().schema('wms').from('vistas_guardadas').delete().eq('id', id)
    return error ? mal(error) : ok()
  }

  // ── Conteos y ajustes ───────────────────────────────────────────────────
  private vistaConteo(c: Fila, lineas: Fila[], nombres: Map<string, string>): ConteoVista {
    const nom = (v: unknown) => (v ? nombres.get(String(v)) ?? 'Usuario' : undefined)
    return {
      id: String(c.id), numero: String(c.numero), estado: c.estado as EstadoConteo, nota: s(c.nota), programadoPor: nom(c.programado_por) ?? 'Usuario', programadoEn: String(c.programado_en),
      cerradoEn: s(c.cerrado_en), resultado: (s(c.resultado) as ConteoVista['resultado']), causa: s(c.causa), accion: s(c.accion), lineas: lineas.length,
      resueltas: lineas.filter((l) => l.resultado && !['DIFERENCIA_CONFIRMADA', 'NO_CONCLUYENTE'].includes(String(l.resultado))).length,
    }
  }

  async listarConteos(): Promise<ConteoVista[]> {
    const supabase = crearClienteServidor()
    const { data, error } = await supabase.schema('wms').from('conteos').select('*').order('programado_en', { ascending: false })
    if (error) throw new Error(`No se pudieron leer los conteos: ${error.message}`)
    const cs = (data ?? []) as Fila[]
    const nombres = await nombresDe(cs.map((c) => s(c.programado_por)))
    // El saldo del sistema es secreto para el contador: el resumen solo cuenta líneas por la función segura.
    const out: ConteoVista[] = []
    for (const c of cs) {
      const { data: ls } = await rpc('conteo_lineas_para', { p_conteo: c.id })
      out.push(this.vistaConteo(c, ((ls ?? []) as Fila[]).map((l) => ({ resultado: l.resultado })), nombres))
    }
    return out
  }

  async obtenerConteo(id: string, _actor: Actor) {
    const supabase = crearClienteServidor()
    const { data, error } = await supabase.schema('wms').from('conteos').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`No se pudo leer el conteo: ${error.message}`)
    if (!data) return null
    const { data: ls, error: e2 } = await rpc('conteo_lineas_para', { p_conteo: id })
    if (e2) throw new Error(`No se pudieron leer las líneas del conteo: ${e2.message}`)
    const filas = (ls ?? []) as Fila[]
    const ajustes = await this.cargarAjustes(filas.map((l) => String(l.linea_id)))
    const nombres = await nombresDe([s((data as Fila).programado_por)])
    const lineas: LineaConteoVista[] = filas.map((l) => ({
      id: String(l.linea_id), posicion: String(l.posicion), productoId: String(l.producto_id), producto: String(l.producto), lote: String(l.lote), vence: s(l.vence), propietario: String(l.propietario),
      estado: l.estado as Estado, miConteo: num(l.mi_conteo), conteo1: num(l.conteo1), conteo2: num(l.conteo2), cantidadSistema: num(l.cantidad_sistema), resultado: s(l.resultado) as ResultadoLinea | undefined,
      causa: s(l.causa), nota: s(l.nota), puedeContar: Boolean(l.puede_contar), ajuste: s(l.hay_ajuste) as LineaConteoVista['ajuste'],
    }))
    return { conteo: this.vistaConteo(data as Fila, filas, nombres), lineas, ajustes }
  }

  private async cargarAjustes(lineaIds?: string[]): Promise<AjusteVista[]> {
    const supabase = crearClienteServidor()
    let q = supabase.schema('wms').from('ajustes_inventario').select('*').order('propuesto_en', { ascending: false })
    if (lineaIds) q = q.in('conteo_linea_id', lineaIds.length ? lineaIds : ['00000000-0000-0000-0000-000000000000'])
    const { data, error } = await q
    if (error) throw new Error(`No se pudieron leer los ajustes: ${error.message}`)
    const filas = (data ?? []) as Fila[]
    if (!filas.length) return []
    const nombres = await nombresDe(filas.flatMap((a) => [s(a.propuesto_por), s(a.decidido_por)]))
    const nom = (v: unknown) => (v ? nombres.get(String(v)) ?? 'Usuario' : undefined)
    return filas.map((a) => ({
      id: String(a.id), numero: String(a.numero), conteoLineaId: String(a.conteo_linea_id), conteoNumero: '', producto: '', lote: '', posicion: '', delta: Number(a.delta), causa: String(a.causa),
      motivo: String(a.motivo), estado: a.estado as AjusteVista['estado'], propuestoPor: nom(a.propuesto_por) ?? 'Usuario', propuestoEn: String(a.propuesto_en), decididoPor: nom(a.decidido_por),
      decididoEn: s(a.decidido_en), notaDecision: s(a.nota_decision),
    }))
  }

  async listarAjustes() { return this.cargarAjustes() }

  async programarConteo(posicionIds: string[], nota: string | undefined, _a: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const { data, error } = await rpc('programar_conteo', { p_posiciones: posicionIds, p_nota: nota ?? null })
    if (error) return mal(error)
    const supabase = crearClienteServidor()
    const { data: c } = await supabase.schema('wms').from('conteos').select('numero').eq('id', String(data)).maybeSingle()
    return ok({ id: String(data), numero: String((c as Fila | null)?.numero ?? '') })
  }
  async registrarConteo(lineaId: string, cantidad: number, _a: Actor): Promise<ResultadoAccion<{ resultado: string }>> {
    const { data, error } = await rpc('registrar_conteo', { p_linea: lineaId, p_cantidad: cantidad })
    return error ? mal(error) : ok({ resultado: String(data) })
  }
  async registrarCausaConteo(lineaId: string, causa: string, _a: Actor): Promise<ResultadoAccion> { const { error } = await rpc('registrar_causa_conteo', { p_linea: lineaId, p_causa: causa }); return error ? mal(error) : ok() }
  async proponerAjuste(lineaId: string, motivo: string, _a: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const { data, error } = await rpc('proponer_ajuste', { p_linea: lineaId, p_motivo: motivo })
    return error ? mal(error) : ok({ id: String(data) })
  }
  async decidirAjuste(ajusteId: string, decision: 'AUTORIZAR' | 'RECHAZAR', nota: string | undefined, _a: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('decidir_ajuste', { p_ajuste: ajusteId, p_decision: decision, p_nota: nota ?? null })
    return error ? mal(error) : ok()
  }
  async escalarLineaConteo(lineaId: string, nota: string, _a: Actor): Promise<ResultadoAccion> { const { error } = await rpc('escalar_linea_conteo', { p_linea: lineaId, p_nota: nota }); return error ? mal(error) : ok() }
  async cerrarConteo(id: string, causa: string | undefined, accion: string | undefined, _a: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('cerrar_conteo', { p_conteo: id, p_causa: causa ?? null, p_accion: accion ?? null })
    return error ? mal(error) : ok()
  }

  // ── Carga inicial ───────────────────────────────────────────────────────
  async estadoCargaInicial() {
    const filas = await traerTodo('parametros', 'wms')
    return s(filas.find((f) => f.clave === 'carga_inicial_estado')?.valor) ?? ''
  }
  private filasJson = (filas: FilaCargaInicial[]) => filas.map((f) => ({ producto: f.producto, lote: f.lote, vence: f.vence, propietario: f.propietario, posicion: f.posicion, estado: f.estado, cantidad: f.cantidad }))
  async validarCargaInicial(filas: FilaCargaInicial[], _a: Actor): Promise<ErrorFilaCarga[]> {
    const { data, error } = await rpc('validar_carga_inicial', { p_lineas: this.filasJson(filas) })
    if (error) return [{ fila: 0, error: mensajeHumano(error) }]
    return ((data ?? []) as Fila[]).map((r) => ({ fila: Number(r.fila), error: String(r.error) }))
  }
  async crearCargaInicial(filas: FilaCargaInicial[], nota: string | undefined, _a: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const { data, error } = await rpc('crear_carga_inicial', { p_lineas: this.filasJson(filas), p_nota: nota ?? null })
    if (error) return mal(error)
    const supabase = crearClienteServidor()
    const { data: c } = await supabase.schema('wms').from('cargas_iniciales').select('numero').eq('id', String(data)).maybeSingle()
    return ok({ id: String(data), numero: String((c as Fila | null)?.numero ?? '') })
  }
  async decidirEstadoCargaInicial(estado: 'APROBADO' | 'CUARENTENA', _a: Actor): Promise<ResultadoAccion> { const { error } = await rpc('decidir_estado_carga_inicial', { p_estado: estado }); return error ? mal(error) : ok() }
  async confirmarCargaInicial(id: string, _a: Actor): Promise<ResultadoAccion> { const { error } = await rpc('confirmar_carga_inicial', { p_carga: id }); return error ? mal(error) : ok() }
  async listarCargasIniciales(): Promise<CargaInicialVista[]> {
    const supabase = crearClienteServidor()
    const { data, error } = await supabase.schema('wms').from('cargas_iniciales').select('*').order('creado_en', { ascending: false })
    if (error) throw new Error(`No se pudieron leer las cargas: ${error.message}`)
    const cs = (data ?? []) as Fila[]
    if (!cs.length) return []
    const { data: ls } = await supabase.schema('wms').from('cargas_iniciales_lineas').select('carga_id, cantidad').in('carga_id', cs.map((c) => String(c.id)))
    const porCarga = por((ls ?? []) as Fila[], 'carga_id')
    const nombres = await nombresDe(cs.map((c) => s(c.creado_por)))
    return cs.map((c) => {
      const l = porCarga.get(String(c.id)) ?? []
      return { id: String(c.id), numero: String(c.numero), estado: c.estado as CargaInicialVista['estado'], nota: s(c.nota), creadoPor: nombres.get(String(c.creado_por)) ?? 'Usuario', creadoEn: String(c.creado_en), confirmadoEn: s(c.confirmado_en), filas: l.length, unidades: l.reduce((n, x) => n + Number(x.cantidad), 0) }
    })
  }
}
