export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_ESCRITURA } from '@/lib/autorizacion';
import { capturarIndicadoresSnapshot } from '@/lib/capturarIndicadoresSnapshot';

// Backfill manual de indicadores_snapshot para fechas de cierre pasadas —
// no se pudo correr desde esta sesión (no hay forma de autenticarse
// contra el preview de Vercel sin credenciales reales). Disparar una vez
// desplegado, logueado como contabilidad/tesorería/admin:
//   POST /api/indicadores-cobranza/backfill
//   body: { "fechas": ["2026-08-31", "2026-09-30", "2026-10-31"] }
export async function POST(req: NextRequest) {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  const body = await req.json().catch(() => ({}));
  const fechas = Array.isArray(body.fechas) ? body.fechas.filter((f: unknown) => typeof f === 'string') : [];
  if (fechas.length === 0) {
    return NextResponse.json({ error: 'Pasa un array "fechas" (YYYY-MM-DD) en el body' }, { status: 400 });
  }

  const resultados = [];
  for (const fecha of fechas) {
    try {
      const r = await capturarIndicadoresSnapshot(fecha, 'backfill');
      resultados.push({ fecha, ok: true, filas: r.filas });
    } catch (err) {
      resultados.push({ fecha, ok: false, error: String(err instanceof Error ? err.message : err) });
    }
  }

  return NextResponse.json({ resultados });
}
