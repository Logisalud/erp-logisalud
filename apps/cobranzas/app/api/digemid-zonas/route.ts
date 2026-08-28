export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('digemid_zona_vendedor')
    .select('codigo_zona, nombre_zona, vendedor:vendedor_id ( id, codigo, nombres, apellidos )')
    .order('codigo_zona');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ zonas: data ?? [] }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
