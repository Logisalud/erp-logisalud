/** Importe con la moneda adelante. 2 decimales siempre, para que las columnas alineen. */
export function Money({ valor, moneda = 'PEN' }: { valor: number; moneda?: string }) {
  const simbolo = moneda === 'USD' ? '$' : 'S/'
  return (
    <span className="tabular-nums">
      {simbolo}&nbsp;
      {valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  )
}
