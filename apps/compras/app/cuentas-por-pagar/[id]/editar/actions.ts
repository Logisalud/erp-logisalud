'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { validarPagoDirecto } from '@/domain/obligacion'
import { editarPagoDirecto } from '@/services/obligaciones'
import { avisarCreacionSinRomper } from '@/services/avisos'
import { formatoMonto } from '@/domain/aviso-email'
import { cambioExigeAviso } from '@/domain/edicion'
import type { EstadoFormulario } from '@/app/pago-directo/nueva/actions'

/**
 * Guardar la edición de un Pago Directo — mismo FormData y mismo
 * `validarPagoDirecto` que el alta, porque es el mismo formulario.
 *
 * `pendienteFactura` se lee de lo guardado y no del formulario: al editar,
 * ese campo no se muestra (pasar de cotización a factura real es
 * "Completar factura", que además recalcula el vencimiento). Acá viaja solo
 * para que la validación sepa si exigir número y fecha de comprobante.
 */
export async function editarPagoDirectoAction(
  obligacionId: string,
  pendienteFactura: boolean,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const moneda = String(form.get('moneda') ?? 'PEN')
  const tipoCambioRaw = form.get('tipoCambio')
  const condicionPagoRaw = form.get('condicionPagoDias')
  const proveedorFuenteRaw = String(form.get('proveedorFuente') ?? 'compra')

  const borrador = {
    proveedorId: String(form.get('proveedorId') ?? ''),
    proveedorFuente: (proveedorFuenteRaw === 'servicio' ? 'servicio' : 'compra') as 'compra' | 'servicio',
    categoriaId: String(form.get('categoriaId') ?? ''),
    descripcion: String(form.get('descripcion') ?? '').trim(),
    numeroFactura: String(form.get('numeroFactura') ?? '').trim(),
    fechaFactura: String(form.get('fechaFactura') ?? ''),
    moneda,
    tipoCambio: tipoCambioRaw ? Number(tipoCambioRaw) : null,
    baseImponible: Number(form.get('baseImponible') ?? 0),
    sinIgv: form.get('sinIgv') === 'true',
    tieneDetraccion: leerTieneDetraccion(form.get('tieneDetraccion')),
    porcentajeDetraccion: form.get('porcentajeDetraccion') ? Number(form.get('porcentajeDetraccion')) : null,
    montoDetraccion: form.get('montoDetraccion') ? Number(form.get('montoDetraccion')) : null,
    pendienteFactura,
    condicionPagoDias: condicionPagoRaw !== null && condicionPagoRaw !== '' ? Number(condicionPagoRaw) : null,
  }

  const errores = validarPagoDirecto(borrador)
  if (errores.length > 0) return { errores }

  let resultado: Awaited<ReturnType<typeof editarPagoDirecto>>
  try {
    resultado = await editarPagoDirecto(obligacionId, borrador)
  } catch (e) {
    return {
      errores: [{ campo: 'general', mensaje: e instanceof Error ? e.message : 'No se pudo guardar la edición.' }],
    }
  }

  // Solo si cambió el monto: es lo que cambia qué se está autorizando.
  if (cambioExigeAviso(resultado.montoAntes, resultado.montoDespues)) {
    const [usuario, perfil] = await Promise.all([exigirUsuario(), perfilActual()])
    await avisarCreacionSinRomper({
      tipo: 'pago_directo',
      codigo: resultado.codigo,
      monto: resultado.montoDespues,
      moneda,
      referencia: String(form.get('categoriaNombre') ?? '').trim() || 'Edición',
      filas: [
        { etiqueta: 'Editado por', valor: perfil?.nombre ?? usuario.email ?? null },
        { etiqueta: 'Proveedor', valor: String(form.get('proveedorNombre') ?? '').trim() || null },
        { etiqueta: 'Monto anterior', valor: formatoMonto(resultado.montoAntes, moneda) },
        { etiqueta: 'Monto nuevo', valor: formatoMonto(resultado.montoDespues, moneda) },
      ],
      ruta: `/cuentas-por-pagar/${obligacionId}`,
      creadorCorreo: usuario.email ?? null,
    })
  }

  revalidatePath(`/cuentas-por-pagar/${obligacionId}`)
  redirect(`/cuentas-por-pagar/${obligacionId}`)
}

function leerTieneDetraccion(v: FormDataEntryValue | null): boolean | null {
  if (v === 'si') return true
  if (v === 'no') return false
  return null
}
