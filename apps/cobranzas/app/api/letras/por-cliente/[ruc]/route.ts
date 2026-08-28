export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export async function GET(
  _req: NextRequest,
  { params }: { params: { ruc: string } }
) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const db = supabaseAdmin();

    const { data: docs, error: docsErr } = await db
      .from('v_saldos')
      .select('id')
      .eq('cliente_ruc', params.ruc);

    if (docsErr) return NextResponse.json({ error: docsErr.message }, { status: 500 });

    const docIds = (docs ?? []).map(d => d.id as string);
    if (docIds.length === 0) return NextResponse.json({ letras: [] }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });

    // Buscar a través de letra_documento
    const { data: ldData, error: ldErr } = await db
      .from('letra_documento')
      .select('letra_id')
      .in('documento_id', docIds);

    if (ldErr) return NextResponse.json({ error: ldErr.message }, { status: 500 });

    const letraIds = [...new Set((ldData ?? []).map(r => r.letra_id as string))];
    if (letraIds.length === 0) return NextResponse.json({ letras: [] }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });

    const { data, error } = await db
      .from('letras')
      .select('id, documento_id, numero_letra, importe, fecha_giro, fecha_vencimiento, estado, banco, observaciones, fecha_pago')
      .in('id', letraIds)
      .order('fecha_vencimiento', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ letras: data ?? [] }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
