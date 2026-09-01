import 'server-only'
import { crearClienteServidor, exigirUsuario } from '@logisalud/auth/server'
import { conciliarFactura, type LineaFacturaConciliacion, type LineaOCDisponible } from '@/domain/conciliacion'
import { hayRecepcionConSaldoSinFacturar } from '@/domain/facturas-pendientes'
import { calcularFechaVencimientoMultiRecepcion } from '@/domain/vencimiento-obligacion'
import { crearObligacionCompraMultiRecepcion, type LineaFacturacionCompra } from '@/services/obligaciones'

/**
 * Orquesta el flujo NUEVO de registro de factura de compra (Pieza 1 + 2):
 * decide si concilia de inmediato o queda en la cola "esperando
 * mercadería", y — cuando llega la mercadería después — la conciliación
 * disparada desde services/recepciones.ts pasa por acá también. La
 * creación de la Obligación en sí (su Aggregate Root) vive en
 * services/obligaciones.ts — este archivo es dueño de
 * `cuentas_x_pagar.facturas_pendientes`, no de `obligaciones`.
 */

export type LineaFacturaInput = { ocItemId: string; cantidadFacturada: number; precioFacturado: number }

export type BorradorFacturaCompra = {
  ocId: string
  numeroFactura: string
  fechaFactura: string
  ruc: string | null
  proveedorNombreLeido: string | null
  /** Base/IGV/Total TAL COMO dice la factura — nunca se pre-llenan con el
   * total de la OC (regla explícita del formulario). Se guardan crudos acá;
   * el `base_imponible` real de la Obligación sale de la conciliación
   * (domain/conciliacion.ts), que puede ser menor si hay excepción. */
  baseFactura: number
  igvFactura: number
  totalFactura: number
  tipoCambio: number | null
  tasaDetraccionId: string | null
  porcentajeDetraccion: number | null
  montoDetraccion: number | null
  /** Informativa — nunca participa del cálculo de vencimiento (regla 3). */
  fechaRecepcionFactura: string | null
  lineas: LineaFacturaInput[]
  storagePath: string | null
}

export type ResultadoRegistroFactura =
  | { estado: 'esperando_mercaderia'; facturaPendienteId: string }
  | { estado: 'conciliada'; facturaPendienteId: string; obligacionId: string }
  | { estado: 'excepcion'; facturaPendienteId: string; obligacionId: string; motivo: string }

type ItemOC = {
  id: string
  cantidad_pedida: number
  cantidad_recibida: number
  cantidad_facturada: number
  precio_unitario: number
}

type OCParaFactura = {
  id: string
  codigo: string
  moneda: string
  proveedor_id: string
  condiciones_pago_dias: number | null
  items: ItemOC[]
}

async function obtenerOCParaFactura(ocId: string): Promise<OCParaFactura | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select(
      `id, codigo, moneda, proveedor_id, condiciones_pago_dias,
       ordenes_compra_items(id, cantidad_pedida, cantidad_recibida, cantidad_facturada, precio_unitario)`
    )
    .eq('id', ocId)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la orden de compra: ${error.message}`)
  if (!data) return null
  return {
    id: (data as any).id,
    codigo: (data as any).codigo,
    moneda: (data as any).moneda,
    proveedor_id: (data as any).proveedor_id,
    condiciones_pago_dias: (data as any).condiciones_pago_dias,
    items: ((data as any).ordenes_compra_items ?? []).map((i: any) => ({
      id: i.id,
      cantidad_pedida: Number(i.cantidad_pedida),
      cantidad_recibida: Number(i.cantidad_recibida),
      cantidad_facturada: Number(i.cantidad_facturada),
      precio_unitario: Number(i.precio_unitario),
    })),
  }
}

async function obtenerCondicionPagoDias(oc: OCParaFactura): Promise<number> {
  if (oc.condiciones_pago_dias != null) return oc.condiciones_pago_dias
  const supabase = crearClienteServidor()
  const { data } = await supabase.schema('compras').from('proveedores').select('condicion_pago_dias').eq('id', oc.proveedor_id).maybeSingle()
  return data?.condicion_pago_dias ?? 30
}

/**
 * Recepciones conformes de esta OC que TODAVÍA no están vinculadas a
 * ninguna obligación (0029_obligacion_recepciones.sql) y que aportaron
 * alguna de las líneas que esta factura factura. Simplificación explícita:
 * una recepción, una vez vinculada a una obligación, queda "consumida" —
 * no se re-parte entre dos facturas distintas aunque en teoría le hubiera
 * quedado saldo a alguna de sus líneas. Es la regla más simple que sostiene
 * el caso real (una factura cubre 1-N recepciones completas), documentada
 * acá para quien necesite revisarla si aparece un caso más fino.
 */
async function recepcionesDisponiblesQueCubren(ocId: string, ocItemIds: readonly string[]): Promise<string[]> {
  const supabase = crearClienteServidor()

  const { data: recepciones, error } = await supabase
    .schema('almacen')
    .from('recepciones')
    .select('id')
    .eq('oc_id', ocId)
    .eq('estado', 'conforme')
  if (error) throw new Error(`No se pudieron leer las recepciones: ${error.message}`)
  const recepcionIds = (recepciones ?? []).map((r) => r.id)
  if (recepcionIds.length === 0) return []

  const { data: yaVinculadas } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligacion_recepciones')
    .select('recepcion_id')
    .in('recepcion_id', recepcionIds)
  const vinculadas = new Set((yaVinculadas ?? []).map((v) => v.recepcion_id))
  const disponibles = recepcionIds.filter((id) => !vinculadas.has(id))
  if (disponibles.length === 0) return []

  const { data: items } = await supabase
    .schema('almacen')
    .from('recepciones_items')
    .select('recepcion_id, oc_item_id, cantidad_aceptada')
    .in('recepcion_id', disponibles)
    .in('oc_item_id', ocItemIds as string[])
    .gt('cantidad_aceptada', 0)

  return [...new Set((items ?? []).map((i) => i.recepcion_id))]
}

async function fechasConformidad(recepcionIds: readonly string[]): Promise<string[]> {
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('almacen')
    .from('recepciones')
    .select('fecha_conformidad')
    .in('id', recepcionIds as string[])
    .not('fecha_conformidad', 'is', null)
  return (data ?? []).map((r) => r.fecha_conformidad as string)
}

/**
 * Registra una factura de compra contra una OC (Pieza 2). Decide sola si
 * concilia ahora o queda "esperando mercadería" (regla de negocio del
 * módulo, domain/facturas-pendientes.ts). Sin validaciones bloqueantes: la
 * sobrefacturación contra lo PEDIDO sigue siendo un tope duro (reutiliza
 * `validarNoSobrefacturar`, igual que el flujo viejo) porque eso es un
 * error de captura, no una discrepancia de negocio — todo lo demás
 * (facturado > recibido) es una excepción que NO bloquea.
 */
export async function registrarFacturaCompra(borrador: BorradorFacturaCompra): Promise<ResultadoRegistroFactura> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const oc = await obtenerOCParaFactura(borrador.ocId)
  if (!oc) throw new Error('No se encontró la orden de compra.')
  if (borrador.lineas.length === 0) throw new Error('Agrega al menos una línea facturada.')

  const itemsMap = new Map(oc.items.map((i) => [i.id, i]))
  for (const l of borrador.lineas) {
    const item = itemsMap.get(l.ocItemId)
    if (!item) throw new Error('Una línea no corresponde a esta orden de compra.')
    const totalFacturado = item.cantidad_facturada + l.cantidadFacturada
    if (totalFacturado > item.cantidad_pedida) {
      const disponible = Math.max(0, item.cantidad_pedida - item.cantidad_facturada)
      throw new Error(
        `Esta línea solo tiene ${disponible} unidad(es) disponible(s) para facturar (pedido ${item.cantidad_pedida}, ya facturado ${item.cantidad_facturada}) — no se puede facturar ${l.cantidadFacturada}.`
      )
    }
  }

  const { data: fila, error: errIns } = await supabase
    .schema('cuentas_x_pagar')
    .from('facturas_pendientes')
    .insert({
      oc_id: borrador.ocId,
      numero_factura: borrador.numeroFactura || null,
      fecha_factura: borrador.fechaFactura || null,
      ruc: borrador.ruc,
      proveedor_nombre_leido: borrador.proveedorNombreLeido,
      base_imponible: borrador.baseFactura,
      igv: borrador.igvFactura,
      total: borrador.totalFactura,
      tasa_detraccion_id: borrador.tasaDetraccionId,
      porcentaje_detraccion: borrador.porcentajeDetraccion,
      monto_detraccion: borrador.montoDetraccion,
      tipo_cambio: borrador.tipoCambio,
      fecha_recepcion_factura: borrador.fechaRecepcionFactura,
      lineas: borrador.lineas,
      storage_path: borrador.storagePath,
      estado: 'esperando_mercaderia',
      created_by: usuario.id,
    })
    .select('id')
    .single()
  if (errIns) throw new Error(`No se pudo registrar la factura: ${errIns.message}`)

  const resultado = await procesarFacturaPendiente(fila.id, oc)
  return resultado ?? { estado: 'esperando_mercaderia', facturaPendienteId: fila.id }
}

/**
 * Intenta conciliar una factura pendiente ya guardada. Devuelve null si se
 * queda esperando (no hay saldo todavía) — la fila no cambia de estado.
 */
async function procesarFacturaPendiente(facturaPendienteId: string, ocYaCargada?: OCParaFactura): Promise<ResultadoRegistroFactura | null> {
  const supabase = crearClienteServidor()

  const { data: fila, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('facturas_pendientes')
    .select('id, oc_id, numero_factura, fecha_factura, tipo_cambio, tasa_detraccion_id, monto_detraccion, lineas, estado')
    .eq('id', facturaPendienteId)
    .maybeSingle()
  if (error || !fila) throw new Error('No se encontró la factura pendiente.')
  if (fila.estado !== 'esperando_mercaderia') return null // ya se procesó

  const oc = ocYaCargada ?? (await obtenerOCParaFactura(fila.oc_id))
  if (!oc) throw new Error('No se encontró la orden de compra de esta factura.')

  const lineas = (fila.lineas ?? []) as LineaFacturaInput[]
  const itemsMap = new Map(oc.items.map((i) => [i.id, i]))

  const disponibilidad = lineas.map((l) => {
    const item = itemsMap.get(l.ocItemId)
    return { ocItemId: l.ocItemId, cantidadVerificadaDisponible: item ? Math.max(0, item.cantidad_recibida - item.cantidad_facturada) : 0 }
  })
  if (!hayRecepcionConSaldoSinFacturar(disponibilidad)) return null // sigue esperando mercadería

  const recepcionIds = await recepcionesDisponiblesQueCubren(oc.id, lineas.map((l) => l.ocItemId))
  if (recepcionIds.length === 0) return null // saldo recibido existe pero no hay una recepción libre que lo respalde todavía

  const fechas = await fechasConformidad(recepcionIds)
  const condicionPagoDias = await obtenerCondicionPagoDias(oc)
  const fechaVencimientoReal = calcularFechaVencimientoMultiRecepcion(fechas, condicionPagoDias)

  const lineasConciliacion: LineaFacturaConciliacion[] = lineas.map((l) => ({
    ocItemId: l.ocItemId,
    cantidadFacturada: l.cantidadFacturada,
    precioFacturado: l.precioFacturado,
  }))
  const lineasOCDisponibles: LineaOCDisponible[] = lineas.map((l) => {
    const item = itemsMap.get(l.ocItemId)!
    return {
      ocItemId: l.ocItemId,
      cantidadVerificadaDisponible: Math.max(0, item.cantidad_recibida - item.cantidad_facturada),
      precioUnitarioOC: item.precio_unitario,
    }
  })
  const conciliacion = conciliarFactura(lineasConciliacion, lineasOCDisponibles)

  const lineasFacturacion: LineaFacturacionCompra[] = lineas.map((l) => ({
    ocItemId: l.ocItemId,
    cantidadFacturada: l.cantidadFacturada,
    precioFacturado: l.precioFacturado,
  }))

  const observaciones = conciliacion.tieneExcepciones
    ? conciliacion.lineas.filter((l) => l.tieneExcepcion).map((l) => l.motivoExcepcion).join(' | ')
    : null

  const { id: obligacionId } = await crearObligacionCompraMultiRecepcion({
    ocId: oc.id,
    proveedorId: oc.proveedor_id,
    moneda: oc.moneda,
    tipoCambio: fila.tipo_cambio,
    numeroFactura: fila.numero_factura ?? '',
    fechaFactura: fila.fecha_factura ?? new Date().toISOString().slice(0, 10),
    tasaDetraccionId: fila.tasa_detraccion_id,
    montoDetraccion: fila.monto_detraccion,
    lineas: lineasFacturacion,
    recepcionIds,
    fechaVencimientoReal,
    baseImponible: conciliacion.montoTotalConciliado,
    conforme: !conciliacion.tieneExcepciones,
    observaciones,
  })

  const nuevoEstado = conciliacion.tieneExcepciones ? 'excepcion' : 'conciliada'
  await supabase
    .schema('cuentas_x_pagar')
    .from('facturas_pendientes')
    .update({ estado: nuevoEstado, obligacion_id: obligacionId, motivo_excepcion: observaciones, updated_at: new Date().toISOString() })
    .eq('id', facturaPendienteId)

  return conciliacion.tieneExcepciones
    ? { estado: 'excepcion', facturaPendienteId, obligacionId, motivo: observaciones ?? '' }
    : { estado: 'conciliada', facturaPendienteId, obligacionId }
}

/**
 * Llamada desde services/recepciones.ts al final de registrar una
 * recepción: revisa si alguna factura "esperando mercadería" de esta OC ya
 * puede conciliar con lo que Almacén acaba de recibir. Best-effort: si una
 * fila individual falla, no aborta las demás ni la recepción que la
 * disparó — solo la deja como estaba, para que Contabilidad la vea igual en
 * la cola.
 */
export async function intentarConciliarPendientes(ocId: string): Promise<void> {
  const supabase = crearClienteServidor()
  const { data: pendientes, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('facturas_pendientes')
    .select('id')
    .eq('oc_id', ocId)
    .eq('estado', 'esperando_mercaderia')
    .order('created_at', { ascending: true })
  if (error || !pendientes || pendientes.length === 0) return

  for (const p of pendientes) {
    try {
      await procesarFacturaPendiente(p.id)
    } catch {
      // Best-effort — no bloquea la recepción que disparó el intento.
    }
  }
}

export type OCParaFacturarDirecto = {
  id: string
  codigo: string
  estado: string
  moneda: string
  proveedor: { razon_social: string; ruc: string } | null
}

/**
 * OCs elegibles para el flujo nuevo (app/facturas/nueva/por-oc): a
 * diferencia de buscarOrdenesFacturables (services/facturas-elegibles.ts,
 * que exige una recepción YA conforme), acá entra cualquier OC confirmada
 * con saldo por facturar — incluida una que TODAVÍA no recibió nada, porque
 * este es justo el flujo que soporta "la factura llegó antes que la
 * mercadería" (queda esperando en la cola).
 */
export async function listarOCsParaFacturarDirecto(): Promise<OCParaFacturarDirecto[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select(
      `id, codigo, estado, moneda, proveedor:proveedores(razon_social, ruc),
       ordenes_compra_items(cantidad_pedida, cantidad_facturada)`
    )
    .in('estado', ['confirmada', 'parcialmente_recibida', 'recibida_completa'])
    .order('codigo', { ascending: false })
    .limit(200)
  if (error) throw new Error(`No se pudieron listar las órdenes: ${error.message}`)

  return (data ?? [])
    .filter((oc: any) => (oc.ordenes_compra_items ?? []).some((i: any) => Number(i.cantidad_facturada) < Number(i.cantidad_pedida)))
    .map((oc: any) => ({
      id: oc.id,
      codigo: oc.codigo,
      estado: oc.estado,
      moneda: oc.moneda,
      proveedor: Array.isArray(oc.proveedor) ? oc.proveedor[0] ?? null : oc.proveedor,
    }))
}

export type OCParaFacturaDetalle = {
  id: string
  codigo: string
  moneda: string
  proveedor: { id: string; razon_social: string } | null
  items: {
    ocItemId: string
    cantidadPedida: number
    cantidadRecibida: number
    cantidadYaFacturada: number
    precioUnitario: number
    producto: { codigo: string; descripcion: string; unidad_medida: string } | null
  }[]
}

/** Datos de la OC para armar el formulario de factura del flujo nuevo — a
 * diferencia de obtenerRecepcionParaObligar (flujo viejo), esto no exige
 * ninguna recepción conforme: solo que la línea tenga saldo por facturar
 * contra lo PEDIDO (cantidad_recibida puede ser 0 todavía). */
export async function obtenerOCParaFacturaDirecta(ocId: string): Promise<OCParaFacturaDetalle | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select(
      `id, codigo, moneda, proveedor:proveedores(id, razon_social),
       ordenes_compra_items(id, producto_id, cantidad_pedida, cantidad_recibida, cantidad_facturada, precio_unitario)`
    )
    .eq('id', ocId)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la orden de compra: ${error.message}`)
  if (!data) return null

  const items: any[] = (data as any).ordenes_compra_items ?? []
  const productos = await mapaProductosBasico(items.map((i) => i.producto_id))

  return {
    id: (data as any).id,
    codigo: (data as any).codigo,
    moneda: (data as any).moneda,
    proveedor: Array.isArray((data as any).proveedor) ? (data as any).proveedor[0] ?? null : (data as any).proveedor,
    items: items
      .filter((i) => Number(i.cantidad_facturada) < Number(i.cantidad_pedida))
      .map((i) => ({
        ocItemId: i.id,
        cantidadPedida: Number(i.cantidad_pedida),
        cantidadRecibida: Number(i.cantidad_recibida),
        cantidadYaFacturada: Number(i.cantidad_facturada),
        precioUnitario: Number(i.precio_unitario),
        producto: productos.get(i.producto_id) ?? null,
      })),
  }
}

async function mapaProductosBasico(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase.schema('catalogo').from('productos').select('id, codigo, descripcion, unidad_medida').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, p]))
}

export type FacturaPendienteListada = {
  id: string
  oc: { id: string; codigo: string; proveedor: { razon_social: string } | null } | null
  numero_factura: string | null
  fecha_factura: string | null
  total: number | null
  fecha_recepcion_factura: string | null
  created_at: string
}

export async function listarFacturasEsperandoMercaderia(): Promise<FacturaPendienteListada[]> {
  return listarPorEstado('esperando_mercaderia')
}

export type ExcepcionConciliacionListada = FacturaPendienteListada & {
  motivo_excepcion: string | null
  obligacion: { id: string; codigo: string; neto_a_pagar: number } | null
}

export async function listarExcepcionesConciliacion(): Promise<ExcepcionConciliacionListada[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('facturas_pendientes')
    .select('id, oc_id, numero_factura, fecha_factura, total, fecha_recepcion_factura, created_at, motivo_excepcion, obligacion_id')
    .eq('estado', 'excepcion')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`No se pudieron listar las excepciones de conciliación: ${error.message}`)
  const filas = data ?? []

  const [ocs, obligaciones] = await Promise.all([
    mapaOCs([...new Set(filas.map((f) => f.oc_id))]),
    mapaObligaciones([...new Set(filas.map((f) => f.obligacion_id).filter(Boolean))] as string[]),
  ])

  return filas.map((f) => ({
    id: f.id,
    oc: ocs.get(f.oc_id) ?? null,
    numero_factura: f.numero_factura,
    fecha_factura: f.fecha_factura,
    total: f.total != null ? Number(f.total) : null,
    fecha_recepcion_factura: f.fecha_recepcion_factura,
    created_at: f.created_at,
    motivo_excepcion: f.motivo_excepcion,
    obligacion: f.obligacion_id ? obligaciones.get(f.obligacion_id) ?? null : null,
  }))
}

async function listarPorEstado(estado: 'esperando_mercaderia'): Promise<FacturaPendienteListada[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('facturas_pendientes')
    .select('id, oc_id, numero_factura, fecha_factura, total, fecha_recepcion_factura, created_at')
    .eq('estado', estado)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`No se pudieron listar las facturas pendientes: ${error.message}`)
  const filas = data ?? []
  const ocs = await mapaOCs([...new Set(filas.map((f) => f.oc_id))])
  return filas.map((f) => ({
    id: f.id,
    oc: ocs.get(f.oc_id) ?? null,
    numero_factura: f.numero_factura,
    fecha_factura: f.fecha_factura,
    total: f.total != null ? Number(f.total) : null,
    fecha_recepcion_factura: f.fecha_recepcion_factura,
    created_at: f.created_at,
  }))
}

async function mapaOCs(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase.schema('compras').from('ordenes_compra').select('id, codigo, proveedor:proveedores(razon_social)').in('id', ids)
  return new Map(
    (data ?? []).map((oc: any) => [
      oc.id,
      { id: oc.id, codigo: oc.codigo, proveedor: Array.isArray(oc.proveedor) ? oc.proveedor[0] ?? null : oc.proveedor },
    ])
  )
}

async function mapaObligaciones(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase.schema('cuentas_x_pagar').from('obligaciones').select('id, codigo, neto_a_pagar').in('id', ids)
  return new Map((data ?? []).map((o: any) => [o.id, { id: o.id, codigo: o.codigo, neto_a_pagar: Number(o.neto_a_pagar) }]))
}

/**
 * Contabilidad "aprueba el monto verificado": reconoce la excepción, la
 * saca de la bandeja de revisión. La obligación YA se creó con el monto
 * verificado desde que se conciliò (regla 5) — esto no mueve plata, solo
 * marca que alguien la revisó.
 */
export async function aprobarExcepcionConciliacion(facturaPendienteId: string): Promise<void> {
  const supabase = crearClienteServidor()
  const { data: fila, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('facturas_pendientes')
    .select('id, estado')
    .eq('id', facturaPendienteId)
    .maybeSingle()
  if (error || !fila) throw new Error('No se encontró la excepción.')
  if (fila.estado !== 'excepcion') throw new Error('Esta factura ya no está en excepción.')

  const { error: errUpd } = await supabase
    .schema('cuentas_x_pagar')
    .from('facturas_pendientes')
    .update({ estado: 'conciliada', updated_at: new Date().toISOString() })
    .eq('id', facturaPendienteId)
  if (errUpd) throw new Error(`No se pudo aprobar la excepción: ${errUpd.message}`)
}

/**
 * Sube el documento de la factura (foto/PDF) al mismo bucket que usa
 * Almacén (legajos-compras) — mismo criterio de path que
 * 0004_storage_legajos.sql: <YYYY>/<MM>/<codigo>/<archivo>. Todavía no hay
 * `codigo` propio de la factura pendiente al momento de subir (recién nace
 * al guardar), así que se usa el código de la OC.
 */
export async function subirDocumentoFacturaPendiente(ocCodigo: string, archivo: File): Promise<string | null> {
  if (!archivo || archivo.size === 0) return null
  const supabase = crearClienteServidor()
  const ahora = new Date()
  const yyyy = String(ahora.getFullYear())
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${yyyy}/${mm}/${ocCodigo}/factura-${Date.now()}-${nombreLimpio}`
  const { error } = await supabase.storage.from('legajos-compras').upload(path, archivo, { contentType: archivo.type || undefined })
  return error ? null : path
}

export async function obtenerUrlDocumentoFacturaPendiente(storagePath: string): Promise<string> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase.storage.from('legajos-compras').createSignedUrl(storagePath, 60)
  if (error || !data) throw new Error(`No se pudo generar el enlace del documento: ${error?.message ?? ''}`)
  return data.signedUrl
}
