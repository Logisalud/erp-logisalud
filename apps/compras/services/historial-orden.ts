import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'

/**
 * Historial de una orden — construido SOLO con fechas reales que ya existen
 * en la base (created_at de la OC/OS, fecha_conformidad de cada recepción,
 * created_at/conformidad_fecha de la obligación, fecha_pago del pago). No
 * hay una tabla de eventos genérica para OC/OS (solo
 * `cuentas_x_pagar.historial_estados`, que es de obligaciones) — así que
 * transiciones sin una columna de fecha propia (ej. exactamente cuándo pasó
 * de 'enviada' a 'confirmada') no aparecen acá: mejor no mostrarlas que
 * inventarlas. Ver PR: esto queda documentado como brecha real.
 */

export type EventoHistorial = { fecha: string; evento: string; detalle?: string }

export async function obtenerHistorialOC(ocId: string): Promise<EventoHistorial[]> {
  const supabase = crearClienteServidor()
  const eventos: EventoHistorial[] = []

  const { data: oc } = await supabase.schema('compras').from('ordenes_compra').select('created_at, codigo').eq('id', ocId).maybeSingle()
  if (oc) eventos.push({ fecha: oc.created_at, evento: 'Orden creada', detalle: oc.codigo })

  const { data: recepciones } = await supabase
    .schema('almacen')
    .from('recepciones')
    .select('fecha_conformidad, estado')
    .eq('oc_id', ocId)
    .not('fecha_conformidad', 'is', null)
  for (const r of recepciones ?? []) {
    eventos.push({ fecha: r.fecha_conformidad, evento: 'Recepción conforme registrada' })
  }

  const { data: obligacion } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, created_at, conformidad_fecha, numero_factura, estado')
    .eq('oc_id', ocId)
    .maybeSingle()
  if (obligacion) {
    eventos.push({ fecha: obligacion.created_at, evento: 'Factura registrada', detalle: obligacion.numero_factura ?? undefined })
    if (obligacion.conformidad_fecha) {
      eventos.push({ fecha: obligacion.conformidad_fecha, evento: 'Factura con conformidad' })
    }
    const pago = await obtenerFechaPago(obligacion.id)
    if (pago) eventos.push({ fecha: pago.fecha, evento: 'Pago registrado', detalle: pago.voucher ?? undefined })
  }

  return eventos.filter((e) => !!e.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export async function obtenerHistorialOS(osId: string): Promise<EventoHistorial[]> {
  const supabase = crearClienteServidor()
  const eventos: EventoHistorial[] = []

  const { data: os } = await supabase.schema('servicios').from('ordenes_servicio').select('created_at, codigo, aprobado_fecha').eq('id', osId).maybeSingle()
  if (os) {
    eventos.push({ fecha: os.created_at, evento: 'Orden creada', detalle: os.codigo })
    if (os.aprobado_fecha) eventos.push({ fecha: os.aprobado_fecha, evento: 'Aprobada por el jefe de área' })
  }

  const { data: conformidad } = await supabase
    .schema('servicios')
    .from('conformidad_servicio')
    .select('fecha_conformidad, conforme, observaciones')
    .eq('os_id', osId)
    .maybeSingle()
  if (conformidad) {
    eventos.push({
      fecha: conformidad.fecha_conformidad,
      evento: conformidad.conforme ? 'Conformidad del servicio confirmada' : 'Servicio marcado como NO conforme',
      detalle: conformidad.observaciones ?? undefined,
    })
  }

  const { data: obligacion } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, created_at, conformidad_fecha, numero_factura')
    .eq('os_id', osId)
    .maybeSingle()
  if (obligacion) {
    eventos.push({ fecha: obligacion.created_at, evento: 'Obligación registrada', detalle: obligacion.numero_factura ?? undefined })
    if (obligacion.conformidad_fecha) eventos.push({ fecha: obligacion.conformidad_fecha, evento: 'Factura con conformidad' })
    const pago = await obtenerFechaPago(obligacion.id)
    if (pago) eventos.push({ fecha: pago.fecha, evento: 'Pago registrado', detalle: pago.voucher ?? undefined })
  }

  return eventos.filter((e) => !!e.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha))
}

async function obtenerFechaPago(obligacionId: string): Promise<{ fecha: string; voucher: string | null } | null> {
  const supabase = crearClienteServidor()
  const { data: aplicacion } = await supabase
    .schema('cuentas_x_pagar')
    .from('pago_aplicacion')
    .select('pago_id')
    .eq('obligacion_id', obligacionId)
    .maybeSingle()
  if (!aplicacion) return null
  const { data: pago } = await supabase
    .schema('cuentas_x_pagar')
    .from('pagos')
    .select('fecha_pago, numero_voucher')
    .eq('id', aplicacion.pago_id)
    .maybeSingle()
  if (!pago?.fecha_pago) return null
  return { fecha: pago.fecha_pago, voucher: pago.numero_voucher }
}
