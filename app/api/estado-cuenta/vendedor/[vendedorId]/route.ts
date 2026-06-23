export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

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

    const data = await fetchAll<SaldoRow>((from, to) => {
      let q = db
        .from('v_saldos')
        .select('cliente_ruc, razon_social, saldo_pendiente, vigente, d1_30, d31_60, d61_90, mas90');
      q = vendedorId === 'sin-asignar'
        ? q.is('vendedor_id', null)
        : q.eq('vendedor_id', vendedorId);
      if (soloDeuda) q = q.gt('saldo_pendiente', 0);
      return q.range(from, to);
    });

    const grupos = new Map<string, GrupoCliente>();
    for (const row of data) {
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
    return NextResponse.json({ clientes }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
