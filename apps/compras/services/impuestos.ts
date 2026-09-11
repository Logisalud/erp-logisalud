import 'server-only'
import { crearClienteServidor, exigirUsuario } from '@logisalud/auth/server'
import type { BorradorImpuesto, EstadoObligacionTributaria } from '@/domain/impuestos'
import {
  filasDeCarga, validarCargaMultiple,
  type EncabezadoCarga, type LineaCarga, type ErrorValidacion,
} from '@/domain/impuestos'

export type TipoImpuesto = { id: string; nombre: string }

export async function listarTiposImpuesto(): Promise<TipoImpuesto[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('impuestos')
    .from('tipos_impuesto')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')
  if (error) throw new Error(`No se pudieron listar los tipos de impuesto: ${error.message}`)
  return data ?? []
}

/** RLS (`tipos_impuesto_escritura`) ya restringe esto a contabilidad/admin. */
export async function crearTipoImpuesto(nombre: string): Promise<void> {
  const supabase = crearClienteServidor()
  const { error } = await supabase.schema('impuestos').from('tipos_impuesto').insert({ nombre })
  if (error) throw new Error(`No se pudo crear el tipo de impuesto: ${error.message}`)
}

export type ObligacionTributariaListada = {
  id: string
  periodo: string
  monto: number
  moneda: string
  fecha_vencimiento: string
  fuente: string
  estado: EstadoObligacionTributaria
  tipo_impuesto: { nombre: string } | null
}

export async function listarObligacionesTributarias(estado?: EstadoObligacionTributaria): Promise<ObligacionTributariaListada[]> {
  const supabase = crearClienteServidor()
  let q = supabase
    .schema('impuestos')
    .from('obligaciones_tributarias')
    .select('id, periodo, monto, moneda, fecha_vencimiento, fuente, estado, tipo_impuesto_id')
    .order('fecha_vencimiento', { ascending: false })
  if (estado) q = q.eq('estado', estado)

  const { data, error } = await q
  if (error) throw new Error(`No se pudieron listar las obligaciones tributarias: ${error.message}`)
  if (!data || data.length === 0) return []

  const tipos = await mapaTiposImpuesto([...new Set(data.map((o) => o.tipo_impuesto_id))])
  return data.map((o) => ({ ...o, tipo_impuesto: tipos.get(o.tipo_impuesto_id) ?? null }))
}

async function mapaTiposImpuesto(ids: string[]) {
  const supabase = crearClienteServidor()
  if (ids.length === 0) return new Map<string, { nombre: string }>()
  const { data } = await supabase.schema('impuestos').from('tipos_impuesto').select('id, nombre').in('id', ids)
  return new Map((data ?? []).map((t: any) => [t.id, { nombre: t.nombre }]))
}

/** Regla 11: Gestión Humana (Arlette) carga el monto de planilla desde BUK antes del vencimiento. */
export async function cargarObligacionTributaria(borrador: BorradorImpuesto): Promise<{ id: string }> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('impuestos')
    .from('obligaciones_tributarias')
    .insert({
      tipo_impuesto_id: borrador.tipoImpuestoId,
      periodo: borrador.periodo,
      monto: borrador.monto,
      fecha_vencimiento: borrador.fechaVencimiento,
      fuente: borrador.fuente,
      cargado_por: usuario.id,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una carga para ese tipo de impuesto en ese periodo.')
    throw new Error(`No se pudo cargar la obligación tributaria: ${error.message}`)
  }
  return data
}

/**
 * Contabilidad confirma lo que Arlette cargó — genera la obligación real en
 * `cuentas_x_pagar.obligaciones`, mismo patrón que aprobarPorContabilidad en
 * services/solicitudes-gasto.ts. Sin IGV: un impuesto de planilla no es una
 * compra sujeta a IGV.
 */
export async function confirmarObligacionTributaria(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: ot, error } = await supabase
    .schema('impuestos')
    .from('obligaciones_tributarias')
    .select('id, tipo_impuesto_id, periodo, monto, moneda, fecha_vencimiento, estado')
    .eq('id', id)
    .maybeSingle()
  if (error || !ot) throw new Error('No se encontró la obligación tributaria.')
  if (ot.estado !== 'pendiente_contabilidad') {
    throw new Error(`Esta carga está en "${ot.estado}", no en espera de Contabilidad.`)
  }

  const tipos = await mapaTiposImpuesto([ot.tipo_impuesto_id])
  const nombreTipo = tipos.get(ot.tipo_impuesto_id)?.nombre ?? 'Impuesto'

  const { data: obligacion, error: errOb } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .insert({
      origen: 'impuesto',
      moneda: ot.moneda,
      base_imponible: ot.monto,
      igv: 0,
      estado: 'registrada',
      fecha_vencimiento_real: ot.fecha_vencimiento,
      observaciones: `${nombreTipo} · periodo ${ot.periodo}`,
      created_by: usuario.id,
    })
    .select('id')
    .single()
  if (errOb) throw new Error(`No se pudo generar la obligación: ${errOb.message}`)

  const { error: errUpd } = await supabase
    .schema('impuestos')
    .from('obligaciones_tributarias')
    .update({ estado: 'conforme', obligacion_id: obligacion.id })
    .eq('id', id)
  if (errUpd) throw new Error(`La obligación se creó pero no se pudo actualizar la carga: ${errUpd.message}`)
}

/** Se llama desde services/pagos.ts justo después de marcar 'pagada' una obligación de origen 'impuesto'. */
export async function marcarImpuestoPagado(obligacionId: string): Promise<void> {
  const supabase = crearClienteServidor()
  await supabase.schema('impuestos').from('obligaciones_tributarias').update({ estado: 'pagado' }).eq('obligacion_id', obligacionId)
}


/**
 * Qué tipos de impuesto YA tienen carga en ese periodo. La base tiene un
 * unique por (tipo, periodo), pero ese solo avisa después de intentar
 * insertar y se lleva el envío completo — con N líneas en un solo
 * `.insert([...])`, una sola colisión perdería todo lo demás bien cargado.
 * Esta consulta previa permite marcar la línea exacta y que Arlette corrija
 * solo esa.
 */
export async function tiposYaCargadosEnPeriodo(periodo: string): Promise<string[]> {
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('impuestos')
    .from('obligaciones_tributarias')
    .select('tipo_impuesto_id')
    .eq('periodo', periodo)
  return (data ?? []).map((o: any) => o.tipo_impuesto_id)
}

/**
 * Carga N obligaciones tributarias de un mismo periodo en un solo envío —
 * así llega el reporte PLAME de BUK, que agrupa varios impuestos del mes.
 *
 * Un único `.insert([...])`: todo o nada. Sin `lote_id` — el periodo ya
 * cumple la función de agrupar, y una columna más sería un identificador
 * que nadie mira.
 *
 * Valida contra la base ANTES de insertar y devuelve los errores por línea
 * en vez de lanzar: el formulario los pinta en la línea que corresponde.
 */
export async function cargarObligacionesTributarias(
  encabezado: EncabezadoCarga,
  lineas: readonly LineaCarga[]
): Promise<{ insertadas: number } | { errores: ErrorValidacion[] }> {
  const yaCargados = await tiposYaCargadosEnPeriodo(encabezado.periodo)
  const errores = validarCargaMultiple(encabezado, lineas, yaCargados)
  if (errores.length > 0) return { errores }

  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { error } = await supabase
    .schema('impuestos')
    .from('obligaciones_tributarias')
    .insert(
      filasDeCarga(encabezado, lineas).map((f) => ({
        tipo_impuesto_id: f.tipoImpuestoId,
        periodo: f.periodo,
        monto: f.monto,
        fecha_vencimiento: f.fechaVencimiento,
        fuente: f.fuente,
        cargado_por: usuario.id,
      }))
    )

  if (error) {
    // El unique de la base sigue siendo el guardián final: si alguien cargó
    // el mismo tipo entre la consulta previa y el insert, cae acá.
    if (error.code === '23505') {
      return {
        errores: [{
          campo: 'general',
          mensaje: 'Alguien cargó uno de estos impuestos para el mismo periodo mientras completabas el formulario. Revisa la lista y vuelve a intentar.',
        }],
      }
    }
    return { errores: [{ campo: 'general', mensaje: `No se pudieron cargar los impuestos: ${error.message}` }] }
  }

  return { insertadas: lineas.length }
}
