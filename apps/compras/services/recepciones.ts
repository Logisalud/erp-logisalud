import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import type { TipoDiscrepancia } from '@/domain/recepcion'
import { estadoTrasRecepcion, puedeRecibirse, ETIQUETA_ESTADO, type EstadoOC } from '@/domain/orden-compra'
import {
  clasificarTresColumnas, papelesCompletos, resumenNumerosFactura, totalizarRecepcion,
  validarRecepcionTresColumnas,
  type GuiaRecibida, type LineaTresColumnas, type TipoPapel, type TotalesRecepcion,
} from '@/domain/recepcion-tres-columnas'
import { puedeCorregirPapeles, validarCorreccionPapel } from '@/domain/correccion-papeles-recepcion'
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
    /** De la OC, igual que el precio (migración 0078). */
    exonerado_igv: boolean
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
             ordenes_compra_items(id, producto_id, cantidad_pedida, cantidad_recibida, precio_unitario,
                                  exonerado_igv)`)
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
  /**
   * Las guías, cada una con su archivo (0064). Varias pueden venir con una
   * sola factura — de ahí que sea una lista y no un campo.
   */
  guias: { id: string; numero: string; storage_path: string }[]
  /** Una o varias, cada una con su archivo (0088). */
  facturas: { id: string; numero: string; storage_path: string }[]
  /** Lo que se corrigió de los papeles después de registrar, más nuevo primero. */
  cambiosPapeles: { accion: string; tipo: string; numero: string; motivo: string | null; hecho_por: string | null; hecho_en: string }[]
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
    .select(`id, oc_id, fecha_recepcion, guia_remision, numero_factura,
             estado, observaciones,
             recepciones_guias(id, numero, storage_path, created_at),
             recepciones_facturas(id, numero, storage_path, created_at),
             recepciones_documentos_cambios(accion, tipo, numero, motivo, hecho_por, hecho_en),
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
  const [ocs, productos, obligacion, nombres] = await Promise.all([
    mapaOCsConId([(data as any).oc_id]),
    mapaProductosPorOCItem(ocItemIds),
    obligacionDeRecepcion((data as any).id),
    mapaNombresPerfiles(((data as any).recepciones_documentos_cambios ?? []).map((c: any) => c.hecho_por)),
  ])

  return {
    id: (data as any).id,
    oc_id: (data as any).oc_id,
    fecha_recepcion: (data as any).fecha_recepcion,
    guia_remision: (data as any).guia_remision,
    // Embed directo y no una segunda consulta: las dos tablas viven en el
    // schema `almacen`, así que PostgREST sí las une (el límite es entre
    // schemas distintos — ver CLAUDE.md).
    guias: porFechaDeAlta((data as any).recepciones_guias),
    facturas: porFechaDeAlta((data as any).recepciones_facturas),
    cambiosPapeles: ((data as any).recepciones_documentos_cambios ?? [])
      .map((c: any) => ({ ...c, hecho_por: nombres.get(c.hecho_por) ?? null }))
      .sort((a: any, b: any) => String(b.hecho_en).localeCompare(String(a.hecho_en))),
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

function porFechaDeAlta(filas: any[] | null): { id: string; numero: string; storage_path: string }[] {
  return [...(filas ?? [])]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((f) => ({ id: f.id, numero: f.numero, storage_path: f.storage_path }))
}

async function mapaNombresPerfiles(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((i): i is string => !!i))]
  if (unicos.length === 0) return new Map()
  const supabase = crearClienteServidor()
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', unicos)
  return new Map((data ?? []).map((p: any) => [p.id, p.nombre]))
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
  /** Cada guía con SU archivo — ver migración 0064 y GuiaRecibida. */
  guias: GuiaRecibida[]
  /** Una o varias, cada una con su archivo (0088). */
  facturas: GuiaRecibida[]
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
             ordenes_compra_items(id, producto_id, cantidad_pedida, cantidad_recibida, precio_unitario,
                                  exonerado_igv)`)
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
      // De la línea de la OC, igual que el precio: lo que se cobra es lo que
      // se pactó, no lo que diga hoy el catálogo.
      exoneradoIgv: !!item.exonerado_igv,
    }
  })

  const errores = validarRecepcionTresColumnas({
    fechaRecepcion: borrador.fechaRecepcion,
    guias: borrador.guias,
    facturas: borrador.facturas,
    lineas: lineasDominio,
  })
  if (errores.length > 0) throw new Error(errores[0].mensaje)

  const totales = totalizarRecepcion(lineasDominio)
  // Solo las completas: la validación de arriba ya rechazó las filas a
  // medio llenar, así que acá lo único que queda es descartar las vacías
  // que el formulario pudo dejar de más.
  const guias = papelesCompletos(borrador.guias)
  const facturas = papelesCompletos(borrador.facturas)
  // La obligación sigue siendo UNA por recepción y lleva todas las facturas
  // en su número; el archivo que la representa es el de la primera.
  const numeroFactura = resumenNumerosFactura(facturas.map((f) => f.numero))
  const storagePathFactura = facturas[0].storagePath

  // ── 1. La cabecera ────────────────────────────────────────────────────
  const { data: recepcion, error: errRec } = await supabase
    .schema('almacen')
    .from('recepciones')
    .insert({
      oc_id: borrador.ocId,
      recibido_por: usuario.id,
      fecha_recepcion: borrador.fechaRecepcion,
      // `guia_remision` (legacy) se llena con el número de la primera para
      // que cualquier lectura vieja siga mostrando algo. Las guías de verdad
      // van a almacen.recepciones_guias, más abajo — `numeros_guia` y
      // `storage_path_guia_recibida` quedaron sin uso en 0064.
      guia_remision: guias[0]?.numero ?? null,
      numero_factura: numeroFactura,
      storage_path_factura_proveedor: storagePathFactura,
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

  // ── 1b. Las guías, una fila por guía con su archivo ───────────────────
  const { error: errGuias } = await supabase
    .schema('almacen')
    .from('recepciones_guias')
    .insert(guias.map((g) => ({
      recepcion_id: recepcion.id,
      numero: g.numero,
      storage_path: g.storagePath,
    })))
  if (errGuias) {
    // Misma salida que si fallan las líneas: una recepción sin su legajo no
    // sirve para nada, y dejarla a medias obligaría a alguien a adivinar qué
    // le falta. El `on delete cascade` se lleva las guías que sí entraron.
    await supabase.schema('almacen').from('recepciones').delete().eq('id', recepcion.id)
    throw new Error(`No se pudieron guardar las guías: ${errGuias.message}`)
  }

  // ── 1c. Las facturas, igual que las guías ─────────────────────────────
  const { error: errFacturas } = await supabase
    .schema('almacen')
    .from('recepciones_facturas')
    .insert(facturas.map((f) => ({
      recepcion_id: recepcion.id,
      numero: f.numero,
      storage_path: f.storagePath,
    })))
  if (errFacturas) {
    await supabase.schema('almacen').from('recepciones').delete().eq('id', recepcion.id)
    throw new Error(`No se pudieron guardar las facturas: ${errFacturas.message}`)
  }

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
    numeroFactura,
    totales,
    storagePathFactura,
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
      // Base GRAVADA, exonerado aparte, IGV solo sobre lo gravado (0078).
      base_imponible: input.totales.base,
      monto_exonerado: input.totales.exonerado,
      igv: input.totales.igv,
      // Una factura entera de productos exonerados no lleva IGV: se declara,
      // para que un IGV en 0 no se confunda con uno que se olvidó cargar.
      sin_igv: input.totales.base === 0 && input.totales.exonerado > 0,
      // Con discrepancia nace 'observada': Contabilidad TIENE que mirarla.
      // Sin discrepancia nace 'registrada' y solo espera el visto bueno.
      estado: input.totales.lineasConDiscrepancia > 0 ? 'observada' : 'registrada',
      espera_nota_credito: input.totales.esperaNotaCredito,
      fecha_vencimiento_real: fechaVencimiento,
      // `factura_storage_path`, no `storage_path_factura`: con el nombre al
      // revés este insert fallaba en TODAS las recepciones desde el rediseño
      // de tres columnas, y como el paso es best-effort el error se tragaba —
      // la recepción quedaba guardada y la deuda nunca llegaba a Cuentas por
      // Pagar (detectado el 2026-10-06 con 11 recepciones sin obligación).
      // tests/services/columnas-obligaciones.test.ts vigila esto ahora.
      factura_storage_path: input.storagePathFactura,
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

// ═══════════════════════════════════════════════════════════════════════════
// CORREGIR LOS PAPELES DESPUÉS DE REGISTRAR (0088)
// ═══════════════════════════════════════════════════════════════════════════

const TABLA_PAPEL: Record<TipoPapel, 'recepciones_guias' | 'recepciones_facturas'> = {
  guia: 'recepciones_guias',
  factura: 'recepciones_facturas',
}

export type CorreccionPapel =
  | { accion: 'agregar'; tipo: TipoPapel; numero: string; storagePath: string | null }
  | { accion: 'quitar' | 'reclasificar'; tipo: TipoPapel; id: string; motivo: string }

/**
 * Agrega, quita o reclasifica una guía o factura de una recepción ya
 * registrada — aunque la OC esté cerrada. Ver
 * domain/correccion-papeles-recepcion.ts para las reglas.
 *
 * Sin transacción, como todo el módulo. El orden deja algo recuperable: el
 * papel nuevo entra ANTES de que se borre el viejo (reclasificar), y el
 * rastro y el resumen de la obligación van al final — si fallan, el papel
 * ya quedó bien y el error lo dice.
 */
export async function corregirPapelRecepcion(recepcionId: string, cambio: CorreccionPapel): Promise<void> {
  const perfil = await perfilActual()
  if (!puedeCorregirPapeles(perfil?.area)) {
    throw new Error('Solo Almacén o Contabilidad corrigen los papeles de una recepción.')
  }
  const recepcion = await obtenerRecepcion(recepcionId)
  if (!recepcion) throw new Error('No se encontró la recepción.')

  const error = validarCorreccionPapel({ guias: recepcion.guias, facturas: recepcion.facturas }, cambio)
  if (error) throw new Error(error)

  const supabase = crearClienteServidor()
  const almacen = supabase.schema('almacen')
  let rastro: { tipo: TipoPapel; numero: string; storage_path: string | null; motivo: string | null }

  if (cambio.accion === 'agregar') {
    const { error: e } = await almacen.from(TABLA_PAPEL[cambio.tipo]).insert({
      recepcion_id: recepcionId, numero: cambio.numero.trim(), storage_path: cambio.storagePath,
    })
    if (e) throw new Error(`No se pudo agregar: ${e.message}`)
    rastro = { tipo: cambio.tipo, numero: cambio.numero.trim(), storage_path: cambio.storagePath, motivo: null }
  } else {
    const papel = (cambio.tipo === 'guia' ? recepcion.guias : recepcion.facturas).find((d) => d.id === cambio.id)!
    if (cambio.accion === 'reclasificar') {
      const destino: TipoPapel = cambio.tipo === 'guia' ? 'factura' : 'guia'
      const { error: e } = await almacen.from(TABLA_PAPEL[destino]).insert({
        recepcion_id: recepcionId, numero: papel.numero, storage_path: papel.storage_path,
      })
      if (e) throw new Error(`No se pudo pasar a ${destino === 'guia' ? 'guía' : 'factura'}: ${e.message}`)
      rastro = { tipo: destino, numero: papel.numero, storage_path: papel.storage_path, motivo: cambio.motivo.trim() }
    } else {
      // El archivo NO se borra del storage: es el respaldo de que existió.
      rastro = { tipo: cambio.tipo, numero: papel.numero, storage_path: papel.storage_path, motivo: cambio.motivo.trim() }
    }
    const { error: e } = await almacen.from(TABLA_PAPEL[cambio.tipo]).delete().eq('id', papel.id)
    if (e) throw new Error(`No se pudo quitar ${cambio.tipo === 'guia' ? 'la guía' : 'la factura'}: ${e.message}`)
  }

  const { error: errRastro } = await almacen.from('recepciones_documentos_cambios').insert({
    recepcion_id: recepcionId, accion: cambio.accion, ...rastro,
  })
  if (errRastro) console.error('[corregirPapelRecepcion] no se pudo guardar el rastro:', errRastro.message)

  // Si se tocaron facturas, el número de la obligación cambia con ellas.
  const tocoFacturas = cambio.tipo === 'factura' || cambio.accion === 'reclasificar'
  if (tocoFacturas) {
    const { error: errSync } = await almacen.rpc('sincronizar_facturas_recepcion', { p_recepcion_id: recepcionId })
    if (errSync) {
      throw new Error(`El papel quedó corregido, pero no se pudo actualizar el número de factura de la obligación: ${errSync.message}. Avisa a Contabilidad.`)
    }
  }
}
