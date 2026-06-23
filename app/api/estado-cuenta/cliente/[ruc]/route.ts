export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: { ruc: string } }
) {
  try {
    const soloDeuda = new URL(req.url).searchParams.get('solo_deuda') !== 'false';
    const db = supabaseAdmin();

    let query = db
      .from('v_saldos')
      .select('*')
      .eq('cliente_ruc', params.ruc)
      .order('fecha_vencimiento', { ascending: false, nullsFirst: false })
      .limit(1000);

    if (soloDeuda) query = query.gt('saldo_pendiente', 0);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ facturas: data ?? [] }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
