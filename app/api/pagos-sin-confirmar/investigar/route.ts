export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Marca un pago pendiente_confirmar como "investigado" con un comentario.
// No cambia estado_verificacion: el pago sigue pendiente_confirmar hasta que
// llegue la confirmación real contra el banco; "investigado" solo silencia
// la alerta y deja constancia de que alguien ya lo revisó.
export async function POST(req: NextRequest) {
  const { pago_id, comentario } = await req.json() as { pago_id: string; comentario: string };
  if (!pago_id || !comentario?.trim())
    return NextResponse.json({ error: 'pago_id y comentario son requeridos' }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db
    .from('pagos')
    .update({ investigado: true, investigado_comentario: comentario.trim(), investigado_en: new Date().toISOString() })
    .eq('id', pago_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
