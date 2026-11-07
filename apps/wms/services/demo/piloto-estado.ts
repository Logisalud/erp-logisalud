// Estado del modo piloto en la demostración (0038). Por defecto la demo NO es piloto (`WMS_DEMO_MODO_PILOTO=1` o `fijarModoPilotoDemo` lo encienden): así las pantallas y las
// pruebas de siempre no cambian; el piloto se ve en su propio servidor de pruebas (e2e/modo-piloto.spec.ts).
import { normalizarModoPiloto, type ModoPiloto } from '@/domain/modo-piloto'
import type { VersionOc } from '@/domain/oc-versiones'
import type { EstadoDemo } from './estado'

export interface PilotoDemoEstado {
  modo?: ModoPiloto; versiones: VersionOc[]
  /** P6: la sincronización automática de las OC. `falla` (solo pruebas) simula que Compras no responde; `enCurso` es el candado. */
  sync?: { ultimaEn?: string; ultimoIntentoEn?: string; error?: string; enCurso?: boolean; falla?: boolean; resumen?: import('@/domain/oc-versiones').ResumenSincronizacion }
}

export function piloto(e: EstadoDemo): PilotoDemoEstado {
  const x = e as EstadoDemo & { piloto?: PilotoDemoEstado }
  return (x.piloto ??= { versiones: [] })
}

export function modoPilotoDemo(e: EstadoDemo): ModoPiloto {
  return piloto(e).modo ?? normalizarModoPiloto(process.env.WMS_DEMO_MODO_PILOTO === '1' ? 'si' : 'no') ?? 'no'
}
