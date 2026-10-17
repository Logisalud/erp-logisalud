import 'server-only'

import { mensajeHumanoSunat, type PayloadNubefact, type RespuestaEmision } from '@/domain/guia-electronica'
import type { ClienteNubefact } from './cliente'

/** Una guía simulada, para mostrarla en pantalla como «PDF» (no existe ante SUNAT). */
export interface GuiaSimulada { numero: string; serie: string; correlativo: number; emitidaEn: string; payload: PayloadNubefact }

interface Almacen { correlativos: Map<string, number>; guias: Map<string, GuiaSimulada> }
const g = globalThis as { __wmsNubefactSimulado?: Almacen }
const almacen = (): Almacen => (g.__wmsNubefactSimulado ??= { correlativos: new Map(), guias: new Map() })

/** Reinicia el simulador (las pruebas). */
export function reiniciarSimuladorNubefact() { g.__wmsNubefactSimulado = undefined }
export const guiaSimulada = (numero: string) => almacen().guias.get(numero.toUpperCase())

const formatoPlaca = /^[A-Z0-9]{6}$/
const rucValido = (r: string) => /^(10|15|17|20)\d{9}$/.test(r)

/** Valida lo mismo que SUNAT pide a una guía remitente y responde con el mismo contrato que Nubefact, para probar todo sin emitir nada real. */
export class SimuladorNubefact implements ClienteNubefact {
  readonly modo = 'SIMULADOR' as const
  static compartido() { return new SimuladorNubefact() }

  async emitirGuia(p: PayloadNubefact): Promise<RespuestaEmision> {
    const rechazo = (codigo: string, texto: string): RespuestaEmision => ({ ok: false, error: mensajeHumanoSunat(codigo, texto), reintentable: false })
    if (!rucValido(p.cliente_numero_de_documento)) return rechazo('2325', 'RUC del destinatario inválido')
    if (!formatoPlaca.test(p.transportista_placa_numero.replace(/-/g, '').toUpperCase())) return rechazo('2329', 'Placa del vehículo inválida')
    if (!/^\d{6}$/.test(p.punto_de_llegada_ubigeo) || !/^\d{6}$/.test(p.punto_de_partida_ubigeo)) return rechazo('2643', 'Ubigeo inválido')
    if (!(Number(p.peso_bruto_total) > 0)) return rechazo('2780', 'Peso bruto inválido')
    if (p.items.length === 0 || p.items.some((i) => !(Number(i.cantidad) > 0))) return rechazo('0000', 'La guía necesita al menos un producto con cantidad')
    const a = almacen()
    const correlativo = (a.correlativos.get(p.serie) ?? 0) + 1
    a.correlativos.set(p.serie, correlativo)
    const numero = `${p.serie}-${String(correlativo).padStart(8, '0')}`
    a.guias.set(numero, { numero, serie: p.serie, correlativo, emitidaEn: new Date().toISOString(), payload: p })
    return {
      ok: true, numero, enlace: `/simulador-nubefact/${numero}`, enlaceXml: `/simulador-nubefact/${numero}?formato=xml`, hash: `SIM${Buffer.from(numero).toString('base64').replace(/=/g, '')}`,
      estadoSunat: 'ACEPTADA', entorno: 'SIMULADOR', cruda: { simulado: true, aceptada_por_sunat: true, serie: p.serie, numero: correlativo },
    }
  }
}
