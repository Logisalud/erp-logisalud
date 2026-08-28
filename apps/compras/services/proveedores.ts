import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'

/**
 * Proveedores y sus cuentas bancarias.
 *
 * Todo pasa por el cliente con anon key + sesión, así que RLS decide qué ve y
 * qué toca cada área. No se usa la service role key: si una consulta vuelve
 * vacía, es un permiso mal puesto y hay que arreglar la policy, no saltearla.
 *
 * OJO con `.schema('compras')`: estas tablas no viven en `public`, y PostgREST
 * solo atiende los schemas que estén en "Exposed schemas" del dashboard de
 * Supabase (Settings → API). Sin `compras` y `catalogo` ahí, todo esto
 * responde 404 aunque las policies estén bien.
 */

export type Proveedor = {
  id: string
  ruc: string
  razon_social: string
  nombre_comercial: string | null
  contacto_nombre: string | null
  contacto_email: string | null
  contacto_telefono: string | null
  condicion_pago_dias: number
  moneda_principal: string
  activo: boolean
}

export type CuentaBancaria = {
  id: string
  proveedor_id: string
  banco: string
  tipo_cuenta: string | null
  numero_cuenta: string
  cci: string
  moneda: string
  titular: string
  es_principal: boolean
}

export async function listarProveedores(busqueda?: string): Promise<Proveedor[]> {
  const supabase = crearClienteServidor()
  let q = supabase
    .schema('compras')
    .from('proveedores')
    .select('id, ruc, razon_social, nombre_comercial, contacto_nombre, contacto_email, contacto_telefono, condicion_pago_dias, moneda_principal, activo')
    .order('razon_social')
    .limit(100)

  if (busqueda?.trim()) {
    const t = busqueda.trim()
    // El RUC es la clave de matching en todo el ERP, así que se busca por RUC
    // y por nombre a la vez: la gente pega cualquiera de los dos.
    q = q.or(`ruc.ilike.%${t}%,razon_social.ilike.%${t}%,nombre_comercial.ilike.%${t}%`)
  }

  const { data, error } = await q
  if (error) throw new Error(`No se pudieron listar los proveedores: ${error.message}`)
  return data ?? []
}

export async function obtenerProveedor(
  id: string
): Promise<{ proveedor: Proveedor; cuentas: CuentaBancaria[] } | null> {
  const supabase = crearClienteServidor()

  const { data: proveedor, error } = await supabase
    .schema('compras')
    .from('proveedores')
    .select('id, ruc, razon_social, nombre_comercial, contacto_nombre, contacto_email, contacto_telefono, condicion_pago_dias, moneda_principal, activo')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer el proveedor: ${error.message}`)
  if (!proveedor) return null

  const { data: cuentas, error: errorCuentas } = await supabase
    .schema('compras')
    .from('proveedor_cuentas_bancarias')
    .select('id, proveedor_id, banco, tipo_cuenta, numero_cuenta, cci, moneda, titular, es_principal')
    .eq('proveedor_id', id)
    .order('es_principal', { ascending: false })
    .order('banco')

  if (errorCuentas) throw new Error(`No se pudieron leer las cuentas: ${errorCuentas.message}`)
  return { proveedor, cuentas: cuentas ?? [] }
}

export type BorradorProveedor = {
  ruc: string
  razonSocial: string
  nombreComercial?: string
  contactoNombre?: string
  contactoEmail?: string
  contactoTelefono?: string
  condicionPagoDias: number
  monedaPrincipal: string
}

/** RLS (`proveedores_escritura`) ya restringe esto a compras/admin. */
export async function crearProveedor(borrador: BorradorProveedor): Promise<{ id: string }> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('compras')
    .from('proveedores')
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
    if (error.code === '23505') throw new Error('Ya existe un proveedor con ese RUC.')
    throw new Error(`No se pudo registrar el proveedor: ${error.message}`)
  }
  return data
}
