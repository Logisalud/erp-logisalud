import 'server-only'

import { createHash } from 'node:crypto'
import { crearClienteServidor } from '@logisalud/auth/server'
import { modoDemoActivo } from '@/lib/demo'

// Los PDF van al bucket privado `wms-documentos` (se crea a mano: docs/wms/aplicar-migraciones.md). En la demo viven en memoria del
// servidor (sirven para probar el flujo y se pierden al reiniciar). El WMS nunca expone una URL pública: se descarga con enlace firmado.
const BUCKET = 'wms-documentos'
const memoria = (globalThis as unknown as { __wmsArchivos?: Map<string, Buffer> }).__wmsArchivos ??= new Map<string, Buffer>()

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** Guarda el archivo y devuelve su referencia (ruta dentro del bucket). La ruta lleva el hash: el mismo contenido siempre cae en el mismo lugar. */
export async function guardarArchivo(tipo: string, nombre: string, bytes: Uint8Array, contentType = 'application/pdf'): Promise<{ ref: string; hash: string }> {
  const hash = sha256(bytes)
  const limpio = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80)
  const ref = `${tipo.toLowerCase()}/${hash.slice(0, 16)}-${limpio}`
  if (modoDemoActivo()) { memoria.set(ref, Buffer.from(bytes)); return { ref, hash } }
  const { error } = await crearClienteServidor().storage.from(BUCKET).upload(ref, bytes, { contentType, upsert: true })
  if (error) throw new Error(`No se pudo guardar el archivo: ${error.message}`)
  return { ref, hash }
}

/** Lo que se le entrega al navegador: los bytes (demo) o un enlace firmado de 5 minutos (producción). */
export async function entregarArchivo(ref: string): Promise<{ bytes: Buffer } | { url: string } | null> {
  if (modoDemoActivo()) { const b = memoria.get(ref); return b ? { bytes: b } : null }
  const { data, error } = await crearClienteServidor().storage.from(BUCKET).createSignedUrl(ref, 300)
  return error || !data ? null : { url: data.signedUrl }
}

/** Los bytes del archivo (para armar el paquete documental en un solo PDF). Nulo si no está disponible. */
export async function leerArchivo(ref: string): Promise<Buffer | null> {
  if (modoDemoActivo()) return memoria.get(ref) ?? null
  const { data, error } = await crearClienteServidor().storage.from(BUCKET).download(ref)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}
