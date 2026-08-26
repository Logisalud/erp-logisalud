import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

export const dynamic = 'force-dynamic';

// Cartera de clientes COMPLETA de un vendedor (no solo los que tienen deuda) —
// para que sepa su territorio y dónde buscar clientes nuevos. Se descarga y
// se envía manualmente (WhatsApp/correo): un link wa.me no puede adjuntar
// archivos, así que este paso siempre es manual.
export async function GET(req: NextRequest) {
  try {
    const vendedorId = new URL(req.url).searchParams.get('vendedor_id')?.trim() ?? '';
    if (!vendedorId) return Response.json({ error: 'vendedor_id requerido' }, { status: 400 });

    const db = supabaseAdmin();

    const [vendedor, clientes] = await Promise.all([
      db.from('vendedores').select('nombres, apellidos, codigo').eq('id', vendedorId).single(),
      fetchAll<{ ruc: string; razon_social: string; distrito: string | null; codigo_zona: string | null; celular: string | null }>(
        (from, to) =>
          db.from('clientes')
            .select('ruc, razon_social, distrito, codigo_zona, celular')
            .eq('vendedor_actual_id', vendedorId)
            .order('razon_social')
            .range(from, to)
      ),
    ]);

    if (vendedor.error || !vendedor.data) return Response.json({ error: 'Vendedor no encontrado' }, { status: 404 });

    const rows = clientes.map(c => ({
      'RUC':          c.ruc,
      'Razón Social': c.razon_social,
      'Distrito':     c.distrito ?? '',
      'Zona':         c.codigo_zona ?? '',
      'Celular':      c.celular ?? '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 13 }, { wch: 40 }, { wch: 22 }, { wch: 10 }, { wch: 13 }];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    XLSX.utils.book_append_sheet(wb, ws, 'Cartera de Clientes');

    const nombreVendedor = `${vendedor.data.nombres} ${vendedor.data.apellidos ?? ''}`.trim();
    const codigo = vendedor.data.codigo ?? '';
    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cartera-clientes-${codigo || nombreVendedor}-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
