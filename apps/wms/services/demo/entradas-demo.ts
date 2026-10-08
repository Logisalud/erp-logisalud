// Motor de ENTRADAS Y CALIDAD en memoria (modo demostración). Aplica las mismas reglas que
// la migración 0004 —y con los mismos mensajes— sobre datos de prueba. Nada sale de aquí.

import { createHash, randomUUID } from 'node:crypto'
import { hashDe } from '@/lib/hash'
import {
  CHECKLIST_ORGANOLEPTICO, ETIQUETA_DECISION, ETIQUETA_TIPO_INGRESO, faltantesParaEnviar, mensajeTemperatura, mensajesDeCuadre,
  muestraOrganoleptica, numeroDeActa, pasoDeIngreso, porTrasladarVencido, progresoLinea, puedeAtenderAlerta, puedeFirmarComo,
  puedeGenerarActa, ROLES_FIRMA, temperaturaFueraDeRango, validarDecision, validarEntradaIngreso, validarEntradaLote,
  validarTransportista, ETIQUETA_ROL_FIRMA, diasParaVencer, situacionLote, type Checklist, type Decision, type EntradaIngreso, type EntradaLote, type RolFirma,
  type TipoAlerta,
} from '@/domain/entradas'
import type {
  ActaRecepcionVista, AlertaVista, ColaDT, ContenidoActaRecepcion, DatosEdicionIngreso, DatosOrganolepticaGuardar,
  ExpedienteVista, FirmaEntrada, IngresoDetalle, IngresoResumen, LineaVista, OrganolepticaVista, PosicionDestino,
  RecepcionCompra, ResumenExpediente,
} from '@/domain/entradas-vistas'
import { parsearVencimiento } from '@/domain/fechas'
import { buscarEnTexto } from '@/domain/busqueda'
import type { ResultadoBusqueda } from '@/domain/panorama'
import { puede } from '@/domain/permisos'
import type { Lote } from '@/domain/tipos'
import { estado, registrar, type ActaDemo, type EstadoDemo, type IngresoDemo } from './estado'
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

const sinPermiso = (actor: Actor, accion: 'ejecutar') => (puede(actor.roles, accion) ? null : 'No tienes permiso para registrar entradas.')

function siguienteCorrelativo(e: EstadoDemo, prefijo: 'I' | 'O'): string {
  const d = new Date()
  const clave = `${prefijo}-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  e.correlativos[clave] = (e.correlativos[clave] ?? 0) + 1
  return numeroDeActa(prefijo, d, e.correlativos[clave])
}

function alertar(e: EstadoDemo, tipo: TipoAlerta, destinatario: AlertaVista['destinatario'], mensaje: string, clave: string, ingresoId?: string, productoId?: string, loteCodigo?: string) {
  if (e.alertas.some((a) => a.estado === 'ABIERTA' && a.mensaje && (a as AlertaVista & { clave?: string }).clave === clave)) return
  e.alertas.unshift(Object.assign({
    id: idDeClave(clave, e.alertas.filter((a) => (a as AlertaVista & { clave?: string }).clave === clave).length), tipo, destinatario, mensaje, estado: 'ABIERTA' as const, creadaEn: ahora(), ingresoId, productoId, loteCodigo,
  }, { clave }))
}

// ── Lectura ─────────────────────────────────────────────────────────────────

function nombrePropietario(e: EstadoDemo, id: string) {
  return e.panorama.propietarios.find((p) => p.id === id)?.razonSocial ?? '—'
}

function producto(e: EstadoDemo, id: string) {
  return e.panorama.productos.find((p) => p.id === id)
}

function lineaVista(e: EstadoDemo, i: IngresoDemo, l: IngresoDemo['lineas'][number]): LineaVista {
  const p = producto(e, l.productoId)
  return {
    id: l.id, productoId: l.productoId, codigo: p?.codigo ?? '', descripcion: p?.descripcion ?? '—',
    registroSanitario: p?.reg?.registroSanitario, rsVence: p?.reg?.rsVence, cantidadReferencia: l.cantidadReferencia,
    lotes: i.lotes.filter((x) => x.lineaId === l.id).map((x) => ({
      id: x.id, codigo: x.codigo, vence: x.vence, venceTexto: x.venceTexto, cantidad: x.cantidad, posicionId: x.posicionId,
      posicionCodigo: e.panorama.posiciones.find((q) => q.id === x.posicionId)?.codigo ?? '—',
    })),
  }
}

function cuadra(i: IngresoDemo): boolean {
  return i.lineas.every((l) => progresoLinea(l.cantidadReferencia, i.lotes.filter((x) => x.lineaId === l.id)).estado === 'CUADRA')
}

function actaVigente(e: EstadoDemo, ingresoId: string): ActaDemo | undefined {
  return e.actas.find((a) => a.ingresoId === ingresoId && a.estado !== 'ANULADA')
}

function actaVista(e: EstadoDemo, a: ActaDemo): ActaRecepcionVista {
  const hechas = new Set(a.firmas.map((f) => f.rol))
  const previa = a.reemplazaA ? e.actas.find((x) => x.id === a.reemplazaA) : undefined
  const siguiente = e.actas.find((x) => x.reemplazaA === a.id)
  return {
    ...a, faltan: ROLES_FIRMA.filter((r) => !hechas.has(r)), reemplazaANumero: previa?.numero, reemplazadaPorNumero: siguiente?.numero,
  }
}

function detalle(e: EstadoDemo, i: IngresoDemo): IngresoDetalle {
  const acta = actaVigente(e, i.id)
  const lineas = i.lineas.map((l) => lineaVista(e, i, l))
  const cuadraIngreso = cuadra(i)
  const ult = i.versiones[i.versiones.length - 1]
  return {
    id: i.id, tipo: i.tipo, propietarioId: i.propietarioId, propietario: nombrePropietario(e, i.propietarioId),
    confirmado: i.confirmado, confirmadoEn: i.confirmadoEn, ocCodigo: i.ocCodigo, contraparteNombre: i.contraparteNombre,
    contraparteRuc: i.contraparteRuc, guiaNumero: i.guiaNumero, facturaNumero: i.facturaNumero, docOriginalTipo: i.docOriginalTipo,
    docOriginalNumero: i.docOriginalNumero, motivo: i.motivo, temperaturaC: i.temperaturaC,
    alertaTemperatura: temperaturaFueraDeRango(i.temperaturaC), bultos: i.bultos, paletas: i.paletas, placa: i.placa,
    marcaVehiculo: i.marcaVehiculo, tipoConteo: i.tipoConteo, horaInicio: i.horaInicio, horaFin: i.horaFin,
    verificaciones: i.verificaciones, observaciones: i.observaciones, creadoEn: i.creadoEn, creadoPor: i.creadoPor,
    paso: pasoDeIngreso({ confirmado: i.confirmado, cuadra: cuadraIngreso, tieneTemperatura: i.temperaturaC != null,
      acta: acta ? { estado: acta.estado, firmas: acta.firmas.length } : undefined }),
    lineas, cuadra: cuadraIngreso, solicitudVersion: ult?.version ?? 1, versiones: [...i.versiones].reverse(),
    actas: e.actas.filter((a) => a.ingresoId === i.id).map((a) => actaVista(e, a)).reverse(),
    organolepticas: e.organolepticas.filter((o) => o.ingresoId === i.id),
    alertas: e.alertas.filter((a) => a.ingresoId === i.id),
    expedienteId: i.expedienteId,
    bloqueadoPorFirmas: !!acta && acta.firmas.length > 0,
  }
}

function resumen(e: EstadoDemo, i: IngresoDemo): IngresoResumen {
  const d = detalle(e, i)
  const referencia = i.tipo === 'COMPRA_LOCAL' ? i.ocCodigo : i.tipo === 'DEVOLUCION' ? `${i.docOriginalTipo === 'BOLETA' ? 'Boleta' : 'Factura'} ${i.docOriginalNumero}` : i.guiaNumero ? `Guía ${i.guiaNumero}` : undefined
  return {
    id: i.id, tipo: i.tipo, propietario: d.propietario, contraparte: i.contraparteNombre, referencia, paso: d.paso,
    actaNumero: actaVigente(e, i.id)?.numero, unidades: i.lineas.reduce((n, l) => n + l.cantidadReferencia, 0),
    productos: i.lineas.length, creadoEn: i.creadoEn, alertasAbiertas: d.alertas.filter((a) => a.estado === 'ABIERTA').length,
    confirmado: i.confirmado,
  }
}

function organolepticaVista(e: EstadoDemo, o: OrganolepticaVista): OrganolepticaVista {
  return structuredClone(o)
}

// ── Motor ───────────────────────────────────────────────────────────────────

function asegurarLote(e: EstadoDemo, productoId: string, codigo: string, vence: string, propietarioId: string): Lote | { error: string } {
  const ya = e.panorama.lotes.find((l) => l.productoId === productoId && l.codigo === codigo && l.propietarioId === propietarioId)
  if (ya) {
    if (ya.vence !== vence) return { error: `El lote ${codigo} ya existe con otro vencimiento (${ya.vence ?? 'sin fecha'}). Un mismo lote no puede tener dos fechas.` }
    return ya
  }
  const l: Lote = { id: `lote:${e.panorama.lotes.length + 1}`, productoId, codigo, vence, propietarioId }
  e.panorama.lotes.push(l)
  return l
}

function generarExpedienteDemo(e: EstadoDemo, i: IngresoDemo, acta: ActaDemo, actor: Actor): void {
  const clave = i.ocCodigo ?? acta.numero
  let exp = e.expedientes.find((x) => x.clave === clave)
  if (!exp) {
    exp = { id: nuevoId(), clave, tipo: i.ocCodigo ? 'OC' : 'ACTA', estado: 'ABIERTO', documentos: [], faltantes: [] }
    e.expedientes.push(exp)
  }
  exp.estado = 'ABIERTO'
  exp.cerradoEn = undefined
  i.expedienteId = exp.id
  const doc = (tipo: string, descripcion: string, ref: string) => {
    if (exp!.documentos.some((d) => d.referenciaId === ref)) return
    exp!.documentos.push({ id: nuevoId(), tipo, descripcion, agregadoEn: ahora(), referenciaTipo: tipo.toLowerCase(), referenciaId: ref })
    for (const f of exp!.faltantes) if (f.estado === 'ABIERTO' && f.tipo === tipo) { f.estado = 'RESUELTO'; f.resueltoEn = ahora(); f.nota = 'Documento enlazado' }
  }
  const falta = (tipo: string, documento: string, responsable: string) =>
    exp!.faltantes.push({ id: nuevoId(), tipo, documento, responsable, estado: 'ABIERTO' })
  doc('ACTA_RECEPCION', `Acta de Recepción ${acta.numero}`, acta.id)
  doc('SOLICITUD_INGRESO', 'Solicitud de Ingreso (LS-FR.05.05)', i.id)
  if (i.guiaNumero?.trim()) doc('GUIA_REMISION', `Guía ${i.guiaNumero}`, `${i.id}:${i.guiaNumero}`)
  else falta('GUIA_REMISION', `Guía de remisión (${acta.numero})`, 'Jefe de Almacén')
  if (i.tipo === 'COMPRA_LOCAL') {
    if (i.facturaNumero?.trim()) doc('FACTURA', `Factura ${i.facturaNumero}`, `${i.id}:${i.facturaNumero}`)
    else falta('FACTURA', `Factura del proveedor (${acta.numero})`, 'Contabilidad')
  } else if (i.tipo === 'DEVOLUCION') {
    doc('FACTURA_BOLETA_ORIGINAL', `${i.docOriginalTipo === 'BOLETA' ? 'Boleta' : 'Factura'} original ${i.docOriginalNumero}`, `${i.id}:${i.docOriginalNumero}`)
    falta('FORMULARIO_DEVOLUCION', `Formulario de devolución del transportista (${acta.numero})`, 'Jefe de Almacén')
  }
  void actor
}

function revisarRS(e: EstadoDemo, i: IngresoDemo) {
  for (const l of i.lineas) {
    const p = producto(e, l.productoId)
    if (p?.reg?.rsVence && p.reg.rsVence < e.panorama.hoy) {
      alertar(e, 'RS_VENCIDO', 'direccion_tecnica',
        `El registro sanitario de ${p.descripcion} venció el ${p.reg.rsVence.split('-').reverse().join('/')}. Su lote no se puede aprobar hasta que lo resuelvas.`,
        `rs:${p.id}`, i.id, p.id)
    }
  }
}

function contenidoActa(e: EstadoDemo, i: IngresoDemo, numero: string): ContenidoActaRecepcion {
  return {
    numero,
    ingreso: {
      tipo: i.tipo, propietario: nombrePropietario(e, i.propietarioId), contraparteNombre: i.contraparteNombre, contraparteRuc: i.contraparteRuc,
      ocCodigo: i.ocCodigo, guiaNumero: i.guiaNumero, facturaNumero: i.facturaNumero, docOriginalTipo: i.docOriginalTipo,
      docOriginalNumero: i.docOriginalNumero, motivo: i.motivo, temperaturaC: i.temperaturaC, bultos: i.bultos, paletas: i.paletas,
      placa: i.placa, marcaVehiculo: i.marcaVehiculo, tipoConteo: i.tipoConteo, horaInicio: i.horaInicio, horaFin: i.horaFin,
      observaciones: i.observaciones, verificaciones: i.verificaciones,
    },
    lineas: i.lineas.map((l) => {
      const p = producto(e, l.productoId)
      const lotes = i.lotes.filter((x) => x.lineaId === l.id)
      return {
        codigo: p?.codigo ?? '', descripcion: p?.descripcion ?? '', registroSanitario: p?.reg?.registroSanitario,
        cantidadEstablecida: l.cantidadReferencia, cantidadRecibida: lotes.reduce((n, x) => n + x.cantidad, 0),
        lotes: lotes.map((x) => ({
          lote: x.codigo, vence: x.vence, venceTexto: x.venceTexto, cantidad: x.cantidad,
          posicion: e.panorama.posiciones.find((q) => q.id === x.posicionId)?.codigo ?? '',
        })),
      }
    }),
  }
}

function validarParaActa(e: EstadoDemo, i: IngresoDemo): string | null {
  const msg = mensajesDeCuadre(
    i.lineas.map((l) => ({ id: l.id, descripcion: producto(e, l.productoId)?.descripcion ?? '', cantidadReferencia: l.cantidadReferencia })),
    i.lotes.map((x) => ({ lineaId: x.lineaId, codigo: x.codigo, cantidad: x.cantidad })),
  )
  if (msg.length) return msg[0].replace(/: (faltan|sobran) .*$/, '').replace(/^Los lotes de (.+) suman (\d+) y la referencia es (\d+)$/, 'Los lotes de $1 suman $2 y la referencia es $3: ajusta los lotes para que coincidan')
  if (i.temperaturaC == null) return 'Falta la temperatura de recepción'
  if (i.tipo === 'DEVOLUCION' && (!i.docOriginalTipo || !i.docOriginalNumero?.trim())) return 'La devolución necesita la factura o boleta original'
  return null
}

function organolepticaDe(e: EstadoDemo, i: IngresoDemo, lote: IngresoDemo['lotes'][number], numero: string): OrganolepticaVista {
  const p = producto(e, lote.lineaId ? i.lineas.find((l) => l.id === lote.lineaId)!.productoId : '')!
  return {
    id: nuevoId(), numero, estado: 'BORRADOR', ingresoId: i.id, ingresoTipo: i.tipo, ingresoLoteId: lote.id, productoId: p.id,
    productoCodigo: p.codigo, producto: p.descripcion, principioActivo: p.principioActivo, registroSanitario: p.reg?.registroSanitario,
    rsVence: p.reg?.rsVence, fabricante: p.reg?.fabricante, formaPresentacion: p.reg?.formaPresentacion ?? p.presentacion,
    lote: lote.codigo, vence: lote.vence, propietario: nombrePropietario(e, i.propietarioId), cantidadLote: lote.cantidad,
    cantidadMuestra: muestraOrganoleptica(lote.cantidad), referencia: i.ocCodigo ?? i.guiaNumero ?? i.docOriginalNumero,
    datos: { certAnalisis: null, checklist: {}, destinoSugerido: null, conclusion: null }, creadaEn: ahora(),
  }
}

// ── Clase pública ───────────────────────────────────────────────────────────

export class MotorEntradas {
  recepcionesDeCompra(): RecepcionCompra[] {
    const e = estadoE()
    return structuredClone(e.compras).map((c) => ({ ...c, ingresoId: e.ingresos.find((i) => i.compraRecepcionId === c.recepcionId)?.id }))
  }

  posicionesDeCuarentena(): PosicionDestino[] {
    const e = estadoE()
    return e.panorama.posiciones.filter((p) => p.tipoArea === 'CUARENTENA').sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
      .map((p) => ({
        id: p.id, codigo: p.codigo, area: 'Cuarentena',
        ocupadas: e.panorama.saldos.filter((s) => s.posicionId === p.id).reduce((n, s) => n + s.cantidad, 0),
      }))
  }

  listarIngresos(): IngresoResumen[] {
    const e = estadoE()
    return [...e.ingresos].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).map((i) => resumen(e, i))
  }

  obtenerIngreso(id: string): IngresoDetalle | null {
    const e = estadoE()
    const i = e.ingresos.find((x) => x.id === id)
    return i ? structuredClone(detalle(e, i)) : null
  }

  crearIngreso(entrada: EntradaIngreso, actor: Actor): ResultadoAccion<{ id: string }> {
    const e = estadoE()
    const perm = sinPermiso(actor, 'ejecutar')
    if (perm) return falla(perm)
    const prop = e.panorama.propietarios.find((p) => p.id === entrada.propietarioId)
    const v = validarEntradaIngreso(entrada, prop)
    if (!v.ok) return falla(Object.values(v.errores)[0] ?? 'Revisa los campos marcados.', v.errores as Record<string, string>)

    const base: IngresoDemo = {
      id: nuevoId(), tipo: entrada.tipo, propietarioId: entrada.propietarioId, confirmado: false,
      contraparteNombre: entrada.contraparteNombre?.trim() || undefined, contraparteRuc: entrada.contraparteRuc?.trim() || undefined,
      guiaNumero: entrada.guiaNumero?.trim() || undefined, docOriginalTipo: entrada.docOriginalTipo,
      docOriginalNumero: entrada.docOriginalNumero?.trim() || undefined, motivo: entrada.motivo?.trim() || undefined,
      verificaciones: {}, creadoEn: ahora(), creadoPor: actor.nombre, lineas: [], lotes: [], versiones: [],
    }
    if (entrada.tipo === 'COMPRA_LOCAL') {
      const rec = e.compras.find((c) => c.recepcionId === entrada.compraRecepcionId)
      if (!rec) return falla('La recepción de Compras no existe o no tiene líneas')
      if (e.ingresos.some((i) => i.compraRecepcionId === rec.recepcionId)) return falla('Esa recepción de Compras ya tiene su ingreso en el WMS')
      base.compraRecepcionId = rec.recepcionId
      base.ocCodigo = rec.ocCodigo
      base.contraparteNombre = rec.proveedorNombre
      base.contraparteRuc = rec.proveedorRuc
      base.guiaNumero = rec.guias
      base.lineas = rec.lineas.map((l) => ({ id: nuevoId(), productoId: l.productoId, cantidadReferencia: l.cantidad }))
      base.copiaCompras = Object.fromEntries(rec.lineas.map((l) => [l.productoId, l.cantidad]))
    } else {
      base.lineas = (entrada.lineas ?? []).map((l) => ({ id: nuevoId(), productoId: l.productoId, cantidadReferencia: Number(l.cantidadReferencia) }))
    }
    e.ingresos.push(base)
    revisarRS(e, base)
    base.versiones.push({ version: 1, motivo: 'Prellenada por el sistema', editadoPor: actor.nombre, editadoEn: ahora(), datos: solicitudDatos(e, base) })
    registrar(e, actor, 'ingreso_creado', 'ingresos', base.ocCodigo ?? base.id.slice(0, 8), `${ETIQUETA_TIPO_INGRESO[base.tipo]} para ${nombrePropietario(e, base.propietarioId)}`)
    return { ok: true, id: base.id }
  }

  editarIngreso(id: string, d: DatosEdicionIngreso, actor: Actor): ResultadoAccion {
    const e = estadoE()
    const perm = sinPermiso(actor, 'ejecutar')
    if (perm) return falla(perm)
    const i = e.ingresos.find((x) => x.id === id)
    if (!i) return falla('Ingreso inexistente')
    const acta = actaVigente(e, id)
    if (acta && acta.firmas.length > 0) return falla('El acta ya tiene firmas: para corregir algo, anúlala con motivo y emite otra')
    if (d.temperaturaC !== undefined) i.temperaturaC = d.temperaturaC ?? undefined
    if (d.bultos !== undefined) i.bultos = d.bultos ?? undefined
    if (d.paletas !== undefined) i.paletas = d.paletas ?? undefined
    if (d.placa !== undefined) i.placa = d.placa.trim() || undefined
    if (d.marcaVehiculo !== undefined) i.marcaVehiculo = d.marcaVehiculo.trim() || undefined
    if (d.tipoConteo !== undefined) i.tipoConteo = d.tipoConteo || undefined
    if (d.horaInicio !== undefined) i.horaInicio = d.horaInicio || undefined
    if (d.horaFin !== undefined) i.horaFin = d.horaFin || undefined
    if (d.verificaciones !== undefined) i.verificaciones = d.verificaciones
    if (d.observaciones !== undefined) i.observaciones = d.observaciones.trim() || undefined
    if (d.facturaNumero !== undefined) i.facturaNumero = d.facturaNumero.trim() || undefined
    if (i.tipo !== 'COMPRA_LOCAL') {
      if (d.guiaNumero !== undefined) i.guiaNumero = d.guiaNumero.trim() || undefined
      if (d.contraparteNombre !== undefined) i.contraparteNombre = d.contraparteNombre.trim() || undefined
      if (d.contraparteRuc !== undefined) i.contraparteRuc = d.contraparteRuc.trim() || undefined
    }
    if (d.motivo !== undefined) i.motivo = d.motivo.trim() || undefined
    if (temperaturaFueraDeRango(i.temperaturaC)) {
      alertar(e, 'TEMPERATURA', 'direccion_tecnica', mensajeTemperatura(i.temperaturaC!), `temp:${i.id}`, i.id)
    }
    registrar(e, actor, 'ingreso_editado', 'ingresos', i.ocCodigo ?? i.id.slice(0, 8), 'Datos de la recepción actualizados')
    return { ok: true }
  }

  guardarLotes(id: string, lineaId: string, lotes: EntradaLote[], actor: Actor): ResultadoAccion {
    const e = estadoE()
    const perm = sinPermiso(actor, 'ejecutar')
    if (perm) return falla(perm)
    const i = e.ingresos.find((x) => x.id === id)
    if (!i) return falla('Ingreso inexistente')
    if (i.confirmado) return falla('El ingreso ya está confirmado: sus lotes no se editan')
    const acta = actaVigente(e, id)
    if (acta && acta.firmas.length > 0) return falla('El acta ya tiene firmas: para corregir los lotes, anúlala con motivo y emite otra')
    const linea = i.lineas.find((l) => l.id === lineaId)
    if (!linea) return falla('La línea no pertenece a este ingreso')

    const nuevos: IngresoDemo['lotes'] = []
    const vistos = new Set<string>()
    for (const [idx, x] of lotes.entries()) {
      const r = validarEntradaLote(x, parsearVencimiento)
      if (!r.ok) return falla(`Lote ${idx + 1}: ${Object.values(r.errores)[0]}`, Object.fromEntries(Object.entries(r.errores).map(([k, v]) => [`${k}-${idx}`, v as string])))
      const codigo = x.codigo.trim()
      if (vistos.has(codigo)) return falla(`El lote ${codigo} está repetido en este producto: junta sus cantidades.`)
      vistos.add(codigo)
      const pos = e.panorama.posiciones.find((p) => p.id === x.posicionId)
      if (!pos || pos.tipoArea !== 'CUARENTENA') return falla('El inventario nuevo nace en Cuarentena: elige una posición de Cuarentena (A-6 a A-9)')
      const lote = asegurarLote(e, linea.productoId, codigo, r.vence, i.propietarioId)
      if ('error' in lote) return falla(lote.error)
      nuevos.push({ id: nuevoId(), lineaId, loteId: lote.id, codigo, vence: r.vence, venceTexto: SOLO_MES_ANIO.test(r.venceTexto) ? r.venceTexto : undefined, cantidad: r.cantidad, posicionId: x.posicionId })
    }
    i.lotes = [...i.lotes.filter((l) => l.lineaId !== lineaId), ...nuevos]
    registrar(e, actor, 'ingreso_lotes_guardados', 'ingreso_lineas', producto(e, linea.productoId)?.codigo ?? '', `${nuevos.length} lote(s) registrados`)
    return { ok: true }
  }

  editarSolicitud(id: string, datos: Record<string, unknown>, motivo: string | undefined, actor: Actor): ResultadoAccion<{ version: number }> {
    const e = estadoE()
    const perm = sinPermiso(actor, 'ejecutar')
    if (perm) return falla(perm)
    const i = e.ingresos.find((x) => x.id === id)
    if (!i) return falla('Ingreso inexistente')
    const version = i.versiones.length + 1
    i.versiones.push({ version, motivo: motivo?.trim() || undefined, editadoPor: actor.nombre, editadoEn: ahora(), datos: { ...solicitudDatos(e, i), ...datos } })
    registrar(e, actor, 'solicitud_editada', 'solicitudes_ingreso', i.ocCodigo ?? i.id.slice(0, 8), `Versión ${version}`, motivo)
    return { ok: true, version }
  }

  generarActa(id: string, actor: Actor): ResultadoAccion<{ actaId: string }> {
    const e = estadoE()
    const perm = sinPermiso(actor, 'ejecutar')
    if (perm) return falla(perm)
    const i = e.ingresos.find((x) => x.id === id)
    if (!i) return falla('Ingreso inexistente')
    const motivo = puedeGenerarActa({ cuadra: cuadra(i), tieneTemperatura: i.temperaturaC != null, tipo: i.tipo, tieneDocOriginal: !!i.docOriginalTipo && !!i.docOriginalNumero?.trim() })
    if (motivo) {
      const detalleCuadre = mensajesDeCuadre(
        i.lineas.map((l) => ({ id: l.id, descripcion: producto(e, l.productoId)?.descripcion ?? '', cantidadReferencia: l.cantidadReferencia })),
        i.lotes.map((x) => ({ lineaId: x.lineaId, codigo: x.codigo, cantidad: x.cantidad })),
      )[0]
      return falla(detalleCuadre ?? motivo)
    }
    const vigente = actaVigente(e, id)
    if (vigente) {
      if (vigente.estado === 'FIRMADA') return falla(`Este ingreso ya tiene su acta firmada (${vigente.numero})`)
      if (vigente.firmas.length > 0) return falla(`El acta ${vigente.numero} ya tiene firmas: para corregir algo, anúlala con motivo y emite otra`)
      vigente.contenido = contenidoActa(e, i, vigente.numero)
      vigente.hash = hashDe(vigente.contenido)
      return { ok: true, actaId: vigente.id }
    }
    const numero = siguienteCorrelativo(e, 'I')
    const contenido = contenidoActa(e, i, numero)
    const acta: ActaDemo = { id: nuevoId(), ingresoId: id, numero, estado: 'BORRADOR', hash: hashDe(contenido), generadaEn: ahora(), contenido, firmas: [] }
    e.actas.push(acta)
    registrar(e, actor, 'acta_recepcion_generada', 'actas_recepcion', numero, 'Acta de Recepción generada')
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
    registrar(e, actor, 'acta_recepcion_anulada', 'actas_recepcion', a.numero, 'Acta anulada', motivo)
    return { ok: true }
  }

  reemitirActa(actaId: string, actor: Actor): ResultadoAccion<{ actaId: string }> {
    const e = estadoE()
    const perm = sinPermiso(actor, 'ejecutar')
    if (perm) return falla(perm)
    const a = e.actas.find((x) => x.id === actaId)
    if (!a || a.estado !== 'ANULADA') return falla('Solo se reemite un acta anulada')
    if (e.actas.some((x) => x.reemplazaA === actaId)) return falla('Esa acta ya fue reemitida')
    const i = e.ingresos.find((x) => x.id === a.ingresoId)!
    const numero = siguienteCorrelativo(e, 'I')
    const contenido = contenidoActa(e, i, numero)
    const nueva: ActaDemo = { id: nuevoId(), ingresoId: i.id, numero, estado: 'BORRADOR', hash: hashDe(contenido), generadaEn: ahora(), contenido, firmas: [], reemplazaA: a.id }
    e.actas.push(nueva)
    const exp = e.expedientes.find((x) => x.id === i.expedienteId)
    if (exp) exp.documentos.push({ id: nuevoId(), tipo: 'ACTA_RECEPCION', descripcion: `Acta de Recepción ${numero} (reemplaza a ${a.numero})`, agregadoEn: ahora(), referenciaTipo: 'acta_recepcion', referenciaId: nueva.id })
    registrar(e, actor, 'acta_recepcion_reemitida', 'actas_recepcion', numero, `Reemplaza al acta ${a.numero}`)
    return { ok: true, actaId: nueva.id }
  }

  confirmarIngreso(id: string, actor: Actor): ResultadoAccion {
    const e = estadoE()
    const perm = sinPermiso(actor, 'ejecutar')
    if (perm) return falla(perm)
    const i = e.ingresos.find((x) => x.id === id)
    if (!i) return falla('Ingreso inexistente')
    if (i.confirmado) return falla('Este ingreso ya está confirmado')
    const problema = validarParaActa(e, i)
    if (problema) return falla(problema)
    const acta = e.actas.find((a) => a.ingresoId === id && a.estado === 'FIRMADA')
    if (!acta) return falla('Para confirmar el ingreso, el acta de recepción tiene que estar firmada por las cuatro partes')

    for (const x of i.lotes) {
      const l = i.lineas.find((y) => y.id === x.lineaId)!
      e.panorama.saldos.push({
        posicionId: x.posicionId, productoId: l.productoId, loteId: x.loteId, propietarioId: i.propietarioId,
        estado: 'CUARENTENA', procedenciaId: x.id, cantidad: x.cantidad,
      })
    }
    i.confirmado = true
    i.confirmadoEn = ahora()
    generarExpedienteDemo(e, i, acta, actor)
    const exp = e.expedientes.find((x) => x.id === i.expedienteId)!
    for (const x of i.lotes) {
      const numero = siguienteCorrelativo(e, 'O')
      const o = organolepticaDe(e, i, x, numero)
      o.actaRecepcion = acta.numero
      e.organolepticas.push(o)
      exp.faltantes.push({ id: nuevoId(), tipo: 'ACTA_ORGANOLEPTICA', documento: `Acta organoléptica ${numero} · ${o.producto} · lote ${o.lote}`, responsable: 'Dirección Técnica', estado: 'ABIERTO' })
    }
    revisarRS(e, i)
    registrar(e, actor, 'ingreso_confirmado', 'ingresos', acta.numero, 'El inventario nació en Cuarentena')
    return { ok: true }
  }

  // ── Calidad ───────────────────────────────────────────────────────────────

  obtenerOrganoleptica(id: string): OrganolepticaVista | null {
    const e = estadoE()
    const o = e.organolepticas.find((x) => x.id === id)
    return o ? organolepticaVista(e, o) : null
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
    const saldos = e.panorama.saldos.filter((s) => s.procedenciaId === o.ingresoLoteId && s.estado === 'CUARENTENA' && s.cantidad > 0)
    if (saldos.length === 0) return falla('Estas unidades ya no están en Cuarentena: no hay nada que decidir')
    for (const s of saldos) s.estado = decision
    o.estado = 'FIRMADA'
    o.decision = decision
    o.decididoPor = actor.nombre
    o.decididoEn = ahora()
    o.observacionDt = observacion?.trim() || undefined
    o.hash = hashDe({ ...o, hash: undefined })
    if (decision === 'APROBADO') e.aprobadoEn[o.ingresoLoteId] = ahora()
    const i = e.ingresos.find((x) => x.id === o.ingresoId)
    const exp = e.expedientes.find((x) => x.id === i?.expedienteId)
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
      organolepticas: e.organolepticas.filter((o) => o.estado === 'PENDIENTE_DT').map((o) => organolepticaVista(e, o)),
      borradores: e.organolepticas.filter((o) => o.estado === 'BORRADOR').map((o) => organolepticaVista(e, o)),
      decididas: e.organolepticas.filter((o) => o.estado === 'FIRMADA').sort((a, b) => (b.decididoEn ?? '').localeCompare(a.decididoEn ?? '')).slice(0, 10).map((o) => organolepticaVista(e, o)),
      productosPorValidar: e.panorama.productos.filter((p) => p.reg && p.reg.estadoValidacion !== 'VALIDADO')
        .map((p) => ({ id: p.id, codigo: p.codigo, descripcion: p.descripcion, estado: p.reg!.estadoValidacion })),
      alertas: alertas.filter((a) => a.estado === 'ABIERTA' && a.destinatario === 'direccion_tecnica'),
    }
  }

  // ── Alertas ───────────────────────────────────────────────────────────────

  listarAlertas(): AlertaVista[] {
    const e = estadoE()
    revisarDivergencias(e)
    revisarPorTrasladar(e)
    revisarVencimientos(e)
    return structuredClone(e.alertas).map((a) => { delete (a as { clave?: string }).clave; return a })
  }

  contarAlertasAbiertas(): { direccion_tecnica: number; jefe_almacen: number } {
    const e = estadoE()
    const abiertas = e.alertas.filter((a) => a.estado === 'ABIERTA')
    return { direccion_tecnica: abiertas.filter((a) => a.destinatario === 'direccion_tecnica').length, jefe_almacen: abiertas.filter((a) => a.destinatario === 'jefe_almacen').length }
  }

  atenderAlerta(id: string, nota: string | undefined, actor: Actor): ResultadoAccion {
    const e = estadoE()
    const a = e.alertas.find((x) => x.id === id)
    if (!a) return falla('Alerta inexistente')
    if (!puedeAtenderAlerta(actor.roles, a.tipo)) return falla(`Esta alerta la atiende ${a.destinatario === 'jefe_almacen' ? 'el Jefe de Almacén' : 'Dirección Técnica'}`)
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
      documentos: x.documentos.length, ingresos: e.ingresos.filter((i) => i.expedienteId === x.id).length,
    }))
  }

  obtenerExpediente(id: string): ExpedienteVista | null {
    const e = estadoE()
    const x = e.expedientes.find((y) => y.id === id)
    if (!x) return null
    return structuredClone({
      ...x,
      ingresos: e.ingresos.filter((i) => i.expedienteId === id).map((i) => ({
        id: i.id, tipo: i.tipo, actaNumero: e.actas.find((a) => a.ingresoId === i.id && a.estado === 'FIRMADA')?.numero,
        unidades: i.lotes.reduce((n, l) => n + l.cantidad, 0), confirmadoEn: i.confirmadoEn,
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

  // ── Búsqueda (OC y actas) ─────────────────────────────────────────────────

  buscarEntradas(consulta: string): ResultadoBusqueda[] {
    const e = estadoE()
    const out: ResultadoBusqueda[] = []
    for (const i of e.ingresos) {
      const acta = actaVigente(e, i.id) ?? [...e.actas].reverse().find((a) => a.ingresoId === i.id)
      if (i.ocCodigo && buscarEnTexto(consulta, i.ocCodigo)) {
        out.push({ tipo: 'oc', id: i.id, titulo: `${i.ocCodigo} · ${i.contraparteNombre ?? ''}`.trim(), detalle: `${ETIQUETA_TIPO_INGRESO[i.tipo]} · ${acta ? `acta ${acta.numero}` : 'sin acta todavía'}`, posiciones: [], unidades: i.lineas.reduce((n, l) => n + l.cantidadReferencia, 0), puntaje: 30, href: `/entradas/${i.id}` })
      }
      for (const a of e.actas.filter((x) => x.ingresoId === i.id)) {
        if (buscarEnTexto(consulta, a.numero)) {
          out.push({ tipo: 'acta', id: a.id, titulo: `Acta ${a.numero}${a.estado === 'ANULADA' ? ' (anulada)' : ''}`, detalle: `${ETIQUETA_TIPO_INGRESO[i.tipo]} · ${nombrePropietario(e, i.propietarioId)}`, posiciones: [], unidades: 0, puntaje: 35, href: `/entradas/${i.id}` })
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

function revisarDivergencias(e: EstadoDemo) {
  for (const i of e.ingresos) {
    if (!i.confirmado || !i.copiaCompras || !i.compraRecepcionId) continue
    const rec = e.compras.find((c) => c.recepcionId === i.compraRecepcionId)
    for (const [productoId, copia] of Object.entries(i.copiaCompras)) {
      const actual = rec?.cantidadActual?.[productoId] ?? rec?.lineas.find((l) => l.productoId === productoId)?.cantidad
      if (actual !== undefined && actual !== copia) {
        alertar(e, 'DIVERGENCIA_COMPRAS', 'jefe_almacen',
          `Compras cambió la cantidad de ${producto(e, productoId)?.descripcion}: el WMS recibió ${copia} y Compras ahora dice ${actual}. Revísalo; el WMS no cambia solo.`,
          `div:${i.id}:${productoId}`, i.id, productoId)
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
    const yaTuvo = (clave: string) => e.alertas.some((a) => (a as AlertaVista & { clave?: string }).clave === clave)
    if (sit === 'VENCIDO') {
      for (const a of e.alertas) if (a.estado === 'ABIERTA' && (a as AlertaVista & { clave?: string }).clave === `lote-por-vencer:${loteId}`) { a.estado = 'ATENDIDA'; a.atendidaEn = ahora(); a.nota = 'El lote venció' }
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

function solicitudDatos(e: EstadoDemo, i: IngresoDemo): Record<string, unknown> {
  return {
    tipo: i.tipo, propietario: nombrePropietario(e, i.propietarioId), contraparteNombre: i.contraparteNombre, contraparteRuc: i.contraparteRuc,
    ocCodigo: i.ocCodigo, guiaNumero: i.guiaNumero, docOriginalNumero: i.docOriginalNumero, motivo: i.motivo, observaciones: i.observaciones,
    lineas: i.lineas.map((l) => ({
      producto: producto(e, l.productoId)?.descripcion, rs: producto(e, l.productoId)?.reg?.registroSanitario, cantidad: l.cantidadReferencia,
      lotes: i.lotes.filter((x) => x.lineaId === l.id).map((x) => ({ lote: x.codigo, vence: x.vence, cantidad: x.cantidad })),
    })),
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
  const prod = (n: number) => producto(e, idProd(n))!
  const rec = (n: number, oc: string, proveedor: string, ruc: string, guias: string, lineas: [number, number][]): RecepcionCompra => ({
    recepcionId: `compras-rec:${n}`, ocCodigo: oc, proveedorNombre: proveedor, proveedorRuc: ruc, fecha: sumarDias(hoy, -n), guias,
    lineas: lineas.map(([p, c]) => ({ productoId: idProd(p), codigo: prod(p).codigo, descripcion: prod(p).descripcion, cantidad: c })),
  })
  e.compras = [
    rec(1, 'OC-DEMO-0001', 'Distribuidora Andina S.A.C.', '20100000001', 'T001-00412', [[7, 120]]),
    rec(2, 'OC-DEMO-0002', 'Droguería Pacífico S.A.C.', '20100000002', 'T002-00871', [[2, 6]]),
    rec(3, 'OC-DEMO-0003', 'Laboratorios del Sur S.A.', '20100000003', 'T001-00088', [[15, 50]]),
    rec(4, 'OC-DEMO-0004', 'Distribuidora Andina S.A.C.', '20100000001', 'T001-00433', [[3, 300]]),
    rec(5, 'OC-DEMO-0005', 'Droguería Pacífico S.A.C.', '20100000002', 'T002-00902', [[6, 84], [5, 60]]),
    rec(6, 'OC-DEMO-0006', 'Laboratorios del Sur S.A.', '20100000003', 'T001-00101', [[8, 200]]),
  ]
  const logissa = e.panorama.propietarios.find((p) => p.esDuenoAlmacen)!.id
  const triamed = e.panorama.propietarios.find((p) => p.codigo === 'TRIAMED')!.id
  const pos = (c: string) => e.panorama.posiciones.find((p) => p.codigo === c)!.id
  const datos = { temperaturaC: 21, bultos: 8, paletas: 1, placa: 'ABC-123', marcaVehiculo: 'Hyundai', tipoConteo: 'TOTAL' as const, horaInicio: horasAtras(2), horaFin: horasAtras(1) }

  const firmarTodo = (actaId: string) => {
    eng.firmarActa(actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE)
    eng.firmarActa(actaId, { rol: 'DIRECCION_TECNICA' }, KATIA)
    eng.firmarActa(actaId, { rol: 'RESPONSABLE_CONTEO' }, AUX)
    eng.firmarActa(actaId, { rol: 'TRANSPORTISTA', nombre: 'Pedro Quispe', dni: '45678912', placa: 'ABC-123', imagen: FIRMA_PNG }, CHARLIE)
  }

  {
    // 1) Compra confirmada, con acta organoléptica ya enviada a Katia y otra en borrador.
    const a = eng.crearIngreso({ tipo: 'COMPRA_LOCAL', propietarioId: logissa, compraRecepcionId: 'compras-rec:1' }, CHARLIE)
    if (a.ok) {
      const ing = e.ingresos.find((i) => i.id === a.id)!
      eng.guardarLotes(a.id, ing.lineas[0].id, [
        { codigo: 'L24071', cantidad: 80, vence: '30/11/2028', posicionId: pos('A-6') },
        { codigo: 'L24072', cantidad: 40, vence: '03/2029', posicionId: pos('A-7') },
      ], CHARLIE)
      eng.editarIngreso(a.id, { ...datos, verificaciones: { cantidadCorresponde: true, cajasSelladas: true, embalajeLimpio: true } }, CHARLIE)
      const g = eng.generarActa(a.id, CHARLIE)
      if (g.ok) firmarTodo(g.actaId)
      eng.confirmarIngreso(a.id, CHARLIE)
      const orgs = e.organolepticas.filter((o) => o.ingresoId === a.id)
      if (orgs[0]) eng.guardarOrganoleptica(orgs[0].id, { certAnalisis: true, checklist: checklistConforme(), destinoSugerido: 'APROBADO', conclusion: 'CONFORME', observacion: 'Sin observaciones.' }, true, SANDRA)
      // Compras corrige la cantidad después: el WMS solo alerta (D-19).
      e.compras[0].cantidadActual = { [idProd(7)]: 118 }
    }
    // 2) Compra a medio registrar: "4 de 6" y temperatura fuera de rango.
    const b = eng.crearIngreso({ tipo: 'COMPRA_LOCAL', propietarioId: logissa, compraRecepcionId: 'compras-rec:2' }, CHARLIE)
    if (b.ok) {
      const ing = e.ingresos.find((i) => i.id === b.id)!
      eng.guardarLotes(b.id, ing.lineas[0].id, [{ codigo: 'M5530', cantidad: 4, vence: '15/08/2028', posicionId: pos('A-8') }], CHARLIE)
      eng.editarIngreso(b.id, { temperaturaC: 31.5, bultos: 2, paletas: 1, placa: 'XYZ-987', marcaVehiculo: 'Toyota', tipoConteo: 'TOTAL' }, CHARLIE)
    }
    // 3) Compra de un producto con registro sanitario vencido: se recibe, pero no se podrá aprobar.
    const c = eng.crearIngreso({ tipo: 'COMPRA_LOCAL', propietarioId: logissa, compraRecepcionId: 'compras-rec:3' }, CHARLIE)
    if (c.ok) {
      const ing = e.ingresos.find((i) => i.id === c.id)!
      eng.guardarLotes(c.id, ing.lineas[0].id, [{ codigo: 'Z9910', cantidad: 50, vence: '28/02/2029', posicionId: pos('A-9') }], CHARLIE)
      eng.editarIngreso(c.id, datos, CHARLIE)
      const g = eng.generarActa(c.id, CHARLIE)
      if (g.ok) firmarTodo(g.actaId)
      eng.confirmarIngreso(c.id, CHARLIE)
      const o = e.organolepticas.find((x) => x.ingresoId === c.id)
      if (o) eng.guardarOrganoleptica(o.id, { certAnalisis: true, checklist: checklistConforme(), destinoSugerido: 'APROBADO', conclusion: 'CONFORME' }, true, SANDRA)
    }
    // 4) Devolución de Triamed con el acta a medio firmar.
    const d = eng.crearIngreso({
      tipo: 'DEVOLUCION', propietarioId: triamed, contraparteNombre: 'Clínica San Lucas', guiaNumero: 'T005-00231',
      docOriginalTipo: 'FACTURA', docOriginalNumero: 'F001-004412', motivo: 'Producto sin rotación; el cliente lo devuelve',
      lineas: [{ productoId: idProd(10), cantidadReferencia: 24 }],
    }, CHARLIE)
    if (d.ok) {
      const ing = e.ingresos.find((i) => i.id === d.id)!
      eng.guardarLotes(d.id, ing.lineas[0].id, [{ codigo: 'C77201', cantidad: 24, vence: '31/07/2027', posicionId: pos('A-7') }], CHARLIE)
      eng.editarIngreso(d.id, datos, CHARLIE)
      const g = eng.generarActa(d.id, CHARLIE)
      if (g.ok) {
        eng.firmarActa(g.actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE)
        eng.firmarActa(g.actaId, { rol: 'RESPONSABLE_CONTEO' }, AUX)
      }
    }
    // El "aprobado por trasladar" del Batch 1 lleva más del plazo (D-28).
    const traslado = e.panorama.lotes.find((l) => l.codigo === 'L-TRASLADO')
    const s = e.panorama.saldos.find((x) => x.loteId === traslado?.id)
    if (s) e.aprobadoEn[s.procedenciaId] = horasAtras(30)
  }
}

// ── Fachada asíncrona (la interfaz del repositorio) ─────────────────────────

const motor = () => new MotorEntradas()

export class EntradasDemo {
  async recepcionesDeCompra() { return motor().recepcionesDeCompra() }
  async posicionesDeCuarentena() { return motor().posicionesDeCuarentena() }
  async listarIngresos() { return motor().listarIngresos() }
  async obtenerIngreso(id: string) { return motor().obtenerIngreso(id) }
  async crearIngreso(entrada: EntradaIngreso, actor: Actor) { return motor().crearIngreso(entrada, actor) }
  async editarIngreso(id: string, d: DatosEdicionIngreso, actor: Actor) { return motor().editarIngreso(id, d, actor) }
  async guardarLotes(id: string, lineaId: string, lotes: EntradaLote[], actor: Actor) { return motor().guardarLotes(id, lineaId, lotes, actor) }
  async editarSolicitud(id: string, datos: Record<string, unknown>, motivo: string | undefined, actor: Actor) { return motor().editarSolicitud(id, datos, motivo, actor) }
  async generarActa(id: string, actor: Actor) { return motor().generarActa(id, actor) }
  async firmarActa(actaId: string, firma: FirmaEntrada, actor: Actor) { return motor().firmarActa(actaId, firma, actor) }
  async anularActa(actaId: string, motivo: string, actor: Actor) { return motor().anularActa(actaId, motivo, actor) }
  async reemitirActa(actaId: string, actor: Actor) { return motor().reemitirActa(actaId, actor) }
  async confirmarIngreso(id: string, actor: Actor) { return motor().confirmarIngreso(id, actor) }
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
