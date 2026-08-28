import 'server-only'
import { crearClienteServidor, exigirUsuario } from '@logisalud/auth/server'
import {
  estaVencida,
  type BorradorCuota,
  type BorradorFraccionamiento,
  type BorradorLetra,
  type BorradorPrestamo,
  type TipoVencimiento,
  type VencimientoProximo,
} from '@/domain/financiamiento'

export type Prestamo = {
  id: string
  entidad_financiera: string
  numero_prestamo: string | null
  monto_original: number
  moneda: string
  estado: string
}

export type Cuota = {
  id: string
  numero_cuota: number
  fecha_vencimiento: string
  monto_capital: number
  monto_interes: number
  monto_cuota: number
  estado: string
  obligacion_id: string | null
}

export async function listarPrestamos(): Promise<Prestamo[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('financiamiento')
    .from('prestamos')
    .select('id, entidad_financiera, numero_prestamo, monto_original, moneda, estado')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`No se pudieron listar los préstamos: ${error.message}`)
  return data ?? []
}

export type PrestamoDetalle = Prestamo & { cuotas: Cuota[] }

export async function obtenerPrestamo(id: string): Promise<PrestamoDetalle | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('financiamiento')
    .from('prestamos')
    .select('id, entidad_financiera, numero_prestamo, monto_original, moneda, estado')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer el préstamo: ${error.message}`)
  if (!data) return null

  const { data: cuotas, error: errCuotas } = await supabase
    .schema('financiamiento')
    .from('prestamos_cuotas')
    .select('id, numero_cuota, fecha_vencimiento, monto_capital, monto_interes, monto_cuota, estado, obligacion_id')
    .eq('prestamo_id', id)
    .order('numero_cuota')
  if (errCuotas) throw new Error(`No se pudieron leer las cuotas: ${errCuotas.message}`)

  return { ...data, cuotas: cuotas ?? [] }
}

/** Cronograma transcrito tal como lo define el banco — el sistema nunca calcula una amortización. */
export async function crearPrestamo(borrador: BorradorPrestamo): Promise<{ id: string }> {
  const supabase = crearClienteServidor()
  const { data: prestamo, error } = await supabase
    .schema('financiamiento')
    .from('prestamos')
    .insert({
      entidad_financiera: borrador.entidadFinanciera,
      numero_prestamo: borrador.numeroPrestamo ?? null,
      monto_original: borrador.montoOriginal,
      moneda: borrador.moneda,
      tasa_interes_anual: borrador.tasaInteresAnual ?? null,
      fecha_desembolso: borrador.fechaDesembolso ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo registrar el préstamo: ${error.message}`)

  const { error: errCuotas } = await supabase
    .schema('financiamiento')
    .from('prestamos_cuotas')
    .insert(borrador.cuotas.map((c) => cuotaParaInsertar(prestamo.id, 'prestamo_id', c)))
  if (errCuotas) {
    await supabase.schema('financiamiento').from('prestamos').delete().eq('id', prestamo.id)
    throw new Error(`No se pudo guardar el cronograma: ${errCuotas.message}`)
  }

  return prestamo
}

export type Fraccionamiento = {
  id: string
  numero_expediente: string
  tipo: string | null
  deuda_original: number
  estado: string
}

export async function listarFraccionamientos(): Promise<Fraccionamiento[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('financiamiento')
    .from('fraccionamientos_sunat')
    .select('id, numero_expediente, tipo, deuda_original, estado')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`No se pudieron listar los fraccionamientos: ${error.message}`)
  return data ?? []
}

export type FraccionamientoDetalle = Fraccionamiento & { cuotas: Cuota[] }

export async function obtenerFraccionamiento(id: string): Promise<FraccionamientoDetalle | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('financiamiento')
    .from('fraccionamientos_sunat')
    .select('id, numero_expediente, tipo, deuda_original, estado')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer el fraccionamiento: ${error.message}`)
  if (!data) return null

  const { data: cuotas, error: errCuotas } = await supabase
    .schema('financiamiento')
    .from('fraccionamientos_sunat_cuotas')
    .select('id, numero_cuota, fecha_vencimiento, monto_capital, monto_interes, monto_cuota, estado, obligacion_id')
    .eq('fraccionamiento_id', id)
    .order('numero_cuota')
  if (errCuotas) throw new Error(`No se pudieron leer las cuotas: ${errCuotas.message}`)

  return { ...data, cuotas: cuotas ?? [] }
}

export async function crearFraccionamiento(borrador: BorradorFraccionamiento): Promise<{ id: string }> {
  const supabase = crearClienteServidor()
  const { data: fraccionamiento, error } = await supabase
    .schema('financiamiento')
    .from('fraccionamientos_sunat')
    .insert({
      numero_expediente: borrador.numeroExpediente,
      tipo: borrador.tipo ?? null,
      deuda_original: borrador.deudaOriginal,
      tasa_interes_moratorio: borrador.tasaInteresMoratorio ?? 0,
      fecha_resolucion: borrador.fechaResolucion ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo registrar el fraccionamiento: ${error.message}`)

  const { error: errCuotas } = await supabase
    .schema('financiamiento')
    .from('fraccionamientos_sunat_cuotas')
    .insert(borrador.cuotas.map((c) => cuotaParaInsertar(fraccionamiento.id, 'fraccionamiento_id', c)))
  if (errCuotas) {
    await supabase.schema('financiamiento').from('fraccionamientos_sunat').delete().eq('id', fraccionamiento.id)
    throw new Error(`No se pudo guardar el cronograma: ${errCuotas.message}`)
  }

  return fraccionamiento
}

function cuotaParaInsertar(padreId: string, columnaFk: 'prestamo_id' | 'fraccionamiento_id', c: BorradorCuota) {
  return {
    [columnaFk]: padreId,
    numero_cuota: c.numeroCuota,
    fecha_vencimiento: c.fechaVencimiento,
    monto_capital: c.montoCapital,
    monto_interes: c.montoInteres,
  }
}

export type ObligacionParaCanje = {
  id: string
  codigo: string
  numero_factura: string | null
  moneda: string
  neto_a_pagar: number
  proveedor: { id: string; razon_social: string } | null
}

/** Regla 8: solo una obligación de compra (con proveedor real) ya facturada se puede canjear por letras. */
export async function obtenerObligacionParaCanje(obligacionId: string): Promise<ObligacionParaCanje | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, codigo, origen, numero_factura, moneda, neto_a_pagar, estado, proveedor_id')
    .eq('id', obligacionId)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la obligación: ${error.message}`)
  if (!data || data.origen !== 'compra' || !data.proveedor_id) return null
  if (['pagada', 'canjeada_por_letra', 'en_propuesta'].includes(data.estado)) return null

  const { data: proveedor } = await supabase.schema('compras').from('proveedores').select('id, razon_social').eq('id', data.proveedor_id).maybeSingle()

  return {
    id: data.id,
    codigo: data.codigo,
    numero_factura: data.numero_factura,
    moneda: data.moneda,
    neto_a_pagar: Number(data.neto_a_pagar),
    proveedor: proveedor ?? null,
  }
}

/**
 * Canjea una obligación de compra ya existente por una o más letras (regla
 * 8) — la obligación original queda `canjeada_por_letra` y ya no entra a
 * ninguna propuesta de pago; lo que se paga de ahora en más son las letras.
 */
export async function canjearPorLetras(obligacionId: string, letras: readonly BorradorLetra[]): Promise<void> {
  const supabase = crearClienteServidor()
  const obligacion = await obtenerObligacionParaCanje(obligacionId)
  if (!obligacion || !obligacion.proveedor) throw new Error('Esta obligación no se puede canjear por letras.')

  const { error: errLetras } = await supabase.schema('financiamiento').from('letras_por_pagar').insert(
    letras.map((l) => ({
      obligacion_origen_id: obligacionId,
      proveedor_id: obligacion.proveedor!.id,
      numero_letra: l.numero ?? null,
      monto: l.monto,
      moneda: obligacion.moneda,
      fecha_vencimiento: l.fechaVencimiento,
      banco_negociacion: l.bancoNegociacion ?? null,
    }))
  )
  if (errLetras) throw new Error(`No se pudieron crear las letras: ${errLetras.message}`)

  const { error: errUpd } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .update({ estado: 'canjeada_por_letra' })
    .eq('id', obligacionId)
  if (errUpd) throw new Error(`Las letras se crearon pero no se pudo actualizar la obligación original: ${errUpd.message}`)
}

export type LetraListada = {
  id: string
  numero_letra: string | null
  monto: number
  moneda: string
  fecha_emision: string
  fecha_vencimiento: string
  banco_negociacion: string | null
  estado: string
  obligacion_id: string | null
}

export async function listarLetrasDeObligacion(obligacionOrigenId: string): Promise<LetraListada[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('financiamiento')
    .from('letras_por_pagar')
    .select('id, numero_letra, monto, moneda, fecha_emision, fecha_vencimiento, banco_negociacion, estado, obligacion_id')
    .eq('obligacion_origen_id', obligacionOrigenId)
    .order('fecha_vencimiento')
  if (error) throw new Error(`No se pudieron listar las letras: ${error.message}`)
  return data ?? []
}

const DIAS_VENTANA_VENCIMIENTOS = 7

/**
 * Regla 6 dice que la obligación se genera por "proceso programado" cuando
 * vence una cuota — esta app todavía no tiene infraestructura de cron
 * (ningún cron job existe en el repo), así que por ahora es Contabilidad
 * quien dispara la generación desde esta bandeja, viendo lo que vence
 * pronto y confirmando en lote — mismo criterio que Gerencia aprobando una
 * propuesta de pago entera de una vez, no obligación por obligación.
 */
export async function listarVencimientosProximos(): Promise<VencimientoProximo[]> {
  const supabase = crearClienteServidor()
  const hoy = new Date().toISOString().slice(0, 10)
  const limite = new Date(Date.now() + DIAS_VENTANA_VENCIMIENTOS * 86400000).toISOString().slice(0, 10)

  const [{ data: cuotasPrestamo }, { data: cuotasFraccionamiento }, { data: letras }] = await Promise.all([
    supabase
      .schema('financiamiento')
      .from('prestamos_cuotas')
      .select('id, prestamo_id, fecha_vencimiento, monto_cuota')
      .eq('estado', 'pendiente')
      .is('obligacion_id', null)
      .lte('fecha_vencimiento', limite),
    supabase
      .schema('financiamiento')
      .from('fraccionamientos_sunat_cuotas')
      .select('id, fraccionamiento_id, fecha_vencimiento, monto_cuota')
      .eq('estado', 'pendiente')
      .is('obligacion_id', null)
      .lte('fecha_vencimiento', limite),
    supabase
      .schema('financiamiento')
      .from('letras_por_pagar')
      .select('id, numero_letra, proveedor_id, moneda, fecha_vencimiento, monto')
      .eq('estado', 'pendiente')
      .is('obligacion_id', null)
      .lte('fecha_vencimiento', limite),
  ])

  const prestamoIds = [...new Set((cuotasPrestamo ?? []).map((c) => c.prestamo_id))]
  const fraccionamientoIds = [...new Set((cuotasFraccionamiento ?? []).map((c) => c.fraccionamiento_id))]
  const proveedorIds = [...new Set((letras ?? []).map((l) => l.proveedor_id))]

  const [prestamos, fraccionamientos, proveedores] = await Promise.all([
    mapaPrestamos(prestamoIds),
    mapaFraccionamientos(fraccionamientoIds),
    mapaProveedores(proveedorIds),
  ])

  const resultado: VencimientoProximo[] = [
    ...(cuotasPrestamo ?? []).map((c) => ({
      tipo: 'prestamo' as const,
      id: c.id,
      etiqueta: prestamos.get(c.prestamo_id) ?? 'Préstamo',
      fechaVencimiento: c.fecha_vencimiento,
      monto: Number(c.monto_cuota),
      moneda: 'PEN' as const,
    })),
    ...(cuotasFraccionamiento ?? []).map((c) => ({
      tipo: 'fraccionamiento' as const,
      id: c.id,
      etiqueta: fraccionamientos.get(c.fraccionamiento_id) ?? 'Fraccionamiento SUNAT',
      fechaVencimiento: c.fecha_vencimiento,
      monto: Number(c.monto_cuota),
      moneda: 'PEN' as const,
    })),
    ...(letras ?? []).map((l) => ({
      tipo: 'letra' as const,
      id: l.id,
      etiqueta: `Letra${l.numero_letra ? ` ${l.numero_letra}` : ''} — ${proveedores.get(l.proveedor_id) ?? 'proveedor'}`,
      fechaVencimiento: l.fecha_vencimiento,
      monto: Number(l.monto),
      moneda: l.moneda as 'PEN' | 'USD',
    })),
  ]

  return resultado.sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
}

async function mapaPrestamos(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, string>()
  const { data } = await supabase.schema('financiamiento').from('prestamos').select('id, entidad_financiera').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, p.entidad_financiera]))
}

async function mapaFraccionamientos(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, string>()
  const { data } = await supabase.schema('financiamiento').from('fraccionamientos_sunat').select('id, numero_expediente').in('id', ids)
  return new Map((data ?? []).map((f: any) => [f.id, `Fraccionamiento ${f.numero_expediente}`]))
}

async function mapaProveedores(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, string>()
  const { data } = await supabase.schema('compras').from('proveedores').select('id, razon_social').in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, p.razon_social]))
}

/**
 * Genera la obligación de cada vencimiento elegido — regla 6. Un préstamo o
 * un fraccionamiento no llevan IGV (no son una compra sujeta a impuesto,
 * son el repago de una deuda), así que la base imponible es el monto entero
 * y el IGV siempre 0; una letra hereda la moneda de la obligación de compra
 * que reemplazó, también sin IGV propio (ya viajaba en la obligación
 * original que canjeó). Arranca en 'registrada', igual que cualquier otra
 * obligación — sigue el mismo embudo de conformidad y propuesta.
 */
export async function generarObligacionesVencimientos(items: readonly { tipo: TipoVencimiento; id: string }[]): Promise<void> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  for (const item of items) {
    if (item.tipo === 'prestamo') {
      const { data: cuota } = await supabase
        .schema('financiamiento')
        .from('prestamos_cuotas')
        .select('id, prestamo_id, monto_cuota')
        .eq('id', item.id)
        .maybeSingle()
      if (!cuota) continue
      const { data: prestamo } = await supabase.schema('financiamiento').from('prestamos').select('entidad_financiera').eq('id', cuota.prestamo_id).maybeSingle()

      const { data: obligacion, error } = await supabase
        .schema('cuentas_x_pagar')
        .from('obligaciones')
        .insert({
          origen: 'prestamo', moneda: 'PEN', base_imponible: cuota.monto_cuota, igv: 0,
          estado: 'registrada', created_by: usuario.id,
          observaciones: `Cuota de préstamo — ${prestamo?.entidad_financiera ?? ''}`.trim(),
        })
        .select('id')
        .single()
      if (error) throw new Error(`No se pudo generar la obligación de la cuota de préstamo: ${error.message}`)
      await supabase.schema('financiamiento').from('prestamos_cuotas').update({ obligacion_id: obligacion.id, estado: 'en_propuesta' }).eq('id', cuota.id)
    }

    if (item.tipo === 'fraccionamiento') {
      const { data: cuota } = await supabase
        .schema('financiamiento')
        .from('fraccionamientos_sunat_cuotas')
        .select('id, fraccionamiento_id, monto_cuota')
        .eq('id', item.id)
        .maybeSingle()
      if (!cuota) continue
      const { data: fraccionamiento } = await supabase
        .schema('financiamiento')
        .from('fraccionamientos_sunat')
        .select('numero_expediente')
        .eq('id', cuota.fraccionamiento_id)
        .maybeSingle()

      const { data: obligacion, error } = await supabase
        .schema('cuentas_x_pagar')
        .from('obligaciones')
        .insert({
          origen: 'fraccionamiento_sunat', moneda: 'PEN', base_imponible: cuota.monto_cuota, igv: 0,
          estado: 'registrada', created_by: usuario.id,
          observaciones: `Fraccionamiento SUNAT ${fraccionamiento?.numero_expediente ?? ''}`.trim(),
        })
        .select('id')
        .single()
      if (error) throw new Error(`No se pudo generar la obligación de la cuota de fraccionamiento: ${error.message}`)
      await supabase.schema('financiamiento').from('fraccionamientos_sunat_cuotas').update({ obligacion_id: obligacion.id, estado: 'en_propuesta' }).eq('id', cuota.id)
    }

    if (item.tipo === 'letra') {
      const { data: letra } = await supabase
        .schema('financiamiento')
        .from('letras_por_pagar')
        .select('id, proveedor_id, moneda, monto')
        .eq('id', item.id)
        .maybeSingle()
      if (!letra) continue

      const { data: obligacion, error } = await supabase
        .schema('cuentas_x_pagar')
        .from('obligaciones')
        .insert({
          origen: 'letra_por_pagar', proveedor_id: letra.proveedor_id, moneda: letra.moneda,
          base_imponible: letra.monto, igv: 0, estado: 'registrada', created_by: usuario.id,
        })
        .select('id')
        .single()
      if (error) throw new Error(`No se pudo generar la obligación de la letra: ${error.message}`)
      await supabase.schema('financiamiento').from('letras_por_pagar').update({ obligacion_id: obligacion.id, estado: 'en_propuesta' }).eq('id', letra.id)
    }
  }
}

/**
 * Se llama desde services/pagos.ts justo después de marcar 'pagada' una
 * obligación — propaga el pago a la cuota/letra que la originó, sea de qué
 * tabla sea (no hace nada si la obligación no nació de un vencimiento de
 * Financiamiento).
 */
export async function marcarVencimientoPagado(obligacionId: string): Promise<void> {
  const supabase = crearClienteServidor()
  await supabase.schema('financiamiento').from('prestamos_cuotas').update({ estado: 'pagada' }).eq('obligacion_id', obligacionId)
  await supabase.schema('financiamiento').from('fraccionamientos_sunat_cuotas').update({ estado: 'pagada' }).eq('obligacion_id', obligacionId)
  await supabase.schema('financiamiento').from('letras_por_pagar').update({ estado: 'pagada' }).eq('obligacion_id', obligacionId)
}

export { estaVencida }
