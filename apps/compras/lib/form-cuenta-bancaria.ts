import type { BorradorCuentaBancariaEmpleado } from '@/services/empleado-cuentas-bancarias'

/** Los campos del formulario de cuenta bancaria (app/mi-cuenta-bancaria/
 * formulario.tsx), que usan tanto "Mi cuenta bancaria" como la ficha de una
 * persona sin usuario. Un solo lugar que sabe cómo se llaman. */
export function cuentaBancariaDeFormulario(form: FormData): BorradorCuentaBancariaEmpleado {
  const tipoCuenta = String(form.get('tipoCuenta') ?? '')
  return {
    banco: String(form.get('banco') ?? ''),
    tipoCuenta: tipoCuenta === 'ahorros' || tipoCuenta === 'corriente' ? tipoCuenta : null,
    numeroCuenta: String(form.get('numeroCuenta') ?? ''),
    cci: String(form.get('cci') ?? ''),
    moneda: String(form.get('moneda') ?? 'PEN'),
    esPrincipal: form.get('esPrincipal') === 'on',
  }
}
