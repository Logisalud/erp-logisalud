'use server'

import { redirect } from 'next/navigation'
import { exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { validarPagoDirecto } from '@/domain/obligacion'
import {
  mapaCategoriasPagoDirecto, registrarPagoDirecto, subirCotizacionPagoDirecto,
  subirFacturaPagoDirecto, completarFacturaPagoDirecto,
} from '@/services/obligaciones'
import { avisarCreacionSinRomper } from '@/services/avisos'
import { registrarPagoHistorico, subirVoucherHistoricoSuelto } from '@/services/pago-historico'
import { formatoMonto } from '@/domain/aviso-email'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function registrarPagoDirectoAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const moneda = String(form.get('moneda') ?? 'PEN')
  const tipoCambioRaw = form.get('tipoCambio')
  const condicionPagoRaw = form.get('condicionPagoDias')
  // Pieza E: el proveedor todavía no emitió la factura y lo que se registra
  // es la cotización.
  const pendienteFactura = form.get('pendienteFactura') === 'si'

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

  // El nombre de la categoría decide si aplica el tope de S/5,000 (ver
  // CATEGORIAS_DE_BACKLOG). Se resuelve CONTRA LA BASE y nunca desde
  // el formulario: un campo del cliente sería una forma de saltarse el tope
  // escribiendo el nombre correcto en el HTML.
  const nombresCategoria = await mapaCategoriasPagoDirecto([borrador.categoriaId])
  const errores = validarPagoDirecto({
    ...borrador,
    categoriaNombre: nombresCategoria.get(borrador.categoriaId) ?? null,
  })
  if (errores.length > 0) return { errores }

  let registro: { id: string; codigo: string; total: number }
  try {
    registro = await registrarPagoDirecto(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: e instanceof Error ? e.message : 'No se pudo registrar el pago directo.' }] }
  }

  // La cotización/factura es best-effort, igual que el resto de los adjuntos
  // del módulo: si falla la subida, el registro igual quedó creado. Nunca
  // se suben las dos — pendienteFactura decide cuál de los dos campos vino
  // en el formulario.
  const archivoCotizacion = form.get('cotizacion')
  const archivoFactura = form.get('factura')
  try {
    if (pendienteFactura && archivoCotizacion instanceof File) {
      await subirCotizacionPagoDirecto(registro.id, registro.codigo, archivoCotizacion)
    } else if (!pendienteFactura && archivoFactura instanceof File) {
      await subirFacturaPagoDirecto(registro.id, registro.codigo, archivoFactura)
    }
  } catch {
    // No tumbar el registro por un adjunto que falló.
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

  // Backlog pre-ERP: si se marcó "Ya se pagó", la obligación nace y pasa
  // directo a `pagada` en el mismo envío, sin tener que volver por la ficha.
  // `registrarPagoHistorico` revalida la categoría contra la base, así que
  // marcar esta casilla en otra categoría no hace nada.
  if (form.get('yaPagado') === 'si') {
    try {
      await registrarPagoHistorico({
        obligacionId: registro.id,
        fechaPago: String(form.get('fechaPagoHistorico') ?? ''),
        numeroOperacion: textoONullPD(form.get('numeroOperacionHistorico')),
        storagePathVoucher: textoONullPD(form.get('voucherHistoricoPath')),
      })
    } catch (e) {
      // El registro YA está creado: tumbarlo acá dejaría todo a medias. Se
      // avisa en la ficha, donde el botón "Registrar pago ya realizado"
      // sigue disponible para completarlo.
      console.error('[registrarPagoDirectoAction] no se pudo marcar como pagado:', e)
    }
  }

  redirect(`/cuentas-por-pagar/${registro.id}`)
}

/** La constancia viaja en su propio request — ver services/pago-historico.ts. */
export async function subirVoucherAltaAction(
  form: FormData
): Promise<{ path: string } | { error: string }> {
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return { error: 'No llegó ningún archivo.' }
  try {
    return await subirVoucherHistoricoSuelto(archivo)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo subir la constancia.' }
  }
}

function textoONullPD(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
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
    await completarFacturaPagoDirecto({
      obligacionId, numeroFactura, fechaFactura, baseImponible,
      sinIgv: form.get('sinIgv') === 'true',
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo completar la factura.' }
  }

  redirect(`/cuentas-por-pagar/${obligacionId}`)
}

/** `<input type="radio" name="tieneDetraccion" value="si"|"no">` — ver components/campo-detraccion.tsx. */
function leerTieneDetraccion(v: FormDataEntryValue | null): boolean | null {
  if (v === 'si') return true
  if (v === 'no') return false
  return null
}
