'use server'

import { redirect } from 'next/navigation'
import { actualizarOC } from '@/services/ordenes-compra'
import { validarOC, type BorradorOC } from '@/domain/orden-compra'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function actualizarOrdenCompraAction(
  id: string,
  esBien: boolean,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const lineas = esBien ? leerLineasBien(form) : leerLineasMercaderia(form)

  const borrador: BorradorOC & { notas: string | null } = {
    tipo: esBien ? 'bien' : 'mercaderia',
    proveedorId: String(form.get('proveedorId') ?? ''),
    fechaEmision: String(form.get('fechaEmision') ?? ''),
    fechaEntregaEstimada: textoONull(form.get('fechaEntregaEstimada')),
    moneda: String(form.get('moneda') ?? 'PEN'),
    condicionesPagoDias: numeroONull(form.get('condicionesPagoDias')),
    notas: textoONull(form.get('notas')),
    lineas,
  }

  const errores = validarOC(borrador)
  if (errores.length > 0) return { errores }

  try {
    await actualizarOC(id, borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect(`/ordenes-compra/${id}`)
}

function leerLineasMercaderia(form: FormData) {
  const productos = form.getAll('linea_producto').map(String)
  const cantidades = form.getAll('linea_cantidad').map(String)
  const precios = form.getAll('linea_precio').map(String)

  return productos
    .map((productoId, i) => ({
      productoId,
      cantidadPedida: Number(cantidades[i] ?? 0),
      precioUnitario: Number(precios[i] ?? 0),
    }))
    .filter((l) => l.productoId || l.cantidadPedida || l.precioUnitario)
}

function leerLineasBien(form: FormData) {
  const descripciones = form.getAll('linea_descripcion').map(String)
  const cantidades = form.getAll('linea_cantidad').map(String)
  const precios = form.getAll('linea_precio').map(String)

  return descripciones
    .map((descripcionLibre, i) => ({
      descripcionLibre,
      cantidadPedida: Number(cantidades[i] ?? 0),
      precioUnitario: Number(precios[i] ?? 0),
    }))
    .filter((l) => l.descripcionLibre.trim() || l.cantidadPedida || l.precioUnitario)
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

function numeroONull(v: FormDataEntryValue | null): number | null {
  const s = textoONull(v)
  return s == null ? null : Number(s)
}
