'use server'

import { redirect } from 'next/navigation'
import { crearFraccionamiento } from '@/services/financiamiento'
import { validarFraccionamiento, type BorradorCuota, type BorradorFraccionamiento } from '@/domain/financiamiento'
import { parsearCuotasExcel } from '@/lib/excel-cuotas'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearFraccionamientoAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  // Si se subió un Excel, gana sobre lo que haya en la tabla manual (ver
  // el aviso del propio formulario) — components/cuotas-input.tsx.
  const archivoCuotas = form.get('archivoCuotas')
  let cuotas: BorradorCuota[]
  if (archivoCuotas instanceof File && archivoCuotas.size > 0) {
    const resultado = parsearCuotasExcel(await archivoCuotas.arrayBuffer())
    if (!resultado.ok) return { errores: resultado.errores }
    cuotas = resultado.cuotas
  } else {
    cuotas = parsearCuotas(form.get('cuotasJson'))
  }

  const borrador: BorradorFraccionamiento = {
    numeroExpediente: String(form.get('numeroExpediente') ?? ''),
    tipo: textoONull(form.get('tipo')),
    tipoImpuestoId: textoONull(form.get('tipoImpuestoId')),
    deudaOriginal: Number(form.get('deudaOriginal') ?? 0),
    tasaInteresMoratorio: form.get('tasaInteresMoratorio') ? Number(form.get('tasaInteresMoratorio')) : null,
    fechaResolucion: textoONull(form.get('fechaResolucion')),
    fechaResolucionObligatoria: textoONull(form.get('fechaResolucionObligatoria')),
    cuotas,
  }

  const errores = validarFraccionamiento(borrador)
  if (errores.length > 0) return { errores }

  let fraccionamiento: { id: string }
  try {
    fraccionamiento = await crearFraccionamiento(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  redirect(`/financiamiento/fraccionamientos/${fraccionamiento.id}`)
}

function parsearCuotas(raw: FormDataEntryValue | null): BorradorCuota[] {
  if (!raw) return []
  try {
    const filas = JSON.parse(String(raw)) as { numeroCuota: number; fechaVencimiento: string; montoCapital: string; montoInteres: string }[]
    return filas.map((f) => ({
      numeroCuota: Number(f.numeroCuota),
      fechaVencimiento: f.fechaVencimiento,
      montoCapital: Number(f.montoCapital) || 0,
      montoInteres: Number(f.montoInteres) || 0,
    }))
  } catch {
    return []
  }
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
