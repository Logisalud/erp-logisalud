'use server'

import { revalidatePath } from 'next/cache'
import { registrarDocumentoExcedente, subirDocumentoExcedente } from '@/services/notas-pendientes-proveedor'

export async function subirDocumentoExcedenteAction(
  ocCodigo: string,
  form: FormData
): Promise<{ path: string } | { error: string }> {
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return { error: 'No llegó ningún archivo.' }
  return subirDocumentoExcedente(ocCodigo, archivo)
}

/** Cierra el excedente de las líneas elegidas con la factura o nota de débito del proveedor. */
export async function registrarDocumentoExcedenteAction(input: {
  tipo: string
  numero: string
  fechaEmision: string
  storagePath: string | null
  lineas: string[]
}): Promise<{ error: string } | null> {
  try {
    await registrarDocumentoExcedente(input)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo registrar el documento.' }
  }
  revalidatePath('/reportes/notas-pendientes')
  return null
}
