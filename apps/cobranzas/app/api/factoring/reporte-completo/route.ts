export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { construirReporteFactoringCompleto } from '@/lib/factoring';

/**
 * El reporteador de factoring, espejo del de letras.
 *
 * Es otra ruta y no un parámetro de `/api/factoring/reporte` porque esa
 * contesta otra pregunta —qué facturas están esperando el ingreso al
 * banco— y la usa el tab de la pantalla de factoring. Esta contesta "qué
 * pasó por factoring", incluidas las ya cobradas y las anuladas.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const { searchParams } = new URL(req.url);
  const db = supabaseAdmin();

  try {
    const filas = await construirReporteFactoringCompleto(db, {
      cliente_ruc: searchParams.get('cliente_ruc'),
      estado: searchParams.get('estado'),
      desde: searchParams.get('desde'),
      hasta: searchParams.get('hasta'),
    });

    return NextResponse.json({
      filas,
      total: filas.reduce((s, f) => s + f.monto, 0),
      totalRetencion: filas.reduce((s, f) => s + f.retencion, 0),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
