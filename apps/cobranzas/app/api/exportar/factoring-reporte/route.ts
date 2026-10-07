export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { construirReporteFactoring } from '@/lib/factoring';

const fmtFecha = (s: string | null) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const cliente_ruc = new URL(req.url).searchParams.get('cliente_ruc');
    const db = supabaseAdmin();
    const filas = await construirReporteFactoring(db, { cliente_ruc });

    const rows = filas.map(f => ({
      'Comprobante': f.comprobante,
      'RUC': f.cliente_ruc,
      'Cliente': f.razon_social,
      'Fecha de Vencimiento': fmtFecha(f.fecha_vencimiento),
      'Monto en Factoring': f.monto,
      'Fecha de Canje': fmtFecha(f.fecha_canje),
      'Días en Factoring': f.dias_en_factoring,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 13 }, { wch: 38 }, { wch: 16 }, { wch: 15 }, { wch: 14 }, { wch: 14 }];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    XLSX.utils.book_append_sheet(wb, ws, 'Facturas en Factoring');

    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="facturas-en-factoring-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
