import 'server-only'

import { esPreviewDeDemostracion, modoDemoActivo } from '@/lib/demo'
import type { ModoNubefact, PayloadConsulta, PayloadNubefact, RespuestaConsulta, RespuestaEmision } from '@/domain/guia-electronica'
import { ClienteNubefactHttp } from './http'
import { SimuladorNubefact } from './simulador'

/** El puerto con Nubefact, en sus dos pasos: generar la guía (la manda a SUNAT) y consultarla (trae PDF, XML y CDR cuando SUNAT la acepta).
 *  La baja ante SUNAT no se cablea: Nubefact solo la permite desde el portal de SUNAT con Clave SOL (D-90). */
export interface ClienteNubefact {
  readonly modo: ModoNubefact
  emitirGuia(payload: PayloadNubefact): Promise<RespuestaEmision>
  consultarGuia(consulta: PayloadConsulta): Promise<RespuestaConsulta>
  /** «Probar conexión»: ¿responde Nubefact y acepta el token? (nunca devuelve la ruta ni el token). */
  probarConexion(): Promise<ResultadoPruebaConexion>
}
export type ResultadoPruebaConexion = { ok: true; detalle: string } | { ok: false; error: string }

export class NubefactNoConfigurado extends Error {}

/**
 * Qué cliente usar, según el entorno:
 *   NUBEFACT_MODO = SIMULADOR (por defecto) | PRUEBA | PRODUCCION
 *   NUBEFACT_URL, NUBEFACT_TOKEN — credenciales, solo como variables de entorno (nunca en el código ni en la base de datos)
 *   NUBEFACT_PRODUCCION_APROBADA = SI — el candado: sin esto, PRODUCCION no emite. Lo pone Sebas cuando lo apruebe.
 * En la demostración siempre se usa el simulador.
 */
export function clienteNubefact(): ClienteNubefact {
  if (modoDemoActivo()) {
    // D-167: en la Preview de la demostración, si existen NUBEFACT_RUTA y NUBEFACT_TOKEN se usa el cliente real contra la cuenta DEMO de Nubefact; si no, el simulador.
    const demo = credencialesNubefactDemo()
    return demo ? new ClienteNubefactHttp({ url: demo.ruta, token: demo.token, modo: 'PRUEBA' }) : SimuladorNubefact.compartido()
  }
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

/**
 * Las credenciales de la cuenta DEMO de Nubefact, solo en la Preview de la demostración y solo si están las dos variables (ruta https y token). Nunca se imprimen ni se registran.
 * Local, las pruebas y producción no pasan por aquí (producción ni siquiera arranca con NUBEFACT_RUTA: lib/demo.ts).
 */
export function credencialesNubefactDemo(env: Record<string, string | undefined> = process.env): { ruta: string; token: string } | null {
  if (!esPreviewDeDemostracion({ VERCEL: env.VERCEL, VERCEL_ENV: env.VERCEL_ENV, WMS_DEMO: env.WMS_DEMO })) return null
  const ruta = (env.NUBEFACT_RUTA ?? '').trim()
  const token = (env.NUBEFACT_TOKEN ?? '').trim()
  if (!ruta || !token || !/^https:\/\//i.test(ruta)) return null
  return { ruta, token }
}

/** ¿Faltan variables? Para decirlo en la pantalla sin revelar valores: la Preview tiene una sola de las dos o una ruta que no es https. */
export function nubefactDemoIncompleto(env: Record<string, string | undefined> = process.env): string | null {
  if (!esPreviewDeDemostracion({ VERCEL: env.VERCEL, VERCEL_ENV: env.VERCEL_ENV, WMS_DEMO: env.WMS_DEMO })) return null
  const ruta = (env.NUBEFACT_RUTA ?? '').trim(); const token = (env.NUBEFACT_TOKEN ?? '').trim()
  if (!ruta && !token) return null
  if (!ruta) return 'Falta NUBEFACT_RUTA en la Preview: se usa el simulador.'
  if (!token) return 'Falta NUBEFACT_TOKEN en la Preview: se usa el simulador.'
  if (!/^https:\/\//i.test(ruta)) return 'NUBEFACT_RUTA debe empezar con https:// : se usa el simulador.'
  return null
}

/** El modo que se mostrará en pantalla antes de emitir (sin lanzar si falta configuración). */
export function modoNubefactActual(): ModoNubefact {
  if (modoDemoActivo()) return credencialesNubefactDemo() ? 'PRUEBA' : 'SIMULADOR'
  const m = (process.env.NUBEFACT_MODO ?? 'SIMULADOR').toUpperCase()
  return m === 'PRUEBA' || m === 'PRODUCCION' ? m : 'SIMULADOR'
}
