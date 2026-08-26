import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { hoyISOLima } from '@/lib/fechas';
import { cobranzaDelMes } from '@/lib/cobranzaDelMes';

export const dynamic = 'force-dynamic';

const fmtFechaCorta = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

// "A quién ir a cobrar este mes": documentos con saldo pendiente cuyo
// vencimiento efectivo (o próxima letra) cae dentro del mes calendario
// actual. Se descarga y se envía manualmente (WhatsApp/correo).
export async function GET(req: NextRequest) {
  try {
    const vendedorId = new URL(req.url).searchParams.get('vendedor_id')?.trim() ?? '';
    if (!vendedorId) return Response.json({ error: 'vendedor_id requerido' }, { status: 400 });

    const db = supabaseAdmin();
    const { data: vendedor, error } = await db.from('vendedores').select('nombres, apellidos, codigo').eq('id', vendedorId).single();
    if (error || !vendedor) return Response.json({ error: 'Vendedor no encontrado' }, { status: 404 });

    const items = await cobranzaDelMes(vendedorId, hoyISOLima());

    const rows = items.map(i => ({
      'RUC':               i.cliente_ruc,
      'Razón Social':      i.razon_social,
      'Comprobante':       i.comprobante,
      'Vence':             fmtFechaCorta(i.fecha_venc),
      'Monto':             i.saldo_pendiente,
      'Con Letra':         i.tiene_letras ? 'Sí' : 'No',
      'Distrito':          i.distrito ?? '',
      'Celular':           i.celular ?? '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'RUC': '', 'Razón Social': 'Sin cobranza pendiente este mes', 'Comprobante': '', 'Vence': '', 'Monto': 0, 'Con Letra': '', 'Distrito': '', 'Celular': '' }]);
    ws['!cols'] = [{ wch: 13 }, { wch: 35 }, { wch: 14 }, { wch: 11 }, { wch: 13 }, { wch: 10 }, { wch: 22 }, { wch: 13 }];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    if (rows.length) {
      const total = rows.reduce((s, r) => s + r['Monto'], 0);
      XLSX.utils.sheet_add_json(ws, [{ 'RUC': 'TOTAL', 'Monto': total }], { header: Object.keys(rows[0]), skipHeader: true, origin: -1 });
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Cobranza del Mes');

    const nombreVendedor = `${vendedor.nombres} ${vendedor.apellidos ?? ''}`.trim();
    const codigo = vendedor.codigo ?? '';
    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cobranza-mes-${codigo || nombreVendedor}-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
