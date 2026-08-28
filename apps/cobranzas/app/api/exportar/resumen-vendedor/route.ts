import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { crearClienteServidor } from '@logisalud/auth/server';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const db = crearClienteServidor();

    const data = await fetchAll((from, to) =>
      db.from('v_saldos')
        .select('vendedor_id, vendedor_codigo, vendedor_nombre, zona_nombre, cliente_ruc, saldo_pendiente, vigente, d0_7, d8_15, d16_30, d31_60, d61_mas')
        .range(from, to)
    );

    type Grupo = {
      vendedor_id: string | null; vendedor_codigo: string | null;
      vendedor_nombre: string | null; zona_nombre: string | null;
      clientes: Set<string>;
      saldo_total: number; vigente: number; d0_7: number; d8_15: number; d16_30: number;
      d31_60: number; d61_mas: number; cant_facturas: number;
    };

    const map = new Map<string, Grupo>();
    for (const row of data) {
      const key = row.vendedor_id ?? '__sin__';
      if (!map.has(key)) {
        map.set(key, {
          vendedor_id: row.vendedor_id, vendedor_codigo: row.vendedor_codigo,
          vendedor_nombre: row.vendedor_nombre, zona_nombre: row.zona_nombre,
          clientes: new Set(),
          saldo_total: 0, vigente: 0, d0_7: 0, d8_15: 0, d16_30: 0, d31_60: 0, d61_mas: 0,
          cant_facturas: 0,
        });
      }
      const g = map.get(key)!;
      g.clientes.add(row.cliente_ruc);
      g.saldo_total   += Number(row.saldo_pendiente) || 0;
      g.vigente       += Number(row.vigente)         || 0;
      g.d0_7          += Number(row.d0_7)            || 0;
      g.d8_15         += Number(row.d8_15)           || 0;
      g.d16_30        += Number(row.d16_30)          || 0;
      g.d31_60        += Number(row.d31_60)          || 0;
      g.d61_mas       += Number(row.d61_mas)         || 0;
      g.cant_facturas += 1;
    }

    const rows = Array.from(map.values())
      .sort((a, b) => b.saldo_total - a.saldo_total)
      .map(g => {
        const vencido = g.d0_7 + g.d8_15 + g.d16_30 + g.d31_60 + g.d61_mas;
        return {
          'Cód. Vendedor': g.vendedor_codigo ?? '',
          'Vendedor':       g.vendedor_nombre ?? 'Sin asignar',
          'Zona':           g.zona_nombre ?? '',
          'N° Clientes':    g.clientes.size,
          'N° Facturas':    g.cant_facturas,
          'Saldo Total':    g.saldo_total,
          'Por Vencer':     g.vigente,
          '0-7 días':       g.d0_7,
          '8-15 días':      g.d8_15,
          '16-30 días':     g.d16_30,
          '31-60 días':     g.d31_60,
          '60+ días':       g.d61_mas,
          'Total Vencido':  vencido,
          '% Morosidad':    g.saldo_total > 0
                              ? Math.round(vencido / g.saldo_total * 10000) / 100
                              : 0,
        };
      });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 11 }, { wch: 11 },
      { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 },
      { wch: 13 }, { wch: 12 },
    ];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen Vendedor');

    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="resumen-vendedor-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
