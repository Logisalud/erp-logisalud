import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { crearClienteServidor } from '@logisalud/auth/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

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
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const db = crearClienteServidor();

    const [docs, clientes, pagos, cuentas] = await Promise.all([
      fetchAll((from, to) =>
        db.from('documentos')
          .select('id, tipo, serie, numero, cliente_ruc, fecha_emision, fecha_vencimiento, importe_total, forma_pago, contado_pendiente, documento_relacionado_id, moneda, tipo_cambio, anulado')
          .order('fecha_emision', { ascending: false })
          .order('id').range(from, to)
      ),
      fetchAll((from, to) =>
        db.from('clientes').select('ruc, razon_social').order('ruc').range(from, to)
      ),
      fetchAll((from, to) =>
        db.from('pagos')
          .select('id, documento_id, monto, fecha_pago, referencia, created_at, tipo, medio_cobro, cuenta_bancaria_codigo, estado_efectivo')
          .order('fecha_pago', { ascending: false })
          .order('id').range(from, to)
      ),
      // cuentas_bancarias no tiene policy de RLS (igual que en
      // /api/cuentas-bancarias) — se lee con el cliente admin.
      supabaseAdmin().from('cuentas_bancarias').select('codigo_interno, banco'),
    ]);

    const clienteMap = new Map(clientes.map(c => [c.ruc, c.razon_social]));
    const docMap     = new Map(docs.map(d => [d.id, `${d.serie}-${d.numero}`]));
    const bancoMap   = new Map((cuentas.data ?? []).map(c => [c.codigo_interno, c.banco]));

    // "Banco" refleja a dónde entró el dinero: el nombre de la cuenta para
    // transferencias (incluye Yape/Plin, que cae en Interbank), "Efectivo"
    // para cobros en efectivo (con nota si aún no se depositó), y vacío para
    // pagos históricos de antes de este campo (set-2026).
    const bancoDePago = (p: { medio_cobro: string | null; cuenta_bancaria_codigo: string | null; estado_efectivo: string | null }) => {
      if (p.medio_cobro === 'efectivo') {
        return p.estado_efectivo === 'depositado' ? 'Efectivo (depositado)' : 'Efectivo (por depositar)';
      }
      if (p.cuenta_bancaria_codigo) return bancoMap.get(p.cuenta_bancaria_codigo) ?? p.cuenta_bancaria_codigo;
      return '';
    };

    // La retención de IGV (3%) vive en `pagos` con tipo 'retencion': baja el
    // saldo igual que un cobro, pero no es plata que entró — la retuvo el
    // cliente para pagársela a SUNAT. Mezclada con los pagos reales, como
    // estaba, no había forma de saber cuál era cuál desde el Excel.
    const retencionPorDoc = new Map<string, number>();
    for (const p of pagos) {
      if (p.tipo !== 'retencion') continue;
      retencionPorDoc.set(p.documento_id, (retencionPorDoc.get(p.documento_id) ?? 0) + (Number(p.monto) || 0));
    }

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
        'Retención IGV':     retencionPorDoc.get(d.id) ?? 0,
        'Doc. Relacionado':  d.documento_relacionado_id
                               ? (docMap.get(d.documento_relacionado_id) ?? d.documento_relacionado_id)
                               : '',
        'Anulado':           d.anulado ? 'Sí' : 'No',
      };
    });

    const pagoRows = pagos.map(p => ({
      'ID Pago':    p.id,
      'Factura':    docMap.get(p.documento_id) ?? p.documento_id,
      'Tipo':       p.tipo === 'retencion' ? 'Retención IGV' : 'Pago',
      'Monto':      Number(p.monto) || 0,
      'Fecha Pago': toDate(p.fecha_pago),
      'Referencia': p.referencia ?? '',
      'Registrado': toDate((p.created_at ?? '').slice(0, 10)),
      'Banco':      bancoDePago(p),
    }));

    const wb = XLSX.utils.book_new();

    const wsDocs = XLSX.utils.json_to_sheet(docRows, { cellDates: true });
    wsDocs['!cols'] = [
      { wch: 13 }, { wch: 14 }, { wch: 13 }, { wch: 35 }, { wch: 13 }, { wch: 16 },
      { wch: 13 }, { wch: 7  }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
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
      { wch: 38 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 20 }, { wch: 13 }, { wch: 22 },
    ];
    // Con autofiltro se puede ver "Retención IGV" sola, o sólo los pagos reales.
    const r2 = XLSX.utils.decode_range(wsPagos['!ref'] ?? 'A1');
    wsPagos['!autofilter'] = { ref: XLSX.utils.encode_range(r2) };
    XLSX.utils.book_append_sheet(wb, wsPagos, 'Pagos');

    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
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
