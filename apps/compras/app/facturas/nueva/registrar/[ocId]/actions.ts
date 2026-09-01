'use server'

import { redirect } from 'next/navigation'
import {
  registrarFacturaCompra,
  subirDocumentoFacturaPendiente,
  type BorradorFacturaCompra,
  type LineaFacturaInput,
} from '@/services/facturas-pendientes'
import { extraerCamposFactura, type ResultadoExtraccion } from '@/services/ocr-documento'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function registrarFacturaAction(
  ocId: string,
  ocCodigo: string,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const numeroFactura = String(form.get('numeroFactura') ?? '').trim()
  const fechaFactura = String(form.get('fechaFactura') ?? '')
  const ruc = textoONull(form.get('ruc'))
  const proveedorNombreLeido = textoONull(form.get('proveedorNombreLeido'))
  const baseFactura = Number(form.get('baseFactura') ?? 0)
  const igvFactura = Number(form.get('igvFactura') ?? 0)
  const totalFactura = Number(form.get('totalFactura') ?? 0)
  const tipoCambio = numeroONull(form.get('tipoCambio'))
  const tasaDetraccionId = textoONull(form.get('tasaDetraccionId'))
  const porcentajeDetraccion = numeroONull(form.get('porcentajeDetraccion'))
  const montoDetraccion = numeroONull(form.get('montoDetraccion'))
  const fechaRecepcionFactura = textoONull(form.get('fechaRecepcionFactura'))
  const lineas = leerLineas(form)

  const errores: { campo: string; mensaje: string }[] = []
  if (!numeroFactura) errores.push({ campo: 'numeroFactura', mensaje: 'Falta el número de factura.' })
  if (!fechaFactura) errores.push({ campo: 'fechaFactura', mensaje: 'Falta la fecha de factura.' })
  if (lineas.length === 0) errores.push({ campo: 'lineas', mensaje: 'Carga al menos una línea facturada.' })
  if (errores.length > 0) return { errores }

  let storagePath: string | null = null
  const archivo = form.get('archivo')
  if (archivo instanceof File && archivo.size > 0) {
    storagePath = await subirDocumentoFacturaPendiente(ocCodigo, archivo)
  }

  const borrador: BorradorFacturaCompra = {
    ocId,
    numeroFactura,
    fechaFactura,
    ruc,
    proveedorNombreLeido,
    baseFactura,
    igvFactura,
    totalFactura,
    tipoCambio,
    tasaDetraccionId,
    porcentajeDetraccion,
    montoDetraccion,
    fechaRecepcionFactura,
    lineas,
    storagePath,
  }

  let resultado
  try {
    resultado = await registrarFacturaCompra(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  if (resultado.estado === 'esperando_mercaderia') {
    redirect('/facturas-pendientes/esperando-mercaderia?registrada=1')
  }
  redirect(`/cuentas-por-pagar/${resultado.obligacionId}`)
}

function leerLineas(form: FormData): LineaFacturaInput[] {
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

/**
 * Llamada desde el cliente al elegir un archivo — best-effort, nunca lanza
 * (ver services/ocr-documento.ts para la limitación real: hoy no hay
 * proveedor de OCR/visión conectado, así que esto siempre devuelve
 * `disponible: false`). El formulario solo pre-llena si `disponible` es
 * true y el campo todavía está vacío.
 */
export async function extraerCamposDeArchivoAction(form: FormData): Promise<ResultadoExtraccion> {
  const archivo = form.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return {
      disponible: false,
      campos: { fecha: null, ruc: null, proveedorNombre: null, base: null, igv: null, total: null, porcentajeDetraccion: null, textoCrudo: null },
      motivoNoDisponible: 'Elige un archivo primero.',
    }
  }
  return extraerCamposFactura({ name: archivo.name, type: archivo.type, size: archivo.size })
}
