export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { construirFasesCobranza } from '@/lib/fasesCobranza';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const params = new URL(req.url).searchParams;
  const fechaCorteParam = params.get('fecha_corte');
  const fechaCorte = fechaCorteParam && FECHA_RE.test(fechaCorteParam)
    ? fechaCorteParam
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

  const vendedor = params.get('vendedor')?.trim().toLowerCase() || null;

  const db = supabaseAdmin();
  try {
    const reporte = await construirFasesCobranza(db, fechaCorte);
    if (vendedor) {
      reporte.clientes = reporte.clientes.filter(c => c.vendedores.toLowerCase().includes(vendedor));
    }
    return NextResponse.json(reporte, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
