'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  anularAporte, crearAportesEnLote, editarAporte,
} from '@/services/aportes-accionista'
import {
  validarAporte, validarAportes, type BorradorAporte, type ErrorDeLinea,
} from '@/domain/aporte-accionista'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null
export type EstadoAccion = { error: string } | null

function leerBorrador(form: FormData): BorradorAporte {
  return {
    fecha: String(form.get('fecha') ?? ''),
    categoriaId: textoONull(form.get('categoriaId')),
    categoriaLibre: textoONull(form.get('categoriaLibre')),
    descripcion: String(form.get('descripcion') ?? ''),
    moneda: String(form.get('moneda') ?? 'PEN'),
    monto: Number(form.get('monto') ?? 0),
  }
}

export type EstadoLote = { errores: ErrorDeLinea[] } | null

/**
 * Registra N aportes de una vez.
 *
 * Los comprobantes ya vienen subidos —cada uno en su propio request— y lo
 * que llega en el FormData es la RUTA. Ese es el punto del diseño: si los
 * archivos viajaran acá, cuatro fotos de celular pasarían del límite de body
 * y el envío se rechazaría sin dejar ni un error que mostrar.
 */
export async function crearAportesAction(
  _previo: EstadoLote,
  form: FormData
): Promise<EstadoLote> {
  const cantidad = Number(form.get('cantidadLineas') ?? 0)
  const lineas: (BorradorAporte & { storagePathComprobante: string | null })[] = []

  for (let i = 0; i < cantidad; i++) {
    lineas.push({
      fecha: String(form.get(`fecha-${i}`) ?? ''),
      categoriaId: textoONull(form.get(`categoriaId-${i}`)),
      categoriaLibre: textoONull(form.get(`categoriaLibre-${i}`)),
      descripcion: String(form.get(`descripcion-${i}`) ?? ''),
      moneda: String(form.get(`moneda-${i}`) ?? 'PEN'),
      monto: Number(form.get(`monto-${i}`) ?? 0),
      storagePathComprobante: textoONull(form.get(`comprobantePath-${i}`)),
    })
  }

  const errores = validarAportes(lineas)
  if (errores.length > 0) return { errores }

  try {
    await crearAportesEnLote(lineas)
  } catch (e) {
    return { errores: [{ linea: 0, campo: 'general', mensaje: (e as Error).message }] }
  }

  revalidatePath('/aportes-accionista')
  redirect('/aportes-accionista')
}

export async function editarAporteAction(
  aporteId: string,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const borrador = leerBorrador(form)
  const errores = validarAporte(borrador)
  if (errores.length > 0) return { errores }

  try {
    await editarAporte(aporteId, borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  revalidatePath('/aportes-accionista')
  redirect('/aportes-accionista')
}

export async function anularAporteAction(
  aporteId: string,
  _previo: EstadoAccion,
  form: FormData
): Promise<EstadoAccion> {
  try {
    await anularAporte(aporteId, String(form.get('motivo') ?? ''))
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath('/aportes-accionista')
  redirect('/aportes-accionista')
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
