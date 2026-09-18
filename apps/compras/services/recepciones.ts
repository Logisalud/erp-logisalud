import 'server-only'
import { crearClienteServidor, exigirUsuario } from '@logisalud/auth/server'
import type { TipoDiscrepancia } from '@/domain/recepcion'
import { estadoTrasRecepcion, puedeRecibirse, ETIQUETA_ESTADO, type EstadoOC } from '@/domain/orden-compra'
import {
  clasificarTresColumnas, totalizarRecepcion, validarRecepcionTresColumnas,
  type LineaTresColumnas, type TotalesRecepcion,
} from '@/domain/recepcion-tres-columnas'
import { calcularFechaVencimientoReal, normalizarNumeroFactura } from '@/domain/obligacion'
import { anioMesStorageLima, hoyLima } from '@/domain/fecha'

export type OCParaRecibir = {
  id: string
  codigo: string
  estado: EstadoOC
  /** Hace falta en la pantalla para mostrar el total en la moneda correcta. */
  moneda: string
  proveedor: { razon_social: string } | null
  items: {
    id: string
    producto_id: string
    cantidad_pedida: number
    cantidad_recibida: number
    /** De la OC. La factura no re-declara precio: si el proveedor lo cambió,
     *  eso es una conversación de Compras, no algo que se arregle recibiendo. */
    precio_unitario: number
    producto: {
      codigo: string; descripcion: string; unidad_medida: string
      controla_lote: boolean; controla_vencimiento: boolean
    } | null
  }[]
}

/** OCs que un vendedor... no, que Almacén puede recibir hoy: confirmadas o con saldo pendiente. */
export async function listarOCsParaRecibir(): Promise<OCParaRecibir[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select(`id, codigo, estado, moneda,
             proveedor:proveedores(razon_social),
             ordenes_compra_items(id, producto_id, cantidad_pedida, cantidad_recibida, precio_unitario)`)
    .in('estado', ['confirmada', 'parcialmente_recibida'])
    .order('codigo', { ascending: false })

  if (error) throw new Error(`No se pudieron listar las órdenes por recibir: ${error.message}`)

  const productoIds = [...new Set((data ?? []).flatMap((oc: any) => oc.ordenes_compra_items.map((i: any) => i.producto_id)))]
  const productos = await mapaProductosBasico(productoIds)

  return (data ?? []).map((oc: any) => ({
    id: oc.id,
    codigo: oc.codigo,
    estado: oc.estado,
    moneda: oc.moneda,
    proveedor: Array.isArray(oc.proveedor) ? oc.proveedor[0] ?? null : oc.proveedor,
    items: oc.ordenes_compra_items
      // Solo interesan las líneas con saldo por recibir.
      .filter((i: any) => Number(i.cantidad_recibida) < Number(i.cantidad_pedida))
      .map((i: any) => ({ ...i, producto: productos.get(i.producto_id) ?? null })),
  }))
}

export async function obtenerOCParaRecibir(id: string): Promise<OCParaRecibir | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select(`id, codigo, estado,
             proveedor:proveedores(razon_social),
             moneda,
             ordenes_compra_items(id, producto_id, cantidad_pedida, cantidad_recibida, precio_unitario)`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la orden: ${error.message}`)
  if (!data) return null

  const items = (data as any).ordenes_compra_items ?? []
  const productos = await mapaProductosBasico(items.map((i: any) => i.producto_id))

  return {
    ...(data as any),
    proveedor: Array.isArray((data as any).proveedor) ? (data as any).proveedor[0] ?? null : (data as any).proveedor,
    items: items
      .filter((i: any) => Number(i.cantidad_recibida) < Number(i.cantidad_pedida))
      .map((i: any) => ({ ...i, producto: productos.get(i.producto_id) ?? null })),
  }
}

async function mapaProductosBasico(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase
    .schema('catalogo')
    .from('productos')
    .select('id, codigo, descripcion, unidad_medida, controla_lote, controla_vencimiento')
    .in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, p]))
}

async function actualizarEstadoOC(ocId: string) {
  const supabase = crearClienteServidor()
  const { data: items } = await supabase
    .schema('compras')
    .from('ordenes_compra_items')
    .select('cantidad_pedida, cantidad_recibida')
    .eq('oc_id', ocId)

  const completo = (items ?? []).every((i) => Number(i.cantidad_recibida) >= Number(i.cantidad_pedida))
  await supabase
    .schema('compras')
    .from('ordenes_compra')
    .update({ estado: estadoTrasRecepcion(completo) })
    .eq('id', ocId)
}

export type RecepcionListada = {
  id: string
  fecha_recepcion: string
  guia_remision: string | null
  estado: 'pendiente' | 'conforme' | 'con_discrepancia'
  oc: { codigo: string; proveedor: { razon_social: string } | null } | null
}

/** Para "Documentos relacionados" en la ficha de la OC. */
export async function listarRecepcionesPorOC(ocId: string): Promise<{ id: string; estado: string; fecha_recepcion: string }[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('almacen')
    .from('recepciones')
    .select('id, estado, fecha_recepcion')
    .eq('oc_id', ocId)
    .order('fecha_recepcion', { ascending: false })
  if (error) throw new Error(`No se pudieron listar las recepciones de la orden: ${error.message}`)
  return data ?? []
}

export async function listarRecepciones(): Promise<RecepcionListada[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('almacen')
    .from('recepciones')
    .select('id, oc_id, fecha_recepcion, guia_remision, estado')
    .order('fecha_recepcion', { ascending: false })
    .limit(100)

  if (error) throw new Error(`No se pudieron listar las recepciones: ${error.message}`)

  const ocs = await mapaOCsConId([...new Set((data ?? []).map((r) => r.oc_id))])
  return (data ?? []).map((r) => ({
    id: r.id,
    fecha_recepcion: r.fecha_recepcion,
    guia_remision: r.guia_remision,
    estado: r.estado,
    oc: ocs.get(r.oc_id) ?? null,
  }))
}


export type RecepcionDetalle = {
  id: string
  oc_id: string
  fecha_recepcion: string
  guia_remision: string | null
  /** Las guías del modelo nuevo. Varias pueden venir con una sola factura. */
  numeros_guia: string[] | null
  numero_factura: string | null
  estado: 'pendiente' | 'conforme' | 'con_discrepancia'
  observaciones: string | null
  oc: { id: string; codigo: string; proveedor: { razon_social: string } | null } | null
  /** La obligación que la recepción generó sola, si la generó. */
  obligacionId: string | null
  items: {
    id: string
    cantidad_guia: number | null
    /** Lo que declaró la factura. Es contra esto que se compara lo físico. */
    cantidad_factura: number | null
    cantidad_fisica: number
    observaciones: string | null
    lote: string | null
    fecha_vencimiento: string | null
    estado_calidad: string
    tipo_discrepancia: TipoDiscrepancia
    cantidad_aceptada: number
    cantidad_rechazada: number
    producto: { codigo: string; descripcion: string; unidad_medida: string } | null
    accion_estandar: string | null
    resolucion: {
      accion_tomada: string
      comentario: string | null
      decidido_por: string
      fecha_decision: string
    } | null
  }[]
}

export async function obtenerRecepcion(id: string): Promise<RecepcionDetalle | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('almacen')
    .from('recepciones')
    .select(`id, oc_id, fecha_recepcion, guia_remision, numeros_guia, numero_factura,
             estado, observaciones,
             recepciones_items(id, cantidad_guia, cantidad_factura, cantidad_fisica,
                                lote, fecha_vencimiento, estado_calidad, tipo_discrepancia,
                                cantidad_aceptada, cantidad_rechazada, observaciones,
                                oc_item_id)`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la recepción: ${error.message}`)
  if (!data) return null

  const items = (data as any).recepciones_items ?? []
  const ocItemIds = items.map((i: any) => i.oc_item_id)

  // `matriz` y `resoluciones` ya no se consultan: el modelo de tres columnas
  // no resuelve discrepancias con una matriz. Se dejan los tipos por
  // compatibilidad con lecturas viejas, pero vienen siempre en null.
  const [ocs, productos, obligacion] = await Promise.all([
    mapaOCsConId([(data as any).oc_id]),
    mapaProductosPorOCItem(ocItemIds),
    obligacionDeRecepcion((data as any).id),
  ])

  return {
    id: (data as any).id,
    oc_id: (data as any).oc_id,
    fecha_recepcion: (data as any).fecha_recepcion,
    guia_remision: (data as any).guia_remision,
    numeros_guia: (data as any).numeros_guia ?? null,
    numero_factura: (data as any).numero_factura ?? null,
    estado: (data as any).estado,
    observaciones: (data as any).observaciones,
    oc: ocs.get((data as any).oc_id) ?? null,
    obligacionId: obligacion,
    items: items.map((i: any) => ({
      ...i,
      producto: productos.get(i.oc_item_id) ?? null,
      accion_estandar: null,
      resolucion: null,
    })),
  }
}

/** La obligación que esta recepción generó, si la generó. */
async function obligacionDeRecepcion(recepcionId: string): Promise<string | null> {
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id')
    .eq('recepcion_id', recepcionId)
    .maybeSingle()
  return data?.id ?? null
}

async function mapaOCsConId(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select('id, codigo, proveedor:proveedores(razon_social)')
    .in('id', ids)
  return new Map(
    (data ?? []).map((oc: any) => [
      oc.id,
      { id: oc.id, codigo: oc.codigo, proveedor: Array.isArray(oc.proveedor) ? oc.proveedor[0] ?? null : oc.proveedor },
    ])
  )
}

async function mapaProductosPorOCItem(ocItemIds: string[]) {
  const supabase = crearClienteServidor()
  if (ocItemIds.length === 0) return new Map()
  const { data } = await supabase
    .schema('compras')
    .from('ordenes_compra_items')
    .select('id, producto_id')
    .in('id', ocItemIds)

  const productoIdPorItem = new Map((data ?? []).map((i: any) => [i.id, i.producto_id]))
  const productos = await mapaProductosBasico([...new Set(productoIdPorItem.values())] as string[])

  const resultado = new Map<string, any>()
  for (const [ocItemId, productoId] of productoIdPorItem) {
    resultado.set(ocItemId, productos.get(productoId) ?? null)
  }
  return resultado
}

/*
 * Acá vivían `mapaMatrizDiscrepancias`, `mapaResolucionesPorItem`,
 * `ResolucionInput` y `resolverDiscrepancia` — el mecanismo con el que el
 * responsable de Almacén confirmaba o ajustaba la sugerencia de cada línea
 * con discrepancia. Se retiraron el 2026-09-18, cerrando lo que el rediseño
 * de tres columnas había dejado inalcanzable: su pantalla (`resolucion.tsx`)
 * se borró con el rediseño, y el último lector indirecto —la columna
 * "Discrepancias abiertas" de /reportes/ordenes-compra— se fue en el mismo
 * commit que este comentario.
 *
 * Las tablas `almacen.resoluciones_discrepancia` y
 * `almacen.matriz_resolucion_discrepancias` siguen en la base, vacías y sin
 * ningún lector. Retirarlas es una migración aparte.
 *
 * Lo que hace su trabajo hoy: la discrepancia físico vs factura frena la
 * obligación con `espera_nota_credito`, y se levanta registrando la nota de
 * crédito del proveedor — ver services/notas-credito.ts.
 */

// ═══════════════════════════════════════════════════════════════════════════
// RECEPCIÓN DE TRES COLUMNAS (rediseño 2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════

export type BorradorRecepcionTresColumnas = {
  ocId: string
  fechaRecepcion: string
  numerosGuia: string[]
  numeroFactura: string
  storagePathGuia: string | null
  storagePathFactura: string | null
  lineas: {
    ocItemId: string
    cantidadFactura: number
    cantidadFisica: number
    observaciones: string | null
  }[]
}

/**
 * Registra la recepción Y crea la obligación, en un solo paso.
 *
 * Es el cambio de fondo del rediseño: antes Almacén registraba la recepción
 * y Contabilidad tenía que entrar a "Registrar obligación" a transcribir la
 * factura. Ahora Charlie sube los dos documentos con las cantidades, el
 * sistema calcula base/IGV/total contra los precios de la OC, y la
 * obligación nace sola. Contabilidad aprueba, no retranscribe.
 *
 * La conformidad de Contabilidad NO se elimina —sigue siendo el segundo par
 * de ojos antes de que una deuda se pague— pero deja de ser trabajo de
 * tipeo: la obligación nace 'registrada' y cae en su bandeja.
 *
 * ── Los dos casos de discrepancia ───────────────────────────────────────
 * CASO A (físico < factura): la obligación nace por lo FACTURADO, porque
 * eso es lo que se debe hasta que exista la NC, pero con
 * `espera_nota_credito = true`, que la excluye de propuesta de pago.
 *
 * CASO B (físico > factura): la obligación nace por lo FACTURADO, que es
 * correcto, y SÍ es pagable. El excedente queda anotado por línea para que
 * el proveedor lo facture. La asimetría con A es deliberada: en A el monto
 * está mal y pagarlo sería pagar de más; en B está bien y retenerlo
 * castigaría al proveedor por un error a nuestro favor.
 *
 * Sin transacción, como todo el módulo. El orden de los pasos está elegido
 * para que un fallo a mitad deje algo recuperable: la recepción y sus líneas
 * primero (si falla la obligación, Contabilidad la puede crear a mano desde
 * la recepción, que es lo que se hacía antes), y el estado de la OC al final.
 */
export async function registrarRecepcionTresColumnas(
  borrador: BorradorRecepcionTresColumnas
): Promise<{ recepcionId: string; obligacionId: string | null; esperaNotaCredito: boolean }> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: oc, error: errOc } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select(`id, estado, moneda, proveedor_id, condiciones_pago_dias,
             ordenes_compra_items(id, producto_id, cantidad_pedida, cantidad_recibida, precio_unitario)`)
    .eq('id', borrador.ocId)
    .maybeSingle()
  if (errOc || !oc) throw new Error('No se pudo leer la orden de compra.')
  if (!puedeRecibirse(oc.estado as EstadoOC)) {
    throw new Error(`La orden está en estado "${ETIQUETA_ESTADO[oc.estado as EstadoOC]}" y no se puede recibir.`)
  }

  const itemsMap = new Map((oc.ordenes_compra_items as any[]).map((i) => [i.id, i]))

  // Las líneas del dominio, con el precio traído DE LA BASE y no del
  // formulario: el precio no es un dato que Almacén declare.
  const lineasDominio: LineaTresColumnas[] = borrador.lineas.map((l) => {
    const item = itemsMap.get(l.ocItemId)
    if (!item) throw new Error('Una línea no corresponde a esta orden de compra.')
    return {
      ocItemId: l.ocItemId,
      cantidadPedida: Number(item.cantidad_pedida),
      precioUnitario: Number(item.precio_unitario),
      cantidadFactura: l.cantidadFactura,
      cantidadFisica: l.cantidadFisica,
      observaciones: l.observaciones,
    }
  })

  const errores = validarRecepcionTresColumnas({
    fechaRecepcion: borrador.fechaRecepcion,
    numerosGuia: borrador.numerosGuia,
    numeroFactura: borrador.numeroFactura,
    storagePathGuia: borrador.storagePathGuia,
    storagePathFactura: borrador.storagePathFactura,
    lineas: lineasDominio,
  })
  if (errores.length > 0) throw new Error(errores[0].mensaje)

  const totales = totalizarRecepcion(lineasDominio)
  const guias = borrador.numerosGuia.map((g) => g.trim()).filter(Boolean)

  // ── 1. La cabecera ────────────────────────────────────────────────────
  const { data: recepcion, error: errRec } = await supabase
    .schema('almacen')
    .from('recepciones')
    .insert({
      oc_id: borrador.ocId,
      recibido_por: usuario.id,
      fecha_recepcion: borrador.fechaRecepcion,
      // `guia_remision` (legacy) se llena con la primera para que las
      // pantallas viejas sigan mostrando algo; el array es la fuente real.
      guia_remision: guias[0] ?? null,
      numeros_guia: guias,
      numero_factura: borrador.numeroFactura.trim(),
      storage_path_guia_recibida: borrador.storagePathGuia,
      storage_path_factura_proveedor: borrador.storagePathFactura,
      estado: totales.lineasConDiscrepancia > 0 ? 'con_discrepancia' : 'conforme',
      conforme: totales.lineasConDiscrepancia === 0,
      // La fecha de conformidad manda la fecha de vencimiento del pago
      // (regla de negocio 3). Con el modelo nuevo se cierra en el acto
      // cuando no hay discrepancia.
      fecha_conformidad: totales.lineasConDiscrepancia === 0 ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
  if (errRec) throw new Error(`No se pudo crear la recepción: ${errRec.message}`)

  // ── 2. Las líneas ─────────────────────────────────────────────────────
  const { error: errItems } = await supabase
    .schema('almacen')
    .from('recepciones_items')
    .insert(lineasDominio.map((l) => {
      const c = clasificarTresColumnas(l)
      return {
        recepcion_id: recepcion.id,
        oc_item_id: l.ocItemId,
        cantidad_factura: l.cantidadFactura,
        cantidad_fisica: l.cantidadFisica,
        // Lo que entra: lo físico. Es lo que de verdad llegó al almacén.
        cantidad_aceptada: l.cantidadFisica,
        cantidad_rechazada: 0,
        excedente_sin_facturar: c.excedenteSinFacturar,
        observaciones: l.observaciones,
      }
    }))
  if (errItems) {
    await supabase.schema('almacen').from('recepciones').delete().eq('id', recepcion.id)
    throw new Error(`No se pudieron guardar las líneas: ${errItems.message}`)
  }

  // ── 3. Descontar de la OC lo recibido ─────────────────────────────────
  // Se suma lo FÍSICO, no lo facturado: el saldo de la OC es de mercadería.
  for (const l of lineasDominio) {
    const item = itemsMap.get(l.ocItemId)
    await supabase
      .schema('compras')
      .from('ordenes_compra_items')
      .update({ cantidad_recibida: Number(item.cantidad_recibida) + l.cantidadFisica })
      .eq('id', l.ocItemId)
  }
  await actualizarEstadoOC(borrador.ocId)

  // ── 4. La obligación, automática ──────────────────────────────────────
  const obligacionId = await crearObligacionDesdeRecepcionTresColumnas({
    recepcionId: recepcion.id,
    oc,
    numeroFactura: borrador.numeroFactura.trim(),
    totales,
    storagePathFactura: borrador.storagePathFactura,
    usuarioId: usuario.id,
  })

  return {
    recepcionId: recepcion.id,
    obligacionId,
    esperaNotaCredito: totales.esperaNotaCredito,
  }
}

/**
 * Crea la obligación con todo ya calculado. Best-effort: si falla, la
 * recepción queda guardada igual y devuelve null — Contabilidad puede
 * crearla a mano desde la recepción, que es lo que se hacía antes del
 * rediseño. Perder la recepción por un fallo acá sería mucho peor.
 */
async function crearObligacionDesdeRecepcionTresColumnas(input: {
  recepcionId: string
  oc: any
  numeroFactura: string
  totales: TotalesRecepcion
  storagePathFactura: string | null
  usuarioId: string
}): Promise<string | null> {
  const supabase = crearClienteServidor()

  const { data: proveedor } = await supabase
    .schema('compras')
    .from('proveedores')
    .select('condicion_pago_dias')
    .eq('id', input.oc.proveedor_id)
    .maybeSingle()

  const condicionDias = input.oc.condiciones_pago_dias ?? proveedor?.condicion_pago_dias ?? 30
  // Regla de negocio 3: el vencimiento del pago se cuenta desde la
  // conformidad de la recepción, nunca desde la fecha de la factura.
  const fechaVencimiento = calcularFechaVencimientoReal(hoyLima(), condicionDias)

  const { data: obligacion, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .insert({
      origen: 'compra',
      proveedor_id: input.oc.proveedor_id,
      recepcion_id: input.recepcionId,
      numero_factura: normalizarNumeroFactura(input.numeroFactura),
      moneda: input.oc.moneda,
      base_imponible: input.totales.base,
      igv: input.totales.igv,
      // Con discrepancia nace 'observada': Contabilidad TIENE que mirarla.
      // Sin discrepancia nace 'registrada' y solo espera el visto bueno.
      estado: input.totales.lineasConDiscrepancia > 0 ? 'observada' : 'registrada',
      espera_nota_credito: input.totales.esperaNotaCredito,
      fecha_vencimiento_real: fechaVencimiento,
      storage_path_factura: input.storagePathFactura,
      created_by: input.usuarioId,
      observaciones: observacionesDeTotales(input.totales),
    })
    .select('id')
    .single()

  if (error) {
    console.error('[registrarRecepcionTresColumnas] no se pudo crear la obligación:', error.message)
    return null
  }
  return obligacion.id
}

/** El resumen que Contabilidad lee primero, en lenguaje de negocio. */
function observacionesDeTotales(t: TotalesRecepcion): string | null {
  const partes: string[] = []
  if (t.esperaNotaCredito) {
    partes.push('Llegó menos de lo facturado: esperando nota de crédito del proveedor.')
  }
  if (t.tieneExcedenteSinFacturar) {
    partes.push('Llegó más de lo facturado: el proveedor tiene que facturar la diferencia.')
  }
  if (t.lineasConEntregaParcial > 0) {
    partes.push(`${t.lineasConEntregaParcial} línea(s) con entrega parcial: queda saldo por recibir en la orden.`)
  }
  return partes.length > 0 ? partes.join(' ') : null
}

/**
 * Sube la guía o la factura de una recepción. EN SU PROPIO REQUEST, separado
 * del submit del formulario: dos fotos de celular junto con las líneas
 * pasarían el límite de body de una Server Action, y eso se manifiesta como
 * "el botón no hace nada" — el fallo silencioso que ya nos pasó con los
 * anticipos (ver next.config.js).
 */
export async function subirDocumentoRecepcion(
  ocCodigo: string,
  cual: 'guia' | 'factura',
  archivo: File
): Promise<{ path: string } | { error: string }> {
  if (!archivo || archivo.size === 0) return { error: 'El archivo está vacío.' }
  const supabase = crearClienteServidor()
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${anioMesStorageLima()}/${ocCodigo}/${cual}-${Date.now()}-${nombreLimpio}`
  const { error } = await supabase.storage
    .from('legajos-compras')
    .upload(path, archivo, { contentType: archivo.type || undefined })
  if (error) {
    console.error('[subirDocumentoRecepcion]', error.message)
    return { error: `No se pudo subir ${cual === 'guia' ? 'la guía' : 'la factura'}: ${error.message}` }
  }
  return { path }
}
