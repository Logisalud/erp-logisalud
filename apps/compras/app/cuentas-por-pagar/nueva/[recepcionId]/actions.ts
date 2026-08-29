'use server'

import { redirect } from 'next/navigation'
import { registrarObligacionDesdeRecepcion, type LineaObligacionInput } from '@/services/obligaciones'
import { validarObligacion, type BorradorObligacion } from '@/domain/obligacion'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function registrarObligacionAction(
  recepcionId: string,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const numeroFactura = String(form.get('numeroFactura') ?? '')
  const fechaFactura = String(form.get('fechaFactura') ?? '')
  const moneda = String(form.get('moneda') ?? 'PEN')
  const tipoCambio = numeroONull(form.get('tipoCambio'))
  const lineas = leerLineas(form)

  const baseImponible = lineas.reduce((acc, l) => acc + l.cantidadFacturada * l.precioFacturado, 0)

  // proveedorId no es un campo de este formulario: lo resuelve el servidor
  // desde la recepción → OC. Se pasa un valor fijo no vacío solo para que
  // validarObligacion() no lo marque como faltante — esa validación no
  // aplica acá. Sin detracción acá tampoco: por decisión de negocio solo
  // aplica a Servicios (ver app/servicios/[id]/registrar-obligacion).
  const borrador: BorradorObligacion = {
    proveedorId: 'resuelto-por-el-servidor',
    numeroFactura, fechaFactura, moneda, tipoCambio, baseImponible,
    tasaDetraccionId: null, montoDetraccion: null,
  }

  const errores = validarObligacion(borrador).filter((e) => e.campo !== 'proveedorId')
  if (lineas.length === 0) errores.push({ campo: 'lineas', mensaje: 'Carga al menos una línea facturada.' })
  if (errores.length > 0) return { errores }

  let obligacion: { id: string; conforme: boolean }
  try {
    obligacion = await registrarObligacionDesdeRecepcion({
      recepcionId, numeroFactura, fechaFactura, tipoCambio, tasaDetraccionId: null, montoDetraccion: null, lineas,
    })
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect(`/cuentas-por-pagar/${obligacion.id}`)
}

function leerLineas(form: FormData): LineaObligacionInput[] {
  const ocItemIds = form.getAll('linea_ocItemId').map(String)
  const cantidades = form.getAll('linea_cantidadFacturada').map(String)
  const precios = form.getAll('linea_precioFacturado').map(String)

  return ocItemIds
    .map((ocItemId, i) => ({
      ocItemId,
      cantidadFacturada: Number(cantidades[i] ?? 0),
      precioFacturado: Number(precios[i] ?? 0),
    }))
    .filter((l) => l.cantidadFacturada > 0)
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

function numeroONull(v: FormDataEntryValue | null): number | null {
  const s = textoONull(v)
  return s == null ? null : Number(s)
}
