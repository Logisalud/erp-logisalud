export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { construirReporteLetras } from '@/lib/reporteLetras';

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const { searchParams } = new URL(req.url);
  const db = supabaseAdmin();

  try {
    const filas = await construirReporteLetras(db, {
      estado: searchParams.get('estado'),
      cliente_ruc: searchParams.get('cliente_ruc'),
      desde: searchParams.get('desde'),
      hasta: searchParams.get('hasta'),
    });
    return NextResponse.json({ filas }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
