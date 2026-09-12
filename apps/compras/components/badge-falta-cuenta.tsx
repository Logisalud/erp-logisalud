/**
 * "Falta cuenta bancaria" — el mismo aviso en los dos lugares donde importa:
 * el listado de proveedores (donde se carga la cuenta) y el desglose del
 * lote de pago (donde Tesorería descubre que falta, justo cuando iba a
 * pagar). Un solo componente para que no se digan distinto.
 */
export function BadgeFaltaCuenta({ texto = 'Falta cuenta bancaria' }: { texto?: string }) {
  return (
    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
      {texto}
    </span>
  )
}
