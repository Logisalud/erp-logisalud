export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { construirReporteFactoring } from '@/lib/factoring';

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const cliente_ruc = new URL(req.url).searchParams.get('cliente_ruc');
  const db = supabaseAdmin();

  try {
    const filas = await construirReporteFactoring(db, { cliente_ruc });

    const porCliente = new Map<string, { cliente_ruc: string; razon_social: string; monto: number; documentos: number }>();
    for (const f of filas) {
      const c = porCliente.get(f.cliente_ruc) ?? { cliente_ruc: f.cliente_ruc, razon_social: f.razon_social, monto: 0, documentos: 0 };
      c.monto += f.monto;
      c.documentos += 1;
      porCliente.set(f.cliente_ruc, c);
    }

    return NextResponse.json({
      filas,
      total: filas.reduce((s, f) => s + f.monto, 0),
      porCliente: Array.from(porCliente.values()).sort((a, b) => b.monto - a.monto),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
