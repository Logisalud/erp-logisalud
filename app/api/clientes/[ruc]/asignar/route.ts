import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { ruc: string } }
) {
  try {
    const { ruc } = params;
    const { vendedor_id }: { vendedor_id: string | null } = await req.json();

    const db = supabaseAdmin();

    // Leer vendedor actual para guardar en historial
    const { data: cliente, error: errLeer } = await db
      .from('clientes')
      .select('vendedor_actual_id')
      .eq('ruc', ruc)
      .single();

    if (errLeer || !cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    const anteriorId = cliente.vendedor_actual_id as string | null;
    const cambia     = anteriorId !== vendedor_id;

    const payload: Record<string, unknown> = { vendedor_actual_id: vendedor_id };
    if (cambia && anteriorId) {
      payload.vendedor_anterior_id = anteriorId;
      payload.fecha_reasignacion   = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    }

    const { error: errUpd } = await db
      .from('clientes')
      .update(payload)
      .eq('ruc', ruc);

    if (errUpd) return NextResponse.json({ error: errUpd.message }, { status: 500 });

    return NextResponse.json({ ok: true, cambio_registrado: cambia && !!anteriorId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
