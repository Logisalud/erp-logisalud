export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: { ruc: string } }
) {
  try {
    const db = supabaseAdmin();

    const { data: docs, error: docsErr } = await db
      .from('v_saldos')
      .select('id')
      .eq('cliente_ruc', params.ruc);

    if (docsErr) return NextResponse.json({ error: docsErr.message }, { status: 500 });

    const ids = (docs ?? []).map(d => d.id);
    if (ids.length === 0) return NextResponse.json({ letras: [] });

    const { data, error } = await db
      .from('letras')
      .select('id, documento_id, numero_letra, importe, fecha_giro, fecha_vencimiento, estado, banco, observaciones, fecha_pago')
      .in('documento_id', ids)
      .order('documento_id')
      .order('fecha_vencimiento', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ letras: data ?? [] }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
