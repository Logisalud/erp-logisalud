'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { EVENTOS_PARADA, validarEventoParada, validarFoto, type EventoParada } from '@/domain/mis-rutas'
import type { Actor, ResultadoAccion } from '@/services/repositorio'
import { guardarArchivo } from '@/services/archivos'
import type { DatosEventoParada } from '@/services/repositorio-mis-rutas'

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}
const falla = (mensaje: string, errores?: Record<string, string>): ResultadoAccion<never> => ({ ok: false, mensaje, errores })
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

/**
 * Lo que marca quien conduce en una parada (llegué, entregado, no entregado, rechazado, incidencia). La foto de la entrega se sube al bucket privado y solo se guarda su referencia
 * y su hash. Las reglas las aplica la base; aquí se valida primero para decir qué falta sin ir y volver.
 */
export async function registrarEventoParadaAccion(f: FormData): Promise<ResultadoAccion<{ retornoPorOriginar: boolean; rutaPendienteDeCierre: boolean }>> {
  const evento = texto(f, 'evento') as EventoParada
  if (!EVENTOS_PARADA.includes(evento)) return falla('Elige qué pasó en esta parada.')
  const archivo = f.get('foto')
  const foto = archivo instanceof File && archivo.size > 0 ? archivo : null
  const datos: DatosEventoParada = { motivo: texto(f, 'motivo') || undefined, recibioNombre: texto(f, 'recibioNombre') || undefined, recibioDocumento: texto(f, 'recibioDocumento') || undefined }
  if (evento === 'ENTREGADO') {
    datos.conforme = texto(f, 'conforme') !== 'NO'
    if (!datos.conforme) { datos.tipoDiferencia = (texto(f, 'tipoDiferencia') || undefined) as DatosEventoParada['tipoDiferencia']; datos.detalleDiferencia = texto(f, 'detalleDiferencia') || undefined }
  }
  const errores = validarEventoParada(evento, { ...datos, tieneFoto: !!foto })
  if (evento === 'ENTREGADO' && foto) { const malo = validarFoto(foto.name, foto.size, foto.type); if (malo) errores.foto = malo }
  const primero = Object.values(errores)[0]
  if (primero) return falla(primero, errores)
  if (evento === 'ENTREGADO' && foto) {
    const g = await guardarArchivo('ENTREGAS', foto.name, new Uint8Array(await foto.arrayBuffer()), foto.type || 'image/jpeg')
    datos.foto = { ref: g.ref, nombre: foto.name, hash: g.hash, bytes: foto.size, tipo: foto.type || undefined }
  }
  return repositorio().registrarEventoParada(texto(f, 'paradaId'), evento, datos, await quien())
}
