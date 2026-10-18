import 'server-only'

import { modoDemoActivo } from '@/lib/demo'
import type { ModoNubefact, PayloadConsulta, PayloadNubefact, RespuestaConsulta, RespuestaEmision } from '@/domain/guia-electronica'
import { ClienteNubefactHttp } from './http'
import { SimuladorNubefact } from './simulador'

/** El puerto con Nubefact, en sus dos pasos: generar la guía (la manda a SUNAT) y consultarla (trae PDF, XML y CDR cuando SUNAT la acepta).
 *  La baja ante SUNAT no se cablea: Nubefact solo la permite desde el portal de SUNAT con Clave SOL (D-90). */
export interface ClienteNubefact {
  readonly modo: ModoNubefact
  emitirGuia(payload: PayloadNubefact): Promise<RespuestaEmision>
  consultarGuia(consulta: PayloadConsulta): Promise<RespuestaConsulta>
}

export class NubefactNoConfigurado extends Error {}

/**
 * Qué cliente usar, según el entorno:
 *   NUBEFACT_MODO = SIMULADOR (por defecto) | PRUEBA | PRODUCCION
 *   NUBEFACT_URL, NUBEFACT_TOKEN — credenciales, solo como variables de entorno (nunca en el código ni en la base de datos)
 *   NUBEFACT_PRODUCCION_APROBADA = SI — el candado: sin esto, PRODUCCION no emite. Lo pone Sebas cuando lo apruebe.
 * En la demostración siempre se usa el simulador.
 */
export function clienteNubefact(): ClienteNubefact {
  if (modoDemoActivo()) return SimuladorNubefact.compartido()
  const modo = (process.env.NUBEFACT_MODO ?? 'SIMULADOR').toUpperCase()
  if (modo === 'SIMULADOR') return SimuladorNubefact.compartido()
  if (modo !== 'PRUEBA' && modo !== 'PRODUCCION') throw new NubefactNoConfigurado(`NUBEFACT_MODO no es válido (${modo}): usa SIMULADOR, PRUEBA o PRODUCCION`)
  const url = process.env.NUBEFACT_URL
  const token = process.env.NUBEFACT_TOKEN
  if (!url || !token) throw new NubefactNoConfigurado('La conexión con Nubefact no está configurada (faltan NUBEFACT_URL y NUBEFACT_TOKEN en el entorno)')
  if (modo === 'PRODUCCION' && process.env.NUBEFACT_PRODUCCION_APROBADA !== 'SI') {
    throw new NubefactNoConfigurado('Producción de Nubefact todavía no está aprobada: no se emite ninguna guía real hasta que Sebas lo apruebe')
  }
  return new ClienteNubefactHttp({ url, token, modo })
}

/** El modo que se mostrará en pantalla antes de emitir (sin lanzar si falta configuración). */
export function modoNubefactActual(): ModoNubefact {
  if (modoDemoActivo()) return 'SIMULADOR'
  const m = (process.env.NUBEFACT_MODO ?? 'SIMULADOR').toUpperCase()
  return m === 'PRUEBA' || m === 'PRODUCCION' ? m : 'SIMULADOR'
}
