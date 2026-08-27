'use server'

import { redirect } from 'next/navigation'
import { crearOC } from '@/services/ordenes-compra'
import { validarOC, type BorradorOC } from '@/domain/orden-compra'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

/**
 * Crea la OC desde el formulario.
 *
 * Valida con `validarOC` en el servidor aunque el formulario ya valide en el
 * navegador: los `required` del HTML son comodidad, no una garantía — un
 * request armado a mano los saltea.
 */
export async function crearOrdenCompra(
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const lineas = leerLineas(form)

  const borrador: BorradorOC & { notas: string | null; cuentaBancariaId: string | null } = {
    proveedorId: String(form.get('proveedorId') ?? ''),
    fechaEmision: String(form.get('fechaEmision') ?? ''),
    fechaEntregaEstimada: textoONull(form.get('fechaEntregaEstimada')),
    moneda: String(form.get('moneda') ?? 'PEN'),
    condicionesPagoDias: numeroONull(form.get('condicionesPagoDias')),
    notas: textoONull(form.get('notas')),
    cuentaBancariaId: textoONull(form.get('cuentaBancariaId')),
    lineas,
  }

  const errores = validarOC(borrador)
  if (errores.length > 0) return { errores }

  let oc: { id: string }
  try {
    oc = await crearOC(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect(`/ordenes-compra/${oc.id}`)
}

function leerLineas(form: FormData) {
  const productos = form.getAll('linea_producto').map(String)
  const cantidades = form.getAll('linea_cantidad').map(String)
  const precios = form.getAll('linea_precio').map(String)

  return productos
    .map((productoId, i) => ({
      productoId,
      cantidadPedida: Number(cantidades[i] ?? 0),
      precioUnitario: Number(precios[i] ?? 0),
    }))
    // Una fila totalmente vacía es una fila que la persona agregó y no usó:
    // se descarta en silencio en vez de hacerla fallar la validación.
    .filter((l) => l.productoId || l.cantidadPedida || l.precioUnitario)
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

function numeroONull(v: FormDataEntryValue | null): number | null {
  const s = textoONull(v)
  return s == null ? null : Number(s)
}
