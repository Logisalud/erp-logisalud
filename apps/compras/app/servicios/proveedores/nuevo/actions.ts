'use server'

import { redirect } from 'next/navigation'
import { crearProveedorServicio } from '@/services/servicios'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearProveedorServicioAction(
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const ruc = String(form.get('ruc') ?? '').trim()
  const razonSocial = String(form.get('razonSocial') ?? '').trim()
  const condicionPagoDias = Number(form.get('condicionPagoDias') ?? 30)

  const errores: { campo: string; mensaje: string }[] = []
  if (!/^\d{11}$/.test(ruc)) errores.push({ campo: 'ruc', mensaje: 'El RUC tiene que tener 11 dígitos.' })
  if (!razonSocial) errores.push({ campo: 'razonSocial', mensaje: 'Escribe la razón social.' })
  if (!condicionPagoDias || condicionPagoDias < 0) {
    errores.push({ campo: 'condicionPagoDias', mensaje: 'Los días de condición de pago tienen que ser 0 o más.' })
  }
  if (errores.length > 0) return { errores }

  try {
    await crearProveedorServicio({
      ruc,
      razonSocial,
      nombreComercial: String(form.get('nombreComercial') ?? '').trim() || undefined,
      contactoNombre: String(form.get('contactoNombre') ?? '').trim() || undefined,
      contactoEmail: String(form.get('contactoEmail') ?? '').trim() || undefined,
      contactoTelefono: String(form.get('contactoTelefono') ?? '').trim() || undefined,
      condicionPagoDias,
      monedaPrincipal: String(form.get('monedaPrincipal') ?? 'PEN'),
    })
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: e instanceof Error ? e.message : 'No se pudo registrar el proveedor.' }] }
  }

  redirect('/servicios/nueva')
}
