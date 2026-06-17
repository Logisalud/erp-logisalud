import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface SaldoRow {
  cliente_ruc: string; razon_social: string;
  saldo_pendiente: number;
  vigente: number; d1_30: number; d31_60: number; d61_90: number; mas90: number;
}

interface GrupoCliente {
  cliente_ruc: string; razon_social: string;
  vigente: number; d1_30: number; d31_60: number; d61_90: number; mas90: number;
  saldo_total: number; cant_facturas: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { vendedorId: string } }
) {
  try {
    const soloDeuda = new URL(req.url).searchParams.get('solo_deuda') !== 'false';
    const { vendedorId } = params;
    const db = supabaseAdmin();

    let query = db
      .from('v_saldos')
      .select('cliente_ruc, razon_social, saldo_pendiente, vigente, d1_30, d31_60, d61_90, mas90')
      .limit(10000);

    query = vendedorId === 'sin-asignar'
      ? query.is('vendedor_id', null)
      : query.eq('vendedor_id', vendedorId);

    if (soloDeuda) query = query.gt('saldo_pendiente', 0);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const grupos = new Map<string, GrupoCliente>();
    for (const row of (data as SaldoRow[])) {
      if (!grupos.has(row.cliente_ruc)) {
        grupos.set(row.cliente_ruc, {
          cliente_ruc: row.cliente_ruc, razon_social: row.razon_social,
          vigente: 0, d1_30: 0, d31_60: 0, d61_90: 0, mas90: 0,
          saldo_total: 0, cant_facturas: 0,
        });
      }
      const g = grupos.get(row.cliente_ruc)!;
      g.saldo_total   += Number(row.saldo_pendiente) || 0;
      g.vigente       += Number(row.vigente)         || 0;
      g.d1_30         += Number(row.d1_30)           || 0;
      g.d31_60        += Number(row.d31_60)          || 0;
      g.d61_90        += Number(row.d61_90)          || 0;
      g.mas90         += Number(row.mas90)           || 0;
      g.cant_facturas += 1;
    }

    const clientes = Array.from(grupos.values()).sort((a, b) => b.saldo_total - a.saldo_total);
    return NextResponse.json({ clientes });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
