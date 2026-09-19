'use server'

import { revalidatePath } from 'next/cache'
import {
  cambiarActivoProveedor,
  editarDatosProveedor,
  tieneMovimientos,
  crearCuentaBancariaUnificada,
  eliminarCuentaBancariaUnificada,
  type BorradorCuentaBancariaUnificada,
} from '@/services/proveedores-unificado'
import {
  validarEdicionProveedor,
  type DatosEditablesProveedor,
  type FuenteProveedor,
} from '@/domain/proveedor'

export type EstadoAccion = { error: string } | null

/**
 * El formulario de datos necesita saber si GUARDÓ, no solo si falló: la
 * ficha vuelve a modo lectura recién cuando el guardado salió bien. Un
 * `null` no alcanza porque también es el estado inicial.
 */
export type EstadoGuardado = { error: string } | { ok: true } | null

function ruta(fuente: FuenteProveedor, id: string) {
  return fuente === 'compra' ? `/proveedores/${id}` : `/proveedores/servicio/${id}`
}

/**
 * Desactivar es la única baja que existe (soft, nunca se borra un
 * proveedor con movimientos — Carta de Simplicidad: no se oculta la
 * consecuencia, si tiene OC/OS emitidas el mensaje lo dice). El
 * formulario ya le mostró el aviso antes de mandar `confirmado=true`
 * cuando hay movimientos — acá se revalida igual, nunca se confía solo en
 * lo que mandó el cliente.
 */
export async function cambiarActivoAction(
  fuente: FuenteProveedor,
  id: string,
  activo: boolean,
  confirmado: boolean
): Promise<EstadoAccion> {
  try {
    if (!activo) {
      const conMovimientos = await tieneMovimientos(fuente, id)
      if (conMovimientos && !confirmado) {
        return { error: 'Este proveedor ya tiene órdenes emitidas — confirma que igual quieres desactivarlo.' }
      }
    }
    await cambiarActivoProveedor(fuente, id, activo)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(ruta(fuente, id))
  revalidatePath('/proveedores')
  return null
}

/**
 * Corregir un proveedor ya creado. SIN gate de permiso a propósito: hoy lo
 * puede hacer cualquiera con sesión (pedido de Sebas, 2026-09-18), porque el
 * problema real era que un RUC o una razón social mal tipeados no los podía
 * arreglar NADIE y la salida era duplicar el proveedor. Cuando se cierre el
 * acceso abierto temporal (ver CONTEXTO.md) hay que decidir a quién se le
 * deja — la policy `proveedores_escritura` ya dice `compras`/`admin`.
 */
export async function guardarDatosProveedorAction(
  fuente: FuenteProveedor,
  id: string,
  _previo: EstadoGuardado,
  form: FormData
): Promise<EstadoGuardado> {
  const texto = (campo: string) => String(form.get(campo) ?? '').trim() || null
  const datos: DatosEditablesProveedor = {
    ruc: String(form.get('ruc') ?? '').trim(),
    razonSocial: String(form.get('razonSocial') ?? '').trim(),
    nombreComercial: texto('nombreComercial'),
    contactoNombre: texto('contactoNombre'),
    contactoEmail: texto('contactoEmail'),
    contactoTelefono: texto('contactoTelefono'),
    condicionPagoDias: Number(form.get('condicionPagoDias') ?? 0),
    direccionFiscal: texto('direccionFiscal'),
    observaciones: texto('observaciones'),
  }
  const errores = validarEdicionProveedor(datos)
  if (errores.length > 0) return { error: errores.map((e) => e.mensaje).join(' ') }
  try {
    await editarDatosProveedor(fuente, id, datos)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(ruta(fuente, id))
  revalidatePath('/proveedores')
  return { ok: true }
}

export type EstadoFormularioCuenta = { error: string } | null

export async function crearCuentaBancariaAction(
  fuente: FuenteProveedor,
  proveedorId: string,
  _previo: EstadoFormularioCuenta,
  form: FormData
): Promise<EstadoFormularioCuenta> {
  const borrador: BorradorCuentaBancariaUnificada = {
    banco: String(form.get('banco') ?? ''),
    tipoCuenta: (form.get('tipoCuenta') as 'ahorros' | 'corriente') || null,
    numeroCuenta: String(form.get('numeroCuenta') ?? ''),
    cci: String(form.get('cci') ?? ''),
    moneda: String(form.get('moneda') ?? 'PEN'),
    titular: String(form.get('titular') ?? ''),
    esPrincipal: form.get('esPrincipal') === 'on',
  }
  try {
    await crearCuentaBancariaUnificada(fuente, proveedorId, borrador)
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath(ruta(fuente, proveedorId))
  return null
}

export async function eliminarCuentaBancariaAction(fuente: FuenteProveedor, proveedorId: string, cuentaId: string): Promise<void> {
  await eliminarCuentaBancariaUnificada(fuente, cuentaId)
  revalidatePath(ruta(fuente, proveedorId))
}
