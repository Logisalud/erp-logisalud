export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { crearClienteServidor } from '@logisalud/auth/server';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

interface SaldoRow {
  vendedor_id: string | null;
  vendedor_codigo: string | null;
  vendedor_nombre: string | null;
  zona_nombre: string | null;
  saldo_pendiente: number;
  vigente: number;
  d0_7: number;
  d8_15: number;
  d16_30: number;
  d31_60: number;
  d61_mas: number;
}

interface GrupoVendedor {
  vendedor_id: string | null;
  vendedor_codigo: string | null;
  vendedor_nombre: string | null;
  zona_nombre: string | null;
  vigente: number; d0_7: number; d8_15: number; d16_30: number; d31_60: number; d61_mas: number;
  saldo_total: number; cant_facturas: number;
}

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const soloDeuda = new URL(req.url).searchParams.get('solo_deuda') !== 'false';
    const db = crearClienteServidor();

    const data = await fetchAll<SaldoRow>((from, to) => {
      let q = db
        .from('v_saldos')
        .select('vendedor_id, vendedor_codigo, vendedor_nombre, zona_nombre, saldo_pendiente, vigente, d0_7, d8_15, d16_30, d31_60, d61_mas');
      if (soloDeuda) q = q.gt('saldo_pendiente', 0);
      return q.range(from, to);
    });

    const grupos = new Map<string, GrupoVendedor>();
    for (const row of data) {
      const key = row.vendedor_id ?? '__sin_asignar__';
      if (!grupos.has(key)) {
        grupos.set(key, {
          vendedor_id: row.vendedor_id, vendedor_codigo: row.vendedor_codigo,
          vendedor_nombre: row.vendedor_nombre, zona_nombre: row.zona_nombre,
          vigente: 0, d0_7: 0, d8_15: 0, d16_30: 0, d31_60: 0, d61_mas: 0,
          saldo_total: 0, cant_facturas: 0,
        });
      }
      const g = grupos.get(key)!;
      g.saldo_total   += Number(row.saldo_pendiente) || 0;
      g.vigente       += Number(row.vigente)         || 0;
      g.d0_7          += Number(row.d0_7)            || 0;
      g.d8_15         += Number(row.d8_15)           || 0;
      g.d16_30        += Number(row.d16_30)          || 0;
      g.d31_60        += Number(row.d31_60)          || 0;
      g.d61_mas       += Number(row.d61_mas)         || 0;
      g.cant_facturas += 1;
    }

    const resumen = Array.from(grupos.values()).sort((a, b) => b.saldo_total - a.saldo_total);
    return NextResponse.json({ resumen }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
