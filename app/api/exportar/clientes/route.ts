import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const db = supabaseAdmin();

    const [clientes, vendedores, saldoRows] = await Promise.all([
      fetchAll((from, to) =>
        db.from('clientes').select('ruc, razon_social, vendedor_actual_id').order('razon_social').range(from, to)
      ),
      fetchAll((from, to) =>
        db.from('vendedores').select('id, codigo, nombres, apellidos').range(from, to)
      ),
      fetchAll((from, to) =>
        db.from('v_saldos').select('cliente_ruc, saldo_pendiente, zona_nombre').range(from, to)
      ),
    ]);

    const vendMap = new Map(
      vendedores.map(v => [
        v.id,
        { codigo: v.codigo, nombre: `${v.nombres} ${v.apellidos}`.trim() },
      ])
    );

    const saldoMap = new Map<string, { saldo: number; zona: string }>();
    for (const row of saldoRows) {
      const ruc = row.cliente_ruc;
      if (!saldoMap.has(ruc)) saldoMap.set(ruc, { saldo: 0, zona: row.zona_nombre ?? '' });
      saldoMap.get(ruc)!.saldo += Number(row.saldo_pendiente) || 0;
    }

    const rows = clientes.map(c => {
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
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

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
