import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'
import type { CuentaEmpresa } from '@/domain/cuenta-empresa'

/** Las cuentas propias activas, para el desplegable "Cuenta de origen". */
export async function listarCuentasEmpresa(): Promise<CuentaEmpresa[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('cuentas_bancarias_empresa')
    .select('id, codigo_interno, nombre, banco, numero_cuenta, moneda, es_predeterminada')
    .eq('activo', true)
    .order('codigo_interno')
  if (error) throw new Error(`No se pudieron leer las cuentas de la empresa: ${error.message}`)
  return (data ?? []).map((c: any) => ({
    id: c.id,
    codigoInterno: c.codigo_interno,
    nombre: c.nombre,
    banco: c.banco,
    numeroCuenta: c.numero_cuenta,
    moneda: c.moneda,
    esPredeterminada: c.es_predeterminada,
  }))
}

/**
 * Que la cuenta de origen que llegó del formulario exista y esté activa.
 *
 * La FK ya garantiza que exista; lo que no garantiza es que siga ACTIVA. Un
 * formulario abierto desde antes de que se diera de baja una cuenta podría
 * mandar su id, y el pago quedaría saliendo de una cuenta cerrada.
 */
export async function exigirCuentaEmpresaActiva(id: string): Promise<void> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('cuentas_bancarias_empresa')
    .select('id, activo')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`No se pudo verificar la cuenta de origen: ${error.message}`)
  if (!data || !(data as any).activo) {
    throw new Error('La cuenta de origen elegida ya no está activa. Elige otra.')
  }
}
