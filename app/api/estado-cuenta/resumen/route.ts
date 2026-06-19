export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface SaldoRow {
  vendedor_id: string | null;
  vendedor_codigo: string | null;
  vendedor_nombre: string | null;
  zona_nombre: string | null;
  saldo_pendiente: number;
  vigente: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  mas90: number;
}

interface GrupoVendedor {
  vendedor_id: string | null;
  vendedor_codigo: string | null;
  vendedor_nombre: string | null;
  zona_nombre: string | null;
  vigente: number; d1_30: number; d31_60: number; d61_90: number; mas90: number;
  saldo_total: number; cant_facturas: number;
}

export async function GET(req: NextRequest) {
  try {
    const soloDeuda = new URL(req.url).searchParams.get('solo_deuda') !== 'false';
    const db = supabaseAdmin();

    let query = db
      .from('v_saldos')
      .select('vendedor_id, vendedor_codigo, vendedor_nombre, zona_nombre, saldo_pendiente, vigente, d1_30, d31_60, d61_90, mas90')
      .limit(10000);

    if (soloDeuda) query = query.gt('saldo_pendiente', 0);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const grupos = new Map<string, GrupoVendedor>();
    for (const row of (data as SaldoRow[])) {
      const key = row.vendedor_id ?? '__sin_asignar__';
      if (!grupos.has(key)) {
        grupos.set(key, {
          vendedor_id: row.vendedor_id, vendedor_codigo: row.vendedor_codigo,
          vendedor_nombre: row.vendedor_nombre, zona_nombre: row.zona_nombre,
          vigente: 0, d1_30: 0, d31_60: 0, d61_90: 0, mas90: 0,
          saldo_total: 0, cant_facturas: 0,
        });
      }
      const g = grupos.get(key)!;
      g.saldo_total   += Number(row.saldo_pendiente) || 0;
      g.vigente       += Number(row.vigente)         || 0;
      g.d1_30         += Number(row.d1_30)           || 0;
      g.d31_60        += Number(row.d31_60)          || 0;
      g.d61_90        += Number(row.d61_90)          || 0;
      g.mas90         += Number(row.mas90)           || 0;
      g.cant_facturas += 1;
    }

    const resumen = Array.from(grupos.values()).sort((a, b) => b.saldo_total - a.saldo_total);
    return NextResponse.json({ resumen });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
