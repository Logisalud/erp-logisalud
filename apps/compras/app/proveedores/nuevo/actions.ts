'use server'

import { redirect } from 'next/navigation'
import { crearProveedorUnificado, type BorradorCuentaBancariaUnificada } from '@/services/proveedores-unificado'
import { validarAltaCompleta, type TipoProveedorUnificado } from '@/domain/proveedor'

const TIPOS_VALIDOS: TipoProveedorUnificado[] = ['mercaderia', 'bien', 'ambos', 'servicio']

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearProveedorAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const tipoRaw = String(form.get('tipo') ?? 'mercaderia')
  const tipo: TipoProveedorUnificado = TIPOS_VALIDOS.includes(tipoRaw as TipoProveedorUnificado)
    ? (tipoRaw as TipoProveedorUnificado)
    : 'mercaderia'
  // Ruta interna a la que volver tras registrar — nunca se confía en un
  // query param para redirigir fuera del propio módulo.
  const volverRaw = String(form.get('volver') ?? '')
  const volver = volverRaw.startsWith('/') ? volverRaw : undefined

  const borrador = {
    tipo,
    ruc: String(form.get('ruc') ?? '').trim(),
    razonSocial: String(form.get('razonSocial') ?? '').trim(),
    nombreComercial: String(form.get('nombreComercial') ?? '').trim() || undefined,
    contactoNombre: String(form.get('contactoNombre') ?? '').trim() || undefined,
    contactoEmail: String(form.get('contactoEmail') ?? '').trim() || undefined,
    contactoTelefono: String(form.get('contactoTelefono') ?? '').trim() || undefined,
    condicionPagoDias: Number(form.get('condicionPagoDias') ?? 30),
    monedaPrincipal: String(form.get('monedaPrincipal') ?? 'PEN'),
  }

  // El alta completa exige cuenta bancaria: un proveedor sin forma de
  // pagarle no sirve, y antes eso recién se descubría el día del pago.
  const tipoCuentaRaw = String(form.get('tipoCuenta') ?? '')
  const cuenta: BorradorCuentaBancariaUnificada = {
    banco: String(form.get('banco') ?? '').trim(),
    tipoCuenta: tipoCuentaRaw === 'ahorros' || tipoCuentaRaw === 'corriente' ? tipoCuentaRaw : null,
    numeroCuenta: String(form.get('numeroCuenta') ?? '').trim(),
    cci: String(form.get('cci') ?? '').trim(),
    moneda: String(form.get('monedaCuenta') ?? 'PEN'),
    titular: String(form.get('titular') ?? '').trim(),
    esPrincipal: true,
  }

  const errores = validarAltaCompleta(borrador, cuenta)
  if (errores.length > 0) return { errores }

  let id: string
  let fuente: 'compra' | 'servicio'
  try {
    const proveedor = await crearProveedorUnificado(borrador, {
      cuenta,
      direccionFiscal: String(form.get('direccionFiscal') ?? '').trim() || null,
    })
    id = proveedor.id
    fuente = proveedor.fuente
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: e instanceof Error ? e.message : 'No se pudo registrar el proveedor.' }] }
  }

  redirect(volver ?? (fuente === 'servicio' ? `/proveedores/servicio/${id}` : `/proveedores/${id}`))
}
