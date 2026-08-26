import { diasEntre } from './fechas';

export interface DescuentoCalc {
  diasAnticipacion: number | null;
  pctDescuento: number; // 0, 0.015 o 0.03
  montoDescuento: number;
  montoAPagarConDescuento: number;
}

// Motor de descuento por pronto pago. Cálculo puro de lectura: no crea notas
// de crédito ni modifica documentos, solo determina si corresponde descuento
// y cuánto, para mostrarlo en la vista del vendedor.
//
// Documentos con retención de IGV pendiente (identificados por tener un pago
// tipo 'retencion' asociado en `pagos`) nunca reciben descuento: la retención
// ya reduce lo que el cliente paga en efectivo, y no debe combinarse con un
// descuento adicional por pronto pago.
export function calcularDescuento(
  fechaVencimiento: string | null,
  saldoPendiente: number,
  hoyISO: string,
  tieneRetencion: boolean,
): DescuentoCalc {
  const diasAnticipacion = diasEntre(fechaVencimiento, hoyISO);

  let pctDescuento = 0;
  if (!tieneRetencion && diasAnticipacion !== null) {
    if (diasAnticipacion >= 15) pctDescuento = 0.03;
    else if (diasAnticipacion >= 7) pctDescuento = 0.015;
  }

  const montoDescuento = Math.round(saldoPendiente * pctDescuento * 100) / 100;
  const montoAPagarConDescuento = Math.round((saldoPendiente - montoDescuento) * 100) / 100;

  return { diasAnticipacion, pctDescuento, montoDescuento, montoAPagarConDescuento };
}
