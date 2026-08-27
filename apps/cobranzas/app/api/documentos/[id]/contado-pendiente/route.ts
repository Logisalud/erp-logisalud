export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_ESCRITURA } from '@/lib/autorizacion';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  const { contado_pendiente } = await req.json();
  if (typeof contado_pendiente !== 'boolean') {
    return NextResponse.json({ error: 'contado_pendiente debe ser boolean' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('documentos')
    .update({ contado_pendiente })
    .eq('id', params.id)
    .select('id, contado_pendiente')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documento: data });
}
