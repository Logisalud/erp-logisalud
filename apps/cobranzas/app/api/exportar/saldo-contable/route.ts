export const dynamic = 'force-dynamic';
import * as XLSX from 'xlsx';
import { crearClienteServidor } from '@logisalud/auth/server';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { cargarSaldoContable } from '@/lib/saldoContable';

const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

// Sale de la MISMA función que la pantalla. Dos hojas: el saldo por cliente
// y el detalle factura por factura con el motivo de cada diferencia contra
// la cartera — sin ese motivo, el que recibe el archivo no puede saber por
// qué las dos columnas no coinciden.
export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const clientes = await cargarSaldoContable(crearClienteServidor() as never);

    const resumen = clientes.map(c => ({
      'RUC': c.cliente_ruc,
      'Cliente': c.razon_social,
      'Vendedor': c.vendedor_nombre ?? 'Sin vendedor',
      'Saldo contable': c.saldo_contable,
      'Saldo cartera': c.saldo_cartera,
      'Diferencia': c.diferencia,
      'Situación': c.saldo_contable < -0.005 ? 'A favor del cliente' : c.saldo_contable > 0.005 ? 'Nos debe' : 'Sin saldo',
      'Facturas': c.facturas.length,
    }));

    const detalle = clientes.flatMap(c => c.facturas.map(f => ({
      'RUC': c.cliente_ruc,
      'Cliente': c.razon_social,
      'Comprobante': f.comprobante,
      'Emisión': fmtFecha(f.fecha_emision),
      'Vencimiento': f.fecha_vencimiento ? fmtFecha(f.fecha_vencimiento) : '',
      'Importe': f.importe,
      'Notas de crédito': f.total_nc,
      'Notas de débito': f.total_nd,
      'Pagos': f.total_pagado,
      'Letras pagadas': f.letras_pagadas,
      'Saldo contable': f.saldo_contable,
      'Saldo cartera': f.saldo_cartera,
      'Diferencia': f.diferencia,
      'Motivo de la diferencia': f.motivo ?? '',
    })));

    const wb = XLSX.utils.book_new();
    const wsR = XLSX.utils.json_to_sheet(resumen.length ? resumen : [{ 'RUC': '', 'Cliente': 'Sin saldos' }]);
    wsR['!cols'] = [{ wch: 13 }, { wch: 38 }, { wch: 24 }, { wch: 15 }, { wch: 14 }, { wch: 13 }, { wch: 20 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsR, 'Por cliente');

    const wsD = XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ 'RUC': '', 'Cliente': 'Sin saldos' }]);
    wsD['!cols'] = [
      { wch: 13 }, { wch: 38 }, { wch: 14 }, { wch: 12 }, { wch: 13 }, { wch: 13 },
      { wch: 16 }, { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 14 }, { wch: 13 }, { wch: 28 },
    ];
    const range = XLSX.utils.decode_range(wsD['!ref'] ?? 'A1');
    wsD['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    XLSX.utils.book_append_sheet(wb, wsD, 'Detalle por factura');

    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const hoy = new Date().toLocaleDateString('en-CA');
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="saldo-contable-${hoy}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
