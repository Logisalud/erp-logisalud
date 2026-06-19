import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const toDate = (s: string | null | undefined): Date | string => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const TIPOS: Record<string, string> = {
  '01': 'Factura',
  '07': 'Nota Crédito',
  '08': 'Nota Débito',
};

export async function GET(_req: NextRequest) {
  try {
    const db = supabaseAdmin();

    const [
      { data: docs,     error: e1 },
      { data: clientes, error: e2 },
      { data: pagos,    error: e3 },
    ] = await Promise.all([
      db.from('documentos')
        .select('id, tipo, serie, numero, cliente_ruc, fecha_emision, fecha_vencimiento, importe_total, forma_pago, contado_pendiente, documento_relacionado_id, moneda, tipo_cambio, anulado')
        .order('fecha_emision', { ascending: false })
        .limit(100000),
      db.from('clientes').select('ruc, razon_social').limit(50000),
      db.from('pagos')
        .select('id, documento_id, monto, fecha_pago, referencia, created_at')
        .order('fecha_pago', { ascending: false })
        .limit(100000),
    ]);

    if (e1) return Response.json({ error: e1.message }, { status: 500 });
    if (e2) return Response.json({ error: e2.message }, { status: 500 });
    if (e3) return Response.json({ error: e3.message }, { status: 500 });

    const clienteMap = new Map((clientes ?? []).map(c => [c.ruc, c.razon_social]));
    const docMap     = new Map((docs ?? []).map(d => [d.id, `${d.serie}-${d.numero}`]));

    const docRows = (docs ?? []).map(d => ({
      'Tipo':              TIPOS[d.tipo as string] ?? d.tipo,
      'Comprobante':       `${d.serie}-${d.numero}`,
      'RUC Cliente':       d.cliente_ruc,
      'Razón Social':      clienteMap.get(d.cliente_ruc) ?? '',
      'Fecha Emisión':     toDate(d.fecha_emision),
      'Fecha Vencimiento': toDate(d.fecha_vencimiento),
      'Importe':           Number(d.importe_total) || 0,
      'Moneda':            d.moneda ?? '',
      'Tipo Cambio':       Number(d.tipo_cambio) || 1,
      'Forma Pago':        d.forma_pago ?? '',
      'Contado Pendiente': d.contado_pendiente ? 'Sí' : 'No',
      'Doc. Relacionado':  d.documento_relacionado_id
                             ? (docMap.get(d.documento_relacionado_id) ?? d.documento_relacionado_id)
                             : '',
      'Anulado':           d.anulado ? 'Sí' : 'No',
    }));

    const pagoRows = (pagos ?? []).map(p => ({
      'ID Pago':    p.id,
      'Factura':    docMap.get(p.documento_id) ?? p.documento_id,
      'Monto':      Number(p.monto) || 0,
      'Fecha Pago': toDate(p.fecha_pago),
      'Referencia': p.referencia ?? '',
      'Registrado': toDate((p.created_at ?? '').slice(0, 10)),
    }));

    const wb = XLSX.utils.book_new();

    const wsDocs = XLSX.utils.json_to_sheet(docRows, { cellDates: true });
    wsDocs['!cols'] = [
      { wch: 13 }, { wch: 14 }, { wch: 13 }, { wch: 35 }, { wch: 13 }, { wch: 16 },
      { wch: 13 }, { wch: 7  }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 8 },
    ];
    const r1 = XLSX.utils.decode_range(wsDocs['!ref'] ?? 'A1');
    wsDocs['!autofilter'] = { ref: XLSX.utils.encode_range(r1) };
    XLSX.utils.book_append_sheet(wb, wsDocs, 'Documentos');

    const wsPagos = XLSX.utils.json_to_sheet(pagoRows, { cellDates: true });
    wsPagos['!cols'] = [
      { wch: 38 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 20 }, { wch: 13 },
    ];
    XLSX.utils.book_append_sheet(wb, wsPagos, 'Pagos');

    const fecha = new Date().toISOString().slice(0, 10);
    const buf   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="documentos-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
