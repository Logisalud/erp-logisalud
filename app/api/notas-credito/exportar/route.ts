export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

const toDate = (s: string | null | undefined): Date | string => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const desde = searchParams.get('desde')?.trim() ?? '';
    const hasta = searchParams.get('hasta')?.trim() ?? '';
    const cliente = searchParams.get('cliente')?.trim() ?? '';

    const db = supabaseAdmin();

    const ncs = await fetchAll<{
      id: string; serie: string; numero: number; fecha_emision: string;
      cliente_ruc: string; importe_total: number; documento_relacionado_id: string | null;
    }>((from, to) => {
      let q = db
        .from('documentos')
        .select('id, serie, numero, fecha_emision, cliente_ruc, importe_total, documento_relacionado_id')
        .eq('tipo', '07')
        .eq('anulado', false)
        .order('fecha_emision', { ascending: false });
      if (desde) q = q.gte('fecha_emision', desde);
      if (hasta) q = q.lte('fecha_emision', hasta);
      return q.range(from, to);
    });

    const rucs = Array.from(new Set(ncs.map(n => n.cliente_ruc)));
    const clienteMap = new Map<string, string>();
    for (let i = 0; i < rucs.length; i += 500) {
      const { data } = await db.from('clientes').select('ruc, razon_social').in('ruc', rucs.slice(i, i + 500));
      for (const c of data ?? []) clienteMap.set(c.ruc, c.razon_social);
    }

    const facturaIds = Array.from(new Set(ncs.map(n => n.documento_relacionado_id).filter(Boolean))) as string[];
    const facturaMap = new Map<string, string>();
    for (let i = 0; i < facturaIds.length; i += 500) {
      const { data } = await db.from('documentos').select('id, serie, numero').in('id', facturaIds.slice(i, i + 500));
      for (const f of data ?? []) facturaMap.set(f.id, `${f.serie}-${f.numero}`);
    }

    let filas = ncs.map(n => ({
      comprobante: `${n.serie}-${n.numero}`,
      fecha_emision: n.fecha_emision,
      cliente_ruc: n.cliente_ruc,
      razon_social: clienteMap.get(n.cliente_ruc) ?? '',
      factura_relacionada: n.documento_relacionado_id ? (facturaMap.get(n.documento_relacionado_id) ?? '') : '',
      importe_total: Number(n.importe_total) || 0,
    }));

    if (cliente) {
      const q = cliente.toLowerCase();
      filas = filas.filter(f => f.cliente_ruc.includes(cliente) || f.razon_social.toLowerCase().includes(q));
    }

    const rows = filas.map(f => ({
      'N° NC':              f.comprobante,
      'Fecha Emisión':      toDate(f.fecha_emision),
      'RUC Cliente':        f.cliente_ruc,
      'Razón Social':       f.razon_social,
      'Factura/Boleta':     f.factura_relacionada,
      'Monto NC':           f.importe_total,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true });
    ws['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 35 }, { wch: 15 }, { wch: 13 },
    ];
    // Autofiltro solo sobre las filas de datos (antes de agregar el total).
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };

    if (rows.length > 0) {
      const totalNc = filas.reduce((s, f) => s + f.importe_total, 0);
      XLSX.utils.sheet_add_json(ws, [{ 'N° NC': 'TOTAL', 'Monto NC': totalNc }], {
        header: Object.keys(rows[0]),
        skipHeader: true,
        origin: -1,
      });
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Notas de Crédito');

    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="notas-credito-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
