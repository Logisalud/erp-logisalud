import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

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

    const data = await fetchAll((from, to) => {
      let q = db
        .from('v_saldos')
        .select('*')
        .order('cliente_ruc')
        .order('fecha_emision', { ascending: false });

      if (clienteRuc) {
        q = q.eq('cliente_ruc', clienteRuc);
      } else if (vendedorId === 'sin-asignar') {
        q = q.is('vendedor_id', null);
      } else if (vendedorId) {
        q = q.eq('vendedor_id', vendedorId);
      }

      return q.range(from, to);
    });

    // Pagos de las facturas del resultado (para una fila por pago).
    interface PagoRow { documento_id: string; monto: number; fecha_pago: string; referencia: string | null; tipo: string; created_at: string; }
    const ids = data.map(r => r.id as string);
    const pagosPorDoc = new Map<string, PagoRow[]>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data: ps } = await db
        .from('pagos')
        .select('documento_id, monto, fecha_pago, referencia, tipo, created_at')
        .in('documento_id', ids.slice(i, i + 500));
      for (const p of (ps ?? []) as PagoRow[]) {
        const arr = pagosPorDoc.get(p.documento_id) ?? [];
        arr.push(p);
        pagosPorDoc.set(p.documento_id, arr);
      }
    }
    // Dentro de cada factura, ordenar los pagos por fecha (y created_at para estabilidad).
    for (const arr of pagosPorDoc.values()) {
      arr.sort((a, b) => (a.fecha_pago ?? '').localeCompare(b.fecha_pago ?? '') || a.created_at.localeCompare(b.created_at));
    }

    const tipoLabel = (t: string) => t === 'retencion' ? 'Retención IGV' : 'Pago';

    // Columnas de factura (se repiten en cada fila de pago de esa factura).
    const colsFactura = (r: Record<string, unknown>) => {
      const saldo    = Number(r.saldo_pendiente) || 0;
      const pagado   = Number(r.total_pagado)    || 0;
      const importe  = Number(r.importe_total)   || 0;
      const vencido  = (Number(r.d0_7) || 0) + (Number(r.d8_15) || 0) + (Number(r.d16_30) || 0)
                     + (Number(r.d31_60) || 0) + (Number(r.d61_mas) || 0);
      const estadoPago = saldo === 0 && importe > 0 ? 'Pagado'
                       : pagado > 0 && saldo > 0    ? 'Parcial'
                       :                              'Pendiente';
      return {
        'Comprobante':       r.comprobante,
        'RUC':               r.cliente_ruc,
        'Razón Social':      r.razon_social,
        'Cód. Vendedor':     r.vendedor_codigo ?? '',
        'Vendedor':          r.vendedor_nombre ?? '',
        'Zona':              r.zona_nombre ?? '',
        'Fecha Emisión':     toDate(r.fecha_emision as string),
        'Fecha Vencimiento': toDate(r.fecha_vencimiento as string),
        'Forma Pago':        r.forma_pago ?? '',
        'Moneda':            r.moneda ?? '',
        'Importe Total':     Number(r.importe_total) || 0,
        'Total NC':          Number(r.total_nc)      || 0,
        'Total ND':          Number(r.total_nd)      || 0,
        'Total Pagado':      pagado,
        'Saldo Pendiente':   saldo,
        'Estado Pago':       estadoPago,
        'Por Vencer':        Number(r.vigente)  || 0,
        '0-7 días':          Number(r.d0_7)     || 0,
        '8-15 días':         Number(r.d8_15)    || 0,
        '16-30 días':        Number(r.d16_30)   || 0,
        '31-60 días':        Number(r.d31_60)   || 0,
        '60+ días':          Number(r.d61_mas)  || 0,
        'Total Vencido':     vencido,
        'Días Retraso':      Number(r.dias_retraso) || 0,
        '% Morosidad':       saldo > 0 ? Math.round(vencido / saldo * 10000) / 100 : 0,
        'Rango':             r.rango_vencimiento ?? '',
        'Tiene Letras':      r.tiene_letras ? 'Sí' : 'No',
      };
    };

    // Columnas de pago, vacías en la fila del documento.
    const pagoVacio = { 'Tipo Movimiento': '', 'Fecha de Pago': '' as string | Date, 'N° Operación': '', 'Monto Pago': '' as string | number };
    // Columnas de factura/saldo/aging, vacías en las filas de detalle de pago —
    // así, sin importar qué filas estén expandidas o colapsadas, sumar cualquier
    // columna de saldo/aging en el Excel da el total correcto (cada valor
    // aparece una sola vez, en la fila del documento).
    const facturaVacia = Object.fromEntries(Object.keys(colsFactura({})).map(k => [k, '']));

    // Una fila por documento (nivel 0) + filas de detalle de pago debajo
    // (nivel 1, colapsadas por defecto vía outline de Excel — "expandible").
    const rows: Record<string, unknown>[] = [];
    const levels: number[] = [];
    for (const r of data) {
      const base = colsFactura(r as Record<string, unknown>);
      rows.push({ ...base, ...pagoVacio });
      levels.push(0);

      const ps = pagosPorDoc.get(r.id as string) ?? [];
      for (const p of ps) {
        rows.push({
          ...facturaVacia,
          'Comprobante':     r.comprobante,
          'Tipo Movimiento': tipoLabel(p.tipo),
          'Fecha de Pago':   toDate(p.fecha_pago),
          'N° Operación':    p.referencia ?? '',
          'Monto Pago':      Number(p.monto) || 0,
        });
        levels.push(1);
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true });
    ws['!cols'] = [
      { wch: 14 }, { wch: 13 }, { wch: 35 }, { wch: 10 }, { wch: 22 }, { wch: 18 },
      { wch: 13 }, { wch: 16 }, { wch: 10 }, { wch: 7  },
      { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 15 }, { wch: 11 },
      { wch: 14 }, { wch: 13 }, { wch: 16 }, { wch: 13 },  // Tipo Movimiento, Fecha de Pago, N° Operación, Monto Pago
    ];
    // Agrupa las filas de detalle de pago (nivel 1) bajo su documento, y las
    // colapsa por defecto — en Excel aparecen como un "+" expandible.
    // Fila 0 es el encabezado (json_to_sheet la agrega antes que los datos).
    ws['!rows'] = [{}, ...levels.map(level => ({ level, hidden: level > 0 }))];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    XLSX.utils.book_append_sheet(wb, ws, 'Estado de Cuenta');

    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

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
