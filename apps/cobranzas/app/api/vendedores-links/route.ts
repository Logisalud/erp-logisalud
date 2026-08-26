export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('vendedores')
    .select('id, nombres, apellidos, codigo, activo, token_acceso')
    .order('nombres');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendedores: data ?? [] }, { headers: noStore });
}

// Regenera el token de un vendedor (revoca el link anterior)
export async function PATCH(req: NextRequest) {
  const { vendedor_id } = await req.json();
  if (!vendedor_id) return NextResponse.json({ error: 'vendedor_id requerido' }, { status: 400 });

  const nuevoToken = randomBytes(16).toString('hex');
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('vendedores')
    .update({ token_acceso: nuevoToken })
    .eq('id', vendedor_id)
    .select('id, token_acceso')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendedor: data }, { headers: noStore });
}
