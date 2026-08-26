export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Registro ligero de un envío de WhatsApp desde /v/[token] (piloto). Se llama
// fire-and-forget al presionar el botón, igual que /api/acceso — no debe
// frenar ni notarse en la interacción del vendedor.
export async function POST(req: NextRequest) {
  try {
    const { token, documento_id, tipo_mensaje } = await req.json();
    if (!token || String(token).length < 16) return NextResponse.json({ ok: false });
    if (!documento_id || (tipo_mensaje !== 'descuento' && tipo_mensaje !== 'vencimiento')) {
      return NextResponse.json({ ok: false });
    }

    const db = supabaseAdmin();
    const { data: vendedor } = await db
      .from('vendedores')
      .select('id, activo')
      .eq('token_acceso', token)
      .single();

    if (!vendedor || !vendedor.activo) return NextResponse.json({ ok: false });

    await db.from('whatsapp_mensajes_enviados').insert({
      vendedor_id: vendedor.id, documento_id, tipo_mensaje,
    });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
