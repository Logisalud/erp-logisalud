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

const TIPOS: Record<string, string> = {
  '01': 'Factura',
  '03': 'Boleta',
  '07': 'Nota Crédito',
  '08': 'Nota Débito',
};

export async function GET(_req: NextRequest) {
  try {
    const db = supabaseAdmin();

    const [docs, clientes, pagos] = await Promise.all([
      fetchAll((from, to) =>
        db.from('documentos')
          .select('id, tipo, serie, numero, cliente_ruc, fecha_emision, fecha_vencimiento, importe_total, forma_pago, contado_pendiente, documento_relacionado_id, moneda, tipo_cambio, anulado')
          .order('fecha_emision', { ascending: false })
          .range(from, to)
      ),
      fetchAll((from, to) =>
        db.from('clientes').select('ruc, razon_social').range(from, to)
      ),
      fetchAll((from, to) =>
        db.from('pagos')
          .select('id, documento_id, monto, fecha_pago, referencia, created_at')
          .order('fecha_pago', { ascending: false })
          .range(from, to)
      ),
    ]);

    const clienteMap = new Map(clientes.map(c => [c.ruc, c.razon_social]));
    const docMap     = new Map(docs.map(d => [d.id, `${d.serie}-${d.numero}`]));

    // Las NC (tipo '07') se guardan en positivo en la base (importe_total >= 0
    // por diseño) — el signo negativo es solo de presentación en este export,
    // para que sumar la columna 'Importe' en Excel dé el neto real. No toca
    // la base ni v_saldos/v_cobros.
    const docRows = docs.map(d => {
      const esNC = d.tipo === '07';
      const importe = Number(d.importe_total) || 0;
      return {
        'Tipo':              TIPOS[d.tipo as string] ?? d.tipo,
        'Comprobante':       `${d.serie}-${d.numero}`,
        'RUC Cliente':       d.cliente_ruc,
        'Razón Social':      clienteMap.get(d.cliente_ruc) ?? '',
        'Fecha Emisión':     toDate(d.fecha_emision),
        'Fecha Vencimiento': toDate(d.fecha_vencimiento),
        'Importe':           esNC ? -importe : importe,
        'Moneda':            d.moneda ?? '',
        'Tipo Cambio':       Number(d.tipo_cambio) || 1,
        'Forma Pago':        d.forma_pago ?? '',
        'Contado Pendiente': d.contado_pendiente ? 'Sí' : 'No',
        'Doc. Relacionado':  d.documento_relacionado_id
                               ? (docMap.get(d.documento_relacionado_id) ?? d.documento_relacionado_id)
                               : '',
        'Anulado':           d.anulado ? 'Sí' : 'No',
      };
    });

    const pagoRows = pagos.map(p => ({
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
    // Autofiltro solo sobre las filas de datos (antes de agregar el total).
    const r1 = XLSX.utils.decode_range(wsDocs['!ref'] ?? 'A1');
    wsDocs['!autofilter'] = { ref: XLSX.utils.encode_range(r1) };

    // Fila de total al final: con el signo de las NC ya corregido, sumar la
    // columna 'Importe' da directamente el neto real (facturas + ND - NC).
    const totalImporte = docRows.reduce((s, r) => s + r['Importe'], 0);
    XLSX.utils.sheet_add_json(wsDocs, [{ 'Tipo': 'TOTAL', 'Importe': totalImporte }], {
      header: Object.keys(docRows[0] ?? { 'Tipo': '', 'Importe': 0 }),
      skipHeader: true,
      origin: -1,
    });

    XLSX.utils.book_append_sheet(wb, wsDocs, 'Documentos');

    const wsPagos = XLSX.utils.json_to_sheet(pagoRows, { cellDates: true });
    wsPagos['!cols'] = [
      { wch: 38 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 20 }, { wch: 13 },
    ];
    XLSX.utils.book_append_sheet(wb, wsPagos, 'Pagos');

    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

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
