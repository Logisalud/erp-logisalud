export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { construirReporteFactoringCompleto } from '@/lib/factoring';

const ESTADO_LABEL: Record<string, string> = {
  en_factoring: 'En factoring',
  ingresada: 'Ingresada',
  anulada: 'Anulada',
};

const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const fmtFechaOpcional = (s: string | null) => s ? fmtFecha(s) : '';

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const { searchParams } = new URL(req.url);
    const db = supabaseAdmin();

    const filas = await construirReporteFactoringCompleto(db, {
      cliente_ruc: searchParams.get('cliente_ruc'),
      estado: searchParams.get('estado'),
      desde: searchParams.get('desde'),
      hasta: searchParams.get('hasta'),
    });

    // Las dos fechas van separadas y las dos se escriben: el que lee tiene
    // que poder ver que el vencimiento del contrato no es el de la factura,
    // que es justamente el motivo por el que se empezó a guardar.
    const rows = filas.map(f => ({
      'Comprobante':            f.comprobante,
      'RUC':                    f.cliente_ruc,
      'Cliente':                f.razon_social,
      'Entidad':                f.entidad ?? '',
      'Fecha de Canje':         fmtFecha(f.fecha_canje),
      'Vencimiento Factoring':  fmtFechaOpcional(f.fecha_vencimiento),
      'Vencimiento Factura':    fmtFechaOpcional(f.fecha_vencimiento_factura),
      'Monto Factorizado':      f.monto,
      'Retención IGV':          f.retencion,
      'Estado':                 ESTADO_LABEL[f.estado] ?? f.estado,
      'Fecha de Ingreso':       fmtFechaOpcional(f.fecha_ingreso),
      'Días en Factoring':      f.dias_en_factoring,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 16 }, { wch: 13 }, { wch: 38 }, { wch: 22 }, { wch: 15 },
      { wch: 20 }, { wch: 19 }, { wch: 17 }, { wch: 14 }, { wch: 13 }, { wch: 16 }, { wch: 17 },
    ];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte de Factoring');

    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="reporte-factoring-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
