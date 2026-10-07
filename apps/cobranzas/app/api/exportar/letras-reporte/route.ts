export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { construirReporteLetras } from '@/lib/reporteLetras';

const ESTADO_LABEL: Record<string, string> = {
  en_cartera: 'En cartera',
  en_banco: 'En banco',
  pagada: 'Pagada',
  protestada: 'Protestada',
};

const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const fmtFechaOpcional = (s: string | null) => s ? fmtFecha(s) : '';

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const { searchParams } = new URL(req.url);
    const db = supabaseAdmin();

    const filas = await construirReporteLetras(db, {
      estado: searchParams.get('estado'),
      cliente_ruc: searchParams.get('cliente_ruc'),
      desde: searchParams.get('desde'),
      hasta: searchParams.get('hasta'),
    });

    const rows = filas.map(f => ({
      'N° de Letra': f.numero_letra,
      'RUC': f.cliente_ruc,
      'Cliente': f.razon_social,
      'Comprobante(s)': f.comprobantes,
      'Fecha de Vencimiento': fmtFecha(f.fecha_vencimiento),
      'Monto': f.importe,
      'Estado': ESTADO_LABEL[f.estado] ?? f.estado,
      'Banco': f.banco ?? '',
      'Fecha de Pago': fmtFechaOpcional(f.fecha_pago),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 }, { wch: 13 }, { wch: 38 }, { wch: 24 }, { wch: 16 }, { wch: 13 }, { wch: 12 }, { wch: 16 }, { wch: 16 },
    ];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte de Letras');

    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="reporte-letras-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
