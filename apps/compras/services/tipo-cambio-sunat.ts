import 'server-only'
import {
  parsearArchivoSunat, parsearSerieBcrp, restarDias, tipoCambioPublicadoPara,
} from '@/domain/tipo-cambio'
import { hoyLima } from '@/domain/fecha'

/**
 * El tipo de cambio SUNAT (venta) para una fecha — el valor por defecto de
 * una solicitud en dólares, que sigue siendo editable. Ver
 * domain/tipo-cambio.ts para de dónde sale cada caso.
 *
 * Nunca tira: si las fuentes no responden devuelve null y el formulario deja
 * el campo para escribirlo a mano.
 */
const ARCHIVO_SUNAT = 'https://www.sunat.gob.pe/a/txt/tipoCambio.txt'
const SERIE_BCRP = 'https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04640PD/json'

async function hoySegunSunat(hoy: string): Promise<number | null> {
  try {
    const r = await fetch(ARCHIVO_SUNAT, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(6000) })
    if (!r.ok) return null
    const tc = parsearArchivoSunat(await r.text())
    return tc && tc.fecha === hoy ? tc.venta : null
  } catch (e) {
    console.error('[tipo-cambio] SUNAT', (e as Error).message)
    return null
  }
}

async function publicadoSegunBcrp(fecha: string): Promise<number | null> {
  try {
    // Diez días atrás alcanzan para cruzar un fin de semana largo o Semana Santa.
    const r = await fetch(`${SERIE_BCRP}/${restarDias(fecha, 10)}/${restarDias(fecha, 1)}`, {
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    return tipoCambioPublicadoPara(parsearSerieBcrp(await r.json()), fecha)?.venta ?? null
  } catch (e) {
    console.error('[tipo-cambio] BCRP', (e as Error).message)
    return null
  }
}

export async function tipoCambioSunat(fecha: string): Promise<number | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const hoy = hoyLima()
  // Hoy (o una fecha futura, que todavía no tiene publicación): el de hoy.
  if (fecha >= hoy) return (await hoySegunSunat(hoy)) ?? (await publicadoSegunBcrp(hoy))
  return publicadoSegunBcrp(fecha)
}
