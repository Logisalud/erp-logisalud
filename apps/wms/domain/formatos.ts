// Formatos controlados (F3): cada cambio de un formato lleva su versión, visible en pantalla y PDF, y NO rige hasta que Dirección Técnica lo aprueba.
export type FormatoControlado = 'ACTA_ORGANOLEPTICA'

export const CODIGO_FORMATO: Record<FormatoControlado, string> = { ACTA_ORGANOLEPTICA: 'LS-FR.55.02' }
export const NOMBRE_FORMATO: Record<FormatoControlado, string> = { ACTA_ORGANOLEPTICA: 'Acta de análisis organoléptico' }

export interface VersionFormatoVista {
  formato: FormatoControlado
  version: number
  resumen: string
  estado: 'APROBADA' | 'PENDIENTE'
  propuestaEn?: string
  aprobadaPor?: string
  aprobadaEn?: string
}

/** Las versiones de ejemplo de la demo y las que siembra la migración 0040. */
export const VERSIONES_ORGANOLEPTICA_INICIALES: readonly Pick<VersionFormatoVista, 'version' | 'resumen' | 'estado'>[] = [
  { version: 1, resumen: 'Formato original: el material del envase se llena siempre.', estado: 'APROBADA' },
  { version: 2, resumen: 'El punto «Material del envase» se oculta cuando Dirección Técnica marca el producto como «sin material de envase».', estado: 'PENDIENTE' },
]

/** Desde la versión 2 el material del envase se oculta si el producto está marcado «sin material de envase». */
export const ocultaMaterialEnvase = (version: number, productoSinMaterialEnvase: boolean | undefined): boolean => version >= 2 && !!productoSinMaterialEnvase

export const textoVersionFormato = (formato: FormatoControlado, version: number) => `${CODIGO_FORMATO[formato]} · versión ${version}`

/** La versión que rige = la más alta ya aprobada. */
export function versionVigente(versiones: readonly Pick<VersionFormatoVista, 'version' | 'estado'>[]): number {
  return Math.max(1, ...versiones.filter((v) => v.estado === 'APROBADA').map((v) => v.version))
}
