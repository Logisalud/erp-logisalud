export const dynamic = 'force-dynamic';
import * as XLSX from 'xlsx';
import { crearClienteServidor } from '@logisalud/auth/server';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { cargarSaldosAFavor } from '@/lib/saldos-a-favor';

const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

// Sale de la MISMA función que la pantalla (`cargarSaldosAFavor`), para que
// no puedan decir cifras distintas. Dos hojas: el resumen por cliente que se
// ve arriba y el detalle factura por factura que está en los desplegables.
export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const clientes = await cargarSaldosAFavor(crearClienteServidor() as never);

    const resumen = clientes.map(c => ({
      'RUC': c.cliente_ruc,
      'Cliente': c.razon_social,
      'Vendedor': c.vendedor_nombre ?? 'Sin vendedor',
      'Saldo a favor': c.a_favor,
      'Deuda vigente': c.deuda,
      'Neto': c.neto,
      'Situación': c.neto < 0 ? 'Le debemos' : c.neto > 0 ? 'Nos debe' : 'Compensado',
      'Facturas con excedente': c.facturas.length,
    }));
    const detalle = clientes.flatMap(c => c.facturas.map(f => ({
      'RUC': c.cliente_ruc,
      'Cliente': c.razon_social,
      'Comprobante': f.comprobante,
      'Emisión': fmtFecha(f.fecha_emision),
      'Importe': f.importe_total,
      'Notas de crédito': f.total_nc,
      'Pagado': f.total_pagado,
      'Saldo a favor': f.a_favor,
    })));

    const wb = XLSX.utils.book_new();
    const wsR = XLSX.utils.json_to_sheet(resumen.length ? resumen : [{ 'RUC': '', 'Cliente': 'Sin saldos a favor' }]);
    wsR['!cols'] = [{ wch: 13 }, { wch: 38 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsR, 'Por cliente');
    const wsD = XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ 'RUC': '', 'Cliente': 'Sin saldos a favor' }]);
    wsD['!cols'] = [{ wch: 13 }, { wch: 38 }, { wch: 14 }, { wch: 12 }, { wch: 13 }, { wch: 16 }, { wch: 13 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsD, 'Detalle por factura');

    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const hoy = new Date().toLocaleDateString('en-CA');
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="saldos-a-favor-${hoy}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
