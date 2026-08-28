import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import {
  calcularFechaVencimientoReal,
  conciliarLineas,
  redondear,
  TASA_IGV,
  type EstadoObligacion,
  type LineaConciliacion,
} from '@/domain/obligacion'
import { puedeMarcarseFacturada } from '@/domain/orden-compra'

export type ItemParaObligar = {
  ocItemId: string
  cantidadPedida: number
  cantidadRecibida: number
  cantidadYaFacturada: number
  precioUnitario: number
  producto: { codigo: string; descripcion: string; unidad_medida: string } | null
}

export type RecepcionParaObligar = {
  id: string
  fechaConformidad: string
  storagePathGuia: string | null
  storagePathFactura: string | null
  oc: { id: string; codigo: string; moneda: string; proveedor: { id: string; razon_social: string } | null } | null
  items: ItemParaObligar[]
  yaTieneObligacion: boolean
}

/**
 * Junta lo que Contabilidad necesita para registrar la obligación desde una
 * recepción conforme: los ítems pendientes de facturar (herencia de
 * documentos, regla 4 — la guía y la factura que Charlie subió se leen de
 * acá, nadie se las vuelve a pedir).
 */
export async function obtenerRecepcionParaObligar(recepcionId: string): Promise<RecepcionParaObligar | null> {
  const supabase = crearClienteServidor()

  const { data: recepcion, error } = await supabase
    .schema('almacen')
    .from('recepciones')
    .select('id, oc_id, estado, fecha_conformidad, storage_path_guia_recibida, storage_path_factura_proveedor')
    .eq('id', recepcionId)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la recepción: ${error.message}`)
  if (!recepcion || recepcion.estado !== 'conforme' || !recepcion.fecha_conformidad) return null

  const [{ data: oc }, { data: existente }] = await Promise.all([
    supabase
      .schema('compras')
      .from('ordenes_compra')
      .select(`id, codigo, moneda, proveedor:proveedores(id, razon_social),
               ordenes_compra_items(id, producto_id, cantidad_pedida, cantidad_recibida, cantidad_facturada, precio_unitario)`)
      .eq('id', recepcion.oc_id)
      .maybeSingle(),
    supabase
      .schema('cuentas_x_pagar')
      .from('obligaciones')
      .select('id')
      .eq('recepcion_id', recepcionId)
      .maybeSingle(),
  ])

  if (!oc) throw new Error('No se encontró la orden de compra de esta recepción.')

  const items: any[] = (oc as any).ordenes_compra_items ?? []
  const productos = await mapaProductosBasico(items.map((i) => i.producto_id))

  return {
    id: recepcion.id,
    fechaConformidad: recepcion.fecha_conformidad,
    storagePathGuia: recepcion.storage_path_guia_recibida,
    storagePathFactura: recepcion.storage_path_factura_proveedor,
    oc: {
      id: (oc as any).id,
      codigo: (oc as any).codigo,
      moneda: (oc as any).moneda,
      proveedor: Array.isArray((oc as any).proveedor) ? (oc as any).proveedor[0] ?? null : (oc as any).proveedor,
    },
    items: items
      .filter((i) => Number(i.cantidad_facturada) < Number(i.cantidad_recibida))
      .map((i) => ({
        ocItemId: i.id,
        cantidadPedida: Number(i.cantidad_pedida),
        cantidadRecibida: Number(i.cantidad_recibida),
        cantidadYaFacturada: Number(i.cantidad_facturada),
        precioUnitario: Number(i.precio_unitario),
        producto: productos.get(i.producto_id) ?? null,
      })),
    yaTieneObligacion: !!existente,
  }
}

async function mapaProductosBasico(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase.schema('catalogo').from('productos').select('id, codigo, descripcion, unidad_medida').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, p]))
}

export type LineaObligacionInput = { ocItemId: string; cantidadFacturada: number; precioFacturado: number }

export type BorradorObligacionCompra = {
  recepcionId: string
  numeroFactura: string
  fechaFactura: string
  tipoCambio: number | null
  tasaDetraccionId: string | null
  montoDetraccion: number | null
  lineas: LineaObligacionInput[]
}

/**
 * Registra la obligación de una compra desde una recepción conforme.
 *
 * Aplica la conciliación de 3 vías (regla 1) para decidir el estado inicial
 * ('registrada' si concilia, 'observada' si no) y calcula
 * `fecha_vencimiento_real` desde `fecha_conformidad` de la recepción, nunca
 * desde la OC ni la factura (regla 3).
 */
export async function registrarObligacionDesdeRecepcion(
  borrador: BorradorObligacionCompra
): Promise<{ id: string; conforme: boolean }> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: recepcion, error: errRec } = await supabase
    .schema('almacen')
    .from('recepciones')
    .select('id, oc_id, estado, fecha_conformidad')
    .eq('id', borrador.recepcionId)
    .maybeSingle()

  if (errRec || !recepcion) throw new Error('No se encontró la recepción.')
  if (recepcion.estado !== 'conforme' || !recepcion.fecha_conformidad) {
    throw new Error('Solo se puede registrar una obligación desde una recepción conforme.')
  }

  const { data: existente } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id')
    .eq('recepcion_id', borrador.recepcionId)
    .maybeSingle()
  if (existente) throw new Error('Esta recepción ya tiene una obligación registrada.')

  const { data: oc, error: errOc } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select('id, moneda, proveedor_id, condiciones_pago_dias, ordenes_compra_items(id, cantidad_pedida, cantidad_recibida, cantidad_facturada, precio_unitario)')
    .eq('id', recepcion.oc_id)
    .maybeSingle()
  if (errOc || !oc) throw new Error('No se encontró la orden de compra de esta recepción.')

  const { data: proveedor, error: errProv } = await supabase
    .schema('compras')
    .from('proveedores')
    .select('id, condicion_pago_dias')
    .eq('id', oc.proveedor_id)
    .maybeSingle()
  if (errProv || !proveedor) throw new Error('No se encontró el proveedor.')

  const condicionPagoDias = oc.condiciones_pago_dias ?? proveedor.condicion_pago_dias
  const fechaVencimientoReal = calcularFechaVencimientoReal(recepcion.fecha_conformidad, condicionPagoDias)

  const itemsMap = new Map((oc.ordenes_compra_items as any[]).map((i) => [i.id, i]))
  if (borrador.lineas.length === 0) throw new Error('Agrega al menos una línea facturada.')

  const lineasConciliacion: LineaConciliacion[] = borrador.lineas.map((l) => {
    const item = itemsMap.get(l.ocItemId)
    if (!item) throw new Error('Una línea no corresponde a esta orden de compra.')
    return {
      ocItemId: l.ocItemId,
      cantidadPedida: Number(item.cantidad_pedida),
      cantidadRecibida: Number(item.cantidad_recibida),
      cantidadFacturada: l.cantidadFacturada,
      precioPactado: Number(item.precio_unitario),
      precioFacturado: l.precioFacturado,
    }
  })
  const conciliacion = conciliarLineas(lineasConciliacion)
  const baseImponible = redondear(
    borrador.lineas.reduce((acc, l) => acc + redondear(l.cantidadFacturada * l.precioFacturado), 0)
  )

  const estadoInicial: EstadoObligacion = conciliacion.conforme ? 'registrada' : 'observada'

  const { data: obligacion, error: errIns } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .insert({
      origen: 'compra',
      proveedor_id: oc.proveedor_id,
      oc_id: oc.id,
      recepcion_id: borrador.recepcionId,
      numero_factura: borrador.numeroFactura,
      fecha_factura: borrador.fechaFactura,
      moneda: oc.moneda,
      tipo_cambio: borrador.tipoCambio,
      base_imponible: baseImponible,
      // Las compras de mercadería sí llevan IGV real de un comprobante
      // formal — a diferencia de gasto_directo/reembolso (ver
      // services/solicitudes-gasto.ts), acá se sigue asumiendo 18% en vez
      // de pedírselo a Contabilidad campo por campo. Si en el futuro
      // aparece un proveedor de compras con boleta sin discriminar IGV,
      // este es el lugar para pedirlo explícito igual que se hizo con
      // gastos.
      igv: redondear(baseImponible * TASA_IGV),
      tasa_detraccion_id: borrador.tasaDetraccionId,
      monto_detraccion: borrador.montoDetraccion ?? 0,
      estado: estadoInicial,
      fecha_vencimiento_real: fechaVencimientoReal,
      created_by: usuario.id,
      observaciones: conciliacion.conforme ? null : conciliacion.discrepancias.map((d) => d.motivo).join(' | '),
    })
    .select('id')
    .single()

  if (errIns) {
    if (errIns.code === '23505') {
      throw new Error('Ya existe una obligación con ese número de factura para este proveedor.')
    }
    throw new Error(`No se pudo registrar la obligación: ${errIns.message}`)
  }

  const { error: errItems } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones_items')
    .insert(
      borrador.lineas.map((l) => ({
        obligacion_id: obligacion.id,
        oc_item_id: l.ocItemId,
        cantidad_facturada: l.cantidadFacturada,
        precio_facturado: l.precioFacturado,
      }))
    )

  if (errItems) {
    await supabase.schema('cuentas_x_pagar').from('obligaciones').delete().eq('id', obligacion.id)
    throw new Error(`No se pudieron guardar las líneas: ${errItems.message}`)
  }

  for (const l of borrador.lineas) {
    const item = itemsMap.get(l.ocItemId)
    await supabase
      .schema('compras')
      .from('ordenes_compra_items')
      .update({ cantidad_facturada: Number(item.cantidad_facturada) + l.cantidadFacturada })
      .eq('id', l.ocItemId)
  }

  const { data: itemsOC } = await supabase
    .schema('compras')
    .from('ordenes_compra_items')
    .select('cantidad_pedida, cantidad_facturada')
    .eq('oc_id', oc.id)
  const completo = (itemsOC ?? []).every((i) => Number(i.cantidad_facturada) >= Number(i.cantidad_pedida))
  if (puedeMarcarseFacturada(completo)) {
    await supabase.schema('compras').from('ordenes_compra').update({ estado: 'facturada' }).eq('id', oc.id)
  }

  return { id: obligacion.id, conforme: conciliacion.conforme }
}

export type ObligacionListada = {
  id: string
  codigo: string
  origen: string
  numero_factura: string | null
  moneda: string
  total: number
  neto_a_pagar: number
  estado: EstadoObligacion
  fecha_vencimiento_real: string | null
  proveedor: { id: string; razon_social: string } | null
  /** Para origen distinto de 'compra'/'servicio': a quién se le paga (empleado, ver public.perfiles). */
  beneficiario: { nombre: string | null } | null
  /**
   * Fallback de display para origen prestamo/fraccionamiento_sunat/impuesto:
   * ninguno de esos tiene proveedor ni beneficiario_persona (no le pagan a
   * un proveedor del catálogo ni a un empleado), así que
   * services/financiamiento.ts y services/impuestos.ts dejan acá una
   * etiqueta legible (entidad financiera, expediente SUNAT, tipo+periodo)
   * al generar la obligación.
   */
  observaciones: string | null
}

export async function listarObligaciones(estado?: EstadoObligacion): Promise<ObligacionListada[]> {
  const supabase = crearClienteServidor()
  let q = supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, codigo, origen, numero_factura, moneda, total, neto_a_pagar, estado, fecha_vencimiento_real, proveedor_id, beneficiario_persona, observaciones')
    .order('created_at', { ascending: false })
    .limit(200)

  if (estado) q = q.eq('estado', estado)

  const { data, error } = await q
  if (error) throw new Error(`No se pudieron listar las obligaciones: ${error.message}`)

  const [proveedores, beneficiarios] = await Promise.all([
    mapaProveedoresBasico([...new Set((data ?? []).map((o) => o.proveedor_id).filter(Boolean))] as string[]),
    mapaBeneficiarios([...new Set((data ?? []).map((o) => o.beneficiario_persona).filter(Boolean))] as string[]),
  ])
  return (data ?? []).map((o) => ({
    ...o,
    proveedor: o.proveedor_id ? proveedores.get(o.proveedor_id) ?? null : null,
    beneficiario: o.beneficiario_persona ? beneficiarios.get(o.beneficiario_persona) ?? null : null,
  }))
}

/** Origen gasto_directo/reembolso/anticipo: el beneficiario es un empleado, no un proveedor. */
async function mapaBeneficiarios(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, { nombre: p.nombre }]))
}

async function mapaProveedoresBasico(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase.schema('compras').from('proveedores').select('id, razon_social').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, { id: p.id, razon_social: p.razon_social }]))
}

export type ObligacionDetalle = ObligacionListada & {
  base_imponible: number
  igv: number
  monto_detraccion: number
  fecha_factura: string | null
  observaciones: string | null
  recepcion: {
    id: string
    storage_path_guia_recibida: string | null
    storage_path_factura_proveedor: string | null
  } | null
  oc: { id: string; codigo: string } | null
  items: {
    id: string
    cantidad_facturada: number
    precio_facturado: number
    producto: { codigo: string; descripcion: string; unidad_medida: string } | null
  }[]
  notasCredito: { id: string; numero_nc: string | null; monto: number; motivo: string; aplicada: boolean }[]
}

export async function obtenerObligacion(id: string): Promise<ObligacionDetalle | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select(`id, codigo, origen, numero_factura, fecha_factura, moneda, total, neto_a_pagar, base_imponible, igv,
             monto_detraccion, estado, fecha_vencimiento_real, observaciones, proveedor_id, beneficiario_persona,
             oc_id, recepcion_id,
             obligaciones_items(id, oc_item_id, cantidad_facturada, precio_facturado)`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la obligación: ${error.message}`)
  if (!data) return null

  const [proveedores, beneficiarios, oc, recepcion, notasCredito] = await Promise.all([
    mapaProveedoresBasico(data.proveedor_id ? [data.proveedor_id] : []),
    mapaBeneficiarios(data.beneficiario_persona ? [data.beneficiario_persona] : []),
    data.oc_id ? obtenerOCBasica(data.oc_id) : Promise.resolve(null),
    data.recepcion_id ? obtenerRecepcionBasica(data.recepcion_id) : Promise.resolve(null),
    listarNotasCredito(id),
  ])

  const items: any[] = (data as any).obligaciones_items ?? []
  const productos = await mapaProductosPorOCItem(items.map((i) => i.oc_item_id))

  return {
    id: data.id,
    codigo: data.codigo,
    origen: data.origen,
    numero_factura: data.numero_factura,
    fecha_factura: data.fecha_factura,
    moneda: data.moneda,
    total: Number(data.total),
    neto_a_pagar: Number(data.neto_a_pagar),
    base_imponible: Number(data.base_imponible),
    igv: Number(data.igv),
    monto_detraccion: Number(data.monto_detraccion),
    estado: data.estado,
    fecha_vencimiento_real: data.fecha_vencimiento_real,
    observaciones: data.observaciones,
    proveedor: data.proveedor_id ? proveedores.get(data.proveedor_id) ?? null : null,
    beneficiario: data.beneficiario_persona ? beneficiarios.get(data.beneficiario_persona) ?? null : null,
    oc,
    recepcion,
    items: items.map((i) => ({
      id: i.id,
      cantidad_facturada: Number(i.cantidad_facturada),
      precio_facturado: Number(i.precio_facturado),
      producto: productos.get(i.oc_item_id) ?? null,
    })),
    notasCredito,
  }
}

async function obtenerOCBasica(ocId: string) {
  const supabase = crearClienteServidor()
  const { data } = await supabase.schema('compras').from('ordenes_compra').select('id, codigo').eq('id', ocId).maybeSingle()
  return data ?? null
}

async function obtenerRecepcionBasica(recepcionId: string) {
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('almacen')
    .from('recepciones')
    .select('id, storage_path_guia_recibida, storage_path_factura_proveedor')
    .eq('id', recepcionId)
    .maybeSingle()
  return data ?? null
}

async function mapaProductosPorOCItem(ocItemIds: string[]) {
  const supabase = crearClienteServidor()
  if (ocItemIds.length === 0) return new Map()
  const { data: items } = await supabase.schema('compras').from('ordenes_compra_items').select('id, producto_id').in('id', ocItemIds)
  const productoIdPorItem = new Map((items ?? []).map((i: any) => [i.id, i.producto_id]))
  const productos = await mapaProductosBasico([...new Set(productoIdPorItem.values())] as string[])
  const resultado = new Map<string, any>()
  for (const [ocItemId, productoId] of productoIdPorItem) resultado.set(ocItemId, productos.get(productoId) ?? null)
  return resultado
}

async function listarNotasCredito(obligacionId: string) {
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('compras')
    .from('notas_credito')
    .select('id, numero_nc, monto, motivo, aplicada')
    .eq('obligacion_id', obligacionId)
    .order('created_at', { ascending: false })
  return data ?? []
}

/**
 * Contabilidad da conformidad — regla 5: una obligación `origen = 'servicio'`
 * no puede pasar a 'conforme' sin una fila en `servicios.conformidad_servicio`
 * con `conforme = true` para su `os_id`, sin importar en qué orden se
 * subieron la factura y la conformidad (ver domain/servicio.ts).
 */
export async function darConformidad(obligacionId: string): Promise<void> {
  const perfil = await perfilActual()
  const puedeDarConformidad = perfil?.area === 'admin' || (perfil?.area === 'contabilidad' && perfil?.rol === 'admin')
  if (!puedeDarConformidad) {
    throw new Error('Solo Contabilidad (rol admin) puede dar conformidad a una obligación.')
  }

  const supabase = crearClienteServidor()
  const { data: obligacion, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, estado, origen, os_id')
    .eq('id', obligacionId)
    .maybeSingle()
  if (error || !obligacion) throw new Error('No se encontró la obligación.')
  if (obligacion.estado !== 'registrada' && obligacion.estado !== 'observada') {
    throw new Error('Solo una obligación registrada u observada puede pasar a conforme.')
  }

  if (obligacion.origen === 'servicio') {
    const { data: conformidad } = await supabase
      .schema('servicios')
      .from('conformidad_servicio')
      .select('id')
      .eq('os_id', obligacion.os_id)
      .eq('conforme', true)
      .maybeSingle()
    if (!conformidad) {
      throw new Error('El área usuaria todavía no dio conformidad de que el servicio se cumplió — no se puede dar conformidad sin eso.')
    }
  }

  const usuario = await exigirUsuario()
  const { error: errUpd } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .update({ estado: 'conforme', conformidad_por: usuario.id, conformidad_fecha: new Date().toISOString() })
    .eq('id', obligacionId)
  if (errUpd) throw new Error(`No se pudo dar conformidad: ${errUpd.message}`)
}

export async function listarTasasDetraccion() {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('tasas_detraccion')
    .select('id, categoria, porcentaje, anexo_sunat')
    .eq('vigente', true)
    .order('categoria')
  if (error) throw new Error(`No se pudieron listar las tasas de detracción: ${error.message}`)
  return data ?? []
}
