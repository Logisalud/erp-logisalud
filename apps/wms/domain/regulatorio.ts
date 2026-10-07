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

export type BloqueoAprobacion =
  | { puede: true }
  | { puede: false; motivo: 'SIN_VALIDAR' | 'RS_VENCIDO' | 'SIN_REGISTRO'; mensaje: string }

/** Un lote solo puede aprobarse con el registro sanitario validado y vigente. */
export function puedeAprobarse(reg: Regulatorio | undefined, hoy: string): BloqueoAprobacion {
  if (!reg || reg.estadoValidacion !== 'VALIDADO') {
    return {
      puede: false,
      motivo: 'SIN_VALIDAR',
      mensaje: 'El producto todavía no está validado por Dirección Técnica.',
    }
  }
  if (!reg.registroSanitario) {
    return { puede: false, motivo: 'SIN_REGISTRO', mensaje: 'El producto no tiene registro sanitario cargado.' }
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
