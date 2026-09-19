'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { validarPagoDirecto } from '@/domain/obligacion'
import {
  editarPagoDirecto, mapaCategoriasPagoDirecto,
  subirCotizacionPagoDirecto, subirFacturaPagoDirecto,
} from '@/services/obligaciones'
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

  // Igual que en el alta: el nombre sale de la base, no del formulario.
  const nombresCategoria = await mapaCategoriasPagoDirecto([borrador.categoriaId])
  const errores = validarPagoDirecto({
    ...borrador,
    categoriaNombre: nombresCategoria.get(borrador.categoriaId) ?? null,
  })
  if (errores.length > 0) return { errores }

  let resultado: Awaited<ReturnType<typeof editarPagoDirecto>>
  try {
    resultado = await editarPagoDirecto(obligacionId, borrador)
  } catch (e) {
    return {
      errores: [{ campo: 'general', mensaje: e instanceof Error ? e.message : 'No se pudo guardar la edición.' }],
    }
  }

  // Reemplazar el archivo que sustenta el registro, si vino uno nuevo.
  //
  // Se sube DESPUÉS de guardar los datos y es best-effort, igual que en el
  // alta: si la subida falla, la corrección de los datos igual quedó hecha y
  // el archivo se puede volver a intentar. Al revés —perder la edición
  // porque el PDF pesaba de más— sería peor.
  //
  // No borra el anterior. El path lleva timestamp, así que el archivo viejo
  // sigue en `legajos-compras` y solo deja de estar apuntado. Un reemplazo
  // que borra el original es irreversible por accidente y guardarlo no
  // cuesta nada.
  //
  // Esto NO es "Reemplazar constancia" (el voucher, después de pagado, solo
  // admin, con motivo obligatorio y su propio rastro). Acá todavía no
  // decidió nadie: el rastro es el `editado_por`/`editado_en` que
  // `editarPagoDirecto` ya escribe.
  const archivoNuevo = pendienteFactura ? form.get('cotizacion') : form.get('factura')
  if (archivoNuevo instanceof File && archivoNuevo.size > 0) {
    if (pendienteFactura) {
      await subirCotizacionPagoDirecto(obligacionId, resultado.codigo, archivoNuevo)
    } else {
      await subirFacturaPagoDirecto(obligacionId, resultado.codigo, archivoNuevo)
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
