import 'server-only'
import { crearClienteServidor, exigirUsuario } from '@logisalud/auth/server'
import {
  clasificarLinea,
  recepcionQuedaConforme,
  type BorradorRecepcion,
  type ProductoParaRecepcion,
  type TipoDiscrepancia,
} from '@/domain/recepcion'
import { estadoTrasRecepcion, puedeRecibirse, ETIQUETA_ESTADO, type EstadoOC } from '@/domain/orden-compra'
import { intentarConciliarPendientes } from '@/services/facturas-pendientes'

export type OCParaRecibir = {
  id: string
  codigo: string
  estado: EstadoOC
  proveedor: { razon_social: string } | null
  items: {
    id: string
    producto_id: string
    cantidad_pedida: number
    cantidad_recibida: number
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
    .select(`id, codigo, estado,
             proveedor:proveedores(razon_social),
             ordenes_compra_items(id, producto_id, cantidad_pedida, cantidad_recibida)`)
    .in('estado', ['confirmada', 'parcialmente_recibida'])
    .order('codigo', { ascending: false })

  if (error) throw new Error(`No se pudieron listar las órdenes por recibir: ${error.message}`)

  const productoIds = [...new Set((data ?? []).flatMap((oc: any) => oc.ordenes_compra_items.map((i: any) => i.producto_id)))]
  const productos = await mapaProductosBasico(productoIds)

  return (data ?? []).map((oc: any) => ({
    id: oc.id,
    codigo: oc.codigo,
    estado: oc.estado,
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
             ordenes_compra_items(id, producto_id, cantidad_pedida, cantidad_recibida)`)
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

async function mapaProductosParaRecepcion(ids: string[]): Promise<Map<string, ProductoParaRecepcion>> {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map()
  const { data } = await supabase
    .schema('catalogo')
    .from('productos')
    .select('id, controla_lote, controla_vencimiento, meses_vida_util_minima_recepcion')
    .in('id', ids)
  return new Map(
    (data ?? []).map((p: any) => [
      p.id,
      {
        controlaLote: p.controla_lote,
        controlaVencimiento: p.controla_vencimiento,
        mesesVidaUtilMinima: p.meses_vida_util_minima_recepcion,
      },
    ])
  )
}

/**
 * Registra la recepción: clasifica cada línea, la guarda, y propaga el
 * efecto a la OC (cantidad_recibida, estado) y a la propia recepción (si
 * queda conforme de una porque ninguna línea tuvo discrepancia).
 *
 * Nota: `cantidad_recibida` se actualiza con lectura-y-escritura, no con un
 * incremento atómico en SQL — aceptable porque en la operación real de
 * Logisalud una sola persona de Almacén recibe a la vez, pero si el módulo
 * creciera a varios turnos simultáneos en la misma OC habría que revisar
 * esto (RPC con `for update` o un trigger que sume).
 */
export async function registrarRecepcion(borrador: BorradorRecepcion): Promise<{ id: string }> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: oc, error: errOc } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select('id, estado, ordenes_compra_items(id, producto_id, cantidad_pedida, cantidad_recibida)')
    .eq('id', borrador.ocId)
    .maybeSingle()

  if (errOc || !oc) throw new Error('No se pudo leer la orden de compra.')
  if (!puedeRecibirse(oc.estado as EstadoOC)) {
    throw new Error(
      `La orden está en estado "${ETIQUETA_ESTADO[oc.estado as EstadoOC]}" y no se puede recibir.`
    )
  }

  const itemsMap = new Map((oc.ordenes_compra_items as any[]).map((i) => [i.id, i]))
  const lineasAUsar = borrador.lineas.filter((l) => l.cantidadFisica > 0)
  if (lineasAUsar.length === 0) throw new Error('No hay ninguna línea con cantidad física a registrar.')

  const productos = await mapaProductosParaRecepcion(
    [...new Set(lineasAUsar.map((l) => itemsMap.get(l.ocItemId)?.producto_id).filter(Boolean))] as string[]
  )

  const clasificaciones = lineasAUsar.map((l) => {
    const item = itemsMap.get(l.ocItemId)
    if (!item) throw new Error('Una línea no corresponde a esta orden de compra.')
    const pendiente = Number(item.cantidad_pedida) - Number(item.cantidad_recibida)
    const producto = productos.get(item.producto_id) ?? {
      controlaLote: false, controlaVencimiento: false, mesesVidaUtilMinima: 12,
    }
    const clasificacion = clasificarLinea(
      {
        cantidadPedidaPendiente: pendiente,
        cantidadGuia: l.cantidadGuia,
        cantidadFisica: l.cantidadFisica,
        lote: l.lote,
        fechaVencimiento: l.fechaVencimiento,
        danado: l.danado,
        productoErroneo: l.productoErroneo,
        fechaRecepcion: borrador.fechaRecepcion,
      },
      producto
    )
    return { ...l, ocItem: item as any, ...clasificacion }
  })

  const { data: recepcion, error: errRec } = await supabase
    .schema('almacen')
    .from('recepciones')
    .insert({
      oc_id: borrador.ocId,
      recibido_por: usuario.id,
      fecha_recepcion: borrador.fechaRecepcion,
      guia_remision: borrador.guiaRemision,
      estado: 'pendiente',
    })
    .select('id')
    .single()

  if (errRec) throw new Error(`No se pudo crear la recepción: ${errRec.message}`)

  const { error: errItems } = await supabase
    .schema('almacen')
    .from('recepciones_items')
    .insert(
      clasificaciones.map((c) => ({
        recepcion_id: recepcion.id,
        oc_item_id: c.ocItemId,
        cantidad_guia: c.cantidadGuia,
        cantidad_fisica: c.cantidadFisica,
        lote: c.lote,
        fecha_vencimiento: c.fechaVencimiento,
        estado_calidad: c.estadoCalidad,
        tipo_discrepancia: c.tipoDiscrepancia,
        cantidad_aceptada: c.cantidadAceptada,
        cantidad_rechazada: c.cantidadRechazada,
      }))
    )

  if (errItems) {
    // La cabecera queda sin líneas: se borra, igual que crearOC con sus items.
    await supabase.schema('almacen').from('recepciones').delete().eq('id', recepcion.id)
    throw new Error(`No se pudieron guardar las líneas: ${errItems.message}`)
  }

  for (const c of clasificaciones) {
    await supabase
      .schema('compras')
      .from('ordenes_compra_items')
      .update({ cantidad_recibida: Number(c.ocItem.cantidad_recibida) + c.cantidadAceptada })
      .eq('id', c.ocItemId)
  }

  await actualizarEstadoOC(borrador.ocId)

  const conforme = recepcionQuedaConforme(
    clasificaciones.map((c) => ({ tipoDiscrepancia: c.tipoDiscrepancia, resuelta: false }))
  )
  await supabase
    .schema('almacen')
    .from('recepciones')
    .update(
      conforme
        ? { estado: 'conforme', conforme: true, fecha_conformidad: new Date().toISOString() }
        : { estado: 'con_discrepancia' }
    )
    .eq('id', recepcion.id)

  // Flujo nuevo multi-recepción: si había alguna factura "esperando
  // mercadería" para esta OC, esta recepción puede ser justo lo que le
  // faltaba para conciliar. Best-effort — nunca revierte la recepción que
  // ya se guardó arriba.
  if (conforme) {
    await intentarConciliarPendientes(borrador.ocId)
  }

  return { id: recepcion.id }
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
  fecha_recepcion: string
  guia_remision: string | null
  estado: 'pendiente' | 'conforme' | 'con_discrepancia'
  observaciones: string | null
  oc: { id: string; codigo: string; proveedor: { razon_social: string } | null } | null
  items: {
    id: string
    cantidad_guia: number | null
    cantidad_fisica: number
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
    .select(`id, oc_id, fecha_recepcion, guia_remision, estado, observaciones,
             recepciones_items(id, cantidad_guia, cantidad_fisica, lote, fecha_vencimiento,
                                estado_calidad, tipo_discrepancia, cantidad_aceptada,
                                cantidad_rechazada, oc_item_id)`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la recepción: ${error.message}`)
  if (!data) return null

  const items = (data as any).recepciones_items ?? []
  const ocItemIds = items.map((i: any) => i.oc_item_id)

  const [ocs, productos, matriz, resoluciones] = await Promise.all([
    mapaOCsConId([(data as any).oc_id]),
    mapaProductosPorOCItem(ocItemIds),
    mapaMatrizDiscrepancias(),
    mapaResolucionesPorItem(items.map((i: any) => i.id)),
  ])

  return {
    id: (data as any).id,
    fecha_recepcion: (data as any).fecha_recepcion,
    guia_remision: (data as any).guia_remision,
    estado: (data as any).estado,
    observaciones: (data as any).observaciones,
    oc: ocs.get((data as any).oc_id) ?? null,
    items: items.map((i: any) => ({
      ...i,
      producto: productos.get(i.oc_item_id) ?? null,
      accion_estandar: i.tipo_discrepancia ? matriz.get(i.tipo_discrepancia) ?? null : null,
      resolucion: resoluciones.get(i.id) ?? null,
    })),
  }
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

async function mapaMatrizDiscrepancias() {
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('almacen')
    .from('matriz_resolucion_discrepancias')
    .select('tipo_discrepancia, accion_estandar')
  return new Map((data ?? []).map((m: any) => [m.tipo_discrepancia, m.accion_estandar]))
}

async function mapaResolucionesPorItem(recepcionItemIds: string[]) {
  const supabase = crearClienteServidor()
  if (recepcionItemIds.length === 0) return new Map()
  const { data } = await supabase
    .schema('almacen')
    .from('resoluciones_discrepancia')
    .select('recepcion_item_id, accion_tomada, comentario, decidido_por, fecha_decision')
    .in('recepcion_item_id', recepcionItemIds)
    // Si algún día se permitiera más de una resolución por línea, la última manda.
    .order('fecha_decision', { ascending: false })

  const mapa = new Map()
  for (const r of data ?? []) {
    if (!mapa.has(r.recepcion_item_id)) mapa.set(r.recepcion_item_id, r)
  }
  return mapa
}

export type ResolucionInput = {
  recepcionItemId: string
  accionTomada:
    | 'aceptado_segun_sugerencia'
    | 'aceptado_con_ajuste'
    | 'rechazado'
    | 'nota_credito_solicitada'
    | 'reposicion_solicitada'
  cantidadAceptadaAjustada?: number | null
  comentario?: string | null
}

/**
 * El responsable de Almacén confirma o ajusta la sugerencia de una línea con
 * discrepancia. Si cambia la cantidad aceptada, propaga el delta a la OC y
 * revisa si la recepción entera ya puede cerrarse como conforme.
 */
export async function resolverDiscrepancia(input: ResolucionInput): Promise<{ conforme: boolean }> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: item, error } = await supabase
    .schema('almacen')
    .from('recepciones_items')
    .select('id, recepcion_id, oc_item_id, tipo_discrepancia, cantidad_aceptada, cantidad_fisica')
    .eq('id', input.recepcionItemId)
    .maybeSingle()

  if (error || !item) throw new Error('No se encontró la línea de recepción.')
  if (item.tipo_discrepancia === 'ninguna') throw new Error('Esta línea no tiene discrepancia que resolver.')

  const nuevaAceptada =
    input.accionTomada === 'aceptado_con_ajuste'
      ? input.cantidadAceptadaAjustada ?? Number(item.cantidad_aceptada)
      : input.accionTomada === 'rechazado'
        ? 0
        : Number(item.cantidad_aceptada)

  const delta = nuevaAceptada - Number(item.cantidad_aceptada)

  const { error: errRes } = await supabase.schema('almacen').from('resoluciones_discrepancia').insert({
    recepcion_item_id: item.id,
    tipo_discrepancia: item.tipo_discrepancia,
    accion_tomada: input.accionTomada,
    comentario: input.comentario ?? null,
    decidido_por: usuario.id,
  })
  if (errRes) throw new Error(`No se pudo registrar la resolución: ${errRes.message}`)

  if (delta !== 0) {
    await supabase
      .schema('almacen')
      .from('recepciones_items')
      .update({
        cantidad_aceptada: nuevaAceptada,
        cantidad_rechazada: Number(item.cantidad_fisica) - nuevaAceptada,
      })
      .eq('id', item.id)

    const { data: ocItem } = await supabase
      .schema('compras')
      .from('ordenes_compra_items')
      .select('id, oc_id, cantidad_recibida')
      .eq('id', item.oc_item_id)
      .maybeSingle()

    if (ocItem) {
      await supabase
        .schema('compras')
        .from('ordenes_compra_items')
        .update({ cantidad_recibida: Number(ocItem.cantidad_recibida) + delta })
        .eq('id', ocItem.id)

      await actualizarEstadoOC(ocItem.oc_id)
    }
  }

  const { data: itemsRecepcion } = await supabase
    .schema('almacen')
    .from('recepciones_items')
    .select('id, tipo_discrepancia')
    .eq('recepcion_id', item.recepcion_id)

  const resoluciones = await mapaResolucionesPorItem((itemsRecepcion ?? []).map((i) => i.id))

  const conforme = recepcionQuedaConforme(
    (itemsRecepcion ?? []).map((i) => ({
      tipoDiscrepancia: i.tipo_discrepancia as TipoDiscrepancia,
      resuelta: resoluciones.has(i.id),
    }))
  )

  if (conforme) {
    await supabase
      .schema('almacen')
      .from('recepciones')
      .update({ estado: 'conforme', conforme: true, fecha_conformidad: new Date().toISOString() })
      .eq('id', item.recepcion_id)
  }

  return { conforme }
}
