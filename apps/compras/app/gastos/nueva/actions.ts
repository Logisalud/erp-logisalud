'use server'

import { redirect } from 'next/navigation'
import { exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { crearSolicitud, subirComprobante, subirCotizacion, notificarAnticipoCreado } from '@/services/solicitudes-gasto'
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
    asignadoA: tipo === 'anticipo' ? textoONull(form.get('asignadoA')) : null,
    quienAutoriza: tipo === 'anticipo' ? textoONull(form.get('quienAutoriza')) : null,
  }

  const errores = validarSolicitud(borrador)
  if (errores.length > 0) return { errores }

  let solicitud: { id: string; codigo: string }
  try {
    solicitud = await crearSolicitud(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  if (tipo === 'anticipo') {
    // Pieza 1: la cotización/sustento es opcional — si falla la subida o
    // no se adjuntó nada, la solicitud igual queda creada (mismo criterio
    // best-effort que el comprobante de abajo).
    const archivoCotizacion = form.get('cotizacion')
    let tieneCotizacion = false
    try {
      tieneCotizacion =
        archivoCotizacion instanceof File ? await subirCotizacion(solicitud.id, archivoCotizacion) : false
    } catch {
      // No tumbar la creación de la solicitud por una cotización que falló.
    }

    // Pieza 3: notificación por correo — no bloquea el flujo si Resend
    // falla o no está configurado, el resultado queda en los logs.
    try {
      const [usuario, perfil] = await Promise.all([exigirUsuario(), perfilActual()])
      await notificarAnticipoCreado({
        solicitudId: solicitud.id,
        codigo: solicitud.codigo,
        solicitanteNombre: perfil?.nombre ?? usuario.email ?? 'Alguien del ERP',
        solicitanteCorreo: usuario.email ?? null,
        monto: montoTotalSolicitud(borrador),
        moneda: borrador.moneda,
        descripcion: borrador.descripcion,
        quienAutoriza: borrador.quienAutoriza ?? null,
        tieneCotizacion,
      })
    } catch (e) {
      console.error('[crearSolicitudAction] No se pudo notificar el anticipo por correo:', e)
    }
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
