import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const db   = supabaseAdmin();

  if (body.estado === 'pagada' && !body.fecha_pago) {
    body.fecha_pago = new Date().toISOString().split('T')[0];
  }
  if (body.estado && body.estado !== 'pagada') {
    body.fecha_pago = null;
  }

  const { data, error } = await db
    .from('letras')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ letra: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = supabaseAdmin();
  const { error } = await db.from('letras').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
