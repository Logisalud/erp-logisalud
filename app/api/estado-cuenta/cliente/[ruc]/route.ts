import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: { ruc: string } }
) {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('v_saldos')
      .select('*')
      .eq('cliente_ruc', params.ruc)
      .order('fecha_vencimiento', { ascending: false, nullsFirst: false })
      .limit(1000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ facturas: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
