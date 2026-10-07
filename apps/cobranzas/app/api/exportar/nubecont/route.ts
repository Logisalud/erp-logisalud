export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { construirFilasNubecont, HEADERS_PLANTILLA } from '@/lib/nubecontExport';

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const { searchParams } = new URL(req.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');
    if (!desde || !hasta) return Response.json({ error: 'desde y hasta son requeridos' }, { status: 400 });

    const db = supabaseAdmin();
    const filas = await construirFilasNubecont(db, desde, hasta);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([[...HEADERS_PLANTILLA], ...filas]);
    ws['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
      { wch: 16 }, { wch: 32 }, { wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'PLANTILLA ');

    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="nubecont-ingresos-cobros-${desde}_${hasta}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
