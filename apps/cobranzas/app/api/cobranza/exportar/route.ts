import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export const dynamic = 'force-dynamic';

// Exporta el desglose de cobranza (por vendedor y por día) del rango.
export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const { searchParams } = new URL(req.url);
    const desde = searchParams.get('desde')?.trim() ?? '';
    const hasta = searchParams.get('hasta')?.trim() ?? '';
    if (!desde || !hasta) return Response.json({ error: 'desde y hasta requeridos' }, { status: 400 });

    const db = supabaseAdmin();

    const pagos = await fetchAll<{ documento_id: string; monto: number; fecha_pago: string }>((from, to) =>
      db.from('pagos').select('documento_id, monto, fecha_pago').eq('tipo', 'pago')
        .gte('fecha_pago', desde).lte('fecha_pago', hasta).range(from, to)
    );

    const docIds = Array.from(new Set(pagos.map(p => p.documento_id)));
    const docMap = new Map<string, { cliente_ruc: string; fecha_vencimiento: string | null }>();
    for (let i = 0; i < docIds.length; i += 500) {
      const { data } = await db.from('documentos').select('id, cliente_ruc, fecha_vencimiento').in('id', docIds.slice(i, i + 500));
      for (const d of data ?? []) docMap.set(d.id, { cliente_ruc: d.cliente_ruc, fecha_vencimiento: d.fecha_vencimiento });
    }
    const rucs = Array.from(new Set([...docMap.values()].map(d => d.cliente_ruc)));
    const vendedorPorRuc = new Map<string, string | null>();
    for (let i = 0; i < rucs.length; i += 500) {
      const { data } = await db.from('clientes').select('ruc, vendedor_actual_id').in('ruc', rucs.slice(i, i + 500));
      for (const c of data ?? []) vendedorPorRuc.set(c.ruc, c.vendedor_actual_id);
    }
    const vendedores = await fetchAll<{ id: string; nombres: string; apellidos: string | null; codigo: string | null }>((from, to) =>
      db.from('vendedores').select('id, nombres, apellidos, codigo').range(from, to));
    const vendMap = new Map(vendedores.map(v => [v.id, `${v.nombres} ${v.apellidos ?? ''} (${v.codigo ?? ''})`.trim()]));

    const porVend = new Map<string, { nombre: string; total: number; vencido: number; alDia: number; n: number }>();
    const porDia = new Map<string, { total: number; vencido: number }>();
    for (const p of pagos) {
      const monto = Number(p.monto) || 0;
      const doc = docMap.get(p.documento_id);
      const venc = doc?.fecha_vencimiento ?? null;
      const fueVencido = !!venc && p.fecha_pago > venc;
      const vid = (doc ? vendedorPorRuc.get(doc.cliente_ruc) : null) ?? '';
      const nombre = vid ? (vendMap.get(vid) ?? 'Desconocido') : 'Sin vendedor';
      let pv = porVend.get(nombre);
      if (!pv) { pv = { nombre, total: 0, vencido: 0, alDia: 0, n: 0 }; porVend.set(nombre, pv); }
      pv.total += monto; pv.n++; if (fueVencido) pv.vencido += monto; else pv.alDia += monto;
      let pd = porDia.get(p.fecha_pago);
      if (!pd) { pd = { total: 0, vencido: 0 }; porDia.set(p.fecha_pago, pd); }
      pd.total += monto; if (fueVencido) pd.vencido += monto;
    }

    const filasVend = [...porVend.values()].sort((a, b) => b.total - a.total).map(v => ({
      'Vendedor': v.nombre, 'Cobranza Total': v.total, 'De lo Vencido': v.vencido, 'Al Día': v.alDia,
      '% Vencido': v.total > 0 ? Math.round(v.vencido / v.total * 100) : 0, 'N° Cobros': v.n,
    }));
    const filasDia = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, d]) => ({
      'Fecha': fecha, 'Cobranza Total': d.total, 'De lo Vencido': d.vencido, 'Al Día': d.total - d.vencido,
    }));

    const wb = XLSX.utils.book_new();
    const wsV = XLSX.utils.json_to_sheet(filasVend);
    wsV['!cols'] = [{ wch: 28 }, { wch: 15 }, { wch: 15 }, { wch: 13 }, { wch: 11 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsV, 'Por Vendedor');
    const wsD = XLSX.utils.json_to_sheet(filasDia);
    wsD['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(wb, wsD, 'Por Día');

    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cobranza-${desde}_${hasta}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
