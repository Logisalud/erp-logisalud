import type {
  ArchivoCarga, EntradaSubida, OpcionAlcance, PanoramaDocumentos, PerfilDocumental, RequisitoDocumental, ResumenCargaCoa, TipoDocumento,
} from '@/domain/documentos'
import type { Actor, ResultadoAccion } from './repositorio'

/** S6a: documentos regulatorios (COA por lote, registro sanitario por producto, BPM por fabricante), perfil documental del cliente y carga masiva de COA. */
export interface RepositorioDocumentos {
  panoramaDocumentos(): Promise<PanoramaDocumentos>
  /** Lotes, productos o fabricantes que coinciden con lo escrito (para elegir de qué es el documento). */
  buscarAlcanceDocumento(tipo: TipoDocumento, consulta: string): Promise<OpcionAlcance[]>
  /** Sube una versión nueva (el archivo ya está en el almacenamiento; aquí se registra). Con `reemplazaA`, reemplaza la vigente. */
  subirDocumento(entrada: EntradaSubida, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  crearFabricante(nombre: string, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  guardarPerfilDocumental(perfil: PerfilDocumental, actor: Actor): Promise<ResultadoAccion>
  /** Qué documentos pide el lote para ese cliente (RUC) y cómo está cada uno. */
  requisitosDocumentales(loteId: string, ruc?: string, entrega?: string): Promise<RequisitoDocumental[]>
  /** Lee el nombre de cada archivo, lo relaciona con su lote y guarda: lo relacionado queda como COA vigente; lo demás, por revisar. */
  cargarCoaEnBloque(archivos: ArchivoCarga[], actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenCargaCoa }>>
  asignarItemCoa(itemId: string, loteId: string, actor: Actor): Promise<ResultadoAccion>
  descartarItemCoa(itemId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  /** Vuelve a leer lo que quedó por revisar (por ejemplo, después de crear los lotes que faltaban). */
  reintentarItemsCoa(actor: Actor): Promise<ResultadoAccion<{ asignados: number }>>
}
