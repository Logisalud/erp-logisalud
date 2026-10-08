// Motor de ENTRADAS Y CALIDAD en memoria (modo demostración). Aplica las mismas reglas que
// la migración 0005 —y con los mismos mensajes— sobre datos de prueba. Nada sale de aquí.
//
// Flujo: Solicitud de Ingreso (primaria, sin inventario) → recepción física que la VERIFICA → Acta de Recepción
// prellenada → confirmar (nace el inventario) → Acta Organoléptica. La integración con Compras es MANUAL:
// el WMS muestra la "Cantidad física confirmada" para copiarla; aquí solo se lee lo que Compras tiene registrado.

import { createHash, randomUUID } from 'node:crypto'
import { hashDe } from '@/lib/hash'
import {
  AREA_DESTINO, CHECKLIST_ORGANOLEPTICO, ESTADO_INICIAL, ETIQUETA_DECISION, ETIQUETA_ROL_FIRMA, ETIQUETA_TIPO_INGRESO,
  diasParaVencer, estadoRegistroCompras, faltantesParaEnviar, mensajeTemperatura, muestraOrganoleptica, numeroDeActa,
  pasoDeSolicitud, porTrasladarVencido, puedeAtenderAlerta, puedeFirmarComo, puedeGenerarActa, puedePrepararSolicitud, ROLES_FIRMA,
  situacionLote, temperaturaFueraDeRango, validarDecision, validarEntradaSolicitud, validarLineaSolicitud, validarTransportista,
  type CambioEntrada, type Checklist, type Decision, type DestinatarioAlerta, type EntradaSolicitud, type EstadoRegistroCompras, type TipoAlerta,
} from '@/domain/entradas'
import type {
  ActaRecepcionVista, AlertaVista, BloqueFisico, CambioVista, ColaDT, ContenidoActaRecepcion, DatosEdicionRecepcion,
  DatosOrganolepticaGuardar, DatosVerificacion, ExpedienteVista, FirmaEntrada, LineaSolicitudVista, OcPendiente, OrganolepticaVista,
  PosicionDestino, ResumenExpediente, SolicitudDetalle, SolicitudResumen, VersionSolicitud,
} from '@/domain/entradas-vistas'
import { parsearVencimiento } from '@/domain/fechas'
import { buscarEnTexto } from '@/domain/busqueda'
import type { ResultadoBusqueda } from '@/domain/panorama'
import { puede } from '@/domain/permisos'
import type { Lote, TipoArea } from '@/domain/tipos'
import { estado, registrar, type ActaDemo, type EstadoDemo, type LineaSolicitudDemo, type LoteRecepcionDemo, type SolicitudDemo } from './estado'
import { sumarDias } from './datos'
import type { Actor, ResultadoAccion } from '../repositorio'

const SOLO_MES_ANIO = /^\d{1,2}\/\d{4}$|^\d{4}-\d{2}$/
// Identificadores: durante la siembra son DETERMINISTAS (el mismo dato tiene el mismo id en cada instancia del servidor).
// En Vercel cada petición puede caer en una instancia distinta y cada una arma su propia copia de los datos de prueba;
// con ids aleatorios, un enlace generado por una instancia daba "No encontramos eso" en otra.
let sembrando = false
let contadorSiembra = 0
const nuevoId = () => (sembrando ? `00000000-0000-4000-8000-${String(++contadorSiembra).padStart(12, '0')}` : randomUUID())

/** Las alertas se crean al abrir la pantalla (no en la siembra): su id sale de su clave para ser igual en todas las instancias. */
const idDeClave = (clave: string, n: number) => {
  const h = createHash('sha1').update(`${clave}#${n}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const ahora = () => new Date().toISOString()
const falla = (mensaje: string, errores?: Record<string, string>): { ok: false; mensaje: string; errores?: Record<string, string> } => ({ ok: false, mensaje, errores })
const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
type ConClave = AlertaVista & { clave?: string }

// ── Acceso al estado (y siembra de los datos de prueba, una sola vez) ───────

export function estadoE(): EstadoDemo {
  const e = estado()
  if (!e.sembrado) {
    e.sembrado = true
    sembrando = true
    contadorSiembra = 0
    try { sembrar(e) } finally { sembrando = false }
  }
  return e
}

const sinPermiso = (actor: Actor) => (puede(actor.roles, 'ejecutar') ? null : 'No tienes permiso para registrar entradas.')
const sinPermisoPreparar = (actor: Actor) => (puedePrepararSolicitud(actor.roles) ? null : 'Solo Sandra (Asistente de Dirección Técnica) y Dirección Técnica preparan solicitudes de ingreso.')

function siguienteCorrelativo(e: EstadoDemo, prefijo: 'I' | 'O'): string {
  const d = new Date()
  const clave = `${prefijo}-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  e.correlativos[clave] = (e.correlativos[clave] ?? 0) + 1
  return numeroDeActa(prefijo, d, e.correlativos[clave])
}

/** SI-AAAA-NNNNN: un correlativo por año. El número de una solicitud no cambia nunca (se corrige en el mismo). */
function siguienteNumeroSolicitud(e: EstadoDemo): string {
  const anio = String(new Date().getUTCFullYear())
  const clave = `SI-${anio}`
  e.correlativos[clave] = (e.correlativos[clave] ?? 0) + 1
  return `SI-${anio}-${String(e.correlativos[clave]).padStart(5, '0')}`
}

function alertar(e: EstadoDemo, tipo: TipoAlerta, destinatario: DestinatarioAlerta, mensaje: string, clave: string, solicitudId?: string, productoId?: string, loteCodigo?: string) {
  if (e.alertas.some((a) => a.estado === 'ABIERTA' && (a as ConClave).clave === clave)) return
  e.alertas.unshift(Object.assign({
    id: idDeClave(clave, e.alertas.filter((a) => (a as ConClave).clave === clave).length), tipo, destinatario, mensaje, estado: 'ABIERTA' as const,
    creadaEn: ahora(), solicitudId, productoId, loteCodigo,
  }, { clave }))
}

// ── Lectura ─────────────────────────────────────────────────────────────────

const nombrePropietario = (e: EstadoDemo, id: string) => e.panorama.propietarios.find((p) => p.id === id)?.razonSocial ?? '—'
const producto = (e: EstadoDemo, id: string) => e.panorama.productos.find((p) => p.id === id)
const posicion = (e: EstadoDemo, id?: string) => (id ? e.panorama.posiciones.find((p) => p.id === id) : undefined)

function actaVigente(e: EstadoDemo, solicitudId: string): ActaDemo | undefined {
  return e.actas.find((a) => a.solicitudId === solicitudId && a.estado !== 'ANULADA')
}

function actaVista(e: EstadoDemo, a: ActaDemo): ActaRecepcionVista {
  const hechas = new Set(a.firmas.map((f) => f.rol))
  const previa = a.reemplazaA ? e.actas.find((x) => x.id === a.reemplazaA) : undefined
  const siguiente = e.actas.find((x) => x.reemplazaA === a.id)
  return { ...a, faltan: ROLES_FIRMA.filter((r) => !hechas.has(r)), reemplazaANumero: previa?.numero, reemplazadaPorNumero: siguiente?.numero }
}

const lotePorLinea = (s: SolicitudDemo, lineaId: string) => s.recepcion?.lotes.find((x) => x.lineaId === lineaId)

function lineaVista(e: EstadoDemo, s: SolicitudDemo, l: LineaSolicitudDemo): LineaSolicitudVista {
  const p = producto(e, l.productoId)
  const lote = lotePorLinea(s, l.id)
  return {
    id: l.id, ocItemId: l.ocItemId, productoId: l.productoId, codigo: p?.codigo ?? '', descripcion: p?.descripcion ?? '—',
    registroSanitario: p?.reg?.registroSanitario, rsVence: p?.reg?.rsVence, lote: l.lote, vence: l.vence, venceTexto: l.venceTexto,
    ocPedida: l.ocPedida, ocSaldo: l.ocSaldo, ocFacturada: e.compras.find((c) => c.ocId === s.ocId)?.items.find((i) => i.ocItemId === l.ocItemId)?.facturada, comprasRecibidaAntes: l.comprasRecibidaAntes, inicial: l.inicial, cantidad: l.cantidad,
    estadoLinea: l.estadoLinea, verificacion: lote?.verificacion ?? null, posicionId: lote?.posicionId, posicionCodigo: posicion(e, lote?.posicionId)?.codigo,
    fisica: s.recepcion?.confirmado && lote ? l.cantidad : undefined,
  }
}

const hayDiferencias = (s: SolicitudDemo) => s.lineas.some((l) => l.estadoLinea !== 'ESPERADA' || (l.inicial != null && l.inicial !== l.cantidad))
const unidades = (s: SolicitudDemo) => s.lineas.reduce((n, l) => n + l.cantidad, 0)

/** Lo que Compras debería mostrar como recibido (lo de antes + lo físico de las solicitudes cerradas) frente a lo que muestra hoy. */
function conciliacion(e: EstadoDemo, s: SolicitudDemo) {
  if (s.estado !== 'CERRADA' || !s.ocId) return []
  const oc = e.compras.find((c) => c.ocId === s.ocId)
  const out: BloqueFisico[] = []
  const items = [...new Set(s.lineas.filter((l) => l.ocItemId && l.cantidad > 0).map((l) => l.ocItemId!))]
  for (const ocItemId of items) {
    const it = oc?.items.find((x) => x.ocItemId === ocItemId)
    if (!it) continue
    const cerradas = e.solicitudes.filter((x) => x.estado === 'CERRADA' && x.ocId === s.ocId)
    const lineas = cerradas.flatMap((x) => x.lineas.filter((l) => l.ocItemId === ocItemId && l.cantidad > 0))
    const fisicaTotal = lineas.reduce((n, l) => n + l.cantidad, 0)
    const base = Math.min(...lineas.map((l) => l.comprasRecibidaAntes ?? 0))
    const fisica = s.lineas.filter((l) => l.ocItemId === ocItemId).reduce((n, l) => n + l.cantidad, 0)
    out.push({
      ocItemId, productoId: it.productoId, descripcion: producto(e, it.productoId)?.descripcion ?? '', ocCodigo: s.ocCodigo ?? '',
      fisica, base, esperado: base + fisicaTotal, registrado: it.recibida, estado: estadoRegistroCompras(base, fisicaTotal, it.recibida),
    })
  }
  return out
}

function detalle(e: EstadoDemo, s: SolicitudDemo): SolicitudDetalle {
  const acta = actaVigente(e, s.id)
  const lineas = s.lineas.map((l) => lineaVista(e, s, l))
  const ult = s.versiones[s.versiones.length - 1]
  const r = s.recepcion
  const pendientes = r ? r.lotes.filter((x) => x.verificacion === 'PENDIENTE').length : 0
  return {
    id: s.id, numero: s.numero, tipo: s.tipo, estado: s.estado, version: ult?.version ?? 1, propietarioId: s.propietarioId,
    propietario: nombrePropietario(e, s.propietarioId), ocId: s.ocId, ocCodigo: s.ocCodigo, contraparteNombre: s.contraparteNombre,
    contraparteRuc: s.contraparteRuc, guiaNumero: s.guiaNumero, docOriginalTipo: s.docOriginalTipo, docOriginalNumero: s.docOriginalNumero,
    motivo: s.motivo, observaciones: s.observaciones, fechaPrevista: s.fechaPrevista, origenCreacion: s.origenCreacion, creadoEn: s.creadoEn,
    creadoPor: s.creadoPor, autorizadoPor: s.autorizadoPor, autorizadoEn: s.autorizadoEn, cerradaEn: s.cerradaEn, lineas,
    paso: pasoDeSolicitud({ estado: s.estado, lineasPendientes: pendientes, acta: acta ? { estado: acta.estado, firmas: acta.firmas.length } : undefined }),
    recepcion: r ? {
      id: r.id, confirmado: r.confirmado, confirmadoEn: r.confirmadoEn, facturaNumero: r.facturaNumero, temperaturaC: r.temperaturaC,
      alertaTemperatura: temperaturaFueraDeRango(r.temperaturaC), bultos: r.bultos, paletas: r.paletas, placa: r.placa, marcaVehiculo: r.marcaVehiculo,
      tipoConteo: r.tipoConteo, horaInicio: r.horaInicio, horaFin: r.horaFin, verificaciones: r.verificaciones, observaciones: r.observaciones,
    } : undefined,
    cambios: [...s.cambios].reverse(), versiones: [...s.versiones].reverse(),
    actas: e.actas.filter((a) => a.solicitudId === s.id).map((a) => actaVista(e, a)).reverse(),
    organolepticas: e.organolepticas.filter((o) => o.solicitudId === s.id),
    alertas: e.alertas.filter((a) => a.solicitudId === s.id).map(limpiarClave),
    expedienteId: s.expedienteId, bloqueadoPorFirmas: !!acta && acta.firmas.length > 0, conDiferencias: hayDiferencias(s),
    cantidadFisica: conciliacion(e, s), estadoInicial: ESTADO_INICIAL[s.tipo],
  }
}

const limpiarClave = (a: AlertaVista): AlertaVista => { const { clave: _c, ...resto } = a as ConClave; void _c; return resto }

function referenciaDe(s: SolicitudDemo) {
  return s.tipo === 'COMPRA_LOCAL' ? s.ocCodigo : s.tipo === 'DEVOLUCION'
    ? `${s.docOriginalTipo === 'BOLETA' ? 'Boleta' : 'Factura'} ${s.docOriginalNumero}` : s.guiaNumero ? `Guía ${s.guiaNumero}` : undefined
}

const peorRegistro = (estados: EstadoRegistroCompras[]): EstadoRegistroCompras | undefined =>
  estados.length === 0 ? undefined : estados.includes('NO_COINCIDE') ? 'NO_COINCIDE' : estados.includes('FALTA') ? 'FALTA' : 'OK'

function resumen(e: EstadoDemo, s: SolicitudDemo): SolicitudResumen {
  const d = detalle(e, s)
  return {
    id: s.id, numero: s.numero, tipo: s.tipo, estado: s.estado, paso: d.paso, propietario: d.propietario, contraparte: s.contraparteNombre,
    referencia: referenciaDe(s), actaNumero: actaVigente(e, s.id)?.numero, unidades: unidades(s), productos: new Set(s.lineas.filter((l) => l.cantidad > 0).map((l) => l.productoId)).size,
    fechaPrevista: s.fechaPrevista, creadoEn: s.creadoEn, alertasAbiertas: d.alertas.filter((a) => a.estado === 'ABIERTA').length, conDiferencias: d.conDiferencias,
    registroCompras: peorRegistro(d.cantidadFisica.map((b) => b.estado)),
  }
}

// ── Núcleo ──────────────────────────────────────────────────────────────────

function asegurarLote(e: EstadoDemo, productoId: string, codigo: string, vence: string, propietarioId: string): Lote | { error: string } {
  const ya = e.panorama.lotes.find((l) => l.productoId === productoId && l.codigo === codigo && l.propietarioId === propietarioId)
  if (ya) {
    if (ya.vence !== vence) {
      return { error: `El lote ${codigo} ya existe con otro vencimiento (${ya.vence ?? 'sin fecha'}) y aquí se declaró ${vence}. Ajusta el dato de la solicitud con su motivo; si el vencimiento registrado antes era el equivocado, Dirección Técnica lo corrige.` }
    }
    return ya
  }
  const l: Lote = { id: `lote:${e.panorama.lotes.length + 1}`, productoId, codigo, vence, propietarioId }
  e.panorama.lotes.push(l)
  return l
}

function foto(l: LineaSolicitudDemo) { return { cantidad: l.cantidad, lote: l.lote, vence: l.vence } }

/** Las filas de la recepción siguen a las líneas de la solicitud; un cambio las devuelve a "por verificar". */
function sincronizarRecepcion(s: SolicitudDemo) {
  const r = s.recepcion
  if (!r || r.confirmado) return
  r.lotes = r.lotes.filter((x) => s.lineas.some((l) => l.id === x.lineaId && l.cantidad > 0))
  for (const l of s.lineas) {
    if (l.cantidad === 0) continue
    const x = r.lotes.find((y) => y.lineaId === l.id)
    if (!x) { r.lotes.push({ id: nuevoId(), lineaId: l.id, verificacion: 'PENDIENTE', foto: foto(l) }); continue }
    const f = foto(l)
    if (f.cantidad !== x.foto.cantidad || f.lote !== x.foto.lote || f.vence !== x.foto.vence) x.verificacion = 'PENDIENTE'
    x.foto = f
  }
}

function snapshot(e: EstadoDemo, s: SolicitudDemo): Record<string, unknown> {
  return {
    numero: s.numero, tipo: s.tipo, propietario: nombrePropietario(e, s.propietarioId), contraparteNombre: s.contraparteNombre, contraparteRuc: s.contraparteRuc,
    ocCodigo: s.ocCodigo, guiaNumero: s.guiaNumero, docOriginalNumero: s.docOriginalNumero, motivo: s.motivo, observaciones: s.observaciones,
    lineas: s.lineas.map((l) => ({ producto: producto(e, l.productoId)?.descripcion, rs: producto(e, l.productoId)?.reg?.registroSanitario, lote: l.lote, vence: l.vence, inicial: l.inicial, cantidad: l.cantidad })),
  }
}

function nuevaVersion(e: EstadoDemo, s: SolicitudDemo, motivo: string | undefined, actor: Actor): number {
  const version = (s.versiones[s.versiones.length - 1]?.version ?? 0) + 1
  const v: VersionSolicitud = { version, motivo: motivo?.trim() || undefined, editadoPor: actor.nombre, editadoEn: ahora(), datos: snapshot(e, s) }
  s.versiones.push(v)
  return version
}

/** D-33: llega (o se autoriza) más que el saldo de la OC → se registra lo físico y se alerta; NO se resuelve solo. */
function alertarExcesoOc(e: EstadoDemo, s: SolicitudDemo) {
  if (s.tipo !== 'COMPRA_LOCAL') return
  const por = new Map<string, { pide: number; saldo: number; productoId: string }>()
  for (const l of s.lineas) {
    if (!l.ocItemId) continue
    const g = por.get(l.ocItemId) ?? { pide: 0, saldo: l.ocSaldo ?? 0, productoId: l.productoId }
    g.pide += l.cantidad
    g.saldo = Math.max(g.saldo, l.ocSaldo ?? 0)
    por.set(l.ocItemId, g)
  }
  for (const [ocItemId, g] of por) {
    if (g.pide <= g.saldo) continue
    alertar(e, 'EXCEDE_OC', 'direccion_tecnica',
      `La solicitud ${s.numero} declara ${g.pide} unidades de ${producto(e, g.productoId)?.descripcion} y el saldo de la orden ${s.ocCodigo} es ${g.saldo}: sobran ${g.pide - g.saldo}. El WMS aceptará lo que llegue físicamente, pero no lo resuelve: decídelo con Compras.`,
      `excede:${s.id}:${ocItemId}`, s.id, g.productoId)
  }
}

/** Núcleo de los cambios: una lista de operaciones, cada una con su registro campo a campo. Devuelve el número de versión. */
function aplicarCambios(e: EstadoDemo, s: SolicitudDemo, ops: CambioEntrada[], motivo: string | undefined, actor: Actor): ResultadoAccion<{ version: number }> {
  const post = s.estado !== 'BORRADOR' && s.estado !== 'ENVIADA'
  const version = (s.versiones[s.versiones.length - 1]?.version ?? 0) + 1
  const registrarCambio = (linea: LineaSolicitudDemo | undefined, campo: string, antes: string | undefined, despues: string | undefined) => {
    const p = linea ? producto(e, linea.productoId) : undefined
    s.cambios.push({
      id: nuevoId(), lineaId: linea?.id, version, campo, antes, despues, motivo: motivo?.trim() || undefined, usuario: actor.nombre, ts: ahora(),
      etiqueta: linea && p ? `${p.descripcion} · lote ${linea.lote}` : undefined,
    })
  }
  let hubo = false
  for (const op of ops) {
    if (op.op === 'LINEA') {
      const l = s.lineas.find((x) => x.id === op.lineaId)
      if (!l) return falla('La línea no pertenece a esta solicitud')
      if (op.campo === 'cantidad') {
        if (!/^\d+$/.test(op.valor.trim())) return falla('La cantidad es un entero (cero si ya no llega)')
        const nueva = Number(op.valor)
        if (nueva !== l.cantidad) {
          registrarCambio(l, 'cantidad', String(l.cantidad), String(nueva))
          l.cantidad = nueva
          if (post) l.estadoLinea = nueva === 0 ? 'RETIRADA' : 'AJUSTADA'
          hubo = true
        }
      } else if (op.campo === 'lote') {
        const nuevo = op.valor.trim()
        if (!nuevo) return falla('El lote no puede quedar vacío')
        if (nuevo !== l.lote) { registrarCambio(l, 'lote', l.lote, nuevo); l.lote = nuevo; if (post) l.estadoLinea = 'AJUSTADA'; hubo = true }
      } else if (op.campo === 'vence') {
        const f = parsearVencimiento(op.valor)
        if (!f) return falla('No entiendo esa fecha. Usa 30/06/2028 o, si el producto solo dice mes y año, 06/2028.')
        if (f.fecha !== l.vence) {
          registrarCambio(l, 'vence', l.vence, f.fecha)
          l.vence = f.fecha
          l.venceTexto = SOLO_MES_ANIO.test(f.textoOriginal) ? f.textoOriginal : undefined
          if (post) l.estadoLinea = 'AJUSTADA'
          hubo = true
        }
      } else return falla('Campo de la línea no editable')
    } else if (op.op === 'AGREGAR_LINEA') {
      const f = parsearVencimiento(op.vence)
      if (!f) return falla('No entiendo esa fecha de vencimiento')
      if (!op.lote?.trim()) return falla('Cada línea necesita su lote')
      let prodId = op.productoId
      let oc: { ocPedida?: number; ocSaldo?: number; antes?: number } = {}
      if (s.tipo === 'COMPRA_LOCAL') {
        const co = e.compras.find((c) => c.ocId === s.ocId)
        const it = co?.items.find((x) => x.ocItemId === op.ocItemId)
        if (!it) return falla('Una línea no pertenece a esa orden de compra')
        prodId = it.productoId
        oc = { ocPedida: it.pedida, ocSaldo: it.pedida - it.recibida, antes: it.recibida }
      }
      if (!prodId) return falla('Cada línea necesita su producto')
      const nueva: LineaSolicitudDemo = {
        id: nuevoId(), ocItemId: op.ocItemId, productoId: prodId, lote: op.lote.trim(), vence: f.fecha,
        venceTexto: SOLO_MES_ANIO.test(f.textoOriginal) ? f.textoOriginal : undefined, ocPedida: oc.ocPedida, ocSaldo: oc.ocSaldo,
        comprasRecibidaAntes: oc.antes, inicial: post ? 0 : undefined, cantidad: op.cantidad, estadoLinea: post ? 'AJUSTADA' : 'ESPERADA',
      }
      s.lineas.push(nueva)
      s.cambios.push({ id: nuevoId(), lineaId: nueva.id, version, campo: 'línea agregada', despues: `lote ${nueva.lote} · ${nueva.cantidad}`, motivo: motivo?.trim() || undefined, usuario: actor.nombre, ts: ahora(), etiqueta: producto(e, prodId)?.descripcion })
      hubo = true
    } else if (op.op === 'ENCABEZADO') {
      const campos: Record<string, keyof SolicitudDemo> = {
        guia_numero: 'guiaNumero', contraparte_nombre: 'contraparteNombre', contraparte_ruc: 'contraparteRuc', motivo: 'motivo',
        observaciones: 'observaciones', fecha_prevista: 'fechaPrevista', doc_original_tipo: 'docOriginalTipo', doc_original_numero: 'docOriginalNumero',
      }
      const k = campos[op.campo]
      if (!k) return falla(`Campo de la solicitud no editable: ${op.campo}`)
      const nuevo = op.valor.trim() || undefined
      const antes = s[k] as string | undefined
      if (nuevo !== antes) {
        ;(s as unknown as Record<string, unknown>)[k] = nuevo
        registrarCambio(undefined, op.campo, antes, nuevo)
        hubo = true
      }
    }
  }
  if (!hubo) return falla('No hay nada que cambiar')
  const v = nuevaVersion(e, s, motivo, actor)
  if (post) {
    // D-34: toda diferencia entre lo anunciado y lo final avisa a Sandra y a Katia.
    const resumenCambios = s.cambios.filter((c) => c.version === version).map((c) =>
      c.campo === 'línea agregada' ? `línea agregada (${c.despues})` : `${c.etiqueta ? `${c.etiqueta}: ` : ''}${c.campo} ${c.antes ?? '—'} → ${c.despues ?? '—'}`).join('; ')
    const m = `La solicitud ${s.numero} cambió: ${resumenCambios}. Motivo: ${motivo?.trim() || 'sin motivo'}.`
    alertar(e, 'SOLICITUD_AJUSTADA', 'asistente_dt', m, `ajuste:${s.id}:${v}:asistente_dt`, s.id)
    alertar(e, 'SOLICITUD_AJUSTADA', 'direccion_tecnica', m, `ajuste:${s.id}:${v}:direccion_tecnica`, s.id)
  }
  alertarExcesoOc(e, s)
  registrar(e, actor, 'solicitud_ajustada', 'solicitudes_ingreso', s.numero, `Versión ${v}`, motivo)
  return { ok: true, version: v }
}

function generarExpedienteDemo(e: EstadoDemo, s: SolicitudDemo, acta: ActaDemo) {
  const clave = s.ocCodigo ?? acta.numero
  let exp = e.expedientes.find((x) => x.clave === clave)
  if (!exp) {
    exp = { id: nuevoId(), clave, tipo: s.ocCodigo ? 'OC' : 'ACTA', estado: 'ABIERTO', documentos: [], faltantes: [] }
    e.expedientes.push(exp)
  }
  exp.estado = 'ABIERTO'
  exp.cerradoEn = undefined
  s.expedienteId = exp.id
  const doc = (tipo: string, descripcion: string, ref: string) => {
    if (exp!.documentos.some((d) => d.referenciaId === ref)) return
    exp!.documentos.push({ id: nuevoId(), tipo, descripcion, agregadoEn: ahora(), referenciaTipo: tipo.toLowerCase(), referenciaId: ref })
    for (const f of exp!.faltantes) if (f.estado === 'ABIERTO' && f.tipo === tipo) { f.estado = 'RESUELTO'; f.resueltoEn = ahora(); f.nota = 'Documento enlazado' }
  }
  const falta = (tipo: string, documento: string, responsable: string) => exp!.faltantes.push({ id: nuevoId(), tipo, documento, responsable, estado: 'ABIERTO' })
  doc('ACTA_RECEPCION', `Acta de Recepción ${acta.numero}`, acta.id)
  doc('SOLICITUD_INGRESO', `Solicitud de Ingreso ${s.numero} (LS-FR.05.05)`, s.id)
  if (s.guiaNumero?.trim()) doc('GUIA_REMISION', `Guía ${s.guiaNumero}`, `${s.id}:${s.guiaNumero}`)
  else falta('GUIA_REMISION', `Guía de remisión (${acta.numero})`, 'Jefe de Almacén')
  if (s.tipo === 'COMPRA_LOCAL') {
    const f = s.recepcion?.facturaNumero
    if (f?.trim()) doc('FACTURA', `Factura ${f}`, `${s.id}:${f}`)
    else falta('FACTURA', `Factura del proveedor (${acta.numero})`, 'Contabilidad')
  } else if (s.tipo === 'DEVOLUCION') {
    doc('FACTURA_BOLETA_ORIGINAL', `${s.docOriginalTipo === 'BOLETA' ? 'Boleta' : 'Factura'} original ${s.docOriginalNumero}`, `${s.id}:${s.docOriginalNumero}`)
    falta('FORMULARIO_DEVOLUCION', `Formulario de devolución del transportista (${acta.numero})`, 'Jefe de Almacén')
  }
}

function revisarRS(e: EstadoDemo, s: SolicitudDemo) {
  for (const l of s.lineas) {
    const p = producto(e, l.productoId)
    if (p?.reg?.rsVence && p.reg.rsVence < e.panorama.hoy) {
      alertar(e, 'RS_VENCIDO', 'direccion_tecnica',
        `El registro sanitario de ${p.descripcion} venció el ${p.reg.rsVence.split('-').reverse().join('/')}. Su lote no se puede aprobar hasta que lo resuelvas.`,
        `rs:${p.id}`, s.id, p.id)
    }
  }
}

function contenidoActa(e: EstadoDemo, s: SolicitudDemo, numero: string): ContenidoActaRecepcion {
  const r = s.recepcion!
  const porProducto = new Map<string, LineaSolicitudDemo[]>()
  for (const l of s.lineas) if (l.cantidad > 0 && r.lotes.some((x) => x.lineaId === l.id)) porProducto.set(l.productoId, [...(porProducto.get(l.productoId) ?? []), l])
  return {
    numero,
    solicitud: { numero: s.numero, version: s.versiones[s.versiones.length - 1]?.version ?? 1 },
    ingreso: {
      tipo: s.tipo, propietario: nombrePropietario(e, s.propietarioId), contraparteNombre: s.contraparteNombre, contraparteRuc: s.contraparteRuc,
      ocCodigo: s.ocCodigo, guiaNumero: s.guiaNumero, facturaNumero: r.facturaNumero, docOriginalTipo: s.docOriginalTipo,
      docOriginalNumero: s.docOriginalNumero, motivo: s.motivo, temperaturaC: r.temperaturaC, bultos: r.bultos, paletas: r.paletas,
      placa: r.placa, marcaVehiculo: r.marcaVehiculo, tipoConteo: r.tipoConteo, horaInicio: r.horaInicio, horaFin: r.horaFin,
      observaciones: r.observaciones, verificaciones: r.verificaciones,
    },
    lineas: [...porProducto.entries()].map(([productoId, ls]) => {
      const p = producto(e, productoId)
      const total = ls.reduce((n, l) => n + l.cantidad, 0)
      return {
        codigo: p?.codigo ?? '', descripcion: p?.descripcion ?? '', registroSanitario: p?.reg?.registroSanitario,
        cantidadEstablecida: total, cantidadRecibida: total,
        lotes: ls.map((l) => ({
          lote: l.lote, vence: l.vence, venceTexto: l.venceTexto, cantidad: l.cantidad, cantidadInicial: l.inicial,
          posicion: posicion(e, lotePorLinea(s, l.id)?.posicionId)?.codigo ?? '',
        })),
      }
    }).sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es')),
  }
}

function problemaParaActa(e: EstadoDemo, s: SolicitudDemo): string | null {
  const r = s.recepcion
  if (!r) return 'Empieza la recepción primero'
  const m = puedeGenerarActa({
    tipo: s.tipo, tieneDocOriginal: !!s.docOriginalTipo && !!s.docOriginalNumero?.trim(), tieneTemperatura: r.temperaturaC != null,
    lineas: s.lineas.filter((l) => l.cantidad > 0).sort((a, b) => (producto(e, a.productoId)?.descripcion ?? '').localeCompare(producto(e, b.productoId)?.descripcion ?? '', 'es') || a.lote.localeCompare(b.lote)).map((l) => {
      const x = lotePorLinea(s, l.id)
      return { descripcion: producto(e, l.productoId)?.descripcion ?? '', lote: l.lote, verificacion: x?.verificacion ?? null, tienePosicion: !!x?.posicionId }
    }),
  })
  return m ? m.replace(/\.$/, '') : null
}

function organolepticaDe(e: EstadoDemo, s: SolicitudDemo, l: LineaSolicitudDemo, lote: LoteRecepcionDemo, numero: string): OrganolepticaVista {
  const p = producto(e, l.productoId)!
  return {
    id: nuevoId(), numero, estado: 'BORRADOR', solicitudId: s.id, solicitudNumero: s.numero, ingresoTipo: s.tipo, ingresoLoteId: lote.id, productoId: p.id,
    productoCodigo: p.codigo, producto: p.descripcion, principioActivo: p.principioActivo, registroSanitario: p.reg?.registroSanitario,
    rsVence: p.reg?.rsVence, fabricante: p.reg?.fabricante, formaPresentacion: p.reg?.formaPresentacion ?? p.presentacion,
    lote: l.lote, vence: l.vence, propietario: nombrePropietario(e, s.propietarioId), cantidadLote: l.cantidad,
    cantidadMuestra: muestraOrganoleptica(l.cantidad), referencia: s.ocCodigo ?? s.guiaNumero ?? s.docOriginalNumero,
    datos: { certAnalisis: null, checklist: {}, destinoSugerido: null, conclusion: null }, creadaEn: ahora(),
  }
}

// ── Clase pública ───────────────────────────────────────────────────────────

export class MotorEntradas {
  ocsPendientes(): OcPendiente[] {
    const e = estadoE()
    return e.compras.map((c) => ({
      ocId: c.ocId, codigo: c.codigo, proveedorNombre: c.proveedorNombre, proveedorRuc: c.proveedorRuc, estado: c.estado,
      items: c.items.map((i) => ({
        ocItemId: i.ocItemId, productoId: i.productoId, codigo: producto(e, i.productoId)?.codigo ?? '', descripcion: producto(e, i.productoId)?.descripcion ?? '',
        pedida: i.pedida, recibida: i.recibida, saldo: i.pedida - i.recibida, facturada: i.facturada,
      })),
    })).filter((c) => c.items.some((i) => i.saldo > 0))
  }

  posicionesDestino(tipo: import('@/domain/entradas').TipoIngreso): PosicionDestino[] {
    const e = estadoE()
    const area: TipoArea = AREA_DESTINO[tipo]
    return e.panorama.posiciones.filter((p) => p.tipoArea === area).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
      .map((p) => ({
        id: p.id, codigo: p.codigo, area: area === 'DEVOLUCIONES' ? 'Devoluciones' : 'Cuarentena',
        ocupadas: e.panorama.saldos.filter((s) => s.posicionId === p.id).reduce((n, s) => n + s.cantidad, 0),
      }))
  }

  listarSolicitudes(): SolicitudResumen[] {
    const e = estadoE()
    return [...e.solicitudes].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn) || b.numero.localeCompare(a.numero)).map((s) => resumen(e, s))
  }

  obtenerSolicitud(id: string): SolicitudDetalle | null {
    const e = estadoE()
    const s = e.solicitudes.find((x) => x.id === id)
    return s ? structuredClone(detalle(e, s)) : null
  }

  crearSolicitud(entrada: EntradaSolicitud, autorizar: boolean, actor: Actor): ResultadoAccion<{ id: string; numero: string }> {
    const e = estadoE()
    const perm = sinPermisoPreparar(actor)
    if (perm) return falla(perm)
    const prop = e.panorama.propietarios.find((p) => p.id === entrada.propietarioId)
    const v = validarEntradaSolicitud(entrada, prop)
    if (!v.ok) return falla(Object.values(v.errores)[0] ?? 'Revisa los campos marcados.', v.errores as Record<string, string>)

    const oc = entrada.tipo === 'COMPRA_LOCAL' ? e.compras.find((c) => c.ocId === entrada.ocId) : undefined
    if (entrada.tipo === 'COMPRA_LOCAL' && !oc) return falla('La orden de compra no existe')
    const lineas: LineaSolicitudDemo[] = []
    const vistos = new Set<string>()
    for (const [idx, x] of entrada.lineas.entries()) {
      const r = validarLineaSolicitud(x, entrada.tipo, parsearVencimiento)
      if (!r.ok) return falla(`Línea ${idx + 1}: ${Object.values(r.errores)[0]}`, Object.fromEntries(Object.entries(r.errores).map(([k, m]) => [`${k}-${idx}`, m as string])))
      const it = oc?.items.find((i) => i.ocItemId === x.ocItemId)
      if (entrada.tipo === 'COMPRA_LOCAL' && !it) return falla('Una línea no pertenece a esa orden de compra')
      const productoId = it?.productoId ?? x.productoId!
      const clave = `${productoId}|${x.lote.trim()}`
      if (vistos.has(clave)) return falla(`El lote ${x.lote.trim()} está repetido en este producto: junta sus cantidades.`)
      vistos.add(clave)
      lineas.push({
        id: nuevoId(), ocItemId: it?.ocItemId, productoId, lote: x.lote.trim(), vence: r.vence,
        venceTexto: SOLO_MES_ANIO.test(r.venceTexto) ? r.venceTexto : undefined, cantidad: r.cantidad, estadoLinea: 'ESPERADA',
        ocPedida: it?.pedida, ocSaldo: it ? it.pedida - it.recibida : undefined, comprasRecibidaAntes: it?.recibida,
      })
    }
    const s: SolicitudDemo = {
      id: nuevoId(), numero: siguienteNumeroSolicitud(e), tipo: entrada.tipo, estado: 'BORRADOR', propietarioId: entrada.propietarioId,
      ocId: oc?.ocId, ocCodigo: oc?.codigo, contraparteNombre: entrada.contraparteNombre?.trim() || oc?.proveedorNombre,
      contraparteRuc: entrada.contraparteRuc?.trim() || oc?.proveedorRuc, guiaNumero: entrada.guiaNumero?.trim() || undefined,
      docOriginalTipo: entrada.docOriginalTipo, docOriginalNumero: entrada.docOriginalNumero?.trim() || undefined, motivo: entrada.motivo?.trim() || undefined,
      observaciones: entrada.observaciones?.trim() || undefined, fechaPrevista: entrada.fechaPrevista || undefined, origenCreacion: 'INTERNO',
      creadoEn: ahora(), creadoPor: actor.nombre, lineas, versiones: [], cambios: [],
    }
    e.solicitudes.push(s)
    revisarRS(e, s)
    alertarExcesoOc(e, s)
    nuevaVersion(e, s, 'Creada', actor)
    registrar(e, actor, 'solicitud_creada', 'solicitudes_ingreso', s.numero, `${ETIQUETA_TIPO_INGRESO[s.tipo]} para ${nombrePropietario(e, s.propietarioId)}`)
    if (autorizar) this.autorizarSolicitud(s.id, actor)
    return { ok: true, id: s.id, numero: s.numero }
  }

  autorizarSolicitud(id: string, actor: Actor): ResultadoAccion {
    const e = estadoE()
    const perm = sinPermisoPreparar(actor)
    if (perm) return falla(perm)
    const s = e.solicitudes.find((x) => x.id === id)
    if (!s) return falla('Solicitud inexistente')
    if (s.estado !== 'BORRADOR' && s.estado !== 'ENVIADA') return falla(`La solicitud ${s.numero} ya está ${s.estado === 'PROGRAMADA' ? 'programada' : s.estado.toLowerCase()}`)
    // Desde aquí lo anunciado queda fijo: la cantidad inicial no se reescribe.
    for (const l of s.lineas) l.inicial = l.cantidad
    s.estado = 'PROGRAMADA'
    s.autorizadoPor = actor.nombre
    s.autorizadoEn = ahora()
    nuevaVersion(e, s, 'Autorizada: queda programada', actor)
    registrar(e, actor, 'solicitud_autorizada', 'solicitudes_ingreso', s.numero, 'Solicitud autorizada: queda por llegar')
    return { ok: true }
  }

  ajustarSolicitud(id: string, cambios: CambioEntrada[], motivo: string | undefined, actor: Actor): ResultadoAccion<{ version: number }> {
    const e = estadoE()
    const s = e.solicitudes.find((x) => x.id === id)
    if (!s) return falla('Solicitud inexistente')
    if (s.estado === 'CERRADA' || s.estado === 'ANULADA') return falla(`La solicitud ${s.numero} ya está ${s.estado === 'CERRADA' ? 'cerrada' : 'anulada'}: no se edita`)
    if (actaVigente(e, id)?.firmas.length) return falla('El acta ya tiene firmas: para corregir algo, anúlala con motivo y emite otra')
    if (s.estado === 'BORRADOR' || s.estado === 'ENVIADA') {
      const perm = sinPermisoPreparar(actor)
      if (perm) return falla(perm)
    } else {
      if (!(puede(actor.roles, 'ejecutar') || puedePrepararSolicitud(actor.roles))) return falla('No tienes permiso para ajustar esta solicitud')
      if (!motivo?.trim()) return falla('Todo cambio de una solicitud autorizada necesita su motivo')
    }
    const r = aplicarCambios(e, s, cambios, motivo, actor)
    if (r.ok) sincronizarRecepcion(s)
    return r
  }

  anularSolicitud(id: string, motivo: string, actor: Actor): ResultadoAccion {
    const e = estadoE()
    const perm = sinPermisoPreparar(actor)
    if (perm) return falla(perm)
    if (!motivo.trim()) return falla('La anulación necesita un motivo')
    const s = e.solicitudes.find((x) => x.id === id)
    if (!s) return falla('Solicitud inexistente')
    if (s.estado === 'CERRADA' || s.estado === 'ANULADA') return falla(`La solicitud ${s.numero} ya está ${s.estado === 'CERRADA' ? 'cerrada' : 'anulada'}`)
    if (e.actas.some((a) => a.solicitudId === id && a.estado === 'FIRMADA')) return falla('Hay un acta firmada: anúlala primero')
    s.estado = 'ANULADA'
    nuevaVersion(e, s, `Anulada: ${motivo.trim()}`, actor)
    registrar(e, actor, 'solicitud_anulada', 'solicitudes_ingreso', s.numero, 'Solicitud anulada', motivo)
    return { ok: true }
  }

  iniciarRecepcion(id: string, actor: Actor): ResultadoAccion {
    const e = estadoE()
    const perm = sinPermiso(actor)
    if (perm) return falla(perm)
    const s = e.solicitudes.find((x) => x.id === id)
    if (!s) return falla('Solicitud inexistente')
    if (s.estado === 'EN_RECEPCION') return { ok: true }
    if (s.estado !== 'PROGRAMADA') return falla(`La solicitud ${s.numero} está ${s.estado === 'CERRADA' ? 'cerrada' : s.estado.toLowerCase()}: solo una solicitud programada ("por llegar") se empieza a recibir`)
    s.recepcion = { id: nuevoId(), confirmado: false, horaInicio: ahora(), verificaciones: {}, lotes: [] }
    s.estado = 'EN_RECEPCION'
    sincronizarRecepcion(s)
    registrar(e, actor, 'recepcion_iniciada', 'ingresos', s.numero, 'Recepción física iniciada')
    return { ok: true }
  }

  verificarLinea(solicitudId: string, lineaId: string, d: DatosVerificacion, actor: Actor): ResultadoAccion<{ verificadas: number; total: number }> {
    const e = estadoE()
    const perm = sinPermiso(actor)
    if (perm) return falla(perm)
    const s = e.solicitudes.find((x) => x.id === solicitudId)
    const l = s?.lineas.find((x) => x.id === lineaId)
    if (!s || !l) return falla('Línea inexistente')
    if (s.estado !== 'EN_RECEPCION' || !s.recepcion) return falla(`La solicitud ${s.numero} no está en recepción: empieza la recepción primero`)
    if (actaVigente(e, solicitudId)?.firmas.length) return falla('El acta ya tiene firmas: para corregir algo, anúlala con motivo y emite otra')

    if (!d.coincide) {
      if (!d.motivo?.trim()) return falla('Cuenta qué encontraste: el cambio de la solicitud necesita su motivo')
      const ops: CambioEntrada[] = []
      if (d.cantidad != null && d.cantidad !== l.cantidad) ops.push({ op: 'LINEA', lineaId, campo: 'cantidad', valor: String(d.cantidad) })
      if (d.lote?.trim() && d.lote.trim() !== l.lote) ops.push({ op: 'LINEA', lineaId, campo: 'lote', valor: d.lote.trim() })
      if (d.vence?.trim()) {
        const f = parsearVencimiento(d.vence)
        if (!f) return falla('No entiendo esa fecha. Usa 30/06/2028 o, si el producto solo dice mes y año, 06/2028.')
        if (f.fecha !== l.vence) ops.push({ op: 'LINEA', lineaId, campo: 'vence', valor: d.vence })
      }
      if (ops.length === 0) return falla('Indica qué encontraste distinto (cantidad, lote o vencimiento)')
      const r = aplicarCambios(e, s, ops, d.motivo, actor)
      if (!r.ok) return r
      sincronizarRecepcion(s)
    }
    const x = lotePorLinea(s, lineaId)
    if (x) {
      x.verificacion = d.coincide ? 'COINCIDE' : 'AJUSTADA'
      if (d.posicionId) {
        const area = AREA_DESTINO[s.tipo]
        if (posicion(e, d.posicionId)?.tipoArea !== area) {
          return falla(s.tipo === 'DEVOLUCION' ? 'Una devolución se deja en el Área de Devoluciones: nunca pasa por Cuarentena'
            : 'El inventario nuevo nace en Cuarentena: elige una posición de Cuarentena (A-6 a A-9)')
        }
        x.posicionId = d.posicionId
      }
    }
    const borrador = e.actas.find((a) => a.solicitudId === solicitudId && a.estado === 'BORRADOR')
    if (borrador && !borrador.firmas.length) { borrador.contenido = contenidoActa(e, s, borrador.numero); borrador.hash = hashDe(borrador.contenido) }
    registrar(e, actor, 'linea_verificada', 'solicitud_ingreso_lineas', s.numero, d.coincide ? 'Coincide con lo esperado' : 'Diferencia: se actualizó la solicitud', d.motivo)
    const lotes = s.recepcion.lotes
    return { ok: true, verificadas: lotes.filter((y) => y.verificacion !== 'PENDIENTE').length, total: lotes.length }
  }

  editarRecepcion(solicitudId: string, d: DatosEdicionRecepcion, actor: Actor): ResultadoAccion {
    const e = estadoE()
    const perm = sinPermiso(actor)
    if (perm) return falla(perm)
    const s = e.solicitudes.find((x) => x.id === solicitudId)
    const r = s?.recepcion
    if (!s || !r) return falla('Todavía no empezó la recepción de esta solicitud')
    if (actaVigente(e, solicitudId)?.firmas.length) return falla('El acta ya tiene firmas: para corregir algo, anúlala con motivo y emite otra')
    if (d.temperaturaC !== undefined) r.temperaturaC = d.temperaturaC ?? undefined
    if (d.bultos !== undefined) r.bultos = d.bultos ?? undefined
    if (d.paletas !== undefined) r.paletas = d.paletas ?? undefined
    if (d.placa !== undefined) r.placa = d.placa.trim() || undefined
    if (d.marcaVehiculo !== undefined) r.marcaVehiculo = d.marcaVehiculo.trim() || undefined
    if (d.tipoConteo !== undefined) r.tipoConteo = d.tipoConteo || undefined
    if (d.horaInicio !== undefined) r.horaInicio = d.horaInicio || undefined
    if (d.horaFin !== undefined) r.horaFin = d.horaFin || undefined
    if (d.verificaciones !== undefined) r.verificaciones = d.verificaciones
    if (d.observaciones !== undefined) r.observaciones = d.observaciones.trim() || undefined
    if (d.facturaNumero !== undefined) r.facturaNumero = d.facturaNumero.trim() || undefined
    if (temperaturaFueraDeRango(r.temperaturaC)) alertar(e, 'TEMPERATURA', 'direccion_tecnica', mensajeTemperatura(r.temperaturaC!), `temp:${r.id}`, s.id)
    registrar(e, actor, 'ingreso_editado', 'ingresos', s.numero, 'Datos de la recepción actualizados')
    return { ok: true }
  }

  generarActa(solicitudId: string, actor: Actor): ResultadoAccion<{ actaId: string }> {
    const e = estadoE()
    const perm = sinPermiso(actor)
    if (perm) return falla(perm)
    const s = e.solicitudes.find((x) => x.id === solicitudId)
    if (!s) return falla('Solicitud inexistente')
    const motivo = problemaParaActa(e, s)
    if (motivo) return falla(motivo)
    const vigente = actaVigente(e, solicitudId)
    if (vigente) {
      if (vigente.estado === 'FIRMADA') return falla(`Esta solicitud ya tiene su acta firmada (${vigente.numero})`)
      if (vigente.firmas.length > 0) return falla(`El acta ${vigente.numero} ya tiene firmas: para corregir algo, anúlala con motivo y emite otra`)
      vigente.contenido = contenidoActa(e, s, vigente.numero)
      vigente.hash = hashDe(vigente.contenido)
      return { ok: true, actaId: vigente.id }
    }
    const numero = siguienteCorrelativo(e, 'I')
    const contenido = contenidoActa(e, s, numero)
    const acta: ActaDemo = { id: nuevoId(), solicitudId, numero, estado: 'BORRADOR', hash: hashDe(contenido), generadaEn: ahora(), contenido, firmas: [] }
    e.actas.push(acta)
    registrar(e, actor, 'acta_recepcion_generada', 'actas_recepcion', numero, 'Acta de Recepción generada desde la solicitud')
    return { ok: true, actaId: acta.id }
  }

  firmarActa(actaId: string, firma: FirmaEntrada, actor: Actor): ResultadoAccion<{ completa: boolean }> {
    const e = estadoE()
    const a = e.actas.find((x) => x.id === actaId)
    if (!a) return falla('Acta inexistente')
    if (a.estado !== 'BORRADOR') return falla(`El acta ${a.numero} ya no admite firmas (${a.estado.toLowerCase()})`)
    if (!ROLES_FIRMA.includes(firma.rol)) return falla('Rol de firma inválido')
    if (!puedeFirmarComo(actor.roles, firma.rol)) {
      return falla(firma.rol === 'JEFE_ALMACEN' ? 'Solo el Jefe de Almacén (o su reemplazo) firma como Jefe de Almacén'
        : firma.rol === 'DIRECCION_TECNICA' ? 'Solo Dirección Técnica firma como Dirección Técnica'
        : firma.rol === 'RESPONSABLE_CONTEO' ? 'Solo el personal de almacén firma como responsable de conteo'
        : 'Solo el personal de almacén registra la firma del transportista')
    }
    if (a.firmas.some((f) => f.rol === firma.rol)) return falla('Ese rol ya firmó esta acta')
    if (firma.rol === 'TRANSPORTISTA') {
      const v = validarTransportista({ nombre: firma.nombre ?? '', dni: firma.dni ?? '', placa: firma.placa ?? '', imagen: firma.imagen ?? '' })
      if (!v.ok) return falla(Object.values(v.errores)[0] ?? 'Revisa los datos del transportista', v.errores as Record<string, string>)
      a.firmas.push({ rol: 'TRANSPORTISTA', nombre: firma.nombre!.trim(), dni: firma.dni!.trim(), placa: firma.placa!.trim(), imagen: firma.imagen, firmadoEn: ahora(), hash: a.hash })
    } else {
      a.firmas.push({ rol: firma.rol, nombre: actor.nombre, firmadoEn: ahora(), hash: a.hash })
    }
    const completa = ROLES_FIRMA.every((r) => a.firmas.some((f) => f.rol === r))
    if (completa) { a.estado = 'FIRMADA'; a.firmadaEn = ahora() }
    registrar(e, actor, 'acta_recepcion_firmada', 'actas_recepcion', a.numero, `Firma: ${ETIQUETA_ROL_FIRMA[firma.rol]}${completa ? ' (acta completa)' : ''}`)
    return { ok: true, completa }
  }

  anularActa(actaId: string, motivo: string, actor: Actor): ResultadoAccion {
    const e = estadoE()
    if (!actor.roles.some((r) => r === 'jefe_almacen' || r === 'reemplazo_jefe' || r === 'direccion_tecnica')) {
      return falla('Solo el Jefe de Almacén (o su reemplazo) o Dirección Técnica anulan un acta')
    }
    if (!motivo.trim()) return falla('La anulación necesita un motivo')
    const a = e.actas.find((x) => x.id === actaId)
    if (!a) return falla('Acta inexistente')
    if (a.estado === 'ANULADA') return falla('El acta ya está anulada')
    if (a.estado === 'BORRADOR') return falla('Un borrador no se anula: se corrige o se vuelve a generar')
    a.estado = 'ANULADA'
    a.anuladaEn = ahora()
    a.motivoAnulacion = motivo.trim()
    registrar(e, actor, 'acta_recepcion_anulada', 'actas_recepcion', a.numero, 'Acta anulada (su número no se reutiliza)', motivo)
    return { ok: true }
  }

  reemitirActa(actaId: string, actor: Actor): ResultadoAccion<{ actaId: string }> {
    const e = estadoE()
    const perm = sinPermiso(actor)
    if (perm) return falla(perm)
    const a = e.actas.find((x) => x.id === actaId)
    if (!a || a.estado !== 'ANULADA') return falla('Solo se reemite un acta anulada')
    if (e.actas.some((x) => x.reemplazaA === actaId)) return falla('Esa acta ya fue reemitida')
    const s = e.solicitudes.find((x) => x.id === a.solicitudId)!
    const numero = siguienteCorrelativo(e, 'I')
    const contenido = contenidoActa(e, s, numero)
    const nueva: ActaDemo = { id: nuevoId(), solicitudId: s.id, numero, estado: 'BORRADOR', hash: hashDe(contenido), generadaEn: ahora(), contenido, firmas: [], reemplazaA: a.id }
    e.actas.push(nueva)
    const exp = e.expedientes.find((x) => x.id === s.expedienteId)
    if (exp) exp.documentos.push({ id: nuevoId(), tipo: 'ACTA_RECEPCION', descripcion: `Acta de Recepción ${numero} (reemplaza a ${a.numero})`, agregadoEn: ahora(), referenciaTipo: 'acta_recepcion', referenciaId: nueva.id })
    registrar(e, actor, 'acta_recepcion_reemitida', 'actas_recepcion', numero, `Reemplaza al acta ${a.numero}`)
    return { ok: true, actaId: nueva.id }
  }

  confirmarIngreso(solicitudId: string, actor: Actor): ResultadoAccion {
    const e = estadoE()
    const perm = sinPermiso(actor)
    if (perm) return falla(perm)
    const s = e.solicitudes.find((x) => x.id === solicitudId)
    if (!s) return falla('Solicitud inexistente')
    if (s.recepcion?.confirmado) return falla('Este ingreso ya está confirmado')
    const problema = problemaParaActa(e, s)
    if (problema) return falla(problema)
    const acta = e.actas.find((a) => a.solicitudId === solicitudId && a.estado === 'FIRMADA')
    if (!acta) return falla('Para confirmar el ingreso, el acta de recepción tiene que estar firmada por las cuatro partes')
    const r = s.recepcion!

    // El lote se asegura recién ahora, con lo verificado en la recepción física.
    const lotes: { lote: Lote; linea: LineaSolicitudDemo; x: LoteRecepcionDemo }[] = []
    for (const x of r.lotes) {
      const l = s.lineas.find((y) => y.id === x.lineaId)!
      const lote = asegurarLote(e, l.productoId, l.lote, l.vence, s.propietarioId)
      if ('error' in lote) return falla(lote.error)
      lotes.push({ lote, linea: l, x })
    }
    const estadoInicial = ESTADO_INICIAL[s.tipo]
    for (const { lote, linea, x } of lotes) {
      e.panorama.saldos.push({
        posicionId: x.posicionId!, productoId: linea.productoId, loteId: lote.id, propietarioId: s.propietarioId,
        estado: estadoInicial, procedenciaId: x.id, cantidad: linea.cantidad,
      })
    }
    r.confirmado = true
    r.confirmadoEn = ahora()
    s.estado = 'CERRADA'
    s.cerradaEn = ahora()
    generarExpedienteDemo(e, s, acta)
    const exp = e.expedientes.find((x) => x.id === s.expedienteId)!
    for (const { linea, x } of lotes) {
      const numero = siguienteCorrelativo(e, 'O')
      const o = organolepticaDe(e, s, linea, x, numero)
      o.actaRecepcion = acta.numero
      e.organolepticas.push(o)
      exp.faltantes.push({ id: nuevoId(), tipo: 'ACTA_ORGANOLEPTICA', documento: `Acta organoléptica ${numero} · ${o.producto} · lote ${o.lote}`, responsable: 'Dirección Técnica', estado: 'ABIERTO' })
    }
    revisarRS(e, s)
    registrar(e, actor, 'ingreso_confirmado', 'ingresos', acta.numero, `El inventario nació en ${estadoInicial === 'DEVOLUCIONES' ? 'Devoluciones' : 'Cuarentena'}`)
    return { ok: true }
  }

  // ── Calidad ───────────────────────────────────────────────────────────────

  obtenerOrganoleptica(id: string): OrganolepticaVista | null {
    const e = estadoE()
    const o = e.organolepticas.find((x) => x.id === id)
    return o ? structuredClone(o) : null
  }

  guardarOrganoleptica(id: string, d: DatosOrganolepticaGuardar, enviar: boolean, actor: Actor): ResultadoAccion {
    const e = estadoE()
    if (!actor.roles.some((r) => r === 'asistente_dt' || r === 'direccion_tecnica')) return falla('Solo Dirección Técnica y su asistente llenan el acta organoléptica')
    const o = e.organolepticas.find((x) => x.id === id)
    if (!o) return falla('Acta inexistente')
    if (o.estado === 'FIRMADA') return falla('El acta ya está firmada')
    if (d.certAnalisis !== undefined) o.datos.certAnalisis = d.certAnalisis
    if (d.checklist !== undefined) o.datos.checklist = d.checklist
    if (d.observacion !== undefined) o.datos.observacion = d.observacion.trim() || undefined
    if (d.destinoSugerido !== undefined) o.datos.destinoSugerido = d.destinoSugerido
    if (d.conclusion !== undefined) o.datos.conclusion = d.conclusion
    if (enviar) {
      const f = faltantesParaEnviar(o.datos)
      if (f.length) return falla(`Para enviarla a Dirección Técnica: ${f[0]}`)
      o.estado = 'PENDIENTE_DT'
    }
    registrar(e, actor, 'acta_organoleptica_guardada', 'actas_organolepticas', o.numero, enviar ? 'Enviada a Dirección Técnica' : 'Borrador guardado')
    return { ok: true }
  }

  decidirOrganoleptica(id: string, decision: Decision, observacion: string | undefined, actor: Actor): ResultadoAccion {
    const e = estadoE()
    if (!actor.roles.includes('direccion_tecnica')) return falla('Solo Dirección Técnica decide Aprobado o Bajas/Rechazados')
    const o = e.organolepticas.find((x) => x.id === id)
    if (!o) return falla('Acta inexistente')
    if (o.estado === 'FIRMADA') return falla('El acta ya está firmada')
    if (o.estado !== 'PENDIENTE_DT') return falla('El acta todavía no está completa: falta que la envíen a Dirección Técnica')
    const p = producto(e, o.productoId)
    const v = validarDecision(decision, o.datos.conclusion, p?.reg?.rsVence, e.panorama.hoy)
    if (!v.ok) return falla(v.mensaje)
    // Solo las unidades de ESTA entrega que siguen esperando su decisión (la aprobación no se hereda).
    const desde = ESTADO_INICIAL[o.ingresoTipo]
    const saldos = e.panorama.saldos.filter((s) => s.procedenciaId === o.ingresoLoteId && s.estado === desde && s.cantidad > 0)
    if (saldos.length === 0) return falla('Estas unidades ya no están esperando decisión: no hay nada que decidir')
    for (const s of saldos) s.estado = decision
    o.estado = 'FIRMADA'
    o.decision = decision
    o.decididoPor = actor.nombre
    o.decididoEn = ahora()
    o.observacionDt = observacion?.trim() || undefined
    o.hash = hashDe({ ...o, hash: undefined })
    if (decision === 'APROBADO') e.aprobadoEn[o.ingresoLoteId] = ahora()
    const s = e.solicitudes.find((x) => x.id === o.solicitudId)
    const exp = e.expedientes.find((x) => x.id === s?.expedienteId)
    if (exp) {
      exp.documentos.push({ id: nuevoId(), tipo: 'ACTA_ORGANOLEPTICA', descripcion: `Acta organoléptica ${o.numero}`, agregadoEn: ahora(), referenciaTipo: 'acta_organoleptica', referenciaId: o.id })
      for (const f of exp.faltantes) if (f.estado === 'ABIERTO' && f.tipo === 'ACTA_ORGANOLEPTICA' && f.documento.startsWith(`Acta organoléptica ${o.numero}`)) { f.estado = 'RESUELTO'; f.resueltoEn = ahora(); f.nota = 'Acta firmada' }
    }
    registrar(e, actor, 'acta_organoleptica_firmada', 'actas_organolepticas', o.numero, `Decisión: ${ETIQUETA_DECISION[decision]}`, observacion)
    return { ok: true }
  }

  colaDireccionTecnica(): ColaDT {
    const e = estadoE()
    const alertas = this.listarAlertas()
    return {
      organolepticas: e.organolepticas.filter((o) => o.estado === 'PENDIENTE_DT').map((o) => structuredClone(o)),
      borradores: e.organolepticas.filter((o) => o.estado === 'BORRADOR').map((o) => structuredClone(o)),
      decididas: e.organolepticas.filter((o) => o.estado === 'FIRMADA').sort((a, b) => (b.decididoEn ?? '').localeCompare(a.decididoEn ?? '')).slice(0, 10).map((o) => structuredClone(o)),
      productosPorValidar: e.panorama.productos.filter((p) => p.reg && p.reg.estadoValidacion !== 'VALIDADO')
        .map((p) => ({ id: p.id, codigo: p.codigo, descripcion: p.descripcion, estado: p.reg!.estadoValidacion })),
      alertas: alertas.filter((a) => a.estado === 'ABIERTA' && a.destinatario === 'direccion_tecnica'),
    }
  }

  // ── Alertas ───────────────────────────────────────────────────────────────

  listarAlertas(): AlertaVista[] {
    const e = estadoE()
    revisarRegistroCompras(e)
    revisarPorTrasladar(e)
    revisarVencimientos(e)
    return structuredClone(e.alertas).map(limpiarClave)
  }

  contarAlertasAbiertas(): { direccion_tecnica: number; jefe_almacen: number; asistente_dt: number } {
    const e = estadoE()
    const abiertas = e.alertas.filter((a) => a.estado === 'ABIERTA')
    const n = (d: DestinatarioAlerta) => abiertas.filter((a) => a.destinatario === d).length
    return { direccion_tecnica: n('direccion_tecnica'), jefe_almacen: n('jefe_almacen'), asistente_dt: n('asistente_dt') }
  }

  atenderAlerta(id: string, nota: string | undefined, actor: Actor): ResultadoAccion {
    const e = estadoE()
    const a = e.alertas.find((x) => x.id === id)
    if (!a) return falla('Alerta inexistente')
    if (!puedeAtenderAlerta(actor.roles, a.destinatario)) {
      return falla(`Esta alerta la atiende ${a.destinatario === 'jefe_almacen' ? 'el Jefe de Almacén' : a.destinatario === 'asistente_dt' ? 'la Asistente de Dirección Técnica' : 'Dirección Técnica'}`)
    }
    if (a.estado === 'ATENDIDA') return { ok: true }
    a.estado = 'ATENDIDA'
    a.atendidaPor = actor.nombre
    a.atendidaEn = ahora()
    a.nota = nota?.trim() || undefined
    registrar(e, actor, 'alerta_atendida', 'alertas', a.tipo, 'Alerta atendida', nota)
    return { ok: true }
  }

  // ── Expediente ────────────────────────────────────────────────────────────

  listarExpedientes(): ResumenExpediente[] {
    const e = estadoE()
    return e.expedientes.map((x) => ({
      id: x.id, clave: x.clave, tipo: x.tipo, estado: x.estado, faltantesAbiertos: x.faltantes.filter((f) => f.estado === 'ABIERTO').length,
      documentos: x.documentos.length, ingresos: e.solicitudes.filter((s) => s.expedienteId === x.id).length,
    }))
  }

  obtenerExpediente(id: string): ExpedienteVista | null {
    const e = estadoE()
    const x = e.expedientes.find((y) => y.id === id)
    if (!x) return null
    return structuredClone({
      ...x,
      ingresos: e.solicitudes.filter((s) => s.expedienteId === id).map((s) => ({
        id: s.id, numero: s.numero, tipo: s.tipo, actaNumero: e.actas.find((a) => a.solicitudId === s.id && a.estado === 'FIRMADA')?.numero,
        unidades: s.recepcion?.confirmado ? unidades(s) : 0, confirmadoEn: s.recepcion?.confirmadoEn,
      })),
    })
  }

  agregarDocumento(expedienteId: string, tipo: string, descripcion: string, actor: Actor): ResultadoAccion {
    const e = estadoE()
    if (!actor.roles.some((r) => r !== 'auditoria_lectura' && r !== 'admin_wms')) return falla('No tienes permiso para el expediente')
    if (!descripcion.trim()) return falla('Describe el documento')
    const x = e.expedientes.find((y) => y.id === expedienteId)
    if (!x) return falla('Expediente inexistente')
    x.documentos.push({ id: nuevoId(), tipo: tipo || 'OTRO', descripcion: descripcion.trim(), agregadoEn: ahora() })
    for (const f of x.faltantes) if (f.estado === 'ABIERTO' && f.tipo === tipo) { f.estado = 'RESUELTO'; f.resueltoEn = ahora(); f.nota = 'Documento enlazado' }
    registrar(e, actor, 'expediente_documento_agregado', 'expedientes', x.clave, descripcion)
    return { ok: true }
  }

  agregarFaltante(expedienteId: string, documento: string, responsable: string, actor: Actor): ResultadoAccion {
    const e = estadoE()
    if (!actor.roles.some((r) => r === 'asistente_dt' || r === 'direccion_tecnica' || r === 'jefe_almacen' || r === 'reemplazo_jefe')) return falla('No tienes permiso para el expediente')
    if (!documento.trim() || !responsable.trim()) return falla('Un faltante necesita el documento y su responsable')
    const x = e.expedientes.find((y) => y.id === expedienteId)
    if (!x) return falla('Expediente inexistente')
    x.faltantes.push({ id: nuevoId(), tipo: 'OTRO', documento: documento.trim(), responsable: responsable.trim(), estado: 'ABIERTO' })
    x.estado = 'ABIERTO'
    x.cerradoEn = undefined
    registrar(e, actor, 'expediente_faltante_agregado', 'expedientes', x.clave, documento)
    return { ok: true }
  }

  resolverFaltante(faltanteId: string, nota: string | undefined, actor: Actor): ResultadoAccion {
    const e = estadoE()
    if (!actor.roles.some((r) => r === 'asistente_dt' || r === 'direccion_tecnica' || r === 'jefe_almacen' || r === 'reemplazo_jefe')) return falla('No tienes permiso para el expediente')
    for (const x of e.expedientes) {
      const f = x.faltantes.find((y) => y.id === faltanteId)
      if (f) {
        if (f.estado === 'ABIERTO') { f.estado = 'RESUELTO'; f.resueltoEn = ahora(); f.nota = nota?.trim() || undefined }
        registrar(e, actor, 'expediente_faltante_resuelto', 'expediente_faltantes', x.clave, f.documento, nota)
        return { ok: true }
      }
    }
    return falla('Faltante inexistente')
  }

  cerrarExpediente(expedienteId: string, actor: Actor): ResultadoAccion {
    const e = estadoE()
    if (!actor.roles.some((r) => r === 'asistente_dt' || r === 'direccion_tecnica')) return falla('Solo Sandra (Asistente de Dirección Técnica) o Dirección Técnica cierran el expediente')
    const x = e.expedientes.find((y) => y.id === expedienteId)
    if (!x) return falla('Expediente inexistente')
    const abiertos = x.faltantes.filter((f) => f.estado === 'ABIERTO').length
    if (abiertos > 0) return falla(`Todavía hay ${abiertos} faltante(s) abiertos: resuélvelos antes de cerrar`)
    x.estado = 'CERRADO'
    x.cerradoEn = ahora()
    registrar(e, actor, 'expediente_cerrado', 'expedientes', x.clave, 'Expediente cerrado')
    return { ok: true }
  }

  // ── Búsqueda (solicitudes, OC y actas) ────────────────────────────────────

  buscarEntradas(consulta: string): ResultadoBusqueda[] {
    const e = estadoE()
    const out: ResultadoBusqueda[] = []
    for (const s of e.solicitudes) {
      const acta = actaVigente(e, s.id) ?? [...e.actas].reverse().find((a) => a.solicitudId === s.id)
      const detalleTxt = `${ETIQUETA_TIPO_INGRESO[s.tipo]} · ${acta ? `acta ${acta.numero}` : 'sin acta todavía'}`
      if (buscarEnTexto(consulta, s.numero)) {
        out.push({ tipo: 'oc', id: s.id, titulo: `Solicitud ${s.numero}${s.ocCodigo ? ` · ${s.ocCodigo}` : ''}`, detalle: detalleTxt, posiciones: [], unidades: unidades(s), puntaje: 32, href: `/entradas/${s.id}` })
      } else if (s.ocCodigo && buscarEnTexto(consulta, s.ocCodigo)) {
        out.push({ tipo: 'oc', id: s.id, titulo: `${s.ocCodigo} · ${s.contraparteNombre ?? ''}`.trim(), detalle: `${s.numero} · ${detalleTxt}`, posiciones: [], unidades: unidades(s), puntaje: 30, href: `/entradas/${s.id}` })
      }
      for (const a of e.actas.filter((x) => x.solicitudId === s.id)) {
        if (buscarEnTexto(consulta, a.numero)) {
          out.push({ tipo: 'acta', id: a.id, titulo: `Acta ${a.numero}${a.estado === 'ANULADA' ? ' (anulada)' : ''}`, detalle: `${ETIQUETA_TIPO_INGRESO[s.tipo]} · ${nombrePropietario(e, s.propietarioId)}`, posiciones: [], unidades: 0, puntaje: 35, href: `/entradas/${s.id}` })
        }
      }
    }
    for (const o of e.organolepticas) {
      if (buscarEnTexto(consulta, o.numero)) {
        out.push({ tipo: 'acta', id: o.id, titulo: `Acta organoléptica ${o.numero}`, detalle: `${o.producto} · lote ${o.lote}`, posiciones: [], unidades: o.cantidadLote, puntaje: 33, href: `/calidad/${o.id}` })
      }
    }
    return out
  }
}

// ── Revisiones automáticas ──────────────────────────────────────────────────

/** Espejo de wms.revisar_registro_compras(): la integración con Compras es manual, así que se vigila que alguien la haga. */
function revisarRegistroCompras(e: EstadoDemo) {
  for (const s of e.solicitudes) {
    if (s.estado !== 'CERRADA' || s.tipo !== 'COMPRA_LOCAL' || !s.ocId) continue
    for (const b of conciliacion(e, s)) {
      const clave = `compras:${s.id}:${b.ocItemId}`
      if (b.estado === 'OK') {
        for (const a of e.alertas) if (a.estado === 'ABIERTA' && (a as ConClave).clave === clave) { a.estado = 'ATENDIDA'; a.atendidaEn = ahora(); a.nota = 'Compras ya coincide con la cantidad física' }
      } else if (b.estado === 'FALTA' && Date.parse(s.cerradaEn ?? ahora()) < Date.now() - e.plazoRegistroComprasHoras * 3_600_000) {
        alertar(e, 'POR_REGISTRAR_EN_COMPRAS', 'jefe_almacen',
          `${b.descripcion}: la cantidad física confirmada es ${b.fisica} y Compras todavía no la tiene registrada (${b.registrado}). Cópiala en la recepción de la OC ${b.ocCodigo}.`,
          clave, s.id, b.productoId)
      } else if (b.estado === 'NO_COINCIDE') {
        alertar(e, 'NO_COINCIDE_CON_COMPRAS', 'jefe_almacen',
          `${b.descripcion}: en WMS recibimos ${b.esperado} y Compras muestra ${b.registrado} en la OC ${b.ocCodigo}. Revisa cuál es el dato correcto.`,
          clave, s.id, b.productoId)
        alertar(e, 'NO_COINCIDE_CON_COMPRAS', 'direccion_tecnica',
          `${b.descripcion}: en WMS recibimos ${b.esperado} y Compras muestra ${b.registrado} en la OC ${b.ocCodigo}.`,
          `${clave}:dt`, s.id, b.productoId)
      }
    }
  }
}

/** Lotes por vencer o vencidos que siguen en el inventario (todo estado salvo Bajas/Rechazados). Espejo de wms.revisar_vencimientos(). */
function revisarVencimientos(e: EstadoDemo) {
  const porLote = new Map<string, { unidades: number; posiciones: Set<string> }>()
  for (const s of e.panorama.saldos) {
    if (s.cantidad <= 0 || s.estado === 'BAJAS_RECHAZADOS') continue
    const g = porLote.get(s.loteId) ?? { unidades: 0, posiciones: new Set<string>() }
    g.unidades += s.cantidad
    g.posiciones.add(e.panorama.posiciones.find((p) => p.id === s.posicionId)?.codigo ?? '')
    porLote.set(s.loteId, g)
  }
  for (const [loteId, g] of porLote) {
    const lote = e.panorama.lotes.find((l) => l.id === loteId)
    if (!lote?.vence) continue
    const sit = situacionLote(lote.vence, e.panorama.hoy, e.diasAlertaVencimiento)
    if (sit !== 'POR_VENCER' && sit !== 'VENCIDO') continue
    const dias = diasParaVencer(lote.vence, e.panorama.hoy)
    const prod = producto(e, lote.productoId)
    const fecha = lote.vence.split('-').reverse().join('/')
    const donde = [...g.posiciones].sort().join(', ')
    // Una sola alerta por lote y tipo: si ya se atendió, no vuelve a molestar cada vez que se abre la pantalla.
    const yaTuvo = (clave: string) => e.alertas.some((a) => (a as ConClave).clave === clave)
    if (sit === 'VENCIDO') {
      for (const a of e.alertas) if (a.estado === 'ABIERTA' && (a as ConClave).clave === `lote-por-vencer:${loteId}`) { a.estado = 'ATENDIDA'; a.atendidaEn = ahora(); a.nota = 'El lote venció' }
      if (!yaTuvo(`lote-vencido:${loteId}`)) alertar(e, 'LOTE_VENCIDO', 'direccion_tecnica',
        `El lote ${lote.codigo} de ${prod?.descripcion} venció el ${fecha} (hace ${-dias} días) y sigue en el inventario: ${g.unidades} unidades en ${donde}. Hay que separarlo y decidir su baja.`,
        `lote-vencido:${loteId}`, undefined, lote.productoId, lote.codigo)
    } else {
      if (!yaTuvo(`lote-por-vencer:${loteId}`)) alertar(e, 'LOTE_POR_VENCER', 'jefe_almacen',
        `El lote ${lote.codigo} de ${prod?.descripcion} vence el ${fecha} (en ${dias} días): ${g.unidades} unidades en ${donde}. Sácalo primero o rótalo.`,
        `lote-por-vencer:${loteId}`, undefined, lote.productoId, lote.codigo)
    }
  }
}

function revisarPorTrasladar(e: EstadoDemo) {
  const ahoraIso = ahora()
  for (const s of e.panorama.saldos) {
    if (s.estado !== 'APROBADO' || s.cantidad <= 0) continue
    const pos = e.panorama.posiciones.find((p) => p.id === s.posicionId)
    if (pos?.tipoArea !== 'CUARENTENA') continue
    const desde = e.aprobadoEn[s.procedenciaId]
    if (!desde || !porTrasladarVencido(desde, ahoraIso, e.plazoPorTrasladarHoras)) continue
    const prod = producto(e, s.productoId)
    const lote = e.panorama.lotes.find((l) => l.id === s.loteId)
    alertar(e, 'POR_TRASLADAR_VENCIDO', 'jefe_almacen',
      `${prod?.descripcion} (lote ${lote?.codigo}, ${s.cantidad} unidades) está aprobado desde hace más de ${e.plazoPorTrasladarHoras} horas y sigue en ${pos.codigo}. Hay que trasladarlo a su rack.`,
      `traslado:${s.posicionId}:${s.loteId}:${s.procedenciaId}`, undefined, s.productoId, lote?.codigo)
  }
}

// ── Datos de prueba de entradas ─────────────────────────────────────────────

const KATIA: Actor = { id: 'demo:direccion_tecnica', nombre: 'Dirección Técnica (demo)', roles: ['direccion_tecnica'] }
const SANDRA: Actor = { id: 'demo:asistente_dt', nombre: 'Asistente DT (demo)', roles: ['asistente_dt'] }
const CHARLIE: Actor = { id: 'demo:jefe_almacen', nombre: 'Jefe de Almacén (demo)', roles: ['jefe_almacen'] }
const AUX: Actor = { id: 'demo:auxiliar', nombre: 'Auxiliar de almacén (demo)', roles: ['auxiliar'] }
const FIRMA_PNG = `data:image/png;base64,${'iVBORw0KGgo'.repeat(30)}`

export function checklistConforme(): Checklist {
  const c: Checklist = {}
  for (const g of CHECKLIST_ORGANOLEPTICO) if (!g.opcional || g.id === 'plastico') for (const it of g.items) c[it.id] = 'C'
  return c
}

function sembrar(e: EstadoDemo) {
  const eng = new MotorEntradas()
  const hoy = e.panorama.hoy
  const idProd = (n: number) => `prod:${n}`
  // Lo facturado por Compras (solo lectura): OC-0001 y OC-0006 facturadas completas; OC-0003, la mitad.
  const facturadas: Record<number, number> = { 1: 120, 3: 25, 6: 200 }
  const oc = (n: number, codigo: string, proveedor: string, ruc: string, items: [number, number][]) => {
    e.compras.push({
      ocId: `compras-oc:${n}`, codigo, proveedorNombre: proveedor, proveedorRuc: ruc, estado: 'enviada',
      items: items.map(([p, c], k) => ({ ocItemId: `compras-oc:${n}:item:${k + 1}`, productoId: idProd(p), pedida: c, recibida: 0, facturada: facturadas[n] ?? 0 })),
    })
    void sumarDias(hoy, -n)
  }
  oc(1, 'OC-DEMO-0001', 'Distribuidora Andina S.A.C.', '20100000001', [[7, 120]])
  oc(2, 'OC-DEMO-0002', 'Droguería Pacífico S.A.C.', '20100000002', [[2, 6]])
  oc(3, 'OC-DEMO-0003', 'Laboratorios del Sur S.A.', '20100000003', [[15, 50]])
  oc(4, 'OC-DEMO-0004', 'Distribuidora Andina S.A.C.', '20100000001', [[3, 300]])
  oc(5, 'OC-DEMO-0005', 'Droguería Pacífico S.A.C.', '20100000002', [[6, 84], [5, 60]])
  oc(6, 'OC-DEMO-0006', 'Laboratorios del Sur S.A.', '20100000003', [[8, 200]])
  oc(7, 'OC-DEMO-0007', 'Distribuidora Andina S.A.C.', '20100000001', [[9, 48]])
  const logissa = e.panorama.propietarios.find((p) => p.esDuenoAlmacen)!.id
  const triamed = e.panorama.propietarios.find((p) => p.codigo === 'TRIAMED')!.id
  const pos = (c: string) => e.panorama.posiciones.find((p) => p.codigo === c)!.id
  const posDev = e.panorama.posiciones.find((p) => p.tipoArea === 'DEVOLUCIONES')!.id
  const datos = { temperaturaC: 21, bultos: 8, paletas: 1, placa: 'ABC-123', marcaVehiculo: 'Hyundai', tipoConteo: 'TOTAL' as const, horaInicio: horasAtras(2), horaFin: horasAtras(1) }
  const compra = (n: number, lineas: { item: number; lote: string; vence: string; cantidad: number }[], autorizar = true) =>
    eng.crearSolicitud({
      tipo: 'COMPRA_LOCAL', propietarioId: logissa, ocId: `compras-oc:${n}`, guiaNumero: `T00${n}-00${400 + n * 31}`,
      lineas: lineas.map((l) => ({ ocItemId: `compras-oc:${n}:item:${l.item}`, lote: l.lote, vence: l.vence, cantidad: l.cantidad })),
    }, autorizar, SANDRA)
  const sol = (id: string) => e.solicitudes.find((s) => s.id === id)!
  const firmarTodo = (actaId: string) => {
    eng.firmarActa(actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE)
    eng.firmarActa(actaId, { rol: 'DIRECCION_TECNICA' }, KATIA)
    eng.firmarActa(actaId, { rol: 'RESPONSABLE_CONTEO' }, AUX)
    eng.firmarActa(actaId, { rol: 'TRANSPORTISTA', nombre: 'Pedro Quispe', dni: '45678912', placa: 'ABC-123', imagen: FIRMA_PNG }, CHARLIE)
  }
  /** Recepción completa de lo que se espera: todas las líneas coinciden, acta firmada, ingreso confirmado. */
  const recibirTodo = (id: string, posiciones: string[]) => {
    eng.iniciarRecepcion(id, CHARLIE)
    sol(id).lineas.forEach((l, k) => eng.verificarLinea(id, l.id, { coincide: true, posicionId: pos(posiciones[k % posiciones.length]) }, CHARLIE))
    eng.editarRecepcion(id, { ...datos, verificaciones: { cantidadCorresponde: true, cajasSelladas: true, embalajeLimpio: true } }, CHARLIE)
    const g = eng.generarActa(id, CHARLIE)
    if (g.ok) firmarTodo(g.actaId)
    eng.confirmarIngreso(id, CHARLIE)
  }
  const llenarOrg = (id: string, k = 0) => {
    const o = e.organolepticas.filter((x) => x.solicitudId === id)[k]
    if (o) eng.guardarOrganoleptica(o.id, { certAnalisis: true, checklist: checklistConforme(), destinoSugerido: 'APROBADO', conclusion: 'CONFORME', observacion: 'Sin observaciones.' }, true, SANDRA)
  }
  const registrarEnCompras = (n: number, item: number, cantidad: number) => {
    e.compras.find((c) => c.ocId === `compras-oc:${n}`)!.items[item - 1].recibida = cantidad
  }

  // 1) Compra confirmada de 120 en dos lotes; Compras copió 118 (se equivocó al tipear): NO COINCIDE.
  const a = compra(1, [{ item: 1, lote: 'L24071', vence: '30/11/2028', cantidad: 80 }, { item: 1, lote: 'L24072', vence: '03/2029', cantidad: 40 }])
  if (a.ok) { recibirTodo(a.id, ['A-6', 'A-7']); llenarOrg(a.id, 0); registrarEnCompras(1, 1, 118) }
  // 2) Compra por llegar (autorizada, sin recepción todavía).
  compra(2, [{ item: 1, lote: 'M5530', vence: '15/08/2028', cantidad: 6 }])
  // 3) Compra de un producto con registro sanitario vencido: se recibe, pero no se podrá aprobar. Compras ya lo registró: OK.
  const c = compra(3, [{ item: 1, lote: 'Z9910', vence: '28/02/2029', cantidad: 50 }])
  if (c.ok) { recibirTodo(c.id, ['A-9']); llenarOrg(c.id); registrarEnCompras(3, 1, 50) }
  // 4) Compra en recepción: anunciaron 300 y llegaron 290 — la solicitud se ajustó con su motivo; temperatura fuera de rango.
  const d = compra(4, [{ item: 1, lote: 'N3301', vence: '20/09/2028', cantidad: 300 }])
  if (d.ok) {
    eng.iniciarRecepcion(d.id, CHARLIE)
    eng.verificarLinea(d.id, sol(d.id).lineas[0].id, { coincide: false, cantidad: 290, motivo: 'La guía dice 300 pero en el conteo hay 290', posicionId: pos('A-8') }, CHARLIE)
    eng.editarRecepcion(d.id, { temperaturaC: 31.5, bultos: 12, paletas: 2, placa: 'XYZ-987', marcaVehiculo: 'Toyota', tipoConteo: 'TOTAL' }, CHARLIE)
  }
  // 5) Solicitud preparada por Sandra, esperando la autorización de Katia.
  compra(5, [{ item: 1, lote: 'P8801', vence: '31/12/2028', cantidad: 84 }, { item: 2, lote: 'Q1204', vence: '30/06/2028', cantidad: 60 }], false)
  // 6) Compra cerrada hace más de 24 h y Compras todavía no la registró: POR REGISTRAR EN COMPRAS.
  const f = compra(6, [{ item: 1, lote: 'R4410', vence: '30/10/2028', cantidad: 200 }])
  if (f.ok) { recibirTodo(f.id, ['A-8']); sol(f.id).cerradaEn = horasAtras(30) }
  // 7) Devolución de Triamed: nace en Devoluciones (nunca en Cuarentena), con el acta a medio firmar.
  const dev = eng.crearSolicitud({
    tipo: 'DEVOLUCION', propietarioId: triamed, contraparteNombre: 'Clínica San Lucas', guiaNumero: 'T005-00231',
    docOriginalTipo: 'FACTURA', docOriginalNumero: 'F001-004412', motivo: 'Producto sin rotación; el cliente lo devuelve',
    lineas: [{ productoId: idProd(10), lote: 'C77201', vence: '31/07/2027', cantidad: 24 }],
  }, true, SANDRA)
  if (dev.ok) {
    eng.iniciarRecepcion(dev.id, CHARLIE)
    eng.verificarLinea(dev.id, sol(dev.id).lineas[0].id, { coincide: true, posicionId: posDev }, CHARLIE)
    eng.editarRecepcion(dev.id, datos, CHARLIE)
    const g = eng.generarActa(dev.id, CHARLIE)
    if (g.ok) {
      eng.firmarActa(g.actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE)
      eng.firmarActa(g.actaId, { rol: 'RESPONSABLE_CONTEO' }, AUX)
    }
  }
  // 8) Compra con exceso: llegan más unidades de las que quedaban por recibir (EXCEDE_OC).
  const g8 = compra(7, [{ item: 1, lote: 'S6602', vence: '30/05/2028', cantidad: 48 }])
  if (g8.ok) {
    eng.iniciarRecepcion(g8.id, CHARLIE)
    eng.verificarLinea(g8.id, sol(g8.id).lineas[0].id, { coincide: false, cantidad: 53, motivo: 'Llegaron 5 unidades de más', posicionId: pos('A-9') }, CHARLIE)
  }
  // El "aprobado por trasladar" del Batch 1 lleva más del plazo (D-28).
  const traslado = e.panorama.lotes.find((l) => l.codigo === 'L-TRASLADO')
  const s = e.panorama.saldos.find((x) => x.loteId === traslado?.id)
  if (s) e.aprobadoEn[s.procedenciaId] = horasAtras(30)
}

// ── Fachada asíncrona (la interfaz del repositorio) ─────────────────────────

const motor = () => new MotorEntradas()

export class EntradasDemo {
  async ocsPendientes() { return motor().ocsPendientes() }
  async posicionesDestino(tipo: import('@/domain/entradas').TipoIngreso) { return motor().posicionesDestino(tipo) }
  async listarSolicitudes() { return motor().listarSolicitudes() }
  async obtenerSolicitud(id: string) { return motor().obtenerSolicitud(id) }
  async crearSolicitud(entrada: EntradaSolicitud, autorizar: boolean, actor: Actor) { return motor().crearSolicitud(entrada, autorizar, actor) }
  async autorizarSolicitud(id: string, actor: Actor) { return motor().autorizarSolicitud(id, actor) }
  async ajustarSolicitud(id: string, cambios: CambioEntrada[], motivo: string | undefined, actor: Actor) { return motor().ajustarSolicitud(id, cambios, motivo, actor) }
  async anularSolicitud(id: string, motivo: string, actor: Actor) { return motor().anularSolicitud(id, motivo, actor) }
  async iniciarRecepcion(id: string, actor: Actor) { return motor().iniciarRecepcion(id, actor) }
  async verificarLinea(solicitudId: string, lineaId: string, d: DatosVerificacion, actor: Actor) { return motor().verificarLinea(solicitudId, lineaId, d, actor) }
  async editarRecepcion(solicitudId: string, d: DatosEdicionRecepcion, actor: Actor) { return motor().editarRecepcion(solicitudId, d, actor) }
  async generarActa(solicitudId: string, actor: Actor) { return motor().generarActa(solicitudId, actor) }
  async firmarActa(actaId: string, firma: FirmaEntrada, actor: Actor) { return motor().firmarActa(actaId, firma, actor) }
  async anularActa(actaId: string, motivo: string, actor: Actor) { return motor().anularActa(actaId, motivo, actor) }
  async reemitirActa(actaId: string, actor: Actor) { return motor().reemitirActa(actaId, actor) }
  async confirmarIngreso(solicitudId: string, actor: Actor) { return motor().confirmarIngreso(solicitudId, actor) }
  async obtenerOrganoleptica(id: string) { return motor().obtenerOrganoleptica(id) }
  async guardarOrganoleptica(id: string, d: DatosOrganolepticaGuardar, enviar: boolean, actor: Actor) { return motor().guardarOrganoleptica(id, d, enviar, actor) }
  async decidirOrganoleptica(id: string, decision: Decision, observacion: string | undefined, actor: Actor) { return motor().decidirOrganoleptica(id, decision, observacion, actor) }
  async colaDireccionTecnica() { return motor().colaDireccionTecnica() }
  async listarAlertas() { return motor().listarAlertas() }
  async contarAlertasAbiertas() { return motor().contarAlertasAbiertas() }
  async atenderAlerta(id: string, nota: string | undefined, actor: Actor) { return motor().atenderAlerta(id, nota, actor) }
  async listarExpedientes() { return motor().listarExpedientes() }
  async obtenerExpediente(id: string) { return motor().obtenerExpediente(id) }
  async agregarDocumento(expedienteId: string, tipo: string, descripcion: string, actor: Actor) { return motor().agregarDocumento(expedienteId, tipo, descripcion, actor) }
  async agregarFaltante(expedienteId: string, documento: string, responsable: string, actor: Actor) { return motor().agregarFaltante(expedienteId, documento, responsable, actor) }
  async resolverFaltante(faltanteId: string, nota: string | undefined, actor: Actor) { return motor().resolverFaltante(faltanteId, nota, actor) }
  async cerrarExpediente(expedienteId: string, actor: Actor) { return motor().cerrarExpediente(expedienteId, actor) }
  async buscarEntradas(consulta: string) { return motor().buscarEntradas(consulta) }
}
