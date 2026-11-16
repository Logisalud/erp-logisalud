import 'server-only'
import { crearClienteServidor, perfilActual } from '@logisalud/auth/server'
import { anioMesStorageLima } from '@/domain/fecha'
import {
  clasificarDiferencia, puedeRegistrarDocumentoExcedente, validarDocumentoExcedente,
  type DiferenciaRecepcion, type FilaNotaPendiente, type TipoDocumentoExcedente,
} from '@/domain/notas-pendientes-proveedor'

/**
 * Reporte "Notas pendientes de proveedores" — ver
 * domain/notas-pendientes-proveedor.ts para qué es cada fila, y la migración
 * 0089 para la vista que junta los cuatro schemas.
 */
export async function listarNotasPendientes(hoy: string): Promise<FilaNotaPendiente[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('compras')
    .from('v_diferencias_recepcion')
    .select('*')
    .order('fecha_recepcion', { ascending: true })
  if (error) throw new Error(`No se pudo leer las diferencias de recepción: ${error.message}`)
  const filas = (data ?? []) as any[]
  if (filas.length === 0) return []

  const obligacionIds = [...new Set(filas.map((f) => f.obligacion_id).filter(Boolean))] as string[]
  const lineaIds = filas.map((f) => f.linea_id as string)
  const [{ data: notas }, { data: documentos }] = await Promise.all([
    obligacionIds.length
      ? supabase.schema('compras').from('notas_credito')
          .select('obligacion_id, numero_nc, fecha_emision, created_at')
          .in('obligacion_id', obligacionIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    supabase.schema('compras').from('documentos_excedente')
      .select('recepcion_item_id, tipo, numero, fecha_emision')
      .in('recepcion_item_id', lineaIds),
  ])

  const notasPorObligacion = new Map<string, { numero: string | null; fecha: string | null }[]>()
  for (const n of (notas ?? []) as any[]) {
    const lista = notasPorObligacion.get(n.obligacion_id) ?? []
    lista.push({ numero: n.numero_nc ?? null, fecha: n.fecha_emision ?? String(n.created_at).slice(0, 10) })
    notasPorObligacion.set(n.obligacion_id, lista)
  }
  const documentoPorLinea = new Map(
    ((documentos ?? []) as any[]).map((d) => [d.recepcion_item_id, { tipo: d.tipo, numero: d.numero, fecha: d.fecha_emision }])
  )

  return filas.map((f) => clasificarDiferencia({
    lineaId: f.linea_id,
    recepcionId: f.recepcion_id,
    fechaRecepcion: f.fecha_recepcion,
    recibidoPor: f.recibido_por ?? null,
    ocCodigo: f.oc_codigo,
    moneda: f.moneda,
    proveedorId: f.proveedor_id,
    proveedor: f.proveedor,
    ruc: f.ruc ?? null,
    numeroFactura: f.numero_factura ?? null,
    productoCodigo: f.producto_codigo ?? null,
    producto: f.producto ?? null,
    cantidadFactura: Number(f.cantidad_factura),
    cantidadFisica: Number(f.cantidad_fisica),
    precioUnitario: Number(f.precio_unitario),
    exoneradoIgv: !!f.exonerado_igv,
    observaciones: f.observaciones ?? null,
    obligacionId: f.obligacion_id ?? null,
    obligacionCodigo: f.obligacion_codigo ?? null,
    esperaNotaCredito: !!f.espera_nota_credito,
    notasCredito: f.obligacion_id ? notasPorObligacion.get(f.obligacion_id) ?? [] : [],
    documentoExcedente: documentoPorLinea.get(f.linea_id) ?? null,
  } satisfies DiferenciaRecepcion, hoy))
}

/** Sube el archivo de la factura o nota de débito. En su propio request,
 *  como todo archivo del módulo (límite de body de las Server Actions). */
export async function subirDocumentoExcedente(ocCodigo: string, archivo: File): Promise<{ path: string } | { error: string }> {
  if (!archivo || archivo.size === 0) return { error: 'El archivo está vacío.' }
  const supabase = crearClienteServidor()
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${anioMesStorageLima()}/${ocCodigo}/excedente-${Date.now()}-${nombreLimpio}`
  const { error } = await supabase.storage
    .from('legajos-compras')
    .upload(path, archivo, { contentType: archivo.type || undefined })
  if (error) return { error: `No se pudo subir el documento: ${error.message}` }
  return { path }
}

/**
 * Cierra el excedente de una o varias líneas con el documento del
 * proveedor. Las líneas se validan contra la vista: solo se aceptan las que
 * de verdad llegaron de más y todavía no tienen documento.
 */
export async function registrarDocumentoExcedente(input: {
  tipo: string
  numero: string
  fechaEmision: string
  storagePath: string | null
  lineas: string[]
}): Promise<void> {
  const perfil = await perfilActual()
  if (!puedeRegistrarDocumentoExcedente(perfil?.area)) {
    throw new Error('Solo Contabilidad registra los documentos de los proveedores.')
  }
  const error = validarDocumentoExcedente(input)
  if (error) throw new Error(error)

  const supabase = crearClienteServidor()
  const { data: lineas, error: errLineas } = await supabase
    .schema('compras')
    .from('v_diferencias_recepcion')
    .select('linea_id, cantidad_factura, cantidad_fisica')
    .in('linea_id', input.lineas)
  if (errLineas) throw new Error(`No se pudieron leer las líneas: ${errLineas.message}`)
  const conExcedente = ((lineas ?? []) as any[]).filter((l) => Number(l.cantidad_fisica) > Number(l.cantidad_factura))
  if (conExcedente.length !== input.lineas.length) {
    throw new Error('Alguna de las líneas elegidas no llegó de más. Recarga la página.')
  }

  const { error: errInsert } = await supabase
    .schema('compras')
    .from('documentos_excedente')
    .insert(input.lineas.map((lineaId) => ({
      recepcion_item_id: lineaId,
      tipo: input.tipo as TipoDocumentoExcedente,
      numero: input.numero.trim(),
      fecha_emision: input.fechaEmision,
      storage_path: input.storagePath,
    })))
  if (errInsert) {
    if (errInsert.code === '23505') throw new Error('Alguna de esas líneas ya tiene su documento registrado. Recarga la página.')
    throw new Error(`No se pudo registrar el documento: ${errInsert.message}`)
  }
}
