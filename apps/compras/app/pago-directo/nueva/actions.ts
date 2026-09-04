'use server'

import { redirect } from 'next/navigation'
import { exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { validarPagoDirecto } from '@/domain/obligacion'
import { registrarPagoDirecto, subirCotizacionPagoDirecto, completarFacturaPagoDirecto } from '@/services/obligaciones'
import { avisarCreacionSinRomper } from '@/services/avisos'
import { formatoMonto } from '@/domain/aviso-email'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function registrarPagoDirectoAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const moneda = String(form.get('moneda') ?? 'PEN')
  const tipoCambioRaw = form.get('tipoCambio')
  const condicionPagoRaw = form.get('condicionPagoDias')
  // Pieza E: el proveedor todavía no emitió la factura y lo que se registra
  // es la cotización.
  const pendienteFactura = form.get('pendienteFactura') === 'si'

  const borrador = {
    proveedorId: String(form.get('proveedorId') ?? ''),
    categoriaId: String(form.get('categoriaId') ?? ''),
    descripcion: String(form.get('descripcion') ?? '').trim(),
    numeroFactura: String(form.get('numeroFactura') ?? '').trim(),
    fechaFactura: String(form.get('fechaFactura') ?? ''),
    moneda,
    tipoCambio: tipoCambioRaw ? Number(tipoCambioRaw) : null,
    baseImponible: Number(form.get('baseImponible') ?? 0),
    tasaDetraccionId: String(form.get('tasaDetraccionId') ?? '') || null,
    montoDetraccion: form.get('montoDetraccion') ? Number(form.get('montoDetraccion')) : null,
    pendienteFactura,
    condicionPagoDias: condicionPagoRaw !== null && condicionPagoRaw !== '' ? Number(condicionPagoRaw) : null,
  }

  const errores = validarPagoDirecto(borrador)
  if (errores.length > 0) return { errores }

  let registro: { id: string; codigo: string; total: number }
  try {
    registro = await registrarPagoDirecto(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: e instanceof Error ? e.message : 'No se pudo registrar el pago directo.' }] }
  }

  // La cotización es best-effort, igual que el resto de los adjuntos del
  // módulo: si falla la subida, el registro igual quedó creado.
  const archivoCotizacion = form.get('cotizacion')
  if (archivoCotizacion instanceof File) {
    try {
      await subirCotizacionPagoDirecto(registro.id, registro.codigo, archivoCotizacion)
    } catch {
      // No tumbar el registro por una cotización que falló.
    }
  }

  // Pieza D: aviso a Contabilidad al CREAR — independiente de "Dar
  // conformidad", que sigue siendo un paso posterior y separado.
  const [usuario, perfil] = await Promise.all([exigirUsuario(), perfilActual()])
  await avisarCreacionSinRomper({
    tipo: 'pago_directo',
    codigo: registro.codigo,
    monto: registro.total,
    moneda,
    referencia: String(form.get('categoriaNombre') ?? '').trim() || 'Pago directo',
    filas: [
      { etiqueta: 'Registrado por', valor: perfil?.nombre ?? usuario.email ?? null },
      { etiqueta: 'Tipo', valor: 'Pago directo' },
      { etiqueta: 'Proveedor', valor: String(form.get('proveedorNombre') ?? '').trim() || null },
      { etiqueta: 'Categoría', valor: String(form.get('categoriaNombre') ?? '').trim() || null },
      { etiqueta: 'Monto', valor: formatoMonto(registro.total, moneda) },
      { etiqueta: 'N° factura', valor: pendienteFactura ? 'pendiente de factura' : borrador.numeroFactura },
      { etiqueta: 'Motivo', valor: borrador.descripcion },
    ],
    ruta: `/cuentas-por-pagar/${registro.id}`,
    creadorCorreo: usuario.email ?? null,
  })

  redirect(`/cuentas-por-pagar/${registro.id}`)
}

export type EstadoCompletarFactura = { error: string } | null

export async function completarFacturaAction(
  obligacionId: string,
  _previo: EstadoCompletarFactura,
  form: FormData,
): Promise<EstadoCompletarFactura> {
  const numeroFactura = String(form.get('numeroFactura') ?? '').trim()
  const fechaFactura = String(form.get('fechaFactura') ?? '')
  const baseImponible = Number(form.get('baseImponible') ?? 0)

  if (!numeroFactura) return { error: 'Falta el número de factura.' }
  if (!fechaFactura) return { error: 'Falta la fecha de factura.' }
  if (!(baseImponible > 0)) return { error: 'La base imponible tiene que ser mayor a 0.' }

  try {
    await completarFacturaPagoDirecto({ obligacionId, numeroFactura, fechaFactura, baseImponible })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo completar la factura.' }
  }

  redirect(`/cuentas-por-pagar/${obligacionId}`)
}
