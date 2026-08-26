import { diaSemanaEsp, fechaLegible } from './fechas';

const fmtMonto = (n: number) =>
  new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const DATOS_PAGO =
  '📲 Plin: 933203759 (LOGISALUD)\n🏦 BCP Soles: 1917315019079\nCCI: 00219100731501907958';

export function mensajeDescuento(params: {
  nombreCliente: string;
  comprobante: string;
  saldoPendiente: number;
  fechaVencimiento: string;
  montoDescuento: number;
  montoAPagarConDescuento: number;
}): string {
  const { nombreCliente, comprobante, saldoPendiente, fechaVencimiento, montoDescuento, montoAPagarConDescuento } = params;
  return `Hola ${nombreCliente} 👋
Factura ${comprobante} · S/ ${fmtMonto(saldoPendiente)}
Si paga hasta el ${diaSemanaEsp(fechaVencimiento)} ${fechaLegible(fechaVencimiento)}, ahorra S/ ${fmtMonto(montoDescuento)} (paga S/ ${fmtMonto(montoAPagarConDescuento)})

${DATOS_PAGO}

Envíe su voucher por este medio. ¡Gracias! 🙌`;
}

export function mensajeVencimiento(params: {
  nombreCliente: string;
  comprobante: string;
  saldoPendiente: number;
  fechaVencimiento: string;
}): string {
  const { nombreCliente, comprobante, saldoPendiente, fechaVencimiento } = params;
  return `Hola ${nombreCliente} 👋
Le recordamos que su factura ${comprobante} por S/ ${fmtMonto(saldoPendiente)} vence el ${diaSemanaEsp(fechaVencimiento)} ${fechaLegible(fechaVencimiento)}.

${DATOS_PAGO}

Cualquier consulta, quedamos atentos. Gracias por su preferencia 🙌`;
}

// Perú: celular de 9 dígitos + código de país 51. wa.me no usa "+".
export function linkWhatsApp(celular: string, mensaje: string): string {
  return `https://wa.me/51${celular}?text=${encodeURIComponent(mensaje)}`;
}
