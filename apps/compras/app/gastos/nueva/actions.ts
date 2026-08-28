'use server'

import { redirect } from 'next/navigation'
import { crearSolicitud, subirComprobante } from '@/services/solicitudes-gasto'
import { validarSolicitud, montoTotalSolicitud, type BorradorSolicitud } from '@/domain/gasto'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearSolicitudAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const tipo = String(form.get('tipo') ?? 'gasto_directo') as BorradorSolicitud['tipo']
  const borrador: BorradorSolicitud = {
    tipo,
    categoriaId: String(form.get('categoriaId') ?? ''),
    moneda: String(form.get('moneda') ?? 'PEN'),
    montoAnticipo: tipo === 'anticipo' ? Number(form.get('montoAnticipo') ?? 0) : null,
    baseImponible: tipo === 'anticipo' ? null : Number(form.get('baseImponible') ?? 0),
    igv: tipo === 'anticipo' ? null : Number(form.get('igv') ?? 0),
    descripcion: String(form.get('descripcion') ?? ''),
    destino: textoONull(form.get('destino')),
    fechaInicio: textoONull(form.get('fechaInicio')),
    fechaFin: textoONull(form.get('fechaFin')),
  }

  const errores = validarSolicitud(borrador)
  if (errores.length > 0) return { errores }

  let solicitud: { id: string; codigo: string }
  try {
    solicitud = await crearSolicitud(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  // El comprobante (foto/PDF + tipo) es opcional en este paso — si la
  // persona no lo tiene a mano todavía, la solicitud igual queda creada y
  // el formulario de comprobante del detalle sirve de respaldo (regla 12:
  // faltar el sustento es una alerta, no un bloqueo).
  if (tipo !== 'anticipo') {
    const archivo = form.get('archivo')
    const tipoComprobante = String(form.get('tipoComprobante') ?? 'boleta') as 'factura' | 'boleta' | 'sin_comprobante'
    try {
      await subirComprobante({
        solicitudId: solicitud.id,
        fase: 'inicial',
        tipoComprobante,
        numero: textoONull(form.get('numero')),
        rucEmisor: textoONull(form.get('rucEmisor')),
        monto: montoTotalSolicitud(borrador),
        sustentable: tipoComprobante !== 'sin_comprobante',
        archivo: archivo instanceof File ? archivo : null,
      })
    } catch {
      // No tumbar la creación de la solicitud por un comprobante que falló.
    }
  }

  redirect(`/gastos/${solicitud.id}`)
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
