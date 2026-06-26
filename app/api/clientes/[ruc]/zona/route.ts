export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { ruc: string } }
) {
  try {
    const { ruc } = params;
    const body: { codigo_zona?: string | null; vendedor_manual_id?: string | null } = await req.json();

    if (!('codigo_zona' in body) && !('vendedor_manual_id' in body)) {
      return NextResponse.json({ error: 'Se requiere codigo_zona o vendedor_manual_id' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {};
    if ('codigo_zona' in body)        payload.codigo_zona        = body.codigo_zona ?? null;
    if ('vendedor_manual_id' in body) payload.vendedor_manual_id = body.vendedor_manual_id ?? null;

    const db = supabaseAdmin();
    const { error } = await db.from('clientes').update(payload).eq('ruc', ruc);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
