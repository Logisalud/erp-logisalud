import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'
import { mapaCategoriasPagoDirecto } from '@/services/obligaciones'
import { RUC_SIN_IDENTIFICAR } from '@/domain/proveedor-sin-identificar'
import type { EstadoObligacion } from '@/domain/obligacion'

/**
 * Las obligaciones cargadas contra el proveedor comodín del backlog.
 *
 * Sirve para dos cosas a la vez, y por eso trae la categoría de cada fila: a
 * Sebas le dice qué le queda por investigar, y a Contabilidad le deja ver si
 * alguien usó el comodín para un pago normal en vez de cargar el proveedor
 * de verdad.
 */

export type FilaSinIdentificar = {
  id: string
  codigo: string
  fecha_factura: string | null
  numero_factura: string | null
  moneda: string
  monto: number
  estado: EstadoObligacion
  categoria: string | null
  observaciones: string | null
}

export async function listarObligacionesSinIdentificar(): Promise<FilaSinIdentificar[]> {
  const supabase = crearClienteServidor()

  // Por RUC y no por un id hardcodeado: el id es de esta base y cambiaría en
  // cualquier otro entorno; el RUC es el dato de negocio.
  const { data: proveedor } = await supabase
    .schema('compras')
    .from('proveedores')
    .select('id')
    .eq('ruc', RUC_SIN_IDENTIFICAR)
    .maybeSingle()
  // Sin comodín cargado no hay nada que reportar, y no es un error: en otro
  // entorno puede simplemente no existir.
  if (!proveedor) return []

  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select(`id, codigo, fecha_factura, numero_factura, moneda, neto_a_pagar, estado,
             categoria_pago_directo_id, observaciones`)
    .eq('proveedor_id', proveedor.id)
    .order('fecha_factura', { ascending: false, nullsFirst: false })
    .limit(500)
  if (error) throw new Error(`No se pudo leer el reporte: ${error.message}`)

  const filas = data ?? []
  if (filas.length === 0) return []

  const categorias = await mapaCategoriasPagoDirecto(
    filas.map((f: any) => f.categoria_pago_directo_id)
  )

  return filas.map((f: any) => ({
    id: f.id,
    codigo: f.codigo,
    fecha_factura: f.fecha_factura ?? null,
    numero_factura: f.numero_factura ?? null,
    moneda: f.moneda,
    monto: Number(f.neto_a_pagar),
    estado: f.estado as EstadoObligacion,
    categoria: categorias.get(f.categoria_pago_directo_id ?? '') ?? null,
    observaciones: f.observaciones ?? null,
  }))
}
