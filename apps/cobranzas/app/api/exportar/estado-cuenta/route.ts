import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { crearClienteServidor } from '@logisalud/auth/server';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export const dynamic = 'force-dynamic';

const toDate = (s: string | null | undefined): Date | string => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const fmtFechaCorta = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const url        = new URL(req.url);
    const vendedorId = url.searchParams.get('vendedor_id');
    const clienteRuc = url.searchParams.get('cliente_ruc');

    const db = crearClienteServidor();

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

    // Pagos de las facturas del resultado — se consolidan en columnas de
    // texto dentro de la misma fila del documento (nunca filas nuevas: eso
    // ya causó confusión en visores que no respetan filas ocultas/agrupadas).
    interface PagoRow {
      documento_id: string; monto: number; fecha_pago: string; referencia: string | null; tipo: string; created_at: string;
      medio_cobro: string; estado_efectivo: string | null; fecha_deposito: string | null;
    }
    const ids = data.map(r => r.id as string);
    const pagosPorDoc = new Map<string, PagoRow[]>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data: ps } = await db
        .from('pagos')
        .select('documento_id, monto, fecha_pago, referencia, tipo, created_at, medio_cobro, estado_efectivo, fecha_deposito')
        .in('documento_id', ids.slice(i, i + 500));
      for (const p of (ps ?? []) as PagoRow[]) {
        const arr = pagosPorDoc.get(p.documento_id) ?? [];
        arr.push(p);
        pagosPorDoc.set(p.documento_id, arr);
      }
    }
    for (const arr of pagosPorDoc.values()) {
      arr.sort((a, b) => (a.fecha_pago ?? '').localeCompare(b.fecha_pago ?? '') || a.created_at.localeCompare(b.created_at));
    }

    const tipoLabel = (t: string) => t === 'retencion' ? 'Retención IGV' : 'Pago';
    const estadoEfectivoLabel = (p: PagoRow) => p.estado_efectivo === 'depositado'
      ? `Depositado${p.fecha_deposito ? ` (${fmtFechaCorta(p.fecha_deposito)})` : ''}`
      : 'Cobrado - por depositar';

    // "Pagos Registrados": un ítem de texto por pago/retención, en la MISMA
    // fila del documento (columna, no fila). Vacía si no hay ninguno.
    const pagosRegistradosLabel = (documentoId: string) => {
      const ps = pagosPorDoc.get(documentoId);
      if (!ps || ps.length === 0) return '';
      return ps.map(p => {
        const base = `${fmtFechaCorta(p.fecha_pago)} - S/ ${(Number(p.monto) || 0).toFixed(2)} - ${tipoLabel(p.tipo)}`;
        return p.referencia ? `${base} (Ref: ${p.referencia})` : base;
      }).join('; ');
    };
    // "Estado Efectivo": solo los pagos en efectivo (nunca retenciones), un
    // ítem de texto por cada uno. Vacía si todos los pagos son transferencia.
    const estadoEfectivoDetalle = (documentoId: string) => {
      const ps = (pagosPorDoc.get(documentoId) ?? []).filter(p => p.tipo === 'pago' && p.medio_cobro === 'efectivo');
      if (ps.length === 0) return '';
      return ps.map(p => `${fmtFechaCorta(p.fecha_pago)}: ${estadoEfectivoLabel(p)}`).join('; ');
    };

    // NC (tipo '07') aplicadas a cada factura del resultado — mismo criterio:
    // detalle en texto dentro de la fila, sin filas nuevas. El monto ya se
    // resta en "Total NC" (columna existente, sin cambios); esto es solo el
    // detalle de qué NC exactamente componen ese total. La fecha va en su
    // propia columna "Fecha NC" (una por cada NC, mismo orden que "NC Aplicadas").
    interface NcRow { serie: string; numero: number; fecha_emision: string; documento_relacionado_id: string; importe_total: number }
    const ncsPorDoc = new Map<string, NcRow[]>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data: ncs } = await db
        .from('documentos')
        .select('serie, numero, fecha_emision, documento_relacionado_id, importe_total')
        .eq('tipo', '07')
        .eq('anulado', false)
        .in('documento_relacionado_id', ids.slice(i, i + 500));
      for (const n of (ncs ?? []) as NcRow[]) {
        const arr = ncsPorDoc.get(n.documento_relacionado_id) ?? [];
        arr.push(n);
        ncsPorDoc.set(n.documento_relacionado_id, arr);
      }
    }
    for (const arr of ncsPorDoc.values()) {
      arr.sort((a, b) => a.fecha_emision.localeCompare(b.fecha_emision));
    }
    const ncAplicadasLabel = (documentoId: string) => {
      const ncs = ncsPorDoc.get(documentoId);
      if (!ncs || ncs.length === 0) return '';
      return ncs.map(n => `${n.serie}-${n.numero}`).join(', ');
    };
    const fechaNcLabel = (documentoId: string) => {
      const ncs = ncsPorDoc.get(documentoId);
      if (!ncs || ncs.length === 0) return '';
      return ncs.map(n => fmtFechaCorta(n.fecha_emision)).join(', ');
    };

    // Una fila por documento — sin excepciones. Las columnas que no apliquen
    // (sin pagos, sin NC, sin efectivo) quedan vacías: en una tabla dinámica
    // de Excel eso se lee como (en blanco), no rompe ningún agrupamiento.
    const rows = data.map(r => {
      const row = r as Record<string, unknown>;
      const saldo    = Number(row.saldo_pendiente) || 0;
      const pagado   = Number(row.total_pagado)    || 0;
      const importe  = Number(row.importe_total)   || 0;
      const vencido  = (Number(row.d0_7) || 0) + (Number(row.d8_15) || 0) + (Number(row.d16_30) || 0)
                     + (Number(row.d31_60) || 0) + (Number(row.d61_mas) || 0);
      const estadoPago = saldo === 0 && importe > 0 ? 'Pagado'
                       : pagado > 0 && saldo > 0    ? 'Parcial'
                       :                              'Pendiente';
      const id = row.id as string;
      return {
        'Comprobante':        row.comprobante,
        'RUC':                row.cliente_ruc,
        'Razón Social':       row.razon_social,
        'Cód. Vendedor':      row.vendedor_codigo ?? '',
        'Vendedor':           row.vendedor_nombre ?? '',
        'Zona':               row.zona_nombre ?? '',
        'Fecha Emisión':      toDate(row.fecha_emision as string),
        'Fecha Vencimiento':  toDate(row.fecha_vencimiento as string),
        'Forma Pago':         row.forma_pago ?? '',
        'Moneda':             row.moneda ?? '',
        'Importe Total':      importe,
        'Total NC':           -(Number(row.total_nc) || 0),
        'NC Aplicadas':       ncAplicadasLabel(id),
        'Fecha NC':           fechaNcLabel(id),
        'Total ND':           Number(row.total_nd) || 0,
        'Total Pagado':       pagado,
        'Pagos Registrados':  pagosRegistradosLabel(id),
        'Estado Efectivo':    estadoEfectivoDetalle(id),
        'Saldo Pendiente':    saldo,
        'Estado Pago':        estadoPago,
        'Por Vencer':         Number(row.vigente)  || 0,
        '0-7 días':           Number(row.d0_7)     || 0,
        '8-15 días':          Number(row.d8_15)    || 0,
        '16-30 días':         Number(row.d16_30)   || 0,
        '31-60 días':         Number(row.d31_60)   || 0,
        '60+ días':           Number(row.d61_mas)  || 0,
        'Total Vencido':      vencido,
        'Días Retraso':       Number(row.dias_retraso) || 0,
        '% Morosidad':        saldo > 0 ? Math.round(vencido / saldo * 10000) / 100 : 0,
        'Rango':              row.rango_vencimiento ?? '',
        'Tiene Letras':       row.tiene_letras ? 'Sí' : 'No',
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true });
    ws['!cols'] = [
      { wch: 14 }, { wch: 13 }, { wch: 35 }, { wch: 10 }, { wch: 22 }, { wch: 18 },
      { wch: 13 }, { wch: 16 }, { wch: 10 }, { wch: 7  },
      { wch: 13 }, { wch: 10 }, { wch: 24 }, { wch: 20 }, { wch: 10 },
      { wch: 12 }, { wch: 45 }, { wch: 30 },
      { wch: 14 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 15 }, { wch: 11 },
    ];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    XLSX.utils.book_append_sheet(wb, ws, 'Estado de Cuenta');

    // Segunda hoja: detalle de todas las NC aplicadas a las facturas del
    // período/filtro exportado (mismo alcance que la hoja principal — no es
    // una pantalla nueva del ERP, es solo una pestaña adicional del mismo
    // archivo). Reutiliza el join factura→cliente ya calculado arriba.
    const facturaInfoPorId = new Map(
      data.map(r => {
        const row = r as Record<string, unknown>;
        return [row.id as string, {
          comprobante:  row.comprobante as string,
          cliente_ruc:  row.cliente_ruc as string,
          razon_social: row.razon_social as string,
        }];
      })
    );
    const ncRows: Record<string, unknown>[] = [];
    for (const [facturaId, ncs] of ncsPorDoc.entries()) {
      const info = facturaInfoPorId.get(facturaId);
      for (const n of ncs) {
        ncRows.push({
          'N° NC':                 `${n.serie}-${n.numero}`,
          'Fecha Emisión':         toDate(n.fecha_emision),
          'RUC Cliente':           info?.cliente_ruc ?? '',
          'Razón Social':          info?.razon_social ?? '',
          'Factura/Boleta':        info?.comprobante ?? '',
          'Monto NC':              -(Number(n.importe_total) || 0),
        });
      }
    }
    ncRows.sort((a, b) => (a['Fecha Emisión'] as Date).getTime() - (b['Fecha Emisión'] as Date).getTime());

    const wsNc = XLSX.utils.json_to_sheet(ncRows, { cellDates: true });
    wsNc['!cols'] = [
      { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 35 }, { wch: 14 }, { wch: 13 },
    ];
    if (ncRows.length > 0) {
      const rangeNc = XLSX.utils.decode_range(wsNc['!ref'] ?? 'A1');
      wsNc['!autofilter'] = { ref: XLSX.utils.encode_range(rangeNc) };
      const totalNc = ncRows.reduce((s, r) => s + (r['Monto NC'] as number), 0);
      XLSX.utils.sheet_add_json(wsNc, [{ 'N° NC': 'TOTAL', 'Monto NC': totalNc }], {
        header: Object.keys(ncRows[0]),
        skipHeader: true,
        origin: -1,
      });
    }
    XLSX.utils.book_append_sheet(wb, wsNc, 'Notas de Crédito');

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
