import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const db = supabaseAdmin();

    const [
      { data: clientes,   error: e1 },
      { data: vendedores, error: e2 },
      { data: saldoRows,  error: e3 },
    ] = await Promise.all([
      db.from('clientes').select('ruc, razon_social, vendedor_actual_id').order('razon_social').limit(50000),
      db.from('vendedores').select('id, codigo, nombres, apellidos').limit(1000),
      db.from('v_saldos').select('cliente_ruc, saldo_pendiente, zona_nombre').limit(100000),
    ]);

    if (e1) return Response.json({ error: e1.message }, { status: 500 });
    if (e2) return Response.json({ error: e2.message }, { status: 500 });
    if (e3) return Response.json({ error: e3.message }, { status: 500 });

    const vendMap = new Map(
      (vendedores ?? []).map(v => [
        v.id,
        { codigo: v.codigo, nombre: `${v.nombres} ${v.apellidos}`.trim() },
      ])
    );

    const saldoMap = new Map<string, { saldo: number; zona: string }>();
    for (const row of saldoRows ?? []) {
      const ruc = row.cliente_ruc;
      if (!saldoMap.has(ruc)) saldoMap.set(ruc, { saldo: 0, zona: row.zona_nombre ?? '' });
      saldoMap.get(ruc)!.saldo += Number(row.saldo_pendiente) || 0;
    }

    const rows = (clientes ?? []).map(c => {
      const v = c.vendedor_actual_id ? vendMap.get(c.vendedor_actual_id) : null;
      const s = saldoMap.get(c.ruc);
      return {
        'RUC':           c.ruc,
        'Razón Social':  c.razon_social,
        'Cód. Vendedor': v?.codigo ?? '',
        'Vendedor':      v?.nombre ?? 'Sin asignar',
        'Zona':          s?.zona ?? '',
        'Saldo Total':   s?.saldo ?? 0,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 13 }, { wch: 40 }, { wch: 10 }, { wch: 25 }, { wch: 18 }, { wch: 13 },
    ];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');

    const fecha = new Date().toISOString().slice(0, 10);
    const buf   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="clientes-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
