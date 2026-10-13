import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { crearClienteServidor } from '@logisalud/auth/server';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export const dynamic = 'force-dynamic';
/**
 * El export "todo" son ~2.650 facturas con sus pagos, letras y NC: entre
 * leer y armar el Excel no entra en los 10 s por defecto de una función
 * serverless, y el navegador se queda sin archivo y sin error visible.
 */
export const maxDuration = 60;

const toDate = (s: string | null | undefined): Date | string => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const fmtFechaCorta = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

// Una sola línea y literal a propósito: supabase-js deduce el tipo de las
// filas parseando este string, y si se arma concatenando pierde el tipo.
const COLUMNAS_SALDOS = 'id, comprobante, cliente_ruc, razon_social, vendedor_codigo, vendedor_nombre, zona_nombre, fecha_emision, fecha_vencimiento, forma_pago, moneda, importe_total, total_nc, total_nd, total_pagado, saldo_pendiente, vigente, d0_7, d8_15, d16_30, d31_60, d61_mas, dias_retraso, rango_vencimiento, tiene_letras';

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const url        = new URL(req.url);
    const vendedorId = url.searchParams.get('vendedor_id');
    const clienteRuc = url.searchParams.get('cliente_ruc');

    const db = crearClienteServidor();

    const data = await fetchAll((from, to) => {
      // Las columnas que usa el Excel y ninguna más: con `select('*')` cada
      // página de 1.000 filas traía también tipo_cambio, created_at, los
      // campos de factoring y los de incobrable, que nadie lee acá.
      let q = db
        .from('v_saldos')
        .select(COLUMNAS_SALDOS)
        .order('cliente_ruc')
        .order('fecha_emision', { ascending: false });

      if (clienteRuc) {
        q = q.eq('cliente_ruc', clienteRuc);
      } else if (vendedorId === 'sin-asignar') {
        q = q.is('vendedor_id', null);
      } else if (vendedorId) {
        q = q.eq('vendedor_id', vendedorId);
      }

      return q.order('id').range(from, to);
    });

    // Pagos de las facturas del resultado — se consolidan en columnas de
    // texto dentro de la misma fila del documento (nunca filas nuevas: eso
    // ya causó confusión en visores que no respetan filas ocultas/agrupadas).
    interface PagoRow {
      documento_id: string; monto: number; fecha_pago: string; referencia: string | null; tipo: string; created_at: string;
      medio_cobro: string; estado_efectivo: string | null; fecha_deposito: string | null;
    }
    const ids = data.map(r => r.id as string);
    const esDelExport = new Set(ids);

    /**
     * Pagos, letras y NC de las facturas exportadas.
     *
     * Preguntar por los ids tiene un techo: PostgREST los manda en la URL y
     * una tanda de 500 UUID son 19,7 KB de querystring. El export completo
     * terminaba haciendo 17 consultas así —pagos, letras y NC, tanda por
     * tanda— y se le iba el presupuesto de tiempo de la función antes de
     * escribir el archivo: el navegador se quedaba esperando una descarga
     * que nunca llegaba. Con muchas facturas sale más barato traer la tabla
     * entera (2.245 pagos, 259 NC, 74 letras) y filtrar acá; con pocas —un
     * cliente, un vendedor— sigue conviniendo preguntar por ids.
     */
    const UMBRAL_IDS = 400;
    const traerDeFacturas = async <T>(
      tabla: string,
      columnas: string,
      fk: string,
      desempate: string[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extra: (q: any) => any = q => q, // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<T[]> => {
      if (ids.length <= UMBRAL_IDS) {
        const filas: T[] = [];
        for (let i = 0; i < ids.length; i += 200) {
          const { data: d, error } = await extra(
            db.from(tabla).select(columnas).in(fk, ids.slice(i, i + 200)),
          );
          if (error) throw new Error(error.message);
          filas.push(...((d ?? []) as T[]));
        }
        return filas;
      }
      // `fetchAll` exige un orden único: sin eso la página 2 repite filas de
      // la 1 y se saltea otras (ver lib/fetchAll.ts).
      const todas = await fetchAll<T>((from, to) => {
        let q = extra(db.from(tabla).select(columnas));
        for (const col of desempate) q = q.order(col);
        return q.range(from, to);
      });
      return todas.filter(f => esDelExport.has((f as Record<string, unknown>)[fk] as string));
    };

    const pagosPorDoc = new Map<string, PagoRow[]>();
    for (const p of await traerDeFacturas<PagoRow>(
      'pagos',
      'documento_id, monto, fecha_pago, referencia, tipo, created_at, medio_cobro, estado_efectivo, fecha_deposito',
      'documento_id',
      ['id'],
    )) {
      const arr = pagosPorDoc.get(p.documento_id) ?? [];
      arr.push(p);
      pagosPorDoc.set(p.documento_id, arr);
    }
    for (const arr of pagosPorDoc.values()) {
      arr.sort((a, b) => (a.fecha_pago ?? '').localeCompare(b.fecha_pago ?? '') || a.created_at.localeCompare(b.created_at));
    }

    const estadoEfectivoLabel = (p: PagoRow) => p.estado_efectivo === 'depositado'
      ? `Depositado${p.fecha_deposito ? ` (${fmtFechaCorta(p.fecha_deposito)})` : ''}`
      : 'Cobrado - por depositar';

    // El cobro de una factura entra por dos caminos distintos y cobranzas
    // los mira distinto: la plata que pagó el cliente y la retención de IGV
    // 3% que retuvo y le paga a SUNAT. Antes iban mezcladas en una sola
    // columna de texto ("… - Pago; … - Retención IGV") y había que leer
    // cada celda para separarlas. Ahora son dos columnas: una por camino,
    // cada una con su total numérico al lado, así se filtran y se suman en
    // la tabla dinámica sin tocar el texto.
    const detallePagos = (documentoId: string, tipo: 'pago' | 'retencion') => {
      const ps = (pagosPorDoc.get(documentoId) ?? []).filter(p => p.tipo === tipo);
      if (ps.length === 0) return '';
      return ps.map(p => {
        const base = `${fmtFechaCorta(p.fecha_pago)} - S/ ${(Number(p.monto) || 0).toFixed(2)}`;
        return p.referencia ? `${base} (Ref: ${p.referencia})` : base;
      }).join('; ');
    };
    const totalPagos = (documentoId: string, tipo: 'pago' | 'retencion') =>
      (pagosPorDoc.get(documentoId) ?? [])
        .filter(p => p.tipo === tipo)
        .reduce((s, p) => s + (Number(p.monto) || 0), 0);
    // "Estado Efectivo": solo los pagos en efectivo (nunca retenciones), un
    // ítem de texto por cada uno. Vacía si todos los pagos son transferencia.
    const estadoEfectivoDetalle = (documentoId: string) => {
      const ps = (pagosPorDoc.get(documentoId) ?? []).filter(p => p.tipo === 'pago' && p.medio_cobro === 'efectivo');
      if (ps.length === 0) return '';
      return ps.map(p => `${fmtFechaCorta(p.fecha_pago)}: ${estadoEfectivoLabel(p)}`).join('; ');
    };

    // Letras de las facturas del resultado. Una factura canjeada por letras
    // no tiene NINGUNA fila en `pagos`: se cancela marcando cada letra como
    // pagada. Sin esto, "Total Pagado" y "Pagos Registrados" salían vacías en
    // una factura efectivamente cobrada — FFF1-831 figuraba con S/ 26,247.03
    // de importe, la NC, y ni rastro de los S/ 25,025.60 de la letra L00023.
    interface LetraRow {
      documento_id: string; monto_aplicado: number;
      numero_letra: string; fecha_giro: string | null; fecha_vencimiento: string;
      fecha_pago: string | null; estado: string; banco: string | null;
    }
    // Dos consultas planas en vez de un embed de PostgREST, igual que
    // /api/letras: la tabla puente y después las letras por id.
    const letrasPorDoc = new Map<string, LetraRow[]>();
    const vinculos = await traerDeFacturas<{ documento_id: string; letra_id: string; monto_aplicado: number }>(
      'letra_documento',
      'documento_id, letra_id, monto_aplicado',
      'documento_id',
      ['documento_id', 'letra_id'], // no tiene `id`: la clave son las dos
    );
    if (vinculos.length > 0) {
      const letraIds = [...new Set(vinculos.map(v => v.letra_id))];
      const letrasPorId = new Map<string, Record<string, unknown>>();
      for (let i = 0; i < letraIds.length; i += 500) {
        const { data: ls } = await db
          .from('letras')
          .select('id, numero_letra, fecha_giro, fecha_vencimiento, fecha_pago, estado, banco')
          .in('id', letraIds.slice(i, i + 500));
        for (const l of ls ?? []) letrasPorId.set(l.id as string, l);
      }
      for (const v of vinculos) {
        const l = letrasPorId.get(v.letra_id);
        if (!l) continue;
        const arr = letrasPorDoc.get(v.documento_id) ?? [];
        arr.push({
          documento_id: v.documento_id,
          monto_aplicado: Number(v.monto_aplicado) || 0,
          numero_letra: l.numero_letra as string,
          fecha_giro: (l.fecha_giro as string) ?? null,
          fecha_vencimiento: l.fecha_vencimiento as string,
          fecha_pago: (l.fecha_pago as string) ?? null,
          estado: l.estado as string,
          banco: (l.banco as string) ?? null,
        });
        letrasPorDoc.set(v.documento_id, arr);
      }
    }
    for (const arr of letrasPorDoc.values()) {
      arr.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
    }

    const letrasPagadasDe = (documentoId: string) =>
      (letrasPorDoc.get(documentoId) ?? []).filter(l => l.estado === 'pagada');
    const totalLetrasPagadas = (documentoId: string) =>
      letrasPagadasDe(documentoId).reduce((s, l) => s + l.monto_aplicado, 0);
    // Mismo formato que "Pagos Registrados": un ítem de texto por letra, en la
    // misma fila del documento.
    const letrasPagadasLabel = (documentoId: string) => {
      const ls = letrasPagadasDe(documentoId);
      if (ls.length === 0) return '';
      return ls.map(l =>
        `${l.numero_letra} - ${l.fecha_pago ? fmtFechaCorta(l.fecha_pago) : 'sin fecha'} - S/ ${l.monto_aplicado.toFixed(2)}`
      ).join('; ');
    };

    // NC (tipo '07') aplicadas a cada factura del resultado — mismo criterio:
    // detalle en texto dentro de la fila, sin filas nuevas. El monto ya se
    // resta en "Total NC" (columna existente, sin cambios); esto es solo el
    // detalle de qué NC exactamente componen ese total. La fecha va en su
    // propia columna "Fecha NC" (una por cada NC, mismo orden que "NC Aplicadas").
    interface NcRow { serie: string; numero: number; fecha_emision: string; documento_relacionado_id: string; importe_total: number }
    const ncsPorDoc = new Map<string, NcRow[]>();
    for (const n of await traerDeFacturas<NcRow>(
      'documentos',
      'serie, numero, fecha_emision, documento_relacionado_id, importe_total',
      'documento_relacionado_id',
      ['id'],
      q => q.eq('tipo', '07').eq('anulado', false),
    )) {
      const arr = ncsPorDoc.get(n.documento_relacionado_id) ?? [];
      arr.push(n);
      ncsPorDoc.set(n.documento_relacionado_id, arr);
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
      const id = row.id as string;
      // "Parcial" tiene que contar también las letras ya cobradas: una
      // factura canjeada con 4 de 5 letras pagadas no está "Pendiente".
      const cobrado = pagado + totalLetrasPagadas(id);
      const estadoPago = saldo === 0 && importe > 0 ? 'Pagado'
                       : cobrado > 0 && saldo > 0   ? 'Parcial'
                       :                              'Pendiente';
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
        // `total_pagado` de la vista suma TODO lo aplicado a la factura,
        // retención incluida — es lo que efectivamente baja el saldo. Las
        // dos columnas que siguen lo abren en sus dos partes.
        'Total Pagado':       pagado,
        'Total Pagos (sin ret.)': totalPagos(id, 'pago'),
        'Pagos Registrados':  detallePagos(id, 'pago'),
        'Total Retención IGV': totalPagos(id, 'retencion'),
        'Retenciones IGV':    detallePagos(id, 'retencion'),
        'Total Letras Pagadas': totalLetrasPagadas(id),
        'Letras Pagadas':     letrasPagadasLabel(id),
        'Total Cobrado':      cobrado,
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
      { wch: 12 }, { wch: 15 }, { wch: 45 }, { wch: 14 }, { wch: 40 },
      { wch: 20 }, { wch: 45 }, { wch: 14 }, { wch: 30 },
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
    // `compression: true` no es cosmético: por defecto SheetJS guarda el XML
    // sin comprimir dentro del .xlsx y el archivo completo pesaba ~3,9 MB,
    // contra el tope de 4,5 MB que tiene la respuesta de una función
    // serverless. Comprimido baja a ~1 MB y tarda lo mismo. Está puesto en
    // todos los export de la app, pero el que se pasaba era este.
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
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
