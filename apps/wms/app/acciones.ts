'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirContexto, obtenerContexto } from '@/lib/contexto'
import { modoDemoActivo } from '@/lib/demo'
import { COOKIE_ROL_DEMO, rolDemoDesdeCookie } from '@/lib/sesion-demo'
import { repositorio } from '@/services/repositorio-actual'
import { buscar, type ResultadoBusqueda } from '@/domain/panorama'
import type { DatosRegulatorios, EntradaProducto } from '@/domain/productos'
import type { ResultadoAccion } from '@/services/repositorio'

export async function entrarDemo(formData: FormData) {
  if (!modoDemoActivo()) redirect('/login')
  const rol = rolDemoDesdeCookie(String(formData.get('rol') ?? ''))
  if (!rol) redirect('/login')
  cookies().set(COOKIE_ROL_DEMO, rol, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
  redirect('/')
}

export async function salirDemo() {
  cookies().delete(COOKIE_ROL_DEMO)
  redirect('/login')
}

export async function buscarAccion(consulta: string): Promise<ResultadoBusqueda[]> {
  await exigirContexto()
  if (consulta.trim().length < 1) return []
  const repo = repositorio()
  const [panorama, entradas] = await Promise.all([repo.panorama(), repo.buscarEntradas(consulta)])
  return [...buscar(panorama, consulta), ...entradas]
}

export interface EstadoFormulario {
  ok?: boolean
  mensaje?: string
  errores?: Record<string, string>
}

const campo = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

export async function crearProductoAccion(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  const entrada: EntradaProducto = {
    codigo: campo(formData, 'codigo'), descripcion: campo(formData, 'descripcion'), presentacion: campo(formData, 'presentacion'),
    marca: campo(formData, 'marca'), principioActivo: campo(formData, 'principioActivo'),
    unidadMedida: campo(formData, 'unidadMedida'), registroSanitario: campo(formData, 'registroSanitario'),
    rsVence: campo(formData, 'rsVence'), fabricante: campo(formData, 'fabricante'),
    formaPresentacion: campo(formData, 'formaPresentacion'), concentracion: campo(formData, 'concentracion'),
    condicionAlmacenamiento: campo(formData, 'condicionAlmacenamiento'),
  }
  const r: ResultadoAccion<{ id: string }> = await repositorio().crearProducto(entrada, {
    id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles,
  })
  if (!r.ok) return { ok: false, mensaje: r.mensaje, errores: r.errores }
  redirect(`/productos/${r.id}?creado=1`)
}

export async function editarRegulatorioAccion(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  const id = campo(formData, 'id')
  const datos: DatosRegulatorios = {}
  for (const k of ['registroSanitario', 'rsVence', 'formaPresentacion', 'concentracion', 'fabricante', 'condicionAlmacenamiento', 'presentacion', 'principioActivo'] as const) {
    datos[k] = campo(formData, k)
  }
  const r = await repositorio().editarRegulatorio(id, datos, campo(formData, 'motivo'), {
    id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles,
  })
  if (!r.ok) return { ok: false, mensaje: r.mensaje, errores: r.errores }
  revalidatePath(`/productos/${id}`)
  return { ok: true, mensaje: r.cambios === 0 ? 'No hubo nada que cambiar.' : `Listo. Guardamos ${r.cambios} ${r.cambios === 1 ? 'cambio' : 'cambios'} y quedaron en el historial.` }
}

/** Para pantallas que solo necesitan saber si hay sesión sin redirigir. */
export async function haySesion(): Promise<boolean> {
  return (await obtenerContexto()) !== null
}
