import type { Regulatorio } from './tipos'

export type SituacionRS = 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' | 'SIN_DATO'

/** Días de aviso antes de que venza el registro sanitario. */
export const DIAS_AVISO_RS = 90

const MS_DIA = 86_400_000

export function diasHasta(fecha: string, hoy: string): number {
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / MS_DIA)
}

export function situacionRS(rsVence: string | undefined | null, hoy: string): SituacionRS {
  if (!rsVence) return 'SIN_DATO'
  const d = diasHasta(rsVence, hoy)
  if (d < 0) return 'VENCIDO'
  if (d <= DIAS_AVISO_RS) return 'POR_VENCER'
  return 'VIGENTE'
}

/**
 * Piloto (PIL-8): los productos los crea Compras; el WMS los completa. Un producto con alguno de estos seis datos vacío figura «pendiente de Dirección Técnica»
 * y NO se pueden aprobar lotes suyos (la base de datos lo exige igual: `wms.producto_completo`). La marca «sin material de envase» y los códigos
 * alternativos de clientes también se completan en la ficha, pero no bloquean.
 */
export const DATOS_PARA_COMPLETAR: readonly { clave: 'registroSanitario' | 'rsVence' | 'fabricante' | 'formaPresentacion' | 'concentracion' | 'condicionAlmacenamiento'; etiqueta: string }[] = [
  { clave: 'registroSanitario', etiqueta: 'Registro sanitario' },
  { clave: 'rsVence', etiqueta: 'Vencimiento del registro' },
  { clave: 'fabricante', etiqueta: 'Fabricante' },
  { clave: 'formaPresentacion', etiqueta: 'Forma farmacéutica' },
  { clave: 'concentracion', etiqueta: 'Concentración' },
  { clave: 'condicionAlmacenamiento', etiqueta: 'Condición de almacenamiento' },
]

/** Lo que falta completar de un producto (vacío = completo). */
export function datosFaltantes(reg: Regulatorio | undefined | null): string[] {
  return DATOS_PARA_COMPLETAR.filter((d) => !String(reg?.[d.clave] ?? '').trim()).map((d) => d.etiqueta)
}
export const productoCompleto = (reg: Regulatorio | undefined | null): boolean => datosFaltantes(reg).length === 0

export const MENSAJE_PENDIENTE_DT = 'El producto está pendiente de Dirección Técnica: faltan sus datos regulatorios. Complétalos en su ficha antes de aprobar sus lotes.'

export type BloqueoAprobacion =
  | { puede: true }
  | { puede: false; motivo: 'SIN_REGISTRO' | 'RS_VENCIDO' | 'SIN_VALIDAR' | 'INCOMPLETO'; mensaje: string }

/** Un lote solo puede aprobarse con el registro sanitario y su vencimiento cargados, y vigente (D-37: sin segunda validación). */
export function puedeAprobarse(reg: Regulatorio | undefined, hoy: string): BloqueoAprobacion {
  if (!reg?.registroSanitario || !reg.rsVence) {
    return {
      puede: false,
      motivo: 'SIN_REGISTRO',
      mensaje: 'El producto no tiene cargados su registro sanitario y su vencimiento. Dirección Técnica debe completarlos.',
    }
  }
  if (!productoCompleto(reg)) return { puede: false, motivo: 'INCOMPLETO', mensaje: MENSAJE_PENDIENTE_DT }
  if (reg.estadoValidacion === 'PENDIENTE' || reg.estadoValidacion === 'OBSERVADO') {
    return { puede: false, motivo: 'SIN_VALIDAR', mensaje: 'El producto todavía no está validado. Dirección Técnica debe validarlo antes de aprobar sus lotes.' }
  }
  if (situacionRS(reg.rsVence, hoy) === 'VENCIDO') {
    return {
      puede: false,
      motivo: 'RS_VENCIDO',
      mensaje: 'El registro sanitario está vencido. El lote no se puede aprobar hasta que Dirección Técnica lo resuelva.',
    }
  }
  return { puede: true }
}
