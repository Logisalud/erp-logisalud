export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Registro ligero de un acceso a la vista del vendedor. Se llama con beacon
// desde el cliente tras cargar /v/[token], así no añade latencia al SSR.
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token || String(token).length < 16) return NextResponse.json({ ok: false });

    const db = supabaseAdmin();
    const { data: vendedor } = await db
      .from('vendedores')
      .select('id, activo')
      .eq('token_acceso', token)
      .single();

    if (!vendedor || !vendedor.activo) return NextResponse.json({ ok: false });

    await db.from('accesos_vendedor').insert({ vendedor_id: vendedor.id });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
