import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import {
  estadoTrasConformidad, estadoTrasSubirFactura,
  type BorradorObligacionServicio, type BorradorOS, type EstadoOS,
} from '@/domain/servicio'
import { normalizarNumeroFactura } from '@/domain/obligacion'

export type ProveedorServicio = { id: string; razon_social: string }

export async function listarProveedoresServicio(): Promise<ProveedorServicio[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('servicios')
    .from('proveedores_servicio')
    .select('id, razon_social')
    .eq('activo', true)
    .order('razon_social')
  if (error) throw new Error(`No se pudieron listar los proveedores de servicio: ${error.message}`)
  return data ?? []
}

export type BorradorProveedorServicio = {
  ruc: string
  razonSocial: string
  nombreComercial?: string
  contactoNombre?: string
  contactoEmail?: string
  contactoTelefono?: string
  condicionPagoDias: number
  monedaPrincipal: string
}

/**
 * Catálogo aparte del de mercadería (compras.proveedores) — no había
 * ninguna pantalla para cargarlo, así que /servicios/nueva se quedaba sin
 * opciones para siempre si nadie insertaba filas a mano en Supabase.
 * Mismo patrón que services/proveedores.ts::crearProveedor.
 */
export async function crearProveedorServicio(borrador: BorradorProveedorServicio): Promise<{ id: string }> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('servicios')
    .from('proveedores_servicio')
    .insert({
      ruc: borrador.ruc,
      razon_social: borrador.razonSocial,
      nombre_comercial: borrador.nombreComercial || null,
      contacto_nombre: borrador.contactoNombre || null,
      contacto_email: borrador.contactoEmail || null,
      contacto_telefono: borrador.contactoTelefono || null,
      condicion_pago_dias: borrador.condicionPagoDias,
      moneda_principal: borrador.monedaPrincipal,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe un proveedor de servicio con ese RUC.')
    throw new Error(`No se pudo registrar el proveedor de servicio: ${error.message}`)
  }
  return data
}

/** Área usuaria: cualquiera puede crear una OS — `area_solicitante` sale del perfil, nunca del formulario. */
export async function crearOS(borrador: BorradorOS): Promise<{ id: string }> {
  const usuario = await exigirUsuario()
  const perfil = await perfilActual()
  if (!perfil?.area) throw new Error('Tu cuenta no tiene un área asignada — no se puede crear la orden de servicio.')

  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('servicios')
    .from('ordenes_servicio')
    .insert({
      area_solicitante: perfil.area,
      solicitante_id: usuario.id,
      proveedor_servicio_id: borrador.proveedorServicioId,
      descripcion_servicio: borrador.descripcionServicio,
      monto_estimado: borrador.montoEstimado,
      moneda: borrador.moneda,
      condiciones_pago_dias: borrador.condicionesPagoDias ?? null,
      fecha_entrega_estimada: borrador.fechaEntregaEstimada ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo crear la orden de servicio: ${error.message}`)
  return data
}

export type OSListada = {
  id: string
  codigo: string
  estado: EstadoOS
  descripcion_servicio: string
  monto_estimado: number
  moneda: string
  area_solicitante: string
  created_at: string
}

export async function listarMisOS(): Promise<OSListada[]> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('servicios')
    .from('ordenes_servicio')
    .select('id, codigo, estado, descripcion_servicio, monto_estimado, moneda, area_solicitante, created_at')
    .eq('solicitante_id', usuario.id)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`No se pudieron listar tus órdenes de servicio: ${error.message}`)
  return data ?? []
}

/** Bandeja de "esperando una decisión mía ahora": RLS ya filtra a quien puede verlas (jefe del área o contabilidad/tesorería/gerencia/admin). */
export async function listarOSPendientes(): Promise<OSListada[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('servicios')
    .from('ordenes_servicio')
    .select('id, codigo, estado, descripcion_servicio, monto_estimado, moneda, area_solicitante, created_at')
    .eq('estado', 'pendiente_jefe')
    .order('created_at')
  if (error) throw new Error(`No se pudieron listar las órdenes de servicio pendientes: ${error.message}`)
  return data ?? []
}

export type OSDetalle = OSListada & {
  proveedor: ProveedorServicio | null
  condiciones_pago_dias: number | null
  fecha_entrega_estimada: string | null
  storage_path_factura_proveedor: string | null
  conformidad: { conforme: boolean; observaciones: string | null; fecha_conformidad: string } | null
  obligacion: { id: string; codigo: string; estado: string } | null
}

export async function obtenerOS(id: string): Promise<OSDetalle | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('servicios')
    .from('ordenes_servicio')
    .select(`id, codigo, estado, descripcion_servicio, monto_estimado, moneda, area_solicitante, created_at,
             proveedor_servicio_id, condiciones_pago_dias, fecha_entrega_estimada, storage_path_factura_proveedor`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la orden de servicio: ${error.message}`)
  if (!data) return null

  const [{ data: proveedor }, { data: conformidad }, { data: obligacion }] = await Promise.all([
    supabase.schema('servicios').from('proveedores_servicio').select('id, razon_social').eq('id', data.proveedor_servicio_id).maybeSingle(),
    supabase
      .schema('servicios')
      .from('conformidad_servicio')
      .select('conforme, observaciones, fecha_conformidad')
      .eq('os_id', id)
      .order('fecha_conformidad', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.schema('cuentas_x_pagar').from('obligaciones').select('id, codigo, estado').eq('os_id', id).maybeSingle(),
  ])

  return { ...(data as any), proveedor: proveedor ?? null, conformidad: conformidad ?? null, obligacion: obligacion ?? null }
}

async function cambiarEstado(id: string, desde: EstadoOS[], hacia: EstadoOS, campos: Record<string, unknown> = {}) {
  const supabase = crearClienteServidor()
  const { data: os, error } = await supabase.schema('servicios').from('ordenes_servicio').select('id, estado').eq('id', id).maybeSingle()
  if (error || !os) throw new Error('No se encontró la orden de servicio.')
  if (!desde.includes(os.estado)) throw new Error(`La orden está en "${os.estado}" y no se puede mover desde ahí.`)
  const { error: errUpd } = await supabase.schema('servicios').from('ordenes_servicio').update({ estado: hacia, ...campos }).eq('id', id)
  if (errUpd) throw new Error(`No se pudo actualizar la orden de servicio: ${errUpd.message}`)
}

export async function aprobarOS(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  await cambiarEstado(id, ['pendiente_jefe'], 'aprobada', { aprobado_por: usuario.id, aprobado_fecha: new Date().toISOString() })
}

export async function rechazarOS(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  await cambiarEstado(id, ['pendiente_jefe'], 'rechazada_jefe', { aprobado_por: usuario.id, aprobado_fecha: new Date().toISOString() })
}

/**
 * Regla 4 (herencia de documentos), aplicada a Servicios: el área usuaria
 * sube la factura una sola vez acá — Contabilidad la hereda al registrar la
 * obligación, nunca la vuelve a pedir. Best-effort igual que en Gastos/Caja
 * Chica: si falla la subida, la orden no se bloquea.
 */
export async function subirFacturaOS(osId: string, archivo: File): Promise<void> {
  const supabase = crearClienteServidor()
  const { data: os, error } = await supabase.schema('servicios').from('ordenes_servicio').select('id, codigo, estado').eq('id', osId).maybeSingle()
  if (error || !os) throw new Error('No se encontró la orden de servicio.')
  if (!['aprobada', 'en_ejecucion'].includes(os.estado)) {
    throw new Error(`La orden está en "${os.estado}" — solo se puede subir la factura de una orden aprobada.`)
  }

  const { data: conformidad } = await supabase.schema('servicios').from('conformidad_servicio').select('conforme').eq('os_id', osId).eq('conforme', true).maybeSingle()

  let storagePath: string | null = null
  if (archivo && archivo.size > 0) {
    const ahora = new Date()
    const yyyy = String(ahora.getFullYear())
    const mm = String(ahora.getMonth() + 1).padStart(2, '0')
    const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${yyyy}/${mm}/${os.codigo}/${Date.now()}-${nombreLimpio}`
    const { error: errUpload } = await supabase.storage.from('legajos-servicios').upload(path, archivo, { contentType: archivo.type || undefined })
    if (!errUpload) storagePath = path
  }
  if (!storagePath) throw new Error('No se pudo subir el archivo de la factura.')

  const { error: errUpd } = await supabase
    .schema('servicios')
    .from('ordenes_servicio')
    .update({ storage_path_factura_proveedor: storagePath, estado: estadoTrasSubirFactura(!!conformidad) })
    .eq('id', osId)
  if (errUpd) throw new Error(`La factura se subió pero no se pudo actualizar la orden: ${errUpd.message}`)
}

export async function obtenerUrlFacturaOS(storagePath: string): Promise<string> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase.storage.from('legajos-servicios').createSignedUrl(storagePath, 60)
  if (error || !data) throw new Error(`No se pudo generar el enlace de la factura: ${error?.message ?? ''}`)
  return data.signedUrl
}

/**
 * Regla 5: la conformidad la da el área usuaria (nunca Contabilidad), y
 * puede pasar antes o después de que se suba la factura.
 */
export async function registrarConformidad(osId: string, conforme: boolean, observaciones?: string | null): Promise<void> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: os, error } = await supabase.schema('servicios').from('ordenes_servicio').select('id, estado, storage_path_factura_proveedor').eq('id', osId).maybeSingle()
  if (error || !os) throw new Error('No se encontró la orden de servicio.')
  if (!['aprobada', 'en_ejecucion', 'facturada'].includes(os.estado)) {
    throw new Error(`La orden está en "${os.estado}" — no corresponde dar conformidad ahí.`)
  }

  const { error: errIns } = await supabase.schema('servicios').from('conformidad_servicio').insert({
    os_id: osId,
    confirmado_por: usuario.id,
    conforme,
    observaciones: observaciones ?? null,
  })
  if (errIns) throw new Error(`No se pudo registrar la conformidad: ${errIns.message}`)

  if (conforme) {
    const nuevoEstado = estadoTrasConformidad(!!os.storage_path_factura_proveedor, os.estado as any)
    if (nuevoEstado !== os.estado) {
      await supabase.schema('servicios').from('ordenes_servicio').update({ estado: nuevoEstado }).eq('id', osId)
    }
  }
}

export type OSParaObligar = { id: string; codigo: string; descripcion_servicio: string; monto_estimado: number; moneda: string; proveedor: ProveedorServicio | null }

/** Contabilidad: OS ya facturadas (con la factura real ya en mano) que todavía no tienen una obligación registrada. */
export async function listarOSSinObligacion(): Promise<OSParaObligar[]> {
  const supabase = crearClienteServidor()
  const { data: os, error } = await supabase
    .schema('servicios')
    .from('ordenes_servicio')
    .select('id, codigo, descripcion_servicio, monto_estimado, moneda, proveedor_servicio_id')
    .in('estado', ['facturada', 'conformada'])
  if (error) throw new Error(`No se pudieron listar las órdenes de servicio: ${error.message}`)
  if (!os || os.length === 0) return []

  const { data: obligaciones } = await supabase.schema('cuentas_x_pagar').from('obligaciones').select('os_id').in('os_id', os.map((o) => o.id))
  const yaObligadas = new Set((obligaciones ?? []).map((o) => o.os_id))
  const sinObligacion = os.filter((o) => !yaObligadas.has(o.id))
  if (sinObligacion.length === 0) return []

  const proveedorIds = [...new Set(sinObligacion.map((o) => o.proveedor_servicio_id))]
  const { data: proveedores } = await supabase.schema('servicios').from('proveedores_servicio').select('id, razon_social').in('id', proveedorIds)
  const mapaProveedores = new Map((proveedores ?? []).map((p) => [p.id, p]))

  return sinObligacion.map((o) => ({ ...o, proveedor: mapaProveedores.get(o.proveedor_servicio_id) ?? null }))
}

/** Contabilidad registra la obligación desde una OS ya facturada — hereda la factura que el área usuaria ya subió (regla 4). */
export async function registrarObligacionDesdeOS(borrador: BorradorObligacionServicio): Promise<{ id: string }> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: os, error } = await supabase
    .schema('servicios')
    .from('ordenes_servicio')
    .select('id, proveedor_servicio_id, moneda, estado')
    .eq('id', borrador.osId)
    .maybeSingle()
  if (error || !os) throw new Error('No se encontró la orden de servicio.')
  if (!['facturada', 'conformada'].includes(os.estado)) {
    throw new Error('Solo se puede registrar la obligación de una orden ya facturada.')
  }

  const { data: existente } = await supabase.schema('cuentas_x_pagar').from('obligaciones').select('id').eq('os_id', borrador.osId).maybeSingle()
  if (existente) throw new Error('Esta orden de servicio ya tiene una obligación registrada.')

  // Identidad del comprobante: proveedor de servicio + número normalizado —
  // mismo criterio que el índice único de
  // 0027_uniqueness_factura_normalizada.sql (que es el que de verdad
  // protege esto: antes de esa migración, proveedor_servicio_id no estaba
  // cubierto por ningún constraint de unicidad).
  const numeroFacturaNormalizado = normalizarNumeroFactura(borrador.numeroFactura)
  const { data: facturaExistente } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id')
    .eq('proveedor_servicio_id', os.proveedor_servicio_id)
    .eq('numero_factura', numeroFacturaNormalizado)
    .maybeSingle()
  if (facturaExistente) {
    throw new Error(`Ya existe una obligación registrada con la factura ${numeroFacturaNormalizado} para este proveedor.`)
  }

  const { data: obligacion, error: errOb } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .insert({
      origen: 'servicio',
      proveedor_servicio_id: os.proveedor_servicio_id,
      os_id: os.id,
      numero_factura: numeroFacturaNormalizado,
      fecha_factura: borrador.fechaFactura,
      moneda: os.moneda,
      tipo_cambio: borrador.tipoCambio ?? null,
      base_imponible: borrador.baseImponible,
      igv: borrador.igv,
      estado: 'registrada',
      created_by: usuario.id,
    })
    .select('id')
    .single()
  if (errOb) {
    if (errOb.code === '23505') throw new Error('Ya existe una obligación con ese número de factura para este proveedor.')
    throw new Error(`No se pudo registrar la obligación: ${errOb.message}`)
  }

  return obligacion
}

/**
 * Se llama desde services/pagos.ts justo después de marcar 'pagada' una
 * obligación con `os_id` — cierra el ciclo de la orden de servicio.
 */
export async function marcarServicioPagado(obligacionId: string): Promise<void> {
  const supabase = crearClienteServidor()
  const { data: obligacion } = await supabase.schema('cuentas_x_pagar').from('obligaciones').select('os_id').eq('id', obligacionId).maybeSingle()
  if (!obligacion?.os_id) return
  await supabase.schema('servicios').from('ordenes_servicio').update({ estado: 'cerrada' }).eq('id', obligacion.os_id)
}
