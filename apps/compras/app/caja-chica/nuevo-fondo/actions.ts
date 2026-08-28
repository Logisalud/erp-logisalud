'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { crearFondo } from '@/services/caja-chica'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearFondoAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const custodioId = String(form.get('custodioId') ?? '')
  const area = String(form.get('area') ?? '').trim()
  const montoFijo = Number(form.get('montoFijo'))
  const moneda = String(form.get('moneda') ?? 'PEN')
  const descripcion = String(form.get('descripcion') ?? '').trim()

  const errores: { campo: string; mensaje: string }[] = []
  if (!custodioId) errores.push({ campo: 'custodioId', mensaje: 'Elegí quién va a administrar el fondo.' })
  if (!area) errores.push({ campo: 'area', mensaje: 'Escribí el área del fondo.' })
  if (!montoFijo || montoFijo <= 0) errores.push({ campo: 'montoFijo', mensaje: 'El monto fijo tiene que ser mayor a 0.' })
  if (errores.length > 0) return { errores }

  let id: string
  try {
    const fondo = await crearFondo({ custodioId, area, montoFijo, moneda, descripcion: descripcion || undefined })
    id = fondo.id
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: e instanceof Error ? e.message : 'No se pudo abrir el fondo.' }] }
  }

  revalidatePath('/caja-chica')
  redirect(`/caja-chica/fondos/${id}`)
}
