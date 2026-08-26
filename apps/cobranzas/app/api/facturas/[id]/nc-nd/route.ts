export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('documentos')
    .select('id, tipo, serie, numero, fecha_emision, importe_total, anulado')
    .eq('documento_relacionado_id', params.id)
    .in('tipo', ['07', '08'])
    .eq('anulado', false)
    .order('fecha_emision', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documentos: data ?? [] }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
