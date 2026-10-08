import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import {
  AREA_DESTINO, ESTADO_INICIAL, ETIQUETA_TIPO_INGRESO, pasoDeSolicitud, ROLES_FIRMA, temperaturaFueraDeRango, validarEntradaSolicitud,
  validarLineaSolicitud, validarTransportista, type CambioEntrada, type Decision, type EntradaSolicitud, type EstadoRegistroCompras,
  type TipoIngreso,
} from '@/domain/entradas'
import type {
  ActaRecepcionVista, AlertaVista, BloqueFisico, CambioVista, ColaDT, DatosEdicionRecepcion, DatosOrganolepticaGuardar, DatosVerificacion,
  ExpedienteVista, FirmaEntrada, LineaSolicitudVista, OcPendiente, OrganolepticaVista, PosicionDestino, ResumenExpediente,
  SolicitudDetalle, SolicitudResumen,
} from '@/domain/entradas-vistas'
import { parsearVencimiento } from '@/domain/fechas'
import type { ResultadoBusqueda } from '@/domain/panorama'
import type { Actor, ResultadoAccion } from '../repositorio'
import { mensajeHumano, num, rpc, s, traerTodo, type Fila } from './util'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (no hay base de pruebas: ver gate-0.md §G.1).
// Está verificado contra el contrato de las funciones SQL de la migración 0005 (que sí se probó
// en Postgres local) y por tipos. Las lecturas pasan por RLS con la sesión de la persona.
// El id que usan las pantallas (/entradas/[id]) es el de la SOLICITUD; el ingreso (recepción física) se resuelve por su solicitud_id.

const ok = <T extends object>(extra?: T) => ({ ok: true as const, ...(extra as T) })
const mal = (error: { code?: string; message: string }) => ({ ok: false as const, mensaje: mensajeHumano(error) })
const SOLO_MES_ANIO = /^\d{1,2}\/\d{4}$|^\d{4}-\d{2}$/

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

/** Lectura de las vistas de Compras (solo existen si Compras está en la misma base). */
async function leerOpcional(tabla: string, orden?: string): Promise<Fila[]> {
  try { return await traerTodo(tabla, 'wms', '*', orden) } catch { return [] }
}

interface Carga {
  solicitudes: Fila[]
  lineas: Fila[]
  cambios: Fila[]
  versiones: Fila[]
  ingresos: Fila[]
  lotesIngreso: Fila[]
  lotes: Fila[]
  posiciones: Fila[]
  productos: Fila[]
  regulatorio: Fila[]
  propietarios: Fila[]
  actas: Fila[]
  firmas: Fila[]
  organolepticas: Fila[]
  alertas: Fila[]
  nombres: Map<string, string>
}

async function cargar(): Promise<Carga> {
  const [solicitudes, lineas, cambios, versiones, ingresos, lotesIngreso, lotes, posiciones, productos, regulatorio, propietarios, actas, firmas, organolepticas, alertas] =
    await Promise.all([
      traerTodo('solicitudes_ingreso', 'wms', '*', 'creado_en'), traerTodo('solicitud_ingreso_lineas', 'wms', '*', 'creado_en'),
      traerTodo('solicitud_ingreso_cambios', 'wms', '*', 'id'), traerTodo('solicitud_ingreso_versiones', 'wms'),
      traerTodo('ingresos', 'wms', '*', 'creado_en'), traerTodo('ingreso_lotes', 'wms'),
      traerTodo('lotes', 'wms'), traerTodo('posiciones', 'wms', 'id, codigo, tipo_area'),
      traerTodo('productos', 'catalogo', 'id, codigo, descripcion, presentacion, principio_activo'),
      traerTodo('producto_regulatorio', 'wms'), traerTodo('propietarios', 'wms'),
      traerTodo('actas_recepcion', 'wms', '*', 'generada_en'), traerTodo('acta_firmas', 'wms'),
      traerTodo('actas_organolepticas', 'wms', '*', 'creado_en'), traerTodo('alertas', 'wms', '*', 'creada_en'),
    ])
  const nombres = await nombresDe([
    ...solicitudes.map((r) => s(r.creado_por)), ...solicitudes.map((r) => s(r.autorizado_por)), ...versiones.map((r) => s(r.editado_por)),
    ...cambios.map((r) => s(r.usuario)), ...organolepticas.map((r) => s(r.decidido_por)), ...alertas.map((r) => s(r.atendida_por)),
  ])
  return { solicitudes, lineas, cambios, versiones, ingresos, lotesIngreso, lotes, posiciones, productos, regulatorio, propietarios, actas, firmas, organolepticas, alertas, nombres }
}

/** Una alerta se refiere a una solicitud directamente o a través de su ingreso. */
function mapearAlerta(r: Fila, nombres: Map<string, string>, solicitudDeIngreso: Map<string, string>): AlertaVista {
  return {
    id: String(r.id), tipo: r.tipo as AlertaVista['tipo'], destinatario: r.destinatario_rol as AlertaVista['destinatario'],
    mensaje: String(r.mensaje), estado: r.estado as AlertaVista['estado'], creadaEn: String(r.creada_en),
    atendidaPor: r.atendida_por ? nombres.get(String(r.atendida_por)) ?? 'Usuario' : undefined, atendidaEn: s(r.atendida_en),
    nota: s(r.nota_atencion), solicitudId: s(r.solicitud_id) ?? (r.ingreso_id ? solicitudDeIngreso.get(String(r.ingreso_id)) : undefined),
    productoId: s(r.producto_id), loteCodigo: s(r.lote_codigo),
  }
}

const solicitudesDeIngreso = (c: Carga) => new Map(c.ingresos.map((i) => [String(i.id), String(i.solicitud_id)]))

function armarOrganolepticas(c: Carga): OrganolepticaVista[] {
  const prod = new Map(c.productos.map((r) => [String(r.id), r]))
  const reg = new Map(c.regulatorio.map((r) => [String(r.producto_id), r]))
  const il = new Map(c.lotesIngreso.map((r) => [String(r.id), r]))
  const lote = new Map(c.lotes.map((r) => [String(r.id), r]))
  const ing = new Map(c.ingresos.map((r) => [String(r.id), r]))
  const sol = new Map(c.solicitudes.map((r) => [String(r.id), r]))
  const prop = new Map(c.propietarios.map((r) => [String(r.id), r]))
  const actaPorIngreso = new Map<string, Fila>()
  for (const a of c.actas) if (a.estado !== 'ANULADA') actaPorIngreso.set(String(a.ingreso_id), a)
  return c.organolepticas.map((o): OrganolepticaVista => {
    const x = il.get(String(o.ingreso_lote_id))!
    const p = prod.get(String(x?.producto_id))
    const rg = reg.get(String(x?.producto_id))
    const i = ing.get(String(o.ingreso_id))!
    const sl = sol.get(String(i?.solicitud_id))
    const l = lote.get(String(x?.lote_id))
    return {
      id: String(o.id), numero: String(o.numero), estado: o.estado as OrganolepticaVista['estado'], solicitudId: String(i?.solicitud_id),
      solicitudNumero: String(sl?.numero ?? ''), ingresoTipo: i?.tipo as TipoIngreso, ingresoLoteId: String(o.ingreso_lote_id), productoId: String(x?.producto_id),
      productoCodigo: String(p?.codigo ?? ''), producto: String(p?.descripcion ?? ''), principioActivo: s(p?.principio_activo),
      registroSanitario: s(rg?.registro_sanitario), rsVence: s(rg?.rs_vence), fabricante: s(rg?.fabricante),
      formaPresentacion: s(rg?.forma_presentacion) ?? s(p?.presentacion), lote: String(l?.codigo ?? x?.lote_codigo ?? ''), vence: String(l?.vence ?? x?.vence ?? ''),
      propietario: String(prop.get(String(i?.propietario_id))?.razon_social ?? ''), cantidadLote: Number(o.cantidad_lote),
      cantidadMuestra: Number(o.cantidad_muestra), referencia: s(i?.oc_codigo) ?? s(sl?.guia_numero) ?? s(sl?.doc_original_numero),
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

/** Conciliación con Compras de una solicitud cerrada (función SQL: la misma lógica que probó la base local). */
async function conciliacion(solicitudId: string, descripciones: Map<string, string>, ocCodigo: string): Promise<BloqueFisico[]> {
  const { data, error } = await rpc('estado_registro_compras', { p_solicitud: solicitudId })
  if (error || !data) return []
  return (data as Fila[]).map((r) => ({
    ocItemId: String(r.oc_item_id), productoId: String(r.producto_id), descripcion: descripciones.get(String(r.producto_id)) ?? '', ocCodigo,
    fisica: Number(r.fisica), base: Number(r.base), esperado: Number(r.esperado), registrado: num(r.registrado), estado: r.estado as EstadoRegistroCompras,
  }))
}

function armarDetalle(c: Carga, sol: Fila, bloque: BloqueFisico[], facturadas: Map<string, number> = new Map()): SolicitudDetalle {
  const id = String(sol.id)
  const prod = new Map(c.productos.map((r) => [String(r.id), r]))
  const reg = new Map(c.regulatorio.map((r) => [String(r.producto_id), r]))
  const pos = new Map(c.posiciones.map((r) => [String(r.id), r]))
  const ing = c.ingresos.find((i) => String(i.solicitud_id) === id)
  const confirmado = ing?.estado === 'CONFIRMADO'
  const lotesIng = new Map(c.lotesIngreso.filter((l) => ing && String(l.ingreso_id) === String(ing.id)).map((l) => [String(l.solicitud_linea_id), l]))
  const lineas: LineaSolicitudVista[] = c.lineas.filter((l) => String(l.solicitud_id) === id).map((l) => {
    const p = prod.get(String(l.producto_id))
    const rg = reg.get(String(l.producto_id))
    const x = lotesIng.get(String(l.id))
    return {
      id: String(l.id), ocItemId: s(l.oc_item_id), productoId: String(l.producto_id), codigo: String(p?.codigo ?? ''), descripcion: String(p?.descripcion ?? '—'),
      registroSanitario: s(rg?.registro_sanitario) ?? s(l.registro_sanitario), rsVence: s(rg?.rs_vence), lote: String(l.lote), vence: String(l.vence),
      venceTexto: s(l.vence_texto_original), ocPedida: num(l.cantidad_oc_pedida), ocSaldo: num(l.cantidad_oc_saldo),
      ocFacturada: l.oc_item_id ? facturadas.get(String(l.oc_item_id)) : undefined,
      comprasRecibidaAntes: num(l.compras_recibida_antes), inicial: num(l.cantidad_inicial), cantidad: Number(l.cantidad),
      estadoLinea: l.estado_linea as LineaSolicitudVista['estadoLinea'], verificacion: (x?.verificacion ?? null) as LineaSolicitudVista['verificacion'],
      posicionId: s(x?.posicion_id), posicionCodigo: x?.posicion_id ? s(pos.get(String(x.posicion_id))?.codigo) : undefined,
      fisica: confirmado && x ? Number(x.cantidad) : undefined,
    }
  })
  const nombres = c.nombres
  const cambios: CambioVista[] = c.cambios.filter((x) => String(x.solicitud_id) === id).map((x) => {
    const l = lineas.find((y) => y.id === String(x.linea_id))
    return {
      id: String(x.id), lineaId: s(x.linea_id), version: Number(x.version), campo: String(x.campo), antes: s(x.antes), despues: s(x.despues),
      motivo: s(x.motivo), usuario: nombres.get(String(x.usuario)) ?? 'Usuario', ts: String(x.ts), etiqueta: l ? `${l.descripcion} · lote ${l.lote}` : undefined,
    }
  }).reverse()
  const versiones = c.versiones.filter((v) => String(v.solicitud_id) === id).sort((a, b) => Number(b.version) - Number(a.version))
    .map((v) => ({ version: Number(v.version), motivo: s(v.motivo), editadoPor: nombres.get(String(v.editado_por)) ?? 'Usuario', editadoEn: String(v.editado_en), datos: (v.datos ?? {}) as Record<string, unknown> }))
  const actasIng = ing ? c.actas.filter((a) => String(a.ingreso_id) === String(ing.id)) : []
  const actas: ActaRecepcionVista[] = actasIng.map((a) => {
    const f = c.firmas.filter((x) => x.acta_tipo === 'RECEPCION' && String(x.acta_id) === String(a.id))
    const hechas = new Set(f.map((x) => String(x.rol_firma)))
    return {
      id: String(a.id), numero: String(a.numero), estado: a.estado as ActaRecepcionVista['estado'], hash: String(a.hash_contenido),
      generadaEn: String(a.generada_en), firmadaEn: s(a.firmada_en), reemplazaA: s(a.reemplaza_a),
      reemplazaANumero: s(c.actas.find((x) => String(x.id) === String(a.reemplaza_a))?.numero),
      reemplazadaPorNumero: s(c.actas.find((x) => String(x.reemplaza_a) === String(a.id))?.numero),
      anuladaEn: s(a.anulada_en), motivoAnulacion: s(a.motivo_anulacion), contenido: camel(a.contenido) as ActaRecepcionVista['contenido'],
      firmas: f.map((x) => ({ rol: x.rol_firma as ActaRecepcionVista['firmas'][number]['rol'], nombre: String(x.nombre), dni: s(x.dni), placa: s(x.placa), imagen: s(x.imagen_firma), firmadoEn: String(x.firmado_en), hash: String(x.hash_contenido) })),
      faltan: ROLES_FIRMA.filter((r) => !hechas.has(r)),
    }
  }).reverse()
  const vigente = actasIng.find((a) => a.estado !== 'ANULADA')
  const tipo = sol.tipo as TipoIngreso
  const temp = ing?.temperatura_c == null ? undefined : Number(ing.temperatura_c)
  const pendientes = [...lotesIng.values()].filter((x) => x.verificacion === 'PENDIENTE').length
  const estado = sol.estado as SolicitudDetalle['estado']
  const conDiferencias = lineas.some((l) => l.estadoLinea !== 'ESPERADA' || (l.inicial != null && l.inicial !== l.cantidad))
  const sinNombre = (v: unknown) => (v ? nombres.get(String(v)) ?? 'Usuario' : undefined)
  return {
    id, numero: String(sol.numero), tipo, estado, version: Number(sol.version_actual), propietarioId: String(sol.propietario_id),
    propietario: String(c.propietarios.find((p) => String(p.id) === String(sol.propietario_id))?.razon_social ?? ''),
    ocId: s(sol.oc_id), ocCodigo: s(sol.oc_codigo), contraparteNombre: s(sol.contraparte_nombre), contraparteRuc: s(sol.contraparte_ruc),
    guiaNumero: s(sol.guia_numero), docOriginalTipo: (sol.doc_original_tipo ?? undefined) as 'FACTURA' | 'BOLETA' | undefined,
    docOriginalNumero: s(sol.doc_original_numero), motivo: s(sol.motivo), observaciones: s(sol.observaciones), fechaPrevista: s(sol.fecha_prevista),
    origenCreacion: sol.origen_creacion as 'INTERNO' | 'CLIENTE', creadoEn: String(sol.creado_en), creadoPor: sinNombre(sol.creado_por),
    autorizadoPor: sinNombre(sol.autorizado_por), autorizadoEn: s(sol.autorizado_en), cerradaEn: s(sol.cerrada_en), lineas,
    paso: pasoDeSolicitud({ estado, lineasPendientes: pendientes, acta: vigente ? { estado: vigente.estado as 'BORRADOR' | 'FIRMADA', firmas: c.firmas.filter((x) => String(x.acta_id) === String(vigente.id)).length } : undefined }),
    recepcion: ing ? {
      id: String(ing.id), confirmado, confirmadoEn: s(ing.confirmado_en), facturaNumero: s(ing.factura_numero), temperaturaC: temp,
      alertaTemperatura: temperaturaFueraDeRango(temp), bultos: num(ing.bultos), paletas: num(ing.paletas), placa: s(ing.placa), marcaVehiculo: s(ing.marca_vehiculo),
      tipoConteo: (ing.tipo_conteo ?? undefined) as 'MUESTREO' | 'TOTAL' | 'OTROS' | undefined, horaInicio: s(ing.hora_inicio), horaFin: s(ing.hora_fin),
      verificaciones: (ing.verificaciones ?? {}) as Record<string, boolean>, observaciones: s(ing.observaciones),
    } : undefined,
    cambios, versiones, actas,
    organolepticas: armarOrganolepticas(c).filter((o) => o.solicitudId === id),
    alertas: c.alertas.filter((a) => String(a.solicitud_id) === id || (ing && String(a.ingreso_id) === String(ing.id))).map((a) => mapearAlerta(a, nombres, solicitudesDeIngreso(c))),
    expedienteId: s(ing?.expediente_id), bloqueadoPorFirmas: !!vigente && c.firmas.some((x) => String(x.acta_id) === String(vigente.id)),
    conDiferencias, cantidadFisica: bloque, estadoInicial: ESTADO_INICIAL[tipo],
  }
}

/** El contenido del acta se guarda en snake_case dentro de la base; las vistas lo leen en camelCase. */
function camel(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(camel)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase()), camel(x)]))
  }
  return v
}

/** Convierte lo que escribe la persona al formato de las funciones SQL (fechas ISO y claves en snake_case). */
function cambiosParaBase(cambios: CambioEntrada[]): { ok: true; datos: Record<string, unknown>[] } | { ok: false; mensaje: string } {
  const out: Record<string, unknown>[] = []
  for (const c of cambios) {
    if (c.op === 'LINEA') {
      if (c.campo === 'vence') {
        const f = parsearVencimiento(c.valor)
        if (!f) return { ok: false, mensaje: 'No entiendo esa fecha. Usa 30/06/2028 o, si el producto solo dice mes y año, 06/2028.' }
        out.push({ op: 'LINEA', linea_id: c.lineaId, campo: 'vence', valor: f.fecha, vence_texto: SOLO_MES_ANIO.test(f.textoOriginal) ? f.textoOriginal : null })
      } else out.push({ op: 'LINEA', linea_id: c.lineaId, campo: c.campo, valor: c.valor })
    } else if (c.op === 'AGREGAR_LINEA') {
      const f = parsearVencimiento(c.vence)
      if (!f) return { ok: false, mensaje: 'No entiendo esa fecha de vencimiento.' }
      out.push({ op: 'AGREGAR_LINEA', oc_item_id: c.ocItemId ?? null, producto_id: c.productoId ?? null, lote: c.lote, vence: f.fecha,
        vence_texto: SOLO_MES_ANIO.test(f.textoOriginal) ? f.textoOriginal : null, cantidad: c.cantidad })
    } else out.push({ op: 'ENCABEZADO', campo: c.campo, valor: c.valor })
  }
  return { ok: true, datos: out }
}

async function ingresoDe(solicitudId: string): Promise<string | undefined> {
  const { data } = await crearClienteServidor().schema('wms').from('ingresos').select('id').eq('solicitud_id', solicitudId).maybeSingle()
  return data ? String((data as Fila).id) : undefined
}

export class EntradasSupabase {
  async ocsPendientes(): Promise<OcPendiente[]> {
    // Vista de integración (solo lectura; existe si Compras está en la misma base).
    const filas = await leerOpcional('v_oc_items', 'oc_codigo')
    const grupos = por(filas, 'oc_id')
    return [...grupos.entries()].map(([ocId, ls]) => ({
      ocId, codigo: String(ls[0].oc_codigo), proveedorNombre: String(ls[0].proveedor_nombre), proveedorRuc: String(ls[0].proveedor_ruc), estado: s(ls[0].estado_oc),
      items: ls.map((l) => ({
        ocItemId: String(l.oc_item_id), productoId: String(l.producto_id), codigo: String(l.producto_codigo), descripcion: String(l.producto_descripcion),
        pedida: Number(l.cantidad_pedida), recibida: Number(l.cantidad_recibida), saldo: Number(l.saldo), facturada: Number(l.cantidad_facturada ?? 0),
      })),
    })).filter((oc) => oc.items.some((i) => i.saldo > 0))
  }

  async posicionesDestino(tipo: TipoIngreso): Promise<PosicionDestino[]> {
    const area = AREA_DESTINO[tipo]
    const [pos, saldos] = await Promise.all([traerTodo('posiciones', 'wms', 'id, codigo, tipo_area'), traerTodo('saldos', 'wms', 'posicion_id, cantidad')])
    const suma = new Map<string, number>()
    for (const r of saldos) suma.set(String(r.posicion_id), (suma.get(String(r.posicion_id)) ?? 0) + Number(r.cantidad))
    return pos.filter((p) => p.tipo_area === area).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true }))
      .map((p) => ({ id: String(p.id), codigo: String(p.codigo), area: area === 'DEVOLUCIONES' ? 'Devoluciones' : 'Cuarentena', ocupadas: suma.get(String(p.id)) ?? 0 }))
  }

  async listarSolicitudes(): Promise<SolicitudResumen[]> {
    const c = await cargar()
    const detalles = c.solicitudes.map((sol) => armarDetalle(c, sol, [])).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn) || b.numero.localeCompare(a.numero))
    // Conciliación con Compras de las compras cerradas recientes (una consulta por solicitud, acotada a los últimos 45 días).
    const desde = Date.now() - 45 * 86_400_000
    const registro = new Map<string, EstadoRegistroCompras>()
    await Promise.all(detalles.filter((d) => d.estado === 'CERRADA' && d.tipo === 'COMPRA_LOCAL' && Date.parse(d.cerradaEn ?? d.creadoEn) > desde).map(async (d) => {
      const b = await conciliacion(d.id, new Map(), d.ocCodigo ?? '')
      if (b.length) registro.set(d.id, b.some((x) => x.estado === 'NO_COINCIDE') ? 'NO_COINCIDE' : b.some((x) => x.estado === 'FALTA') ? 'FALTA' : 'OK')
    }))
    return detalles.map((d) => ({
      id: d.id, numero: d.numero, tipo: d.tipo, estado: d.estado, paso: d.paso, propietario: d.propietario, contraparte: d.contraparteNombre,
      referencia: d.tipo === 'COMPRA_LOCAL' ? d.ocCodigo : d.tipo === 'DEVOLUCION' ? `${d.docOriginalTipo === 'BOLETA' ? 'Boleta' : 'Factura'} ${d.docOriginalNumero}` : d.guiaNumero ? `Guía ${d.guiaNumero}` : undefined,
      actaNumero: d.actas.find((a) => a.estado !== 'ANULADA')?.numero, unidades: d.lineas.reduce((n, l) => n + l.cantidad, 0),
      productos: new Set(d.lineas.filter((l) => l.cantidad > 0).map((l) => l.productoId)).size, fechaPrevista: d.fechaPrevista, creadoEn: d.creadoEn,
      alertasAbiertas: d.alertas.filter((a) => a.estado === 'ABIERTA').length, conDiferencias: d.conDiferencias, registroCompras: registro.get(d.id),
    }))
  }

  async obtenerSolicitud(id: string): Promise<SolicitudDetalle | null> {
    const c = await cargar()
    const sol = c.solicitudes.find((x) => String(x.id) === id)
    if (!sol) return null
    const desc = new Map(c.productos.map((p) => [String(p.id), String(p.descripcion)]))
    const bloque = sol.estado === 'CERRADA' && sol.tipo === 'COMPRA_LOCAL' ? await conciliacion(id, desc, String(sol.oc_codigo ?? '')) : []
    // La factura es de Compras: se lee de la vista de integración (solo lectura) y no se guarda en el WMS.
    const facturadas = new Map<string, number>()
    if (sol.tipo === 'COMPRA_LOCAL') {
      for (const r of await leerOpcional('v_oc_lineas')) if (String(r.oc_id) === String(sol.oc_id)) facturadas.set(String(r.oc_item_id), Number(r.cantidad_facturada ?? 0))
    }
    return armarDetalle(c, sol, bloque, facturadas)
  }

  async crearSolicitud(entrada: EntradaSolicitud, autorizar: boolean, _actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string }>> {
    const props = await traerTodo('propietarios', 'wms', 'id, es_dueno_almacen')
    const p = props.find((x) => String(x.id) === entrada.propietarioId)
    const v = validarEntradaSolicitud(entrada, p ? { esDuenoAlmacen: Boolean(p.es_dueno_almacen) } : undefined)
    if (!v.ok) return { ok: false, mensaje: Object.values(v.errores)[0] ?? 'Revisa los campos marcados.', errores: v.errores as Record<string, string> }
    const lineas: Record<string, unknown>[] = []
    for (const [idx, x] of entrada.lineas.entries()) {
      const r = validarLineaSolicitud(x, entrada.tipo, parsearVencimiento)
      if (!r.ok) return { ok: false, mensaje: `Línea ${idx + 1}: ${Object.values(r.errores)[0]}`, errores: Object.fromEntries(Object.entries(r.errores).map(([k, m]) => [`${k}-${idx}`, m as string])) }
      lineas.push({ oc_item_id: x.ocItemId ?? null, producto_id: x.productoId ?? null, lote: x.lote.trim(), vence: r.vence, vence_texto: SOLO_MES_ANIO.test(r.venceTexto) ? r.venceTexto : null, cantidad: r.cantidad })
    }
    const { data, error } = await rpc('crear_solicitud', {
      p_tipo: entrada.tipo, p_propietario: entrada.propietarioId,
      p_datos: {
        oc_id: entrada.ocId, contraparte_nombre: entrada.contraparteNombre, contraparte_ruc: entrada.contraparteRuc, guia_numero: entrada.guiaNumero,
        doc_original_tipo: entrada.docOriginalTipo, doc_original_numero: entrada.docOriginalNumero, motivo: entrada.motivo,
        observaciones: entrada.observaciones, fecha_prevista: entrada.fechaPrevista,
      },
      p_lineas: lineas, p_autorizar: autorizar,
    })
    if (error) return mal(error)
    const id = String(data)
    const { data: fila } = await crearClienteServidor().schema('wms').from('solicitudes_ingreso').select('numero').eq('id', id).maybeSingle()
    return { ok: true, id, numero: String((fila as Fila | null)?.numero ?? '') }
  }

  async autorizarSolicitud(id: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('autorizar_solicitud', { p_solicitud: id })
    return error ? mal(error) : ok()
  }

  async ajustarSolicitud(id: string, cambios: CambioEntrada[], motivo: string | undefined, _actor: Actor): Promise<ResultadoAccion<{ version: number }>> {
    const c = cambiosParaBase(cambios)
    if (!c.ok) return c
    const { data, error } = await rpc('ajustar_solicitud', { p_solicitud: id, p_cambios: c.datos, p_motivo: motivo ?? null })
    return error ? mal(error) : { ok: true, version: Number(data) }
  }

  async anularSolicitud(id: string, motivo: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('anular_solicitud', { p_solicitud: id, p_motivo: motivo })
    return error ? mal(error) : ok()
  }

  async iniciarRecepcion(id: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('iniciar_recepcion', { p_solicitud: id })
    return error ? mal(error) : ok()
  }

  async verificarLinea(_solicitudId: string, lineaId: string, d: DatosVerificacion, _actor: Actor): Promise<ResultadoAccion<{ verificadas: number; total: number }>> {
    let vence: string | null = null
    let venceTexto: string | null = null
    if (!d.coincide && d.vence?.trim()) {
      const f = parsearVencimiento(d.vence)
      if (!f) return { ok: false, mensaje: 'No entiendo esa fecha. Usa 30/06/2028 o, si el producto solo dice mes y año, 06/2028.' }
      vence = f.fecha
      venceTexto = SOLO_MES_ANIO.test(f.textoOriginal) ? f.textoOriginal : null
    }
    const { data, error } = await rpc('verificar_linea', {
      p_linea: lineaId, p_coincide: d.coincide, p_cantidad: d.cantidad ?? null, p_lote: d.lote ?? null, p_vence: vence, p_vence_texto: venceTexto,
      p_posicion: d.posicionId ?? null, p_motivo: d.motivo ?? null,
    })
    if (error) return mal(error)
    const r = (data ?? {}) as { verificadas?: number; total?: number }
    return { ok: true, verificadas: Number(r.verificadas ?? 0), total: Number(r.total ?? 0) }
  }

  async editarRecepcion(solicitudId: string, d: DatosEdicionRecepcion, _actor: Actor): Promise<ResultadoAccion> {
    const ingreso = await ingresoDe(solicitudId)
    if (!ingreso) return { ok: false, mensaje: 'Todavía no empezó la recepción de esta solicitud' }
    const datos: Record<string, unknown> = {}
    const map: Record<string, string> = {
      temperaturaC: 'temperatura_c', bultos: 'bultos', paletas: 'paletas', placa: 'placa', marcaVehiculo: 'marca_vehiculo', tipoConteo: 'tipo_conteo',
      horaInicio: 'hora_inicio', horaFin: 'hora_fin', verificaciones: 'verificaciones', observaciones: 'observaciones', facturaNumero: 'factura_numero',
    }
    for (const [k, col] of Object.entries(map)) if (k in d) datos[col] = (d as Record<string, unknown>)[k] === '' ? null : (d as Record<string, unknown>)[k]
    const { error } = await rpc('editar_ingreso', { p_ingreso: ingreso, p_datos: datos })
    return error ? mal(error) : ok()
  }

  async generarActa(solicitudId: string, _actor: Actor): Promise<ResultadoAccion<{ actaId: string }>> {
    const ingreso = await ingresoDe(solicitudId)
    if (!ingreso) return { ok: false, mensaje: 'Empieza la recepción primero' }
    const { data, error } = await rpc('generar_acta_recepcion', { p_ingreso: ingreso })
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

  async confirmarIngreso(solicitudId: string, _actor: Actor): Promise<ResultadoAccion> {
    const ingreso = await ingresoDe(solicitudId)
    if (!ingreso) return { ok: false, mensaje: 'Empieza la recepción primero' }
    const { error } = await rpc('confirmar_ingreso', { p_ingreso: ingreso })
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
    await Promise.all([rpc('revisar_registro_compras', {}), rpc('revisar_por_trasladar', {}), rpc('revisar_vencimientos', {})])
    const [filas, ingresos] = await Promise.all([traerTodo('alertas', 'wms', '*', 'creada_en'), traerTodo('ingresos', 'wms', 'id, solicitud_id')])
    const nombres = await nombresDe(filas.map((r) => s(r.atendida_por)))
    const solDeIngreso = new Map(ingresos.map((i) => [String(i.id), String(i.solicitud_id)]))
    return filas.map((r) => mapearAlerta(r, nombres, solDeIngreso)).reverse()
  }

  async contarAlertasAbiertas(): Promise<{ direccion_tecnica: number; jefe_almacen: number; asistente_dt: number }> {
    const { data } = await crearClienteServidor().schema('wms').from('alertas').select('destinatario_rol').eq('estado', 'ABIERTA')
    const f = (data ?? []) as Fila[]
    const n = (rol: string) => f.filter((a) => a.destinatario_rol === rol).length
    return { direccion_tecnica: n('direccion_tecnica'), jefe_almacen: n('jefe_almacen'), asistente_dt: n('asistente_dt') }
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
    const [exps, docs, falt, ings, actas, lotes, sols] = await Promise.all([
      traerTodo('expedientes', 'wms'), traerTodo('expediente_documentos', 'wms', '*', 'agregado_en'), traerTodo('expediente_faltantes', 'wms', '*', 'creado_en'),
      traerTodo('ingresos', 'wms', 'id, tipo, solicitud_id, expediente_id, confirmado_en'), traerTodo('actas_recepcion', 'wms', 'ingreso_id, numero, estado'),
      traerTodo('ingreso_lotes', 'wms', 'ingreso_id, cantidad'), traerTodo('solicitudes_ingreso', 'wms', 'id, numero'),
    ])
    const x = exps.find((e) => String(e.id) === id)
    if (!x) return null
    return {
      id, clave: String(x.clave), tipo: x.tipo as 'OC' | 'ACTA', estado: x.estado as 'ABIERTO' | 'CERRADO', cerradoEn: s(x.cerrado_en),
      documentos: docs.filter((d) => String(d.expediente_id) === id).map((d) => ({ id: String(d.id), tipo: String(d.tipo), descripcion: String(d.descripcion), agregadoEn: String(d.agregado_en), referenciaTipo: s(d.referencia_tipo), referenciaId: s(d.referencia_id) })),
      faltantes: falt.filter((f) => String(f.expediente_id) === id).map((f) => ({ id: String(f.id), tipo: String(f.tipo), documento: String(f.documento), responsable: String(f.responsable), estado: f.estado as 'ABIERTO' | 'RESUELTO', resueltoEn: s(f.resuelto_en), nota: s(f.nota) })),
      ingresos: ings.filter((i) => String(i.expediente_id) === id).map((i) => ({
        id: String(i.solicitud_id), numero: String(sols.find((q) => String(q.id) === String(i.solicitud_id))?.numero ?? ''), tipo: i.tipo as TipoIngreso,
        actaNumero: s(actas.find((a) => String(a.ingreso_id) === String(i.id) && a.estado === 'FIRMADA')?.numero),
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
    const [sols, actas, orgs] = await Promise.all([
      supabase.schema('wms').from('solicitudes_ingreso').select('id, tipo, numero, oc_codigo, contraparte_nombre').or(`numero.ilike.${like},oc_codigo.ilike.${like}`).limit(8),
      supabase.schema('wms').from('actas_recepcion').select('id, numero, estado, ingreso_id').ilike('numero', like).limit(8),
      supabase.schema('wms').from('actas_organolepticas').select('id, numero').ilike('numero', like).limit(8),
    ])
    const out: ResultadoBusqueda[] = []
    for (const r of (sols.data ?? []) as Fila[]) {
      out.push({ tipo: 'oc', id: String(r.id), titulo: `Solicitud ${r.numero}${r.oc_codigo ? ` · ${r.oc_codigo}` : ''}`, detalle: `${ETIQUETA_TIPO_INGRESO[r.tipo as TipoIngreso]}${r.contraparte_nombre ? ` · ${r.contraparte_nombre}` : ''}`, posiciones: [], unidades: 0, puntaje: 30, href: `/entradas/${r.id}` })
    }
    const ingresoIds = ((actas.data ?? []) as Fila[]).map((r) => String(r.ingreso_id))
    const { data: ingresos } = ingresoIds.length ? await supabase.schema('wms').from('ingresos').select('id, solicitud_id').in('id', ingresoIds) : { data: [] as Fila[] }
    const solDeIngreso = new Map(((ingresos ?? []) as Fila[]).map((i) => [String(i.id), String(i.solicitud_id)]))
    for (const r of (actas.data ?? []) as Fila[]) out.push({ tipo: 'acta', id: String(r.id), titulo: `Acta ${r.numero}${r.estado === 'ANULADA' ? ' (anulada)' : ''}`, detalle: 'Acta de Recepción', posiciones: [], unidades: 0, puntaje: 35, href: `/entradas/${solDeIngreso.get(String(r.ingreso_id)) ?? ''}` })
    for (const r of (orgs.data ?? []) as Fila[]) out.push({ tipo: 'acta', id: String(r.id), titulo: `Acta organoléptica ${r.numero}`, detalle: 'Evaluación organoléptica', posiciones: [], unidades: 0, puntaje: 33, href: `/calidad/${r.id}` })
    return out
  }
}
