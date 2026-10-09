import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { crearClienteServidor } from '@logisalud/auth/server';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export const dynamic = 'force-dynamic';

/**
 * El resumen por vendedor en Excel — el mismo que muestra la pantalla.
 *
 * "El mismo" es literal y costó un reclamo de cobranzas: antes esta ruta
 * agrupaba sólo por vendedor y no aplicaba el filtro "Solo cartera
 * pendiente", así que el Excel traía otras cifras que la pantalla de al
 * lado. Ahora comparte las tres reglas con `/api/estado-cuenta/resumen`:
 *
 * 1. El filtro de cartera pendiente viaja desde la pantalla (`solo_deuda`),
 *    así que el archivo dice lo que estabas mirando al descargarlo.
 * 2. Agrupa por vendedor **y zona**: una persona que cubre dos zonas son dos
 *    filas, igual que en pantalla, y no una suma que no cuadra con ninguna.
 * 3. Pagina con un orden estable (`.order('id')`). Sin eso, un `range()`
 *    sobre 2.500 facturas repite filas y pierde otras —y el total sale mal
 *    por decenas de miles de soles, distinto en cada descarga.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const soloDeuda = new URL(req.url).searchParams.get('solo_deuda') !== 'false';
    const db = crearClienteServidor();

    const data = await fetchAll<{
      vendedor_id: string | null; vendedor_codigo: string | null;
      vendedor_nombre: string | null; zona_nombre: string | null;
      cliente_ruc: string; saldo_pendiente: number; vigente: number;
      d0_7: number; d8_15: number; d16_30: number; d31_60: number; d61_mas: number;
    }>((from, to) => {
      let q = db.from('v_saldos')
        .select('vendedor_id, vendedor_codigo, vendedor_nombre, zona_nombre, cliente_ruc, saldo_pendiente, vigente, d0_7, d8_15, d16_30, d31_60, d61_mas');
      if (soloDeuda) q = q.gt('saldo_pendiente', 0);
      return q.order('id').range(from, to);
    });

    type Grupo = {
      vendedor_codigo: string | null;
      vendedor_nombre: string | null; zona_nombre: string | null;
      clientes: Set<string>;
      saldo_total: number; vigente: number; d0_7: number; d8_15: number; d16_30: number;
      d31_60: number; d61_mas: number; cant_facturas: number;
    };

    const map = new Map<string, Grupo>();
    for (const row of data) {
      // Misma clave que la pantalla: vendedor + zona.
      const key = `${row.vendedor_id ?? '__sin_asignar__'}::${row.zona_nombre ?? '__sin_zona__'}`;
      if (!map.has(key)) {
        map.set(key, {
          vendedor_codigo: row.vendedor_codigo,
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
    const sufijo = soloDeuda ? '' : '-con-pagados';
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="resumen-vendedor-${fecha}${sufijo}.xlsx"`,
        'Cache-Control':       'no-store',
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
