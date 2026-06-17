import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface SaldoRow {
  cliente_ruc: string; razon_social: string;
  saldo_pendiente: number; rango_vencimiento: string;
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
      .select('cliente_ruc, razon_social, saldo_pendiente, rango_vencimiento')
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
      const s = Number(row.saldo_pendiente) || 0;
      g.saldo_total += s; g.cant_facturas++;
      switch (row.rango_vencimiento) {
        case 'vigente': case 'sin_vencimiento': g.vigente += s; break;
        case '1-30':  g.d1_30  += s; break;
        case '31-60': g.d31_60 += s; break;
        case '61-90': g.d61_90 += s; break;
        case '+90':   g.mas90  += s; break;
      }
    }

    const clientes = Array.from(grupos.values()).sort((a, b) => b.saldo_total - a.saldo_total);
    return NextResponse.json({ clientes });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
