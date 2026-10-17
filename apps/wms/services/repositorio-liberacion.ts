import type { PanoramaMuestreo } from '@/domain/muestreo'
import type { EntradaRetorno, ResumenSalidaRetorno, SalidaParaRetorno } from '@/domain/retornos'
import type { Actor, ResultadoAccion } from './repositorio'

/** El documento del DT del cliente ya guardado en el bucket (el archivo no pasa por la base de datos: solo su referencia y su huella). */
export interface DocumentoDictamen { ref: string; nombre: string; tipo: string; hash: string }

export interface DatosRegistroDictamen {
  liberada: number
  rechazada: number
  fechaDictamen: string
  observacion?: string
  documento: DocumentoDictamen
}

/** OS-5: muestreo LS-TB.02.02, liberación LS-POE.04.05 y retornos (recepción tipo devolución). */
export interface RepositorioLiberacion {
  // ── Muestreo (LS-TB.02.02): la tabla es un parámetro; Dirección Técnica marca los productos con antecedentes de calidad ──
  panoramaMuestreo(): Promise<PanoramaMuestreo>
  marcarAntecedentes(productoId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  quitarAntecedentes(productoId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>

  // ── Liberación (LS-POE.04.05) ──
  /** Observación reversible: el producto sigue en Cuarentena hasta la disposición final. */
  observarActa(actaId: string, texto: string, actor: Actor): Promise<ResultadoAccion>
  levantarObservacion(actaId: string, nota: string, actor: Actor): Promise<ResultadoAccion>
  /** Sandra o Katia registran el dictamen del DT del cliente (con el documento que llegó por correo). Todavía no cambia el estado. */
  registrarDictamen(actaId: string, datos: DatosRegistroDictamen, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  /** Confirma el cambio de estado que autoriza el dictamen (Aprobado y Bajas/Rechazados). */
  confirmarDictamen(dictamenId: string, actor: Actor): Promise<ResultadoAccion<{ firmada: boolean }>>
  anularDictamen(dictamenId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>

  // ── Retornos ──
  /** Las Órdenes de Salida que ya salieron, con sus retornos. */
  salidasConRetorno(): Promise<ResumenSalidaRetorno[]>
  salidaParaRetorno(salidaId: string): Promise<SalidaParaRetorno | null>
  /** Crea la solicitud de ingreso tipo devolución con la referencia a la Orden de Salida. `autorizar` solo vale para Sandra y Katia. */
  crearRetorno(entrada: EntradaRetorno, autorizar: boolean, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string; autorizada: boolean }>>
}
