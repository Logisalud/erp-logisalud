export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_BORRADO } from '@/lib/autorizacion';

// Anular un canje: las facturas vuelven a cartera normal (nunca tuvieron el
// saldo tocado, así que no hay nada que revertir ahí). Solo admin.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirArea(AREAS_BORRADO);
  if (!auth.ok) return auth.respuesta;

  const body = await req.json() as { anulado_motivo?: string };
  if (!body.anulado_motivo?.trim())
    return NextResponse.json({ error: 'Indica el motivo de la anulación' }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('factoring_canjes')
    .update({ anulado: true, anulado_motivo: body.anulado_motivo.trim(), anulado_en: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ canje: data });
}
