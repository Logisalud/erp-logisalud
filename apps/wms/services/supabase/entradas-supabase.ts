import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import {
  ETIQUETA_TIPO_INGRESO, pasoDeIngreso, progresoLinea, ROLES_FIRMA, temperaturaFueraDeRango, validarEntradaIngreso,
  validarEntradaLote, validarTransportista, type Decision, type EntradaIngreso, type EntradaLote, type TipoIngreso,
} from '@/domain/entradas'
import type {
  ActaRecepcionVista, AlertaVista, ColaDT, DatosEdicionIngreso, DatosOrganolepticaGuardar, ExpedienteVista, FirmaEntrada,
  IngresoDetalle, IngresoResumen, OrganolepticaVista, PosicionDestino, RecepcionCompra, ResumenExpediente,
} from '@/domain/entradas-vistas'
import { parsearVencimiento } from '@/domain/fechas'
import type { ResultadoBusqueda } from '@/domain/panorama'
import type { Actor, ResultadoAccion } from '../repositorio'
import { mensajeHumano, num, rpc, s, traerTodo, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (no hay base de pruebas: ver gate-0.md §G.1).
// Está verificado contra el contrato de las funciones SQL de la migración 0004 (que sí se probó
// en Postgres local) y por tipos. Las lecturas pasan por RLS con la sesión de la persona.

const ok = <T extends object>(extra?: T) => ({ ok: true as const, ...(extra as T) })
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })

const por = <T extends Fila>(filas: T[], clave: string) => {
  const m = new Map<string, T[]>()
  for (const f of filas) { const k = String(f[clave]); m.set(k, [...(m.get(k) ?? []), f]) }
  return m
}

async function nombresDe(ids: (string | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))]
  const m = new Map<string, string>()
  if (unicos.length === 0) return m
  try {
    const { data } = await crearClienteServidor().from('perfiles').select('id, nombre').in('id', unicos)
    for (const r of (data ?? []) as Fila[]) m.set(String(r.id), String(r.nombre ?? r.id))
  } catch { /* sin nombres: se muestra "Usuario" */ }
  return m
}

interface Carga {
  ingresos: Fila[]
  lineas: Fila[]
  lotesIngreso: Fila[]
  lotes: Fila[]
  posiciones: Fila[]
  productos: Fila[]
  regulatorio: Fila[]
  propietarios: Fila[]
  solicitudes: Fila[]
  versiones: Fila[]
  actas: Fila[]
  firmas: Fila[]
  organolepticas: Fila[]
  alertas: Fila[]
  nombres: Map<string, string>
}

async function cargar(): Promise<Carga> {
  const [ingresos, lineas, lotesIngreso, lotes, posiciones, productos, regulatorio, propietarios, solicitudes, versiones, actas, firmas, organolepticas, alertas] =
    await Promise.all([
      traerTodo('ingresos', 'wms', '*', 'creado_en'), traerTodo('ingreso_lineas', 'wms'), traerTodo('ingreso_lotes', 'wms'),
      traerTodo('lotes', 'wms'), traerTodo('posiciones', 'wms', 'id, codigo, tipo_area'),
      traerTodo('productos', 'catalogo', 'id, codigo, descripcion, presentacion, principio_activo'),
      traerTodo('producto_regulatorio', 'wms'), traerTodo('propietarios', 'wms'), traerTodo('solicitudes_ingreso', 'wms'),
      traerTodo('solicitud_ingreso_versiones', 'wms'), traerTodo('actas_recepcion', 'wms', '*', 'generada_en'),
      traerTodo('acta_firmas', 'wms'), traerTodo('actas_organolepticas', 'wms', '*', 'creado_en'), traerTodo('alertas', 'wms', '*', 'creada_en'),
    ])
  const nombres = await nombresDe([
    ...ingresos.map((r) => s(r.creado_por)), ...versiones.map((r) => s(r.editado_por)),
    ...organolepticas.map((r) => s(r.decidido_por)), ...alertas.map((r) => s(r.atendida_por)),
  ])
  return { ingresos, lineas, lotesIngreso, lotes, posiciones, productos, regulatorio, propietarios, solicitudes, versiones, actas, firmas, organolepticas, alertas, nombres }
}

function mapearAlerta(r: Fila, nombres: Map<string, string>): AlertaVista {
  return {
    id: String(r.id), tipo: r.tipo as AlertaVista['tipo'], destinatario: r.destinatario_rol as AlertaVista['destinatario'],
    mensaje: String(r.mensaje), estado: r.estado as AlertaVista['estado'], creadaEn: String(r.creada_en),
    atendidaPor: r.atendida_por ? nombres.get(String(r.atendida_por)) ?? 'Usuario' : undefined, atendidaEn: s(r.atendida_en),
    nota: s(r.nota_atencion), ingresoId: s(r.ingreso_id), productoId: s(r.producto_id),
  }
}

function armarOrganolepticas(c: Carga): OrganolepticaVista[] {
  const prod = new Map(c.productos.map((r) => [String(r.id), r]))
  const reg = new Map(c.regulatorio.map((r) => [String(r.producto_id), r]))
  const il = new Map(c.lotesIngreso.map((r) => [String(r.id), r]))
  const lote = new Map(c.lotes.map((r) => [String(r.id), r]))
  const ing = new Map(c.ingresos.map((r) => [String(r.id), r]))
  const prop = new Map(c.propietarios.map((r) => [String(r.id), r]))
  const actaPorIngreso = new Map<string, Fila>()
  for (const a of c.actas) if (a.estado !== 'ANULADA') actaPorIngreso.set(String(a.ingreso_id), a)
  return c.organolepticas.map((o): OrganolepticaVista => {
    const x = il.get(String(o.ingreso_lote_id))!
    const p = prod.get(String(x?.producto_id))
    const rg = reg.get(String(x?.producto_id))
    const i = ing.get(String(o.ingreso_id))!
    const l = lote.get(String(x?.lote_id))
    return {
      id: String(o.id), numero: String(o.numero), estado: o.estado as OrganolepticaVista['estado'], ingresoId: String(o.ingreso_id),
      ingresoTipo: i?.tipo as TipoIngreso, ingresoLoteId: String(o.ingreso_lote_id), productoId: String(x?.producto_id),
      productoCodigo: String(p?.codigo ?? ''), producto: String(p?.descripcion ?? ''), principioActivo: s(p?.principio_activo),
      registroSanitario: s(rg?.registro_sanitario), rsVence: s(rg?.rs_vence), fabricante: s(rg?.fabricante),
      formaPresentacion: s(rg?.forma_presentacion) ?? s(p?.presentacion), lote: String(l?.codigo ?? ''), vence: String(l?.vence ?? ''),
      propietario: String(prop.get(String(i?.propietario_id))?.razon_social ?? ''), cantidadLote: Number(o.cantidad_lote),
      cantidadMuestra: Number(o.cantidad_muestra), referencia: s(i?.oc_codigo) ?? s(i?.guia_numero) ?? s(i?.doc_original_numero),
      datos: {
        certAnalisis: o.cert_analisis == null ? null : Boolean(o.cert_analisis),
        checklist: (o.checklist ?? {}) as OrganolepticaVista['datos']['checklist'], observacion: s(o.observacion),
        destinoSugerido: (o.destino_sugerido ?? null) as OrganolepticaVista['datos']['destinoSugerido'],
        conclusion: (o.conclusion ?? null) as OrganolepticaVista['datos']['conclusion'],
      },
      decision: (o.decision ?? undefined) as Decision | undefined, decididoPor: o.decidido_por ? c.nombres.get(String(o.decidido_por)) ?? 'Dirección Técnica' : undefined,
      decididoEn: s(o.decidido_en), observacionDt: s(o.observacion_dt), hash: s(o.hash_contenido),
      actaRecepcion: s(actaPorIngreso.get(String(o.ingreso_id))?.numero), creadaEn: String(o.creado_en),
    }
  })
}

function armarDetalle(c: Carga, i: Fila): IngresoDetalle {
  const id = String(i.id)
  const prod = new Map(c.productos.map((r) => [String(r.id), r]))
  const reg = new Map(c.regulatorio.map((r) => [String(r.producto_id), r]))
  const lote = new Map(c.lotes.map((r) => [String(r.id), r]))
  const pos = new Map(c.posiciones.map((r) => [String(r.id), r]))
  const lineasDe = c.lineas.filter((l) => String(l.ingreso_id) === id)
  const lotesPorLinea = por(c.lotesIngreso.filter((l) => String(l.ingreso_id) === id), 'linea_id')
  const lineas = lineasDe.map((l) => {
    const p = prod.get(String(l.producto_id))
    const rg = reg.get(String(l.producto_id))
    return {
      id: String(l.id), productoId: String(l.producto_id), codigo: String(p?.codigo ?? ''), descripcion: String(p?.descripcion ?? '—'),
      registroSanitario: s(rg?.registro_sanitario), rsVence: s(rg?.rs_vence), cantidadReferencia: Number(l.cantidad_referencia),
      lotes: (lotesPorLinea.get(String(l.id)) ?? []).map((x) => ({
        id: String(x.id), codigo: String(lote.get(String(x.lote_id))?.codigo ?? ''), vence: String(x.vence ?? ''), venceTexto: s(x.vence_texto_original),
        cantidad: Number(x.cantidad), posicionId: String(x.posicion_id), posicionCodigo: String(pos.get(String(x.posicion_id))?.codigo ?? ''),
      })),
    }
  })
  const cuadra = lineas.every((l) => progresoLinea(l.cantidadReferencia, l.lotes).estado === 'CUADRA')
  const sol = c.solicitudes.find((x) => String(x.ingreso_id) === id)
  const versiones = c.versiones.filter((v) => sol && String(v.solicitud_id) === String(sol.id))
    .sort((a, b) => Number(b.version) - Number(a.version))
    .map((v) => ({ version: Number(v.version), motivo: s(v.motivo), editadoPor: c.nombres.get(String(v.editado_por)) ?? 'Usuario', editadoEn: String(v.editado_en), datos: (v.datos ?? {}) as Record<string, unknown> }))
  const actasIngreso = c.actas.filter((a) => String(a.ingreso_id) === id)
  const actas: ActaRecepcionVista[] = actasIngreso.map((a) => {
    const f = c.firmas.filter((x) => x.acta_tipo === 'RECEPCION' && String(x.acta_id) === String(a.id))
    const hechas = new Set(f.map((x) => String(x.rol_firma)))
    return {
      id: String(a.id), numero: String(a.numero), estado: a.estado as ActaRecepcionVista['estado'], hash: String(a.hash_contenido),
      generadaEn: String(a.generada_en), firmadaEn: s(a.firmada_en), reemplazaA: s(a.reemplaza_a),
      reemplazaANumero: s(c.actas.find((x) => String(x.id) === String(a.reemplaza_a))?.numero),
      reemplazadaPorNumero: s(c.actas.find((x) => String(x.reemplaza_a) === String(a.id))?.numero),
      anuladaEn: s(a.anulada_en), motivoAnulacion: s(a.motivo_anulacion), contenido: a.contenido as ActaRecepcionVista['contenido'],
      firmas: f.map((x) => ({ rol: x.rol_firma as ActaRecepcionVista['firmas'][number]['rol'], nombre: String(x.nombre), dni: s(x.dni), placa: s(x.placa), imagen: s(x.imagen_firma), firmadoEn: String(x.firmado_en), hash: String(x.hash_contenido) })),
      faltan: ROLES_FIRMA.filter((r) => !hechas.has(r)),
    }
  }).reverse()
  const vigente = actasIngreso.find((a) => a.estado !== 'ANULADA')
  const confirmado = i.estado === 'CONFIRMADO'
  const tipo = i.tipo as TipoIngreso
  const temp = i.temperatura_c == null ? undefined : Number(i.temperatura_c)
  return {
    id, tipo, propietarioId: String(i.propietario_id), propietario: String(c.propietarios.find((p) => String(p.id) === String(i.propietario_id))?.razon_social ?? ''),
    confirmado, confirmadoEn: s(i.confirmado_en), ocCodigo: s(i.oc_codigo), contraparteNombre: s(i.contraparte_nombre), contraparteRuc: s(i.contraparte_ruc),
    guiaNumero: s(i.guia_numero), facturaNumero: s(i.factura_numero), docOriginalTipo: (i.doc_original_tipo ?? undefined) as 'FACTURA' | 'BOLETA' | undefined,
    docOriginalNumero: s(i.doc_original_numero), motivo: s(i.motivo), temperaturaC: temp, alertaTemperatura: temperaturaFueraDeRango(temp),
    bultos: num(i.bultos), paletas: num(i.paletas), placa: s(i.placa), marcaVehiculo: s(i.marca_vehiculo),
    tipoConteo: (i.tipo_conteo ?? undefined) as IngresoDetalle['tipoConteo'], horaInicio: s(i.hora_inicio), horaFin: s(i.hora_fin),
    verificaciones: (i.verificaciones ?? {}) as Record<string, boolean>, observaciones: s(i.observaciones), creadoEn: String(i.creado_en),
    creadoPor: c.nombres.get(String(i.creado_por)),
    paso: pasoDeIngreso({ confirmado, cuadra, tieneTemperatura: temp != null, acta: vigente ? { estado: vigente.estado as 'BORRADOR' | 'FIRMADA', firmas: c.firmas.filter((x) => String(x.acta_id) === String(vigente.id)).length } : undefined }),
    lineas, cuadra, solicitudVersion: versiones[0]?.version ?? 1, versiones, actas,
    organolepticas: armarOrganolepticas(c).filter((o) => o.ingresoId === id),
    alertas: c.alertas.filter((a) => String(a.ingreso_id) === id).map((a) => mapearAlerta(a, c.nombres)),
    expedienteId: s(i.expediente_id),
    bloqueadoPorFirmas: !!vigente && c.firmas.some((x) => String(x.acta_id) === String(vigente.id)),
  }
}

export class EntradasSupabase {
  async recepcionesDeCompra(): Promise<RecepcionCompra[]> {
    // Vista de integración (solo existe si Compras está en la misma base).
    let filas: Fila[] = []
    try { filas = await traerTodo('v_recepciones_compra', 'wms', '*', 'fecha_recepcion') } catch { return [] }
    const ingresos = await traerTodo('ingresos', 'wms', 'id, compra_recepcion_id')
    const ya = new Map(ingresos.filter((r) => r.compra_recepcion_id).map((r) => [String(r.compra_recepcion_id), String(r.id)]))
    const grupos = por(filas, 'recepcion_id')
    return [...grupos.entries()].map(([recepcionId, ls]) => ({
      recepcionId, ocCodigo: String(ls[0].oc_codigo), proveedorNombre: String(ls[0].proveedor_nombre), proveedorRuc: String(ls[0].proveedor_ruc),
      fecha: String(ls[0].fecha_recepcion).slice(0, 10), guias: s(ls[0].guias),
      lineas: ls.map((l) => ({ productoId: String(l.producto_id), codigo: String(l.producto_codigo), descripcion: String(l.producto_descripcion), cantidad: Number(l.cantidad_fisica) })),
      ingresoId: ya.get(recepcionId),
    }))
  }

  async posicionesDeCuarentena(): Promise<PosicionDestino[]> {
    const [pos, saldos] = await Promise.all([traerTodo('posiciones', 'wms', 'id, codigo, tipo_area'), traerTodo('saldos', 'wms', 'posicion_id, cantidad')])
    const suma = new Map<string, number>()
    for (const r of saldos) suma.set(String(r.posicion_id), (suma.get(String(r.posicion_id)) ?? 0) + Number(r.cantidad))
    return pos.filter((p) => p.tipo_area === 'CUARENTENA').sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true }))
      .map((p) => ({ id: String(p.id), codigo: String(p.codigo), area: 'Cuarentena', ocupadas: suma.get(String(p.id)) ?? 0 }))
  }

  async listarIngresos(): Promise<IngresoResumen[]> {
    const c = await cargar()
    return c.ingresos.map((i) => armarDetalle(c, i)).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).map((d) => ({
      id: d.id, tipo: d.tipo, propietario: d.propietario, contraparte: d.contraparteNombre,
      referencia: d.tipo === 'COMPRA_LOCAL' ? d.ocCodigo : d.tipo === 'DEVOLUCION' ? `${d.docOriginalTipo === 'BOLETA' ? 'Boleta' : 'Factura'} ${d.docOriginalNumero}` : d.guiaNumero ? `Guía ${d.guiaNumero}` : undefined,
      paso: d.paso, actaNumero: d.actas.find((a) => a.estado !== 'ANULADA')?.numero, unidades: d.lineas.reduce((n, l) => n + l.cantidadReferencia, 0),
      productos: d.lineas.length, creadoEn: d.creadoEn, alertasAbiertas: d.alertas.filter((a) => a.estado === 'ABIERTA').length, confirmado: d.confirmado,
    }))
  }

  async obtenerIngreso(id: string): Promise<IngresoDetalle | null> {
    const c = await cargar()
    const i = c.ingresos.find((x) => String(x.id) === id)
    return i ? armarDetalle(c, i) : null
  }

  async crearIngreso(entrada: EntradaIngreso, _actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const props = await traerTodo('propietarios', 'wms', 'id, es_dueno_almacen')
    const p = props.find((x) => String(x.id) === entrada.propietarioId)
    const v = validarEntradaIngreso(entrada, p ? { esDuenoAlmacen: Boolean(p.es_dueno_almacen) } : undefined)
    if (!v.ok) return { ok: false, mensaje: Object.values(v.errores)[0] ?? 'Revisa los campos marcados.', errores: v.errores as Record<string, string> }
    const { data, error } = await rpc('crear_ingreso', {
      p_tipo: entrada.tipo, p_propietario: entrada.propietarioId,
      p_datos: {
        compra_recepcion_id: entrada.compraRecepcionId, contraparte_nombre: entrada.contraparteNombre, contraparte_ruc: entrada.contraparteRuc,
        guia_numero: entrada.guiaNumero, doc_original_tipo: entrada.docOriginalTipo, doc_original_numero: entrada.docOriginalNumero, motivo: entrada.motivo,
      },
      p_lineas: (entrada.lineas ?? []).map((l) => ({ producto_id: l.productoId, cantidad_referencia: Number(l.cantidadReferencia) })),
    })
    return error ? mal(error) : { ok: true, id: String(data) }
  }

  async editarIngreso(id: string, d: DatosEdicionIngreso, _actor: Actor): Promise<ResultadoAccion> {
    const datos: Record<string, unknown> = {}
    const map: Record<string, string> = {
      temperaturaC: 'temperatura_c', bultos: 'bultos', paletas: 'paletas', placa: 'placa', marcaVehiculo: 'marca_vehiculo', tipoConteo: 'tipo_conteo',
      horaInicio: 'hora_inicio', horaFin: 'hora_fin', verificaciones: 'verificaciones', observaciones: 'observaciones', guiaNumero: 'guia_numero',
      facturaNumero: 'factura_numero', contraparteNombre: 'contraparte_nombre', contraparteRuc: 'contraparte_ruc', motivo: 'motivo',
    }
    for (const [k, col] of Object.entries(map)) if (k in d) datos[col] = (d as Record<string, unknown>)[k] === '' ? null : (d as Record<string, unknown>)[k]
    const { error } = await rpc('editar_ingreso', { p_ingreso: id, p_datos: datos })
    return error ? mal(error) : ok()
  }

  async guardarLotes(id: string, lineaId: string, lotes: EntradaLote[], _actor: Actor): Promise<ResultadoAccion> {
    const salida: Record<string, unknown>[] = []
    for (const [idx, x] of lotes.entries()) {
      const r = validarEntradaLote(x, parsearVencimiento)
      if (!r.ok) return { ok: false, mensaje: `Lote ${idx + 1}: ${Object.values(r.errores)[0]}` }
      salida.push({ codigo: x.codigo.trim(), cantidad: r.cantidad, vence: r.vence, vence_texto: /^\d{1,2}\/\d{4}$|^\d{4}-\d{2}$/.test(r.venceTexto) ? r.venceTexto : null, posicion_id: x.posicionId })
    }
    const { error } = await rpc('guardar_lotes', { p_ingreso: id, p_linea: lineaId, p_lotes: salida })
    return error ? mal(error) : ok()
  }

  async editarSolicitud(id: string, datos: Record<string, unknown>, motivo: string | undefined, _actor: Actor): Promise<ResultadoAccion<{ version: number }>> {
    const { data, error } = await rpc('editar_solicitud', { p_ingreso: id, p_datos: datos, p_motivo: motivo ?? null })
    return error ? mal(error) : { ok: true, version: Number(data) }
  }

  async generarActa(id: string, _actor: Actor): Promise<ResultadoAccion<{ actaId: string }>> {
    const { data, error } = await rpc('generar_acta_recepcion', { p_ingreso: id })
    return error ? mal(error) : { ok: true, actaId: String(data) }
  }

  async firmarActa(actaId: string, firma: FirmaEntrada, actor: Actor): Promise<ResultadoAccion<{ completa: boolean }>> {
    if (firma.rol === 'TRANSPORTISTA') {
      const v = validarTransportista({ nombre: firma.nombre ?? '', dni: firma.dni ?? '', placa: firma.placa ?? '', imagen: firma.imagen ?? '' })
      if (!v.ok) return { ok: false, mensaje: Object.values(v.errores)[0] ?? 'Revisa los datos del transportista', errores: v.errores as Record<string, string> }
    }
    const { data, error } = await rpc('firmar_acta_recepcion', {
      p_acta: actaId, p_rol_firma: firma.rol, p_nombre: firma.rol === 'TRANSPORTISTA' ? firma.nombre : actor.nombre,
      p_dni: firma.dni ?? null, p_placa: firma.placa ?? null, p_imagen: firma.imagen ?? null,
    })
    return error ? mal(error) : { ok: true, completa: Boolean((data as { completa?: boolean } | null)?.completa) }
  }

  async anularActa(actaId: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('anular_acta_recepcion', { p_acta: actaId, p_motivo: motivo })
    return error ? mal(error) : ok()
  }

  async reemitirActa(actaId: string, _actor: Actor): Promise<ResultadoAccion<{ actaId: string }>> {
    const { data, error } = await rpc('reemitir_acta_recepcion', { p_acta_anulada: actaId })
    return error ? mal(error) : { ok: true, actaId: String(data) }
  }

  async confirmarIngreso(id: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('confirmar_ingreso', { p_ingreso: id })
    return error ? mal(error) : ok()
  }

  async obtenerOrganoleptica(id: string): Promise<OrganolepticaVista | null> {
    return armarOrganolepticas(await cargar()).find((o) => o.id === id) ?? null
  }

  async guardarOrganoleptica(id: string, d: DatosOrganolepticaGuardar, enviar: boolean, _actor: Actor): Promise<ResultadoAccion> {
    const datos: Record<string, unknown> = {}
    if (d.certAnalisis !== undefined) datos.cert_analisis = d.certAnalisis
    if (d.checklist !== undefined) datos.checklist = d.checklist
    if (d.observacion !== undefined) datos.observacion = d.observacion
    if (d.destinoSugerido !== undefined) datos.destino_sugerido = d.destinoSugerido
    if (d.conclusion !== undefined) datos.conclusion = d.conclusion
    const { error } = await rpc('guardar_acta_organoleptica', { p_acta: id, p_datos: datos, p_enviar: enviar })
    return error ? mal(error) : ok()
  }

  async decidirOrganoleptica(id: string, decision: Decision, observacion: string | undefined, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('decidir_acta_organoleptica', { p_acta: id, p_decision: decision, p_observacion: observacion ?? null })
    return error ? mal(error) : ok()
  }

  async colaDireccionTecnica(): Promise<ColaDT> {
    const [c, alertas, regs, prods] = await Promise.all([
      cargar(), this.listarAlertas(), traerTodo('producto_regulatorio', 'wms', 'producto_id, estado_validacion'),
      traerTodo('productos', 'catalogo', 'id, codigo, descripcion'),
    ])
    const pendientes = new Map(regs.filter((r) => r.estado_validacion !== 'VALIDADO').map((r) => [String(r.producto_id), String(r.estado_validacion)]))
    const todas = armarOrganolepticas(c)
    return {
      organolepticas: todas.filter((o) => o.estado === 'PENDIENTE_DT'),
      borradores: todas.filter((o) => o.estado === 'BORRADOR'),
      decididas: todas.filter((o) => o.estado === 'FIRMADA').sort((a, b) => (b.decididoEn ?? '').localeCompare(a.decididoEn ?? '')).slice(0, 10),
      productosPorValidar: prods.filter((p) => pendientes.has(String(p.id))).map((p) => ({ id: String(p.id), codigo: String(p.codigo), descripcion: String(p.descripcion), estado: pendientes.get(String(p.id))! })),
      alertas: alertas.filter((a) => a.estado === 'ABIERTA' && a.destinatario === 'direccion_tecnica'),
    }
  }

  async listarAlertas(): Promise<AlertaVista[]> {
    // Las revisiones son idempotentes: crean la alerta una sola vez mientras siga abierta.
    await Promise.all([rpc('revisar_divergencias', {}), rpc('revisar_por_trasladar', {})])
    const filas = await traerTodo('alertas', 'wms', '*', 'creada_en')
    const nombres = await nombresDe(filas.map((r) => s(r.atendida_por)))
    return filas.map((r) => mapearAlerta(r, nombres)).reverse()
  }

  async contarAlertasAbiertas(): Promise<{ direccion_tecnica: number; jefe_almacen: number }> {
    const { data } = await crearClienteServidor().schema('wms').from('alertas').select('destinatario_rol').eq('estado', 'ABIERTA')
    const f = (data ?? []) as Fila[]
    return { direccion_tecnica: f.filter((a) => a.destinatario_rol === 'direccion_tecnica').length, jefe_almacen: f.filter((a) => a.destinatario_rol === 'jefe_almacen').length }
  }

  async atenderAlerta(id: string, nota: string | undefined, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('atender_alerta', { p_alerta: id, p_nota: nota ?? null })
    return error ? mal(error) : ok()
  }

  async listarExpedientes(): Promise<ResumenExpediente[]> {
    const [exps, docs, falt, ings] = await Promise.all([
      traerTodo('expedientes', 'wms', '*', 'creado_en'), traerTodo('expediente_documentos', 'wms', 'id, expediente_id'),
      traerTodo('expediente_faltantes', 'wms', 'id, expediente_id, estado'), traerTodo('ingresos', 'wms', 'id, expediente_id'),
    ])
    return exps.map((x) => ({
      id: String(x.id), clave: String(x.clave), tipo: x.tipo as 'OC' | 'ACTA', estado: x.estado as 'ABIERTO' | 'CERRADO',
      faltantesAbiertos: falt.filter((f) => String(f.expediente_id) === String(x.id) && f.estado === 'ABIERTO').length,
      documentos: docs.filter((d) => String(d.expediente_id) === String(x.id)).length,
      ingresos: ings.filter((i) => String(i.expediente_id) === String(x.id)).length,
    })).reverse()
  }

  async obtenerExpediente(id: string): Promise<ExpedienteVista | null> {
    const [exps, docs, falt, ings, actas, lotes] = await Promise.all([
      traerTodo('expedientes', 'wms'), traerTodo('expediente_documentos', 'wms', '*', 'agregado_en'), traerTodo('expediente_faltantes', 'wms', '*', 'creado_en'),
      traerTodo('ingresos', 'wms', 'id, tipo, expediente_id, confirmado_en'), traerTodo('actas_recepcion', 'wms', 'ingreso_id, numero, estado'),
      traerTodo('ingreso_lotes', 'wms', 'ingreso_id, cantidad'),
    ])
    const x = exps.find((e) => String(e.id) === id)
    if (!x) return null
    return {
      id, clave: String(x.clave), tipo: x.tipo as 'OC' | 'ACTA', estado: x.estado as 'ABIERTO' | 'CERRADO', cerradoEn: s(x.cerrado_en),
      documentos: docs.filter((d) => String(d.expediente_id) === id).map((d) => ({ id: String(d.id), tipo: String(d.tipo), descripcion: String(d.descripcion), agregadoEn: String(d.agregado_en), referenciaTipo: s(d.referencia_tipo), referenciaId: s(d.referencia_id) })),
      faltantes: falt.filter((f) => String(f.expediente_id) === id).map((f) => ({ id: String(f.id), tipo: String(f.tipo), documento: String(f.documento), responsable: String(f.responsable), estado: f.estado as 'ABIERTO' | 'RESUELTO', resueltoEn: s(f.resuelto_en), nota: s(f.nota) })),
      ingresos: ings.filter((i) => String(i.expediente_id) === id).map((i) => ({
        id: String(i.id), tipo: i.tipo as TipoIngreso, actaNumero: s(actas.find((a) => String(a.ingreso_id) === String(i.id) && a.estado === 'FIRMADA')?.numero),
        unidades: lotes.filter((l) => String(l.ingreso_id) === String(i.id)).reduce((n, l) => n + Number(l.cantidad), 0), confirmadoEn: s(i.confirmado_en),
      })),
    }
  }

  async agregarDocumento(expedienteId: string, tipo: string, descripcion: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('agregar_documento_expediente', { p_exp: expedienteId, p_tipo: tipo || 'OTRO', p_descripcion: descripcion, p_ref_tipo: null, p_ref: null })
    return error ? mal(error) : ok()
  }

  async agregarFaltante(expedienteId: string, documento: string, responsable: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('agregar_faltante', { p_exp: expedienteId, p_tipo: 'OTRO', p_documento: documento, p_responsable: responsable })
    return error ? mal(error) : ok()
  }

  async resolverFaltante(faltanteId: string, nota: string | undefined, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('resolver_faltante', { p_faltante: faltanteId, p_nota: nota ?? null })
    return error ? mal(error) : ok()
  }

  async cerrarExpediente(expedienteId: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('cerrar_expediente', { p_exp: expedienteId })
    return error ? mal(error) : ok()
  }

  async buscarEntradas(consulta: string): Promise<ResultadoBusqueda[]> {
    const q = consulta.trim()
    if (!q) return []
    const like = `%${q.replace(/[%_]/g, '')}%`
    const supabase = crearClienteServidor()
    const [oc, actas, orgs] = await Promise.all([
      supabase.schema('wms').from('ingresos').select('id, tipo, oc_codigo, contraparte_nombre').ilike('oc_codigo', like).limit(8),
      supabase.schema('wms').from('actas_recepcion').select('id, numero, estado, ingreso_id').ilike('numero', like).limit(8),
      supabase.schema('wms').from('actas_organolepticas').select('id, numero').ilike('numero', like).limit(8),
    ])
    const out: ResultadoBusqueda[] = []
    for (const r of (oc.data ?? []) as Fila[]) out.push({ tipo: 'oc', id: String(r.id), titulo: `${r.oc_codigo} · ${r.contraparte_nombre ?? ''}`.trim(), detalle: ETIQUETA_TIPO_INGRESO[r.tipo as TipoIngreso], posiciones: [], unidades: 0, puntaje: 30, href: `/entradas/${r.id}` })
    for (const r of (actas.data ?? []) as Fila[]) out.push({ tipo: 'acta', id: String(r.id), titulo: `Acta ${r.numero}${r.estado === 'ANULADA' ? ' (anulada)' : ''}`, detalle: 'Acta de Recepción', posiciones: [], unidades: 0, puntaje: 35, href: `/entradas/${r.ingreso_id}` })
    for (const r of (orgs.data ?? []) as Fila[]) out.push({ tipo: 'acta', id: String(r.id), titulo: `Acta organoléptica ${r.numero}`, detalle: 'Evaluación organoléptica', posiciones: [], unidades: 0, puntaje: 33, href: `/calidad/${r.id}` })
    return out
  }
}
