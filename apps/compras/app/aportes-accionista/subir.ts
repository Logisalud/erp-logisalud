'use server'

import {
  subirComprobanteSuelto, type ResultadoSubida,
} from '@/services/aportes-accionista'

/**
 * Sube UN comprobante y devuelve su ruta, apenas se elige el archivo.
 *
 * Existe como acción propia justamente para que cada archivo viaje en su
 * PROPIO request: el submit final lleva solo texto y rutas, y así N
 * comprobantes no suman contra el límite de body del envío.
 *
 * Devuelve el MOTIVO cuando falla. La primera versión devolvía null a secas
 * y la pantalla solo podía decir "no se pudo subir" — que es un callejón sin
 * salida: la persona no sabe si reintentar, cambiar el archivo o seguir sin
 * él. El error real (una policy de Storage que rechazaba el path) quedó
 * invisible justamente por eso.
 */
export async function subirComprobanteAporteAction(form: FormData): Promise<ResultadoSubida> {
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return { error: 'No llegó ningún archivo.' }
  try {
    return await subirComprobanteSuelto(archivo)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo subir el comprobante.' }
  }
}
