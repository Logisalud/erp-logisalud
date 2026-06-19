import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const toDate = (s: string | null | undefined): Date | string => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export async function GET(req: NextRequest) {
  try {
    const url        = new URL(req.url);
    const vendedorId = url.searchParams.get('vendedor_id');
    const clienteRuc = url.searchParams.get('cliente_ruc');

    const db = supabaseAdmin();
    let q = db
      .from('v_saldos')
      .select('*')
      .order('cliente_ruc')
      .order('fecha_emision', { ascending: false })
      .limit(100000);

    if (clienteRuc) {
      q = q.eq('cliente_ruc', clienteRuc);
    } else if (vendedorId === 'sin-asignar') {
      q = q.is('vendedor_id', null);
    } else if (vendedorId) {
      q = q.eq('vendedor_id', vendedorId);
    }

    const { data, error } = await q;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []).map(r => {
      const saldo   = Number(r.saldo_pendiente) || 0;
      const vencido = (Number(r.d1_30) || 0) + (Number(r.d31_60) || 0)
                    + (Number(r.d61_90) || 0) + (Number(r.mas90) || 0);
      return {
        'Comprobante':       r.comprobante,
        'RUC':               r.cliente_ruc,
        'Razón Social':      r.razon_social,
        'Cód. Vendedor':     r.vendedor_codigo ?? '',
        'Vendedor':          r.vendedor_nombre ?? '',
        'Zona':              r.zona_nombre ?? '',
        'Fecha Emisión':     toDate(r.fecha_emision),
        'Fecha Vencimiento': toDate(r.fecha_vencimiento),
        'Forma Pago':        r.forma_pago ?? '',
        'Moneda':            r.moneda ?? '',
        'Importe Total':     Number(r.importe_total) || 0,
        'Total NC':          Number(r.total_nc)      || 0,
        'Total ND':          Number(r.total_nd)      || 0,
        'Total Pagado':      Number(r.total_pagado)  || 0,
        'Saldo Pendiente':   saldo,
        'Por Vencer':        Number(r.vigente)  || 0,
        '1-30 días':         Number(r.d1_30)    || 0,
        '31-60 días':        Number(r.d31_60)   || 0,
        '61-90 días':        Number(r.d61_90)   || 0,
        '+90 días':          Number(r.mas90)    || 0,
        'Total Vencido':     vencido,
        'Días Retraso':      Number(r.dias_retraso) || 0,
        '% Morosidad':       saldo > 0 ? Math.round(vencido / saldo * 10000) / 100 : 0,
        'Rango':             r.rango_vencimiento ?? '',
        'Tiene Letras':      r.tiene_letras ? 'Sí' : 'No',
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true });
    ws['!cols'] = [
      { wch: 14 }, { wch: 13 }, { wch: 35 }, { wch: 10 }, { wch: 22 }, { wch: 18 },
      { wch: 13 }, { wch: 16 }, { wch: 10 }, { wch: 7  },
      { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 15 }, { wch: 11 },
    ];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    XLSX.utils.book_append_sheet(wb, ws, 'Estado de Cuenta');

    const fecha = new Date().toISOString().slice(0, 10);
    const buf   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="estado-cuenta-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
