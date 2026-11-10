// Piloto (F): reglas de vencimiento al recibir. Dominio puro; la base de datos (migración 0040) aplica las mismas.
//  · Vida útil mínima: al recibir, si al lote le quedan menos meses que `vida_util_minima_meses` (24 al inicio), alerta.
//  · Proveedor que solo imprime mes y año (p. ej. Daré Pharma): al recibir sus productos, alerta para verificar la fecha en el envase.
import { mesesDeVidaRestante } from './fechas'

/** Valor inicial del parámetro `vida_util_minima_meses`. */
export const VIDA_UTIL_MINIMA_MESES = 24

/** El parámetro se valida: un número entero de meses, de 1 a 120. Devuelve el mensaje de error o null. */
export function validarVidaUtilMinima(valor: string): string | null {
  const v = valor.trim()
  if (!/^\d{1,3}$/.test(v) || Number(v) < 1 || Number(v) > 120) return 'La vida útil mínima son meses enteros, de 1 a 120.'
  return null
}

export type TipoAvisoVencimiento = 'VENCIMIENTO_VERIFICAR' | 'VIDA_UTIL_CORTA'
export interface AvisoVencimiento { tipo: TipoAvisoVencimiento; texto: string }

export interface EntradaAvisosVencimiento {
  lote: string
  vence?: string | null
  /** El proveedor de esta recepción está marcado «vencimiento solo mes y año». */
  proveedorSoloMesAnio?: boolean
  proveedorNombre?: string
  hoy: string
  minimoMeses?: number
}

export function avisosDeVencimiento(e: EntradaAvisosVencimiento): AvisoVencimiento[] {
  const avisos: AvisoVencimiento[] = []
  if (e.proveedorSoloMesAnio) {
    avisos.push({
      tipo: 'VENCIMIENTO_VERIFICAR',
      texto: `${e.proveedorNombre ?? 'Este proveedor'} solo imprime mes y año en sus productos. Verifica en el envase la fecha de vencimiento del lote ${e.lote} antes de confirmar.`,
    })
  }
  if (e.vence) {
    const min = e.minimoMeses ?? VIDA_UTIL_MINIMA_MESES
    const meses = mesesDeVidaRestante(e.vence, e.hoy)
    if (e.vence < e.hoy) {
      avisos.push({ tipo: 'VIDA_UTIL_CORTA', texto: `El lote ${e.lote} llega vencido. Dirección Técnica decide qué se hace.` })
    } else if (meses < min) {
      avisos.push({ tipo: 'VIDA_UTIL_CORTA', texto: `Al lote ${e.lote} le quedan ${meses} ${meses === 1 ? 'mes' : 'meses'} de vida útil, menos de los ${min} mínimos. Dirección Técnica decide si se acepta.` })
    }
  }
  return avisos
}

/** Cambio auditado de la fecha de vencimiento de un lote (F1): quién, cuándo, de qué a qué y por qué. El historial no se edita ni se borra. */
export interface CambioVencimientoLote {
  id: string
  loteId: string
  antes?: string
  despues?: string
  motivo: string
  usuario: string
  ts: string
}

export function validarCorreccionVencimiento(fecha: string, motivo: string): { ok: true } | { ok: false; errores: { fecha?: string; motivo?: string } } {
  const errores: { fecha?: string; motivo?: string } = {}
  if (!fecha.trim()) errores.fecha = 'Escribe la fecha correcta.'
  if (!motivo.trim()) errores.motivo = 'Cuéntanos por qué cambia: el motivo es obligatorio.'
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true }
}

/** Quién corrige la fecha de un lote ya registrado: Jefe de Almacén (o su reemplazo) y Dirección Técnica. */
export const ROLES_CORRIGEN_VENCIMIENTO = ['jefe_almacen', 'reemplazo_jefe', 'direccion_tecnica', 'admin_wms'] as const

/** Quién ve la pantalla «Proveedores» y quién marca «vencimiento solo mes y año» (la base lo exige igual). */
export const puedeVerProveedores = (roles: readonly string[]) => roles.some((r) => ['direccion_tecnica', 'asistente_dt', 'admin_wms', 'jefe_almacen'].includes(r))
export const puedeMarcarProveedores = (roles: readonly string[]) => roles.some((r) => ['direccion_tecnica', 'asistente_dt', 'admin_wms'].includes(r))
