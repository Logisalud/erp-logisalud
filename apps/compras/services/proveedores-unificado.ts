import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'
import { validarCuentaBancaria, type FuenteProveedor } from '@/domain/proveedor'

/**
 * Búsqueda unificada de proveedores — junta compras.proveedores (mercadería
 * y bienes) y servicios.proveedores_servicio (dos tablas reales y
 * separadas, cada una con su propio Bounded Context y su propia RLS — ver
 * docs/modulo-compras-pagos.md sección 1) en una sola pantalla de
 * búsqueda. No las fusiona en la base: junta los resultados en JS, mismo
 * patrón que el resto del módulo para cruces entre schemas (ver
 * mapaProductos() en services/ordenes-compra.ts).
 */

export type ProveedorUnificado = {
  fuente: FuenteProveedor
  id: string
  ruc: string
  razonSocial: string
  nombreComercial: string | null
  condicionPagoDias: number
  monedaPrincipal: string
  activo: boolean
}

export type FiltrosProveedorUnificado = { busqueda?: string; fuente?: FuenteProveedor }

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export async function buscarProveedoresUnificado(filtros: FiltrosProveedorUnificado): Promise<ProveedorUnificado[]> {
  const supabase = crearClienteServidor()

  const [compra, servicio] = await Promise.all([
    filtros.fuente === 'servicio'
      ? Promise.resolve([])
      : supabase
          .schema('compras')
          .from('proveedores')
          .select('id, ruc, razon_social, nombre_comercial, condicion_pago_dias, moneda_principal, activo')
          .order('razon_social')
          .limit(200)
          .then(({ data, error }) => {
            if (error) throw new Error(`No se pudieron buscar proveedores de compra: ${error.message}`)
            return (data ?? []).map(
              (p: any): ProveedorUnificado => ({
                fuente: 'compra',
                id: p.id,
                ruc: p.ruc,
                razonSocial: p.razon_social,
                nombreComercial: p.nombre_comercial,
                condicionPagoDias: p.condicion_pago_dias,
                monedaPrincipal: p.moneda_principal,
                activo: p.activo,
              })
            )
          }),
    filtros.fuente === 'compra'
      ? Promise.resolve([])
      : supabase
          .schema('servicios')
          .from('proveedores_servicio')
          .select('id, ruc, razon_social, nombre_comercial, condicion_pago_dias, moneda_principal, activo')
          .order('razon_social')
          .limit(200)
          .then(({ data, error }) => {
            if (error) throw new Error(`No se pudieron buscar proveedores de servicio: ${error.message}`)
            return (data ?? []).map(
              (p: any): ProveedorUnificado => ({
                fuente: 'servicio',
                id: p.id,
                ruc: p.ruc,
                razonSocial: p.razon_social,
                nombreComercial: p.nombre_comercial,
                condicionPagoDias: p.condicion_pago_dias,
                monedaPrincipal: p.moneda_principal,
                activo: p.activo,
              })
            )
          }),
  ])

  let filas = [...compra, ...servicio]
  if (filtros.busqueda?.trim()) {
    const q = normalizar(filtros.busqueda)
    filas = filas.filter(
      (p) =>
        normalizar(p.ruc).includes(q) ||
        normalizar(p.razonSocial).includes(q) ||
        (p.nombreComercial ? normalizar(p.nombreComercial).includes(q) : false)
    )
  }
  return filas.sort((a, b) => a.razonSocial.localeCompare(b.razonSocial))
}

/** true si el proveedor (de la fuente que sea) ya tiene al menos una OC/OS emitida — nunca se borra, solo se desactiva. */
export async function tieneMovimientos(fuente: FuenteProveedor, id: string): Promise<boolean> {
  const supabase = crearClienteServidor()
  if (fuente === 'compra') {
    const { count, error } = await supabase
      .schema('compras')
      .from('ordenes_compra')
      .select('id', { count: 'exact', head: true })
      .eq('proveedor_id', id)
    if (error) throw new Error(`No se pudo verificar movimientos del proveedor: ${error.message}`)
    return (count ?? 0) > 0
  }
  const { count, error } = await supabase
    .schema('servicios')
    .from('ordenes_servicio')
    .select('id', { count: 'exact', head: true })
    .eq('proveedor_servicio_id', id)
  if (error) throw new Error(`No se pudo verificar movimientos del proveedor: ${error.message}`)
  return (count ?? 0) > 0
}

/** Activa/desactiva (soft) — nunca borra la fila. RLS de cada tabla ya restringe esto a compras/admin. */
export async function cambiarActivoProveedor(fuente: FuenteProveedor, id: string, activo: boolean): Promise<void> {
  const supabase = crearClienteServidor()
  const tabla = fuente === 'compra' ? 'proveedores' : 'proveedores_servicio'
  const schema = fuente === 'compra' ? 'compras' : 'servicios'
  const { error } = await supabase.schema(schema).from(tabla).update({ activo }).eq('id', id)
  if (error) throw new Error(`No se pudo actualizar el proveedor: ${error.message}`)
}

export type DetalleProveedorUnificado = {
  fuente: FuenteProveedor
  id: string
  ruc: string
  razonSocial: string
  nombreComercial: string | null
  contactoNombre: string | null
  contactoEmail: string | null
  contactoTelefono: string | null
  condicionPagoDias: number
  monedaPrincipal: string
  activo: boolean
  direccionFiscal: string | null
  observaciones: string | null
}

export type CuentaBancariaUnificada = {
  id: string
  banco: string
  tipoCuenta: string | null
  numeroCuenta: string
  cci: string
  moneda: string
  titular: string
  esPrincipal: boolean
}

export async function obtenerProveedorUnificado(
  fuente: FuenteProveedor,
  id: string
): Promise<{ proveedor: DetalleProveedorUnificado; cuentas: CuentaBancariaUnificada[]; tieneMovimientos: boolean } | null> {
  const supabase = crearClienteServidor()
  const schema = fuente === 'compra' ? 'compras' : 'servicios'
  const tabla = fuente === 'compra' ? 'proveedores' : 'proveedores_servicio'
  const tablaCuentas = fuente === 'compra' ? 'proveedor_cuentas_bancarias' : 'proveedor_servicio_cuentas_bancarias'
  const columnaFk = fuente === 'compra' ? 'proveedor_id' : 'proveedor_servicio_id'

  const { data: proveedor, error } = await supabase
    .schema(schema)
    .from(tabla)
    .select(
      'id, ruc, razon_social, nombre_comercial, contacto_nombre, contacto_email, contacto_telefono, condicion_pago_dias, moneda_principal, activo, direccion_fiscal, observaciones'
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer el proveedor: ${error.message}`)
  if (!proveedor) return null

  const [{ data: cuentas, error: errCuentas }, movimientos] = await Promise.all([
    supabase
      .schema(schema)
      .from(tablaCuentas)
      .select('id, banco, tipo_cuenta, numero_cuenta, cci, moneda, titular, es_principal')
      .eq(columnaFk, id)
      .order('es_principal', { ascending: false })
      .order('banco'),
    tieneMovimientos(fuente, id),
  ])
  if (errCuentas) throw new Error(`No se pudieron leer las cuentas: ${errCuentas.message}`)

  return {
    proveedor: {
      fuente,
      id: proveedor.id,
      ruc: proveedor.ruc,
      razonSocial: proveedor.razon_social,
      nombreComercial: proveedor.nombre_comercial,
      contactoNombre: proveedor.contacto_nombre,
      contactoEmail: proveedor.contacto_email,
      contactoTelefono: proveedor.contacto_telefono,
      condicionPagoDias: proveedor.condicion_pago_dias,
      monedaPrincipal: proveedor.moneda_principal,
      activo: proveedor.activo,
      direccionFiscal: proveedor.direccion_fiscal,
      observaciones: proveedor.observaciones,
    },
    cuentas: (cuentas ?? []).map((c: any) => ({
      id: c.id,
      banco: c.banco,
      tipoCuenta: c.tipo_cuenta,
      numeroCuenta: c.numero_cuenta,
      cci: c.cci,
      moneda: c.moneda,
      titular: c.titular,
      esPrincipal: c.es_principal,
    })),
    tieneMovimientos: movimientos,
  }
}

export type BorradorCuentaBancariaUnificada = {
  banco: string
  tipoCuenta: 'ahorros' | 'corriente' | null
  numeroCuenta: string
  cci: string
  moneda: string
  titular: string
  esPrincipal: boolean
}

/**
 * Alta de cuenta bancaria para cualquiera de las dos fuentes — junta lo que
 * ya hacía services/proveedores.ts::crearCuentaBancariaProveedor (solo
 * compras) con el mismo criterio para servicios.proveedor_servicio_cuentas_bancarias,
 * que hasta esta ronda no tenía ninguna pantalla que la escribiera.
 */
export async function crearCuentaBancariaUnificada(
  fuente: FuenteProveedor,
  proveedorId: string,
  borrador: BorradorCuentaBancariaUnificada
): Promise<{ id: string }> {
  const errores = validarCuentaBancaria(borrador)
  if (!borrador.banco.trim()) errores.push({ campo: 'banco', mensaje: 'Falta el banco.' })
  if (errores.length > 0) throw new Error(errores.map((e) => e.mensaje).join(' '))

  const supabase = crearClienteServidor()
  const schema = fuente === 'compra' ? 'compras' : 'servicios'
  const tablaCuentas = fuente === 'compra' ? 'proveedor_cuentas_bancarias' : 'proveedor_servicio_cuentas_bancarias'
  const columnaFk = fuente === 'compra' ? 'proveedor_id' : 'proveedor_servicio_id'

  const { data, error } = await supabase
    .schema(schema)
    .from(tablaCuentas)
    .insert({
      [columnaFk]: proveedorId,
      banco: borrador.banco.trim(),
      tipo_cuenta: borrador.tipoCuenta,
      numero_cuenta: borrador.numeroCuenta.trim(),
      cci: borrador.cci.trim(),
      moneda: borrador.moneda,
      titular: borrador.titular.trim(),
      es_principal: borrador.esPrincipal,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Ya existe una cuenta principal en ${borrador.moneda} para este proveedor — desmárcala antes de agregar otra.`)
    }
    throw new Error(`No se pudo guardar la cuenta bancaria: ${error.message}`)
  }
  return data
}

export async function eliminarCuentaBancariaUnificada(fuente: FuenteProveedor, cuentaId: string): Promise<void> {
  const supabase = crearClienteServidor()
  const schema = fuente === 'compra' ? 'compras' : 'servicios'
  const tablaCuentas = fuente === 'compra' ? 'proveedor_cuentas_bancarias' : 'proveedor_servicio_cuentas_bancarias'
  const { error } = await supabase.schema(schema).from(tablaCuentas).delete().eq('id', cuentaId)
  if (error) throw new Error(`No se pudo eliminar la cuenta: ${error.message}`)
}

/** Guarda dirección fiscal / observaciones — únicos campos nuevos de esta ronda además de activo. */
export async function actualizarDatosProveedor(
  fuente: FuenteProveedor,
  id: string,
  datos: { direccionFiscal: string | null; observaciones: string | null }
): Promise<void> {
  const supabase = crearClienteServidor()
  const schema = fuente === 'compra' ? 'compras' : 'servicios'
  const tabla = fuente === 'compra' ? 'proveedores' : 'proveedores_servicio'
  const { error } = await supabase
    .schema(schema)
    .from(tabla)
    .update({ direccion_fiscal: datos.direccionFiscal, observaciones: datos.observaciones })
    .eq('id', id)
  if (error) throw new Error(`No se pudo guardar: ${error.message}`)
}
