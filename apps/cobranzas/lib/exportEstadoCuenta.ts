import * as XLSX from 'xlsx';
import type { DatosEstadoCuenta } from '@/lib/estado-cuenta-datos';

const fecha = (f: string) => {
  if (!f) return '';
  const [a, m, d] = f.split('-');
  return `${d}/${m}/${a}`;
};

/**
 * El mismo extracto que se ve en pantalla, en un Excel listo para mandarle al
 * cliente: el resumen arriba y después el libro, columna por columna.
 *
 * Lo arma a partir de `cargarEstadoCuenta`, igual que la pantalla. Si un día
 * cambia una regla de saldo, cambia en un solo lugar y las dos salidas siguen
 * diciendo lo mismo — que un Excel y una pantalla discrepen sobre cuánto debe
 * un cliente es peor que no tener el Excel.
 */
export function estadoCuentaXlsx(
  ruc: string,
  datos: DatosEstadoCuenta,
  desde: string | null,
  hasta: string | null,
): { buf: ArrayBuffer; filename: string } {
  const { cliente: c, movimientos, porFactura, resumen } = datos;

  const rango =
    desde || hasta
      ? `Del ${desde ? fecha(desde) : 'inicio'} al ${hasta ? fecha(hasta) : 'hoy'}`
      : 'Histórico completo';

  // El resumen va arriba, como filas sueltas, y recién después la tabla:
  // así el Excel se imprime o se manda tal cual, sin retocar nada.
  const aoa: (string | number)[][] = [
    ['ESTADO DE CUENTA'],
    [c?.razon_social ?? ruc],
    [`RUC ${ruc}`],
    [[c?.direccion, c?.distrito, c?.provincia].filter(Boolean).join(' · ')],
    [rango],
    [],
    ['Saldo actual', resumen.saldoActual],
    ['Total facturado', resumen.totalFacturado],
    ['Total pagado (incluye letras y retención)', resumen.totalPagado],
    ['Total notas de crédito', resumen.totalNotasCredito],
    ['Total notas de débito', resumen.totalNotasDebito],
    [],
    ['Fecha', 'Tipo', 'Documento', 'Debe', 'Haber', 'Saldo', 'Detalle'],
  ];

  for (const m of movimientos) {
    aoa.push([fecha(m.fecha), m.etiqueta, m.documento, m.debe || '', m.haber || '', m.saldo, m.detalle ?? '']);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 12 }, { wch: 18 }, { wch: 14 },
    { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 42 },
  ];

  // Segunda hoja: la misma verdad por factura. Van las dos porque responden
  // preguntas distintas — "qué pasó" y "en qué va cada factura".
  const aoaF: (string | number)[][] = [
    ['POR FACTURA'],
    [c?.razon_social ?? ruc],
    [`RUC ${ruc}`],
    [],
    ['Factura', 'Emisión', 'Vence', 'Importe', 'Notas de crédito', 'Notas de débito', 'Cobrado', 'Ajuste', 'Motivo del ajuste', 'Saldo', 'Estado', 'Días vencida', 'NC vigentes'],
  ];
  for (const f of porFactura) {
    aoaF.push([
      f.comprobante,
      fecha(f.fechaEmision),
      f.fechaVencimiento ? fecha(f.fechaVencimiento) : '',
      f.importe,
      f.totalNotasCredito || '',
      f.totalNotasDebito || '',
      f.totalCobrado || '',
      f.ajuste || '',
      f.motivoAjuste ?? '',
      f.saldo,
      f.estado,
      f.saldo > 0.005 && (f.diasVencida ?? 0) > 0 ? (f.diasVencida as number) : '',
      f.notasCredito.map((n) => `${n.comprobante} (${fecha(n.fecha)}) ${n.importe.toFixed(2)}`).join(' · '),
    ]);
  }
  const wsF = XLSX.utils.aoa_to_sheet(aoaF);
  wsF['!cols'] = [
    { wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 13 }, { wch: 17 }, { wch: 16 },
    { wch: 13 }, { wch: 12 }, { wch: 34 }, { wch: 13 }, { wch: 11 }, { wch: 13 }, { wch: 46 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsF, 'Por factura');
  XLSX.utils.book_append_sheet(wb, ws, 'Estado de cuenta');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  return { buf, filename: `estado-cuenta-${ruc}${desde || hasta ? '-filtrado' : ''}.xlsx` };
}
