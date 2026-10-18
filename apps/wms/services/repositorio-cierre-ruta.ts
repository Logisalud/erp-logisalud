import type { Actor, ResultadoAccion } from './repositorio'

/** Un archivo ya guardado en el almacenamiento privado (la acción del servidor lo sube y aquí solo se registra su referencia). */
export interface ArchivoGuardado { ref: string; nombre: string; hash: string; bytes: number; tipo?: string }

export interface DatosCierreRuta {
  tempMin: number
  tempMax: number
  observaciones?: string
  /** El archivo que se descargó del data logger (Elitech GSP-6), tal cual. */
  archivo: ArchivoGuardado
}

/** OS-7: cierre de ruta (data logger, mínima y máxima), impresión registrada y escaneo firmado del LS-FR.43.03. */
export interface RepositorioCierreRuta {
  /** Registra que se imprimió el formato (quién y cuándo). Devuelve cuántas impresiones lleva la ruta. */
  registrarImpresionLsFr(rutaId: string, actor: Actor): Promise<ResultadoAccion<{ impresiones: number }>>
  /** Sube el escaneo del formato firmado (se conserva 5 años). Si ya había uno, el motivo es obligatorio y el anterior queda. */
  subirEscaneoLsFr(rutaId: string, archivo: ArchivoGuardado, motivo: string | undefined, actor: Actor): Promise<ResultadoAccion<{ version: number; conservarHasta: string }>>
  /** Cierra la ruta (desde que salió): adjunta el archivo del data logger y registra la temperatura mínima y máxima. */
  cerrarRuta(rutaId: string, datos: DatosCierreRuta, actor: Actor): Promise<ResultadoAccion<{ fueraDeRango: boolean }>>
  /** Corrige el cierre de una ruta cerrada: versión nueva con su motivo; la anterior queda. */
  corregirCierreRuta(rutaId: string, datos: DatosCierreRuta, motivo: string, actor: Actor): Promise<ResultadoAccion<{ version: number; fueraDeRango: boolean }>>
  /** El archivo guardado (para descargarlo): la versión pedida o la vigente. */
  archivoLsFr(rutaId: string, que: 'ESCANEO' | 'DATA_LOGGER', version?: number): Promise<{ ref: string; nombre: string; tipo?: string } | null>
}
