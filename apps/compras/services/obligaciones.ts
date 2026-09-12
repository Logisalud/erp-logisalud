import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import {
  calcularFechaVencimientoReal,
  conciliarLineas,
  igvDeBase,
  igvSegun,
  normalizarNumeroFactura,
  redondear,
  TASA_IGV,
  validarNoSobrefacturar,
  esOrigenAnulable,
  puedeAnularseObligacion,
  puedeRechazarseObligacion,
  ETIQUETA_ESTADO,
  type EstadoObligacion,
  type LineaConciliacion,
  type BorradorPagoDirecto,
  type LineaFacturacion,
} from '@/domain/obligacion'
import { puedeMarcarseFacturada } from '@/domain/orden-compra'
import { ERROR_AUTO_APROBACION, esAutoridadFinal, puedeAnular, puedeDecidirSobre, autoridadYaDecidioPagoDirecto, ERROR_ANULAR_TARDE, ERROR_ANULAR_AJENO } from '@/domain/auto-aprobacion'
import { avisarAnulacionSinRomper } from '@/services/avisos'
import type { FiltroCuentasPorPagar } from '@/domain/filtros-cuentas-por-pagar'
import { formatoMonto } from '@/domain/aviso-email'

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
  // Sobrefacturación: tope duro contra lo pedido, sumando lo ya facturado
  // en registros anteriores de esta misma OC — se rechaza antes de tocar
  // la base de datos, nunca se autocorrige (Carta de Simplicidad).
  const lineasFacturacion: LineaFacturacion[] = borrador.lineas.map((l) => {
    const item = itemsMap.get(l.ocItemId)
    return {
      ocItemId: l.ocItemId,
      cantidadPedida: Number(item.cantidad_pedida),
      cantidadYaFacturada: Number(item.cantidad_facturada),
      cantidadNuevaFactura: l.cantidadFacturada,
    }
  })
  const erroresSobrefacturacion = validarNoSobrefacturar(lineasFacturacion)
  if (erroresSobrefacturacion.length > 0) {
    throw new Error(erroresSobrefacturacion.map((e) => e.mensaje).join(' | '))
  }

  const conciliacion = conciliarLineas(lineasConciliacion)
  const baseImponible = redondear(
    borrador.lineas.reduce((acc, l) => acc + redondear(l.cantidadFacturada * l.precioFacturado), 0)
  )

  const estadoInicial: EstadoObligacion = conciliacion.conforme ? 'registrada' : 'observada'

  // Identidad del comprobante: proveedor + número normalizado (mayúsculas,
  // sin espacios al borde) — mismo criterio que el índice único de
  // 0027_uniqueness_factura_normalizada.sql. Se pre-chequea acá para dar un
  // error en lenguaje de negocio; el índice de la base es el resguardo
  // final contra una carrera entre dos registros simultáneos.
  const numeroFacturaNormalizado = normalizarNumeroFactura(borrador.numeroFactura)
  const { data: facturaExistente } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id')
    .eq('proveedor_id', oc.proveedor_id)
    .eq('numero_factura', numeroFacturaNormalizado)
    .maybeSingle()
  if (facturaExistente) {
    throw new Error(`Ya existe una obligación registrada con la factura ${numeroFacturaNormalizado} para este proveedor.`)
  }

  const { data: obligacion, error: errIns } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .insert({
      origen: 'compra',
      proveedor_id: oc.proveedor_id,
      oc_id: oc.id,
      recepcion_id: borrador.recepcionId,
      numero_factura: numeroFacturaNormalizado,
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

export type LineaFacturacionCompra = { ocItemId: string; cantidadFacturada: number; precioFacturado: number }

// Sin campos de detracción: origen 'compra' es mercadería/bien, y la
// detracción real (Anexo SUNAT) aplica a servicios — mismo criterio que
// registrarObligacionDesdeRecepcion (flujo viejo) y
// services/facturas-pendientes.ts::BorradorFacturaCompra.
export type InputObligacionMultiRecepcion = {
  ocId: string
  proveedorId: string
  moneda: string
  tipoCambio: number | null
  numeroFactura: string
  fechaFactura: string
  lineas: LineaFacturacionCompra[]
  /** Ya resueltas por el llamador (services/facturas-pendientes.ts): las
   * recepciones conformes de esta OC que esta factura cubre. */
  recepcionIds: string[]
  /** Ya calculada por domain/vencimiento-obligacion.ts desde la fecha de
   * conformidad MÁS TARDÍA de `recepcionIds`. */
  fechaVencimientoReal: string
  /** = montoTotalConciliado de domain/conciliacion.ts — el monto VERIFICADO,
   * no necesariamente lo que dice la factura (regla de negocio 5). */
  baseImponible: number
  /** = !conciliacion.tieneExcepciones */
  conforme: boolean
  observaciones: string | null
}

/**
 * Crea la obligación del flujo NUEVO multi-recepción: a diferencia de
 * `registrarObligacionDesdeRecepcion` (flujo viejo, intacto, un
 * `recepcion_id` directo), esta deja `recepcion_id` en null y en cambio
 * inserta una fila en `cuentas_x_pagar.obligacion_recepciones` por cada
 * recepción que la factura cubre (0029_obligacion_recepciones.sql). La
 * orquestación de CUÁNDO llamarla (¿ya hay saldo recibido? ¿qué recepciones
 * cubre?) vive en services/facturas-pendientes.ts, que es quien conoce la
 * cola — esta función solo sabe crear la Obligación (su Aggregate Root, ver
 * sección 1 del documento maestro) a partir de datos ya resueltos.
 */
export async function crearObligacionCompraMultiRecepcion(
  input: InputObligacionMultiRecepcion
): Promise<{ id: string }> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  if (input.lineas.length === 0) throw new Error('Agrega al menos una línea facturada.')
  if (input.recepcionIds.length === 0) throw new Error('No hay ninguna recepción conforme que respalde esta factura todavía.')

  const numeroFacturaNormalizado = normalizarNumeroFactura(input.numeroFactura)
  const { data: facturaExistente } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id')
    .eq('proveedor_id', input.proveedorId)
    .eq('numero_factura', numeroFacturaNormalizado)
    .maybeSingle()
  if (facturaExistente) {
    throw new Error(`Ya existe una obligación registrada con la factura ${numeroFacturaNormalizado} para este proveedor.`)
  }

  const { data: obligacion, error: errIns } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .insert({
      origen: 'compra',
      proveedor_id: input.proveedorId,
      oc_id: input.ocId,
      recepcion_id: null,
      numero_factura: numeroFacturaNormalizado,
      fecha_factura: input.fechaFactura,
      moneda: input.moneda,
      tipo_cambio: input.tipoCambio,
      base_imponible: input.baseImponible,
      estado: input.conforme ? 'registrada' : 'observada',
      fecha_vencimiento_real: input.fechaVencimientoReal,
      created_by: usuario.id,
      observaciones: input.observaciones,
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
      input.lineas.map((l) => ({
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

  const { error: errPuente } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligacion_recepciones')
    .insert(input.recepcionIds.map((recepcionId) => ({ obligacion_id: obligacion.id, recepcion_id: recepcionId })))
  if (errPuente) {
    await supabase.schema('cuentas_x_pagar').from('obligaciones').delete().eq('id', obligacion.id)
    throw new Error(`No se pudieron vincular las recepciones: ${errPuente.message}`)
  }

  const { data: itemsOC } = await supabase
    .schema('compras')
    .from('ordenes_compra_items')
    .select('id, cantidad_pedida, cantidad_facturada')
    .eq('oc_id', input.ocId)
  const itemsMap = new Map((itemsOC ?? []).map((i) => [i.id, i]))

  for (const l of input.lineas) {
    const item = itemsMap.get(l.ocItemId)
    if (!item) continue
    await supabase
      .schema('compras')
      .from('ordenes_compra_items')
      .update({ cantidad_facturada: Number(item.cantidad_facturada) + l.cantidadFacturada })
      .eq('id', l.ocItemId)
    item.cantidad_facturada = Number(item.cantidad_facturada) + l.cantidadFacturada
  }

  const completo = [...itemsMap.values()].every((i) => Number(i.cantidad_facturada) >= Number(i.cantidad_pedida))
  if (puedeMarcarseFacturada(completo)) {
    await supabase.schema('compras').from('ordenes_compra').update({ estado: 'facturada' }).eq('id', input.ocId)
  }

  return { id: obligacion.id }
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
   * En qué propuesta de pago entró esta obligación, si entró. Antes el
   * listado decía "conforme" y no había forma de saber si ya estaba en un
   * lote, en cuál, ni si ese lote estaba aprobado — así que Tesorería no
   * podía llegar a la pantalla donde se paga sin adivinar.
   *
   * El pago NO se ejecuta desde el listado a propósito: eso saltearía la
   * aprobación del lote (regla de oro, sección 4 del documento maestro).
   * Esto es el camino hacia donde sí se paga, no un atajo que lo evita.
   *
   * Opcional porque `ObligacionDetalle` extiende este tipo y su consulta no
   * los trae: la ficha individual no ofrece pagar, así que no los necesita.
   */
  propuesta?: { id: string; codigo: string; estado: string } | null
  /** Ya tiene un pago aplicado — con `propuesta.estado === 'aprobada'` es lo que define "lista para pagar". */
  yaPagada?: boolean
  /** De qué se trata, para no entrar a la ficha. Categoría de Pago Directo
   * más `observaciones`; para el resto de los orígenes, `observaciones`
   * sola, que es donde cada servicio deja su etiqueta legible. */
  concepto?: string | null
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

/**
 * `estado` acepta uno o varios: el listado filtra por CATEGORÍA (que agrupa
 * dos o tres estados) además de por estado suelto — ver
 * domain/categorias-estado-obligacion.ts.
 */
export async function listarObligaciones(
  estado?: EstadoObligacion | readonly EstadoObligacion[]
): Promise<ObligacionListada[]> {
  const supabase = crearClienteServidor()
  let q = supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, codigo, origen, numero_factura, moneda, total, neto_a_pagar, estado, fecha_vencimiento_real, proveedor_id, proveedor_servicio_id, beneficiario_persona, observaciones, categoria_pago_directo_id')
    .order('created_at', { ascending: false })
    .limit(200)

  if (Array.isArray(estado)) {
    if (estado.length === 0) return []
    q = q.in('estado', estado as string[])
  } else if (estado) {
    q = q.eq('estado', estado)
  }

  const { data, error } = await q
  if (error) throw new Error(`No se pudieron listar las obligaciones: ${error.message}`)

  const ids = (data ?? []).map((o) => o.id)
  const [proveedores, beneficiarios, propuestas, pagadas, categoriasPD] = await Promise.all([
    mapaProveedoresBasico(
      [...new Set((data ?? []).map((o) => o.proveedor_id).filter(Boolean))] as string[],
      [...new Set((data ?? []).map((o) => o.proveedor_servicio_id).filter(Boolean))] as string[]
    ),
    mapaBeneficiarios([...new Set((data ?? []).map((o) => o.beneficiario_persona).filter(Boolean))] as string[]),
    mapaPropuestaDeObligacion(ids),
    idsConPagoAplicado(ids),
    mapaCategoriasPagoDirecto((data ?? []).map((o: any) => o.categoria_pago_directo_id)),
  ])
  return (data ?? []).map((o) => ({
    ...o,
    proveedor: proveedores.get(o.proveedor_id ?? o.proveedor_servicio_id ?? '') ?? null,
    beneficiario: o.beneficiario_persona ? beneficiarios.get(o.beneficiario_persona) ?? null : null,
    propuesta: propuestas.get(o.id) ?? null,
    yaPagada: pagadas.has(o.id),
    concepto: [categoriasPD.get((o as any).categoria_pago_directo_id ?? ''), o.observaciones?.trim()]
      .filter((p): p is string => !!p)
      .join(' — ') || null,
  }))
}

/**
 * La vista de /cuentas-por-pagar resuelta de punta a punta: filtro de
 * estados + el recorte de "listas para pagar", que no se puede hacer en la
 * consulta porque depende del estado de la PROPUESTA, no del de la
 * obligación.
 *
 * La comparte la pantalla con la ruta de descarga a Excel (Pieza 1): el
 * Excel tiene que traer exactamente las mismas filas que se están viendo,
 * y eso solo se garantiza si las pide por el mismo camino.
 */
export async function listarVistaCuentasPorPagar(
  filtro: FiltroCuentasPorPagar
): Promise<ObligacionListada[]> {
  const todas = await listarObligaciones(filtro.estados)
  return filtro.soloListas
    ? todas.filter((o) => o.propuesta?.estado === 'aprobada' && !o.yaPagada)
    : todas
}

/**
 * La propuesta de pago en la que entró cada obligación. Dos consultas
 * (detalle → propuestas) porque `propuesta_detalle` no trae el código ni el
 * estado del lote, y un embed inverso desde `obligaciones` no existe.
 */
async function mapaPropuestaDeObligacion(
  obligacionIds: string[]
): Promise<Map<string, { id: string; codigo: string; estado: string }>> {
  const mapa = new Map<string, { id: string; codigo: string; estado: string }>()
  const ids = [...new Set(obligacionIds)]
  if (ids.length === 0) return mapa
  const supabase = crearClienteServidor()

  const { data: detalle } = await supabase
    .schema('cuentas_x_pagar')
    .from('propuesta_detalle')
    .select('obligacion_id, propuesta_id')
    .in('obligacion_id', ids)
  const filas = (detalle ?? []) as { obligacion_id: string; propuesta_id: string }[]
  if (filas.length === 0) return mapa

  const { data: propuestas } = await supabase
    .schema('cuentas_x_pagar')
    .from('propuestas_pago')
    .select('id, codigo, estado')
    .in('id', [...new Set(filas.map((f) => f.propuesta_id))])
  const porId = new Map((propuestas ?? []).map((p: any) => [p.id, p]))

  for (const fila of filas) {
    const propuesta = porId.get(fila.propuesta_id)
    if (propuesta) mapa.set(fila.obligacion_id, propuesta as any)
  }
  return mapa
}

async function mapaCategoriasPagoDirecto(ids: (string | null)[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const limpios = [...new Set(ids.filter((id): id is string => !!id))]
  if (limpios.length === 0) return mapa
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('cuentas_x_pagar')
    .from('categorias_pago_directo')
    .select('id, nombre')
    .in('id', limpios)
  for (const c of (data ?? []) as any[]) mapa.set(c.id, c.nombre)
  return mapa
}

async function idsConPagoAplicado(obligacionIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(obligacionIds)]
  if (ids.length === 0) return new Set()
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('cuentas_x_pagar')
    .from('pago_aplicacion')
    .select('obligacion_id')
    .in('obligacion_id', ids)
  return new Set((data ?? []).map((p: any) => p.obligacion_id))
}

/** Origen gasto_directo/reembolso/anticipo: el beneficiario es un empleado, no un proveedor. */
async function mapaBeneficiarios(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, { nombre: p.nombre }]))
}

/**
 * Una obligación le paga a un proveedor de compras.proveedores
 * (`proveedor_id`) O a uno de servicios.proveedores_servicio
 * (`proveedor_servicio_id`) — Pago Directo puede ser cualquiera de los dos
 * (notaría, seguros, courier son "servicio"). `idsServicio` es opcional
 * para no tocar los llamadores que solo manejan proveedor_id.
 */
/**
 * Proveedores de las DOS tablas. Una obligación puede apuntar a
 * `compras.proveedores` (mercadería y bienes) o a
 * `servicios.proveedores_servicio` (notaría, seguros, courier, alquileres),
 * y hay que mirar las dos: un Pago Directo casi siempre le paga a un
 * proveedor de servicio.
 *
 * Exportado porque services/reportes-cuentas-por-pagar.ts tenía su propia
 * copia que solo consultaba `compras`, y por eso mostraba "sin proveedor ni
 * beneficiario" en TODAS las filas. Un solo lugar que sabe hacer el cruce.
 */
export async function mapaProveedoresBasico(idsCompra: string[], idsServicio: string[] = []) {
  const supabase = crearClienteServidor()
  const [compra, servicio] = await Promise.all([
    idsCompra.length
      ? supabase.schema('compras').from('proveedores').select('id, razon_social').in('id', idsCompra)
      : Promise.resolve({ data: [] as { id: string; razon_social: string }[] }),
    idsServicio.length
      ? supabase.schema('servicios').from('proveedores_servicio').select('id, razon_social').in('id', idsServicio)
      : Promise.resolve({ data: [] as { id: string; razon_social: string }[] }),
  ])
  return new Map(
    [...(compra.data ?? []), ...(servicio.data ?? [])].map((p) => [p.id, { id: p.id, razon_social: p.razon_social }])
  )
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
  categoriaPagoDirecto: { nombre: string } | null
  /** Solo Pago Directo: cotización (si se registró "pendiente de factura") o
   * la factura escaneada (si sí había factura) — ver subirCotizacionPagoDirecto
   * / subirFacturaPagoDirecto. Nunca las dos a la vez. */
  cotizacion_storage_path: string | null
  factura_storage_path: string | null
  pago: {
    numero_voucher: string | null
    storage_path_voucher: string | null
    storage_path_detraccion: string | null
  } | null
  /** Solo Pago Directo — ver anularPagoDirecto/rechazarPagoDirecto. */
  anulada_en: string | null
  anulada_motivo: string | null
  rechazada_en: string | null
  rechazo_motivo: string | null
}

export async function obtenerObligacion(id: string): Promise<ObligacionDetalle | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select(`id, codigo, origen, numero_factura, fecha_factura, moneda, total, neto_a_pagar, base_imponible, igv,
             monto_detraccion, estado, fecha_vencimiento_real, observaciones, proveedor_id, proveedor_servicio_id, beneficiario_persona,
             oc_id, recepcion_id, categoria_pago_directo_id, cotizacion_storage_path, factura_storage_path,
             anulada_en, anulada_motivo, rechazada_en, rechazo_motivo,
             obligaciones_items(id, oc_item_id, cantidad_facturada, precio_facturado)`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la obligación: ${error.message}`)
  if (!data) return null

  const [proveedores, beneficiarios, oc, recepcion, notasCredito, pago, categoriaPagoDirecto] = await Promise.all([
    mapaProveedoresBasico(
      data.proveedor_id ? [data.proveedor_id] : [],
      data.proveedor_servicio_id ? [data.proveedor_servicio_id] : []
    ),
    mapaBeneficiarios(data.beneficiario_persona ? [data.beneficiario_persona] : []),
    data.oc_id ? obtenerOCBasica(data.oc_id) : Promise.resolve(null),
    data.recepcion_id ? obtenerRecepcionBasica(data.recepcion_id) : Promise.resolve(null),
    listarNotasCredito(id),
    obtenerPagoDeObligacion(id),
    data.categoria_pago_directo_id ? obtenerCategoriaPagoDirectoBasica(data.categoria_pago_directo_id) : Promise.resolve(null),
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
    proveedor: proveedores.get(data.proveedor_id ?? data.proveedor_servicio_id ?? '') ?? null,
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
    categoriaPagoDirecto,
    cotizacion_storage_path: data.cotizacion_storage_path,
    factura_storage_path: data.factura_storage_path,
    pago,
    anulada_en: (data as any).anulada_en,
    anulada_motivo: (data as any).anulada_motivo,
    rechazada_en: (data as any).rechazada_en,
    rechazo_motivo: (data as any).rechazo_motivo,
  }
}

async function obtenerCategoriaPagoDirectoBasica(id: string) {
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('cuentas_x_pagar')
    .from('categorias_pago_directo')
    .select('nombre')
    .eq('id', id)
    .maybeSingle()
  return data ?? null
}

/** El voucher que "cierra el ciclo" (Fase 1.9) — vive en cuentas_x_pagar.pagos,
 * enlazado por pago_aplicacion, así que hay que resolverlo con una segunda
 * consulta en vez de embeberlo directo desde obligaciones. */
async function obtenerPagoDeObligacion(obligacionId: string) {
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
    .select('numero_voucher, storage_path_voucher, storage_path_detraccion')
    .eq('id', aplicacion.pago_id)
    .maybeSingle()
  return pago ?? null
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
    .select('id, estado, origen, os_id, created_by')
    .eq('id', obligacionId)
    .maybeSingle()
  if (error || !obligacion) throw new Error('No se encontró la obligación.')
  if (obligacion.estado !== 'registrada' && obligacion.estado !== 'observada') {
    throw new Error('Solo una obligación registrada u observada puede pasar a conforme.')
  }
  // Nadie da conformidad a lo que cargó él mismo (Pieza H). La autoridad
  // final queda exenta: no hay a quién derivarlo por encima de ella.
  const usuario = await exigirUsuario()
  if (!puedeDecidirSobre(perfil, usuario.id, obligacion.created_by ?? null)) {
    throw new Error(ERROR_AUTO_APROBACION)
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

  const { error: errUpd } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .update({ estado: 'conforme', conformidad_por: usuario.id, conformidad_fecha: new Date().toISOString() })
    .eq('id', obligacionId)
  if (errUpd) throw new Error(`No se pudo dar conformidad: ${errUpd.message}`)
}

export type CategoriaPagoDirecto = { id: string; nombre: string }

export async function listarCategoriasPagoDirecto(): Promise<CategoriaPagoDirecto[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('categorias_pago_directo')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')
  if (error) throw new Error(`No se pudieron listar las categorías de pago directo: ${error.message}`)
  return data ?? []
}

/**
 * "Pago directo" — origen `gasto_directo`: registra una obligación con
 * factura de proveedor sin pasar por Orden de Compra ni Orden de Servicio.
 * A diferencia de registrarObligacionDesdeRecepcion no hay conciliación de
 * 3 vías posible (no hay OC ni recepción contra qué comparar), así que
 * arranca siempre en 'registrada' — Contabilidad revisa y da conformidad a
 * mano, igual que con cualquier otra obligación.
 *
 * `fecha_vencimiento_real` se calcula desde la fecha de FACTURA (no hay
 * fecha de conformidad de recepción acá — la factura es el único hito real)
 * más la condición de pago del proveedor.
 */
export async function registrarPagoDirecto(
  borrador: BorradorPagoDirecto,
): Promise<{ id: string; codigo: string; total: number }> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()
  const fuente = borrador.proveedorFuente ?? 'compra'

  const { data: proveedor, error: errProv } =
    fuente === 'servicio'
      ? await supabase
          .schema('servicios')
          .from('proveedores_servicio')
          .select('id, razon_social, condicion_pago_dias')
          .eq('id', borrador.proveedorId)
          .maybeSingle()
      : await supabase
          .schema('compras')
          .from('proveedores')
          .select('id, razon_social, condicion_pago_dias')
          .eq('id', borrador.proveedorId)
          .maybeSingle()
  if (errProv || !proveedor) throw new Error('No se encontró el proveedor.')

  // Pieza F: la condición de pago que se eligió en la pantalla manda; el
  // valor del proveedor es solo la propuesta inicial. Se guarda en la fila
  // para que "Completar factura" (Pieza E) calcule el vencimiento con el
  // mismo número, no con el default que el proveedor tenga meses después.
  const condicionPagoDias = borrador.condicionPagoDias ?? proveedor.condicion_pago_dias

  // Pieza E: sin factura todavía no hay de dónde contar los días de crédito;
  // el vencimiento se calcula al completar la factura.
  const fechaVencimientoReal = borrador.pendienteFactura
    ? null
    : calcularFechaVencimientoReal(borrador.fechaFactura, condicionPagoDias)

  const numeroFacturaNormalizado = borrador.pendienteFactura ? null : normalizarNumeroFactura(borrador.numeroFactura)
  if (numeroFacturaNormalizado) {
    let qFacturaExistente = supabase
      .schema('cuentas_x_pagar')
      .from('obligaciones')
      .select('id')
      .eq('numero_factura', numeroFacturaNormalizado)
    qFacturaExistente =
      fuente === 'servicio'
        ? qFacturaExistente.eq('proveedor_servicio_id', borrador.proveedorId)
        : qFacturaExistente.eq('proveedor_id', borrador.proveedorId)
    const { data: facturaExistente } = await qFacturaExistente.maybeSingle()
    if (facturaExistente) {
      throw new Error(`Ya existe una obligación registrada con la factura ${numeroFacturaNormalizado} para este proveedor.`)
    }
  }

  const { data: obligacion, error: errIns } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .insert({
      origen: 'gasto_directo',
      proveedor_id: fuente === 'compra' ? borrador.proveedorId : null,
      proveedor_servicio_id: fuente === 'servicio' ? borrador.proveedorId : null,
      categoria_pago_directo_id: borrador.categoriaId,
      numero_factura: numeroFacturaNormalizado,
      fecha_factura: borrador.pendienteFactura ? null : borrador.fechaFactura,
      moneda: borrador.moneda,
      tipo_cambio: borrador.tipoCambio,
      base_imponible: borrador.baseImponible,
      // Pieza B2: esto FALTABA — la columna tiene default 0, así que todo
      // Pago Directo quedaba con IGV 0 y, como `total` y `neto_a_pagar` son
      // columnas generadas sobre (base + igv), Tesorería veía 18% de menos.
      igv: igvSegun(borrador.baseImponible, borrador.sinIgv),
      sin_igv: !!borrador.sinIgv,
      condicion_pago_dias: condicionPagoDias,
      // Sesión 2026-09-07: ya no se elige una categoría de
      // `tasas_detraccion` (catálogo nunca cargado) — quien registra
      // declara directamente el % mirando la factura real.
      porcentaje_detraccion: borrador.tieneDetraccion ? borrador.porcentajeDetraccion : null,
      monto_detraccion: borrador.tieneDetraccion ? borrador.montoDetraccion ?? 0 : 0,
      estado: borrador.pendienteFactura ? 'pendiente_factura' : 'registrada',
      fecha_vencimiento_real: fechaVencimientoReal,
      observaciones: borrador.descripcion,
      created_by: usuario.id,
      creador_correo: usuario.email ?? null,
    })
    .select('id, codigo, total')
    .single()

  if (errIns) {
    if (errIns.code === '23505') {
      throw new Error('Ya existe una obligación con ese número de factura para este proveedor.')
    }
    throw new Error(`No se pudo registrar el pago directo: ${errIns.message}`)
  }

  return { id: obligacion.id, codigo: obligacion.codigo, total: Number(obligacion.total) }
}

/**
 * Pieza E: llegó la factura que faltaba. Completa los datos reales, calcula
 * el vencimiento con la condición de pago que se guardó al registrar, y pasa
 * la obligación a `registrada` para que siga el embudo normal (conformidad →
 * propuesta → pago).
 */
export async function completarFacturaPagoDirecto(input: {
  obligacionId: string
  numeroFactura: string
  fechaFactura: string
  baseImponible: number
  /** Ver `igvSegun`: lo declara quien completa, mirando la factura real. */
  sinIgv?: boolean
}): Promise<void> {
  const supabase = crearClienteServidor()

  const { data: obligacion, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, estado, proveedor_id, condicion_pago_dias')
    .eq('id', input.obligacionId)
    .maybeSingle()
  if (error || !obligacion) throw new Error('No se encontró la obligación.')
  if (obligacion.estado !== 'pendiente_factura') {
    throw new Error('Esta obligación ya tiene su factura registrada.')
  }

  const numeroFacturaNormalizado = normalizarNumeroFactura(input.numeroFactura)
  const { data: facturaExistente } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id')
    .eq('proveedor_id', obligacion.proveedor_id)
    .eq('numero_factura', numeroFacturaNormalizado)
    .maybeSingle()
  if (facturaExistente) {
    throw new Error(`Ya existe una obligación registrada con la factura ${numeroFacturaNormalizado} para este proveedor.`)
  }

  const { error: errUpd } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .update({
      numero_factura: numeroFacturaNormalizado,
      fecha_factura: input.fechaFactura,
      base_imponible: input.baseImponible,
      // La factura real manda: si llega gravada, deja de ser "sin IGV"
      // aunque la cotización se hubiera cargado así (y al revés).
      igv: igvSegun(input.baseImponible, input.sinIgv),
      sin_igv: !!input.sinIgv,
      estado: 'registrada',
      fecha_vencimiento_real: calcularFechaVencimientoReal(input.fechaFactura, obligacion.condicion_pago_dias ?? 0),
    })
    .eq('id', input.obligacionId)
  if (errUpd) throw new Error(`No se pudo completar la factura: ${errUpd.message}`)
}

/**
 * Sube la cotización que sustenta un Pago Directo registrado sin factura
 * (Pieza E) — mismo bucket y mismo patrón de path que el resto de los
 * documentos de compras (`legajos-compras`, `<YYYY>/<MM>/<codigo>/…`).
 * Best-effort: la obligación ya está creada cuando esto corre.
 */
export async function subirCotizacionPagoDirecto(obligacionId: string, codigo: string, archivo: File): Promise<boolean> {
  if (!archivo || archivo.size === 0) return false
  const supabase = crearClienteServidor()
  const ahora = new Date()
  const yyyy = String(ahora.getFullYear())
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${yyyy}/${mm}/${codigo}/cotizacion-${Date.now()}-${nombreLimpio}`

  const { error } = await supabase.storage.from('legajos-compras').upload(path, archivo, { contentType: archivo.type || undefined })
  if (error) return false

  const { error: errUpd } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .update({ cotizacion_storage_path: path })
    .eq('id', obligacionId)
  return !errUpd
}

/**
 * Sube el escaneo/PDF de la factura real de un Pago Directo (cuando SÍ hay
 * factura — lo opuesto de `subirCotizacionPagoDirecto`, que es para cuando
 * todavía no la emitieron). Mismo bucket y mismo patrón de path. Best-effort,
 * igual que el resto de los adjuntos del módulo.
 */
export async function subirFacturaPagoDirecto(obligacionId: string, codigo: string, archivo: File): Promise<boolean> {
  if (!archivo || archivo.size === 0) return false
  const supabase = crearClienteServidor()
  const ahora = new Date()
  const yyyy = String(ahora.getFullYear())
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${yyyy}/${mm}/${codigo}/factura-${Date.now()}-${nombreLimpio}`

  const { error } = await supabase.storage.from('legajos-compras').upload(path, archivo, { contentType: archivo.type || undefined })
  if (error) return false

  const { error: errUpd } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .update({ factura_storage_path: path })
    .eq('id', obligacionId)
  return !errUpd
}

/** Firma un link temporal (60s) para ver la cotización o la factura escaneada
 * de un Pago Directo — mismo bucket `legajos-compras` para las dos. */
export async function obtenerUrlLegajoPagoDirecto(storagePath: string): Promise<string> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase.storage.from('legajos-compras').createSignedUrl(storagePath, 60)
  if (error || !data) throw new Error(`No se pudo generar el enlace del archivo: ${error?.message ?? ''}`)
  return data.signedUrl
}

/**
 * Los dos finales de línea de un Pago Directo, que comparten todo salvo el
 * verbo (ver domain/obligacion.ts y la migración 0043):
 *
 *  - `anular`: quien lo cargó se equivocó y el registro no debió existir.
 *  - `rechazar`: Contabilidad lo revisó y lo devuelve — la contraparte
 *    negativa de "Dar conformidad".
 *
 * Desde 0043 los dos escriben un `estado` real ('anulada' / 'rechazada')
 * además de sus columnas de auditoría. Eso es lo que los saca solos de
 * `darConformidad` y de los candidatos a propuesta de pago: antes, con la
 * anulación solo en columnas laterales, la fila seguía en 'registrada' y
 * seguía siendo elegible para conformarse y pagarse.
 */
/** Cómo se nombra cada origen cortable en los mensajes de la pantalla. */
const NOMBRE_POR_ORIGEN: Record<string, string> = {
  gasto_directo: 'un Pago Directo',
  anticipo: 'un anticipo',
  reembolso: 'un reembolso',
}

const ETIQUETA_ORIGEN_CORTE: Record<string, string> = {
  gasto_directo: 'Pago directo',
  anticipo: 'Anticipo',
  reembolso: 'Reembolso',
}

/** El aviso por correo ya distingue los tres (ver domain/aviso-email.ts). */
const TIPO_AVISO_POR_ORIGEN: Record<string, 'pago_directo' | 'anticipo' | 'reembolso'> = {
  gasto_directo: 'pago_directo',
  anticipo: 'anticipo',
  reembolso: 'reembolso',
}

type CorteDePagoDirecto = {
  estado: Extract<EstadoObligacion, 'anulada' | 'rechazada'>
  /** Cómo se llama la acción en los mensajes de error de la pantalla. */
  sustantivo: 'anulación' | 'rechazo'
  puedeCortarse: (estado: EstadoObligacion) => boolean
  columnas: (usuarioId: string, motivo: string, ahora: string) => Record<string, unknown>
}

const CORTES: Record<'anular' | 'rechazar', CorteDePagoDirecto> = {
  anular: {
    estado: 'anulada',
    sustantivo: 'anulación',
    puedeCortarse: puedeAnularseObligacion,
    columnas: (usuarioId, motivo, ahora) => ({
      anulada_motivo: motivo,
      anulada_por: usuarioId,
      anulada_en: ahora,
    }),
  },
  rechazar: {
    estado: 'rechazada',
    sustantivo: 'rechazo',
    puedeCortarse: puedeRechazarseObligacion,
    columnas: (usuarioId, motivo, ahora) => ({
      rechazo_motivo: motivo,
      rechazada_por: usuarioId,
      rechazada_en: ahora,
    }),
  },
}

async function cortarPagoDirecto(id: string, motivo: string, accion: 'anular' | 'rechazar'): Promise<void> {
  const corte = CORTES[accion]
  if (!motivo.trim()) throw new Error(`El motivo ${accion === 'anular' ? 'de la anulación' : 'del rechazo'} es obligatorio.`)
  const usuario = await exigirUsuario()
  const perfil = await perfilActual()
  const supabase = crearClienteServidor()

  const { data: obligacion, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, codigo, origen, estado, moneda, total, creador_correo, categoria_pago_directo_id, created_by')
    .eq('id', id)
    .maybeSingle()
  if (error || !obligacion) throw new Error('No se encontró la obligación.')
  // Antes decía `!== 'gasto_directo'`, herencia de cuando esta función solo
  // servía a Pago Directo. Un anticipo y un reembolso llegan por el mismo
  // camino (nacen 'registrada', los revisa Contabilidad) y no tienen otra
  // salida hacia atrás — ver ORIGENES_ANULABLES en domain/obligacion.ts.
  if (!esOrigenAnulable(obligacion.origen)) {
    throw new Error(
      `Un registro de origen "${obligacion.origen}" no se ${accion === 'anular' ? 'anula' : 'rechaza'} desde aquí — se hace desde el documento que lo originó.`
    )
  }
  const nombreRegistro = NOMBRE_POR_ORIGEN[obligacion.origen] ?? 'el registro'
  if (!corte.puedeCortarse(obligacion.estado as EstadoObligacion)) {
    throw new Error(
      `Ya no se puede ${accion}: está "${ETIQUETA_ESTADO[obligacion.estado as EstadoObligacion]}".`
    )
  }

  // Pieza G/H. Rechazar es una decisión de la autoridad y solo ella la
  // toma. Anular lo puede hacer también quien lo creó, pero únicamente
  // mientras Contabilidad no le haya dado conformidad todavía.
  if (accion === 'rechazar') {
    if (!esAutoridadFinal(perfil)) {
      throw new Error(`Solo Contabilidad (rol admin) puede rechazar ${nombreRegistro}.`)
    }
    if (!puedeDecidirSobre(perfil, usuario.id, (obligacion as any).created_by ?? null)) {
      throw new Error(ERROR_AUTO_APROBACION)
    }
  } else if (
    !puedeAnular(
      esAutoridadFinal(perfil),
      usuario.id,
      (obligacion as any).created_by ?? null,
      autoridadYaDecidioPagoDirecto(obligacion.estado as string)
    )
  ) {
    throw new Error(
      (obligacion as any).created_by === usuario.id ? ERROR_ANULAR_TARDE : ERROR_ANULAR_AJENO
    )
  }

  const ahora = new Date().toISOString()
  const { error: errUpd } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .update({ estado: corte.estado, ...corte.columnas(usuario.id, motivo.trim(), ahora) })
    .eq('id', id)
  if (errUpd) throw new Error(`No se pudo registrar ${accion === 'anular' ? 'la anulación' : 'el rechazo'}: ${errUpd.message}`)

  const categoria = obligacion.categoria_pago_directo_id
    ? await obtenerCategoriaPagoDirectoBasica(obligacion.categoria_pago_directo_id)
    : null

  await avisarAnulacionSinRomper({
    accion: accion === 'anular' ? 'anulacion' : 'rechazo',
    tipo: TIPO_AVISO_POR_ORIGEN[obligacion.origen] ?? 'pago_directo',
    codigo: obligacion.codigo,
    monto: Number(obligacion.total),
    moneda: obligacion.moneda,
    referencia: categoria?.nombre ?? ETIQUETA_ORIGEN_CORTE[obligacion.origen] ?? 'Pago directo',
    motivo: motivo.trim(),
    anuladoPor: perfil?.nombre ?? usuario.email ?? 'alguien del ERP',
    filas: [{ etiqueta: 'Monto', valor: formatoMonto(Number(obligacion.total), obligacion.moneda) }],
    ruta: `/cuentas-por-pagar/${id}`,
    creadorCorreo: obligacion.creador_correo ?? null,
  })
}

/** Anular un Pago Directo por error de captura (Pieza D/K, sesión 2026-09-09). */
export async function anularPagoDirecto(id: string, motivo: string): Promise<void> {
  await cortarPagoDirecto(id, motivo, 'anular')
}

/** Contabilidad rechaza un Pago Directo al revisarlo — contraparte de `darConformidad`. */
export async function rechazarPagoDirecto(id: string, motivo: string): Promise<void> {
  await cortarPagoDirecto(id, motivo, 'rechazar')
}

/** Para la ficha de la OC: si ya se registró una factura, de acá sale el link a la obligación.
 * Devuelve la más reciente — se mantiene por compatibilidad con el flujo viejo
 * (una OC con una sola factura). Para el caso multi-recepción usar
 * `listarObligacionesPorOC`. */
export async function obtenerObligacionPorOC(ocId: string): Promise<{ id: string; codigo: string; estado: EstadoObligacion } | null> {
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, codigo, estado')
    .eq('oc_id', ocId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

/** Una OC puede tener VARIAS obligaciones (una por factura parcial) —
 * usada en la ficha de la OC para listarlas todas, no solo la última. */
export async function listarObligacionesPorOC(
  ocId: string
): Promise<{ id: string; codigo: string; estado: EstadoObligacion; numero_factura: string | null; neto_a_pagar: number }[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, codigo, estado, numero_factura, neto_a_pagar')
    .eq('oc_id', ocId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`No se pudieron listar las obligaciones de la orden: ${error.message}`)
  return (data ?? []).map((o) => ({ ...o, neto_a_pagar: Number(o.neto_a_pagar) }))
}
