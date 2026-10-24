import 'server-only'

import { formatoNumeroGuia, mensajeHumanoSunat, type PayloadConsulta, type PayloadNubefact, type RespuestaConsulta, type RespuestaEmision } from '@/domain/guia-electronica'
import type { CausaNubefact } from '@/domain/numeracion-guias'
import type { ClienteNubefact, ResultadoPruebaConexion } from './cliente'

/** Una guía simulada, para mostrarla en pantalla como «PDF» (no existe ante SUNAT). */
export interface GuiaSimulada { numero: string; serie: string; correlativo: number; emitidaEn: string; payload: PayloadNubefact; consultas: number; /** 'PANEL': la emitió alguien desde el panel de Nubefact (prueba de la numeración). */ origen?: 'WMS' | 'PANEL' }

interface Almacen { guias: Map<string, GuiaSimulada>; consultasPendientes: number; rechazoDe: Map<string, string>; anuladas: Set<string>; ultimoPorSerie: Map<string, number>; fallosDeRed: number; fallosLlegan: boolean }
const g = globalThis as { __wmsNubefactSimulado?: Almacen }
const almacen = (): Almacen => (g.__wmsNubefactSimulado ??= { guias: new Map(), consultasPendientes: 0, rechazoDe: new Map(), anuladas: new Set(), ultimoPorSerie: new Map(), fallosDeRed: 0, fallosLlegan: false })

/** Reinicia el simulador (las pruebas). */
export function reiniciarSimuladorNubefact() { g.__wmsNubefactSimulado = undefined }
export const guiaSimulada = (numero: string) => almacen().guias.get(numero.toUpperCase())
/** Para las pruebas: las próximas N consultas responden «SUNAT todavía no responde». */
export const retrasarAceptacionSimulada = (consultas: number) => { almacen().consultasPendientes = consultas }
/** Para las pruebas de la numeración: alguien emite una guía DESDE EL PANEL de Nubefact (toma el número que diga o el siguiente de la serie). Devuelve el número tomado. */
export function emitirDesdePanelSimulado(serie: string, numero?: number): number {
  const a = almacen(); const n = numero ?? (a.ultimoPorSerie.get(serie) ?? 0) + 1
  a.guias.set(formatoNumeroGuia(serie, n), { numero: formatoNumeroGuia(serie, n), serie, correlativo: n, emitidaEn: new Date().toISOString(), payload: {} as PayloadNubefact, consultas: 0, origen: 'PANEL' })
  a.ultimoPorSerie.set(serie, Math.max(a.ultimoPorSerie.get(serie) ?? 0, n))
  return n
}
/** Para las pruebas: la guía se da de baja en el panel de Nubefact; la próxima consulta lo dirá (`anulado`). */
export const anularEnPanelSimulado = (numero: string) => { almacen().anuladas.add(numero.toUpperCase()) }
/** Para las pruebas: los próximos N envíos no tienen respuesta (se cortó la red). Con `llegaANubefact`, Nubefact SÍ recibió la guía y lo que se perdió fue la respuesta: el resultado es incierto. */
export const cortarRedSimulada = (envios: number, opciones: { llegaANubefact?: boolean } = {}) => { const a = almacen(); a.fallosDeRed = envios; a.fallosLlegan = !!opciones.llegaANubefact }
/** Para las pruebas: SUNAT rechazará esa guía en la consulta con este motivo. */
export const rechazarGuiaSimulada = (numero: string, motivo: string) => { almacen().rechazoDe.set(numero.toUpperCase(), motivo) }

const formatoPlaca = /^[A-Z0-9]{6,8}$/
const rucValido = (r: string) => /^(10|15|17|20)\d{9}$/.test(r)

/** Valida lo mismo que SUNAT pide a una guía remitente y responde con el mismo contrato de dos pasos que Nubefact, para probar todo sin emitir nada real. */
export class SimuladorNubefact implements ClienteNubefact {
  readonly modo = 'SIMULADOR' as const
  static compartido() { return new SimuladorNubefact() }

  async emitirGuia(p: PayloadNubefact): Promise<RespuestaEmision> {
    const rechazo = (codigo: string, texto: string, causa?: CausaNubefact, numeroEsperado?: number): RespuestaEmision => ({ ok: false, error: mensajeHumanoSunat(codigo, texto), reintentable: false, causa, numeroEsperado })
    const a = almacen()
    const sinRespuesta = a.fallosDeRed > 0
    if (sinRespuesta) a.fallosDeRed -= 1
    if (sinRespuesta && !a.fallosLlegan) return { ok: false, error: 'Nubefact no respondió. No se emitió nada: intenta de nuevo.', reintentable: true }
    if (!/^T[A-Z0-9]{3}$/.test(p.serie)) return rechazo('0000', 'La serie de una guía remitente empieza con T')
    if (!Number.isInteger(p.numero) || p.numero < 1 || p.numero > 99_999_999) return rechazo('0000', 'El número de la guía debe ser un entero de 1 a 8 dígitos')
    if (p.cliente_tipo_de_documento === 1 ? !/^\d{8}$/.test(p.cliente_numero_de_documento) : !rucValido(p.cliente_numero_de_documento)) return rechazo('2325', p.cliente_tipo_de_documento === 1 ? 'DNI del destinatario inválido' : 'RUC del destinatario inválido')
    if (!formatoPlaca.test(p.transportista_placa_numero)) return rechazo('2329', 'Placa del vehículo inválida (sin guiones, de 6 a 8 letras y números)')
    if (!/^\d{6}$/.test(p.punto_de_llegada_ubigeo) || !/^\d{6}$/.test(p.punto_de_partida_ubigeo)) return rechazo('2643', 'Ubigeo inválido')
    if (!(Number(p.peso_bruto_total) > 0)) return rechazo('2780', 'Peso bruto inválido')
    if (!/^[A-Z0-9]{9,10}$/.test(p.conductor_numero_licencia)) return rechazo('2338', 'Licencia del conductor inválida')
    if (p.items.length === 0 || p.items.some((i) => !(Number(i.cantidad) > 0))) return rechazo('0000', 'La guía necesita al menos un producto con cantidad')
    const numero = formatoNumeroGuia(p.serie, p.numero)
    if (a.guias.has(numero)) return rechazo('1033', 'El comprobante ya fue registrado', 'NUMERO_EXISTE')
    // Como Nubefact: el número sigue al último de la serie, sin saltos (si la serie ya tiene guías)
    const ultimo = a.ultimoPorSerie.get(p.serie)
    if (ultimo !== undefined && p.numero > ultimo + 1) return rechazo('0000', `El número de la guía no es correlativo: el siguiente debe ser ${ultimo + 1}`, 'NUMERO_SALTO', ultimo + 1)
    a.guias.set(numero, { numero, serie: p.serie, correlativo: p.numero, emitidaEn: new Date().toISOString(), payload: p, consultas: 0, origen: 'WMS' })
    a.ultimoPorSerie.set(p.serie, Math.max(ultimo ?? 0, p.numero))
    if (sinRespuesta) return { ok: false, error: 'Nubefact no respondió. No se emitió nada: intenta de nuevo.', reintentable: true }
    return { ok: true, numero, hash: '', estadoSunat: 'PENDIENTE', entorno: 'SIMULADOR', cruda: { simulado: true, aceptada_por_sunat: false, serie: p.serie, numero: p.numero, enlace_del_pdf: '' } }
  }

  async consultarGuia(c: PayloadConsulta): Promise<RespuestaConsulta> {
    const a = almacen()
    const numero = formatoNumeroGuia(c.serie, c.numero)
    const guia = a.guias.get(numero)
    if (!guia) return { ok: false, error: `Nubefact no tiene la guía ${numero}`, reintentable: false, causa: 'NO_ENCONTRADA' }
    guia.consultas += 1
    if (a.anuladas.has(numero)) return { ok: true, estadoSunat: 'PENDIENTE', anuladaEnNubefact: true, cruda: { simulado: true, anulado: true } }
    const motivo = a.rechazoDe.get(numero)
    if (motivo) return { ok: true, estadoSunat: 'RECHAZADA', error: mensajeHumanoSunat(undefined, motivo), cruda: { simulado: true, aceptada_por_sunat: false, sunat_description: motivo } }
    if (a.consultasPendientes > 0) { a.consultasPendientes -= 1; return { ok: true, estadoSunat: 'PENDIENTE', cruda: { simulado: true, aceptada_por_sunat: false } } }
    return {
      ok: true, estadoSunat: 'ACEPTADA', enlace: `/simulador-nubefact/${numero}`, enlaceXml: `/simulador-nubefact/${numero}?formato=xml`, enlaceCdr: `/simulador-nubefact/${numero}?formato=cdr`,
      hash: `SIM${Buffer.from(numero).toString('base64').replace(/=/g, '')}`, cruda: { simulado: true, aceptada_por_sunat: true, serie: c.serie, numero: c.numero },
    }
  }

  async probarConexion(): Promise<ResultadoPruebaConexion> { return { ok: true, detalle: 'El simulador siempre responde: no hay conexión real que probar.' } }
}
