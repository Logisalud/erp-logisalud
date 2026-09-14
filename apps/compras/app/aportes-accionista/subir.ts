'use server'

import { subirComprobanteSuelto } from '@/services/aportes-accionista'

/**
 * Sube UN comprobante y devuelve su ruta, apenas se elige el archivo.
 *
 * Existe como acción propia justamente para que cada archivo viaje en su
 * PROPIO request: el submit final lleva solo texto y rutas, y así N
 * comprobantes no suman contra el límite de body del envío.
 */
export async function subirComprobanteAporteAction(form: FormData): Promise<string | null> {
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return null
  try {
    return await subirComprobanteSuelto(archivo)
  } catch {
    // El comprobante es opcional: si la subida falla, el aporte se registra
    // igual y el archivo se sube después desde la ficha.
    return null
  }
}
