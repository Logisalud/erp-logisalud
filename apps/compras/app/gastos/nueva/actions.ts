'use server'

import { redirect } from 'next/navigation'
import { exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { crearSolicitud, subirComprobante, subirCotizacion } from '@/services/solicitudes-gasto'
import { avisarCreacionSinRomper } from '@/services/avisos'
import { formatoMonto } from '@/domain/aviso-email'
import {
  validarSolicitud,
  montoTotalSolicitud,
  type BorradorSolicitud,
  type TipoComprobante,
} from '@/domain/gasto'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearSolicitudAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const tipo = String(form.get('tipo') ?? 'gasto_directo') as BorradorSolicitud['tipo']
  const tipoComprobante = String(form.get('tipoComprobante') ?? 'boleta') as TipoComprobante

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
    // Pieza A: informativo en Anticipo y en Reembolso.
    quienAutoriza: tipo === 'gasto_directo' ? null : textoONull(form.get('quienAutoriza')),
    // Pieza H: fecha del comprobante real (no aplica a un anticipo).
    fechaFactura: tipo === 'anticipo' ? null : textoONull(form.get('fechaFactura')),
    tipoComprobante: tipo === 'anticipo' ? null : tipoComprobante,
  }

  const errores = validarSolicitud(borrador)
  if (errores.length > 0) return { errores }

  let solicitud: { id: string; codigo: string }
  try {
    solicitud = await crearSolicitud(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  const monto = montoTotalSolicitud(borrador)
  let tieneCotizacion = false

  if (tipo === 'anticipo') {
    // La cotización/sustento es opcional — si falla la subida o no se
    // adjuntó nada, la solicitud igual queda creada (best-effort, mismo
    // criterio que el comprobante de abajo).
    const archivoCotizacion = form.get('cotizacion')
    try {
      tieneCotizacion =
        archivoCotizacion instanceof File ? await subirCotizacion(solicitud.id, archivoCotizacion) : false
    } catch {
      // No tumbar la creación de la solicitud por una cotización que falló.
    }
  }

  // El comprobante (foto/PDF + tipo) es opcional en este paso — si la
  // persona no lo tiene a mano todavía, la solicitud igual queda creada y
  // el formulario de comprobante del detalle sirve de respaldo (regla 12:
  // faltar el sustento es una alerta, no un bloqueo).
  if (tipo !== 'anticipo') {
    const archivo = form.get('archivo')
    try {
      await subirComprobante({
        solicitudId: solicitud.id,
        fase: 'inicial',
        tipoComprobante,
        numero: textoONull(form.get('numero')),
        rucEmisor: textoONull(form.get('rucEmisor')),
        monto,
        sustentable: tipoComprobante !== 'sin_comprobante',
        archivo: archivo instanceof File ? archivo : null,
      })
    } catch {
      // No tumbar la creación de la solicitud por un comprobante que falló.
    }
  }

  // Pieza D: aviso a Contabilidad al CREAR. Solo Anticipo y Reembolso — un
  // `gasto_directo` como solicitud es un flujo que el menú ya no ofrece.
  if (tipo === 'anticipo' || tipo === 'reembolso') {
    const [usuario, perfil] = await Promise.all([exigirUsuario(), perfilActual()])
    await avisarCreacionSinRomper({
      tipo,
      codigo: solicitud.codigo,
      monto,
      moneda: borrador.moneda,
      referencia: String(form.get('categoriaNombre') ?? '').trim() || (tipo === 'anticipo' ? 'Anticipo' : 'Reembolso'),
      filas: [
        { etiqueta: 'Solicitado por', valor: perfil?.nombre ?? usuario.email ?? null },
        { etiqueta: 'Tipo', valor: tipo === 'anticipo' ? 'Anticipo' : 'Reembolso' },
        { etiqueta: 'Monto', valor: formatoMonto(monto, borrador.moneda) },
        { etiqueta: 'Categoría', valor: String(form.get('categoriaNombre') ?? '').trim() || null },
        { etiqueta: 'Motivo', valor: borrador.descripcion },
        { etiqueta: 'Quién autoriza', valor: borrador.quienAutoriza ?? 'No informado' },
        { etiqueta: 'Fecha comprob.', valor: borrador.fechaFactura ?? null },
        { etiqueta: 'Cotización', valor: tipo === 'anticipo' ? (tieneCotizacion ? 'adjunta' : 'no adjunta') : null },
      ],
      ruta: `/gastos/${solicitud.id}`,
      creadorCorreo: usuario.email ?? null,
    })
  }

  redirect(`/gastos/${solicitud.id}`)
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
