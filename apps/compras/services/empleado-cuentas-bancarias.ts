import 'server-only'
import { crearClienteServidor, exigirUsuario } from '@logisalud/auth/server'

export type CuentaBancariaEmpleado = {
  id: string
  banco: string
  tipo_cuenta: 'ahorros' | 'corriente' | null
  numero_cuenta: string
  cci: string
  moneda: string
  es_principal: boolean
}

export type BorradorCuentaBancariaEmpleado = {
  banco: string
  tipoCuenta: 'ahorros' | 'corriente' | null
  numeroCuenta: string
  cci: string
  moneda: string
  esPrincipal: boolean
}

/** La cuenta bancaria de la persona logueada — es dueña de sus propias filas
 * (RLS: usuario_id = auth.uid()), así que no recibe un id como parámetro. */
export async function listarMisCuentasBancarias(): Promise<CuentaBancariaEmpleado[]> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .from('empleado_cuentas_bancarias')
    .select('id, banco, tipo_cuenta, numero_cuenta, cci, moneda, es_principal')
    .eq('usuario_id', usuario.id)
    .order('es_principal', { ascending: false })

  if (error) throw new Error(`No se pudieron listar tus cuentas bancarias: ${error.message}`)
  return data ?? []
}

/** Para Tesorería al elegir cuenta destino de un pago — RLS solo deja leer
 * esto a contabilidad/tesoreria/admin además del propio dueño. */
export async function listarCuentasBancariasDe(usuarioId: string): Promise<CuentaBancariaEmpleado[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .from('empleado_cuentas_bancarias')
    .select('id, banco, tipo_cuenta, numero_cuenta, cci, moneda, es_principal')
    .eq('usuario_id', usuarioId)
    .order('es_principal', { ascending: false })

  if (error) throw new Error(`No se pudieron leer las cuentas bancarias: ${error.message}`)
  return data ?? []
}

export async function crearCuentaBancariaEmpleado(borrador: BorradorCuentaBancariaEmpleado): Promise<{ id: string }> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  if (!borrador.banco.trim()) throw new Error('Falta el banco.')
  if (!borrador.numeroCuenta.trim()) throw new Error('Falta el número de cuenta.')
  if (borrador.cci.trim().length !== 20) throw new Error('El CCI tiene que tener 20 dígitos.')

  const { data, error } = await supabase
    .from('empleado_cuentas_bancarias')
    .insert({
      usuario_id: usuario.id,
      banco: borrador.banco.trim(),
      tipo_cuenta: borrador.tipoCuenta,
      numero_cuenta: borrador.numeroCuenta.trim(),
      cci: borrador.cci.trim(),
      moneda: borrador.moneda,
      es_principal: borrador.esPrincipal,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Ya tienes una cuenta principal en ${borrador.moneda} — desmárcala antes de agregar otra.`)
    }
    throw new Error(`No se pudo guardar la cuenta bancaria: ${error.message}`)
  }
  return data
}

export async function eliminarCuentaBancariaEmpleado(id: string): Promise<void> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()
  const { error } = await supabase
    .from('empleado_cuentas_bancarias')
    .delete()
    .eq('id', id)
    .eq('usuario_id', usuario.id)
  if (error) throw new Error(`No se pudo eliminar la cuenta: ${error.message}`)
}
