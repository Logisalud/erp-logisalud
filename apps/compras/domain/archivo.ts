/**
 * Cuánto puede pesar un archivo que se sube por un formulario. Puro.
 *
 * El tope NO lo pone el bucket de Supabase (20 MB en los legajos) sino el
 * camino: los formularios suben por una Server Action, y en Vercel el body
 * de una función serverless topa en 4.5 MB. Un archivo más grande se
 * rechaza en la infraestructura, antes de que corra una sola línea nuestra
 * — sin error que mostrar y sin nada que el formulario pueda hacer.
 *
 * Por eso el límite se valida en el CLIENTE, antes de enviar: es el único
 * momento en que todavía se le puede decir algo útil a la persona.
 */

/** 4 MB, por debajo del tope de 4.5 MB de Vercel con margen para el resto
 * del formulario (los campos de texto también viajan en ese mismo body). */
export const TAMANO_MAXIMO_ARCHIVO = 4 * 1024 * 1024

export function excedeTamanoMaximo(bytes: number): boolean {
  return bytes > TAMANO_MAXIMO_ARCHIVO
}

export function formatoTamano(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * El mensaje que ve quien eligió un archivo demasiado grande. Dice el
 * tamaño real y qué hacer — "archivo muy grande" a secas deja a la persona
 * adivinando si son 5 MB o 50.
 */
export function mensajeArchivoDemasiadoGrande(nombre: string, bytes: number): string {
  return (
    `"${nombre}" pesa ${formatoTamano(bytes)} y el máximo es ` +
    `${formatoTamano(TAMANO_MAXIMO_ARCHIVO)}. Si es una foto, sácala de nuevo en calidad ` +
    'media o mándala en blanco y negro; también puedes enviar la solicitud sin adjunto y ' +
    'subir el archivo después desde su ficha.'
  )
}
