import 'server-only'

/**
 * Extracción best-effort de campos desde un documento (foto/PDF de una
 * factura) — compartida entre módulos que en el futuro también quieran
 * pre-llenar un formulario desde un documento subido (ej. un futuro flujo
 * de Gastos). A propósito NO mapea los campos leídos a los inputs
 * específicos de ningún formulario: eso vive en cada flujo que consume esta
 * función (hoy, app/facturas/nueva), para no acoplar este servicio
 * genérico a las reglas de un solo Bounded Context.
 *
 * LIMITACIÓN REAL — léase antes de asumir que esto "hace OCR": hoy este
 * proyecto no tiene ningún proveedor de visión/OCR conectado. Se verificó
 * antes de escribir esto: no hay API key de ningún proveedor de visión en
 * `.env.example` ni en las env vars del proyecto, y `package.json` no trae
 * ninguna librería de OCR ni de parseo de PDF/imagen. Conectar un proveedor
 * real (Claude con visión, Google Document AI, Textract, o correr un motor
 * de OCR local) es trabajo aparte que necesita credenciales que esta tarea
 * no tiene. Esta función es el PUNTO DE EXTENSIÓN: la interfaz
 * (`ResultadoExtraccion`) ya está pensada para lo que un proveedor real
 * devolvería, así que conectar uno después es reemplazar el cuerpo de esta
 * función sin tocar quien la llama. Hoy siempre devuelve `disponible:
 * false` y todos los campos en null — nunca lanza, nunca bloquea: el
 * formulario que la usa tiene que funcionar perfecto solo con carga manual,
 * el OCR es un best-effort que pre-llena, nunca una dependencia dura.
 */

export type CamposFacturaExtraidos = {
  fecha: string | null
  ruc: string | null
  proveedorNombre: string | null
  base: number | null
  igv: number | null
  total: number | null
  porcentajeDetraccion: number | null
  textoCrudo: string | null
}

export type ResultadoExtraccion = {
  /** true solo si un proveedor real de OCR/visión corrió sobre el documento
   * (con o sin campos encontrados). false = no hay proveedor conectado. */
  disponible: boolean
  campos: CamposFacturaExtraidos
  /** Mensaje para mostrar en la pantalla, en lenguaje de negocio, cuando disponible=false. */
  motivoNoDisponible: string | null
}

const CAMPOS_VACIOS: CamposFacturaExtraidos = {
  fecha: null,
  ruc: null,
  proveedorNombre: null,
  base: null,
  igv: null,
  total: null,
  porcentajeDetraccion: null,
  textoCrudo: null,
}

export async function extraerCamposFactura(archivo: {
  name: string
  type: string
  size: number
}): Promise<ResultadoExtraccion> {
  // Punto de extensión: acá va la llamada al proveedor real cuando exista
  // uno conectado (ej. `if (process.env.PROVEEDOR_OCR_API_KEY) { ... }`).
  // Ver el comentario de arriba — hoy no hay ninguno, así que esto es un
  // no-op explícito, no una simulación de éxito.
  void archivo
  return {
    disponible: false,
    campos: CAMPOS_VACIOS,
    motivoNoDisponible: 'Todavía no hay un lector automático conectado — completa los campos a mano.',
  }
}
