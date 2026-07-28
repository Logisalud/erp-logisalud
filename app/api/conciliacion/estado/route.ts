export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Cambia el estado de conciliación de un movimiento (sin tocar pagos):
//  - descartar:    pendiente -> descartado
//  - reactivar:    descartado -> pendiente
//  - desconciliar: conciliado -> pendiente (solo desenlaza; el pago NO se borra)
export async function POST(req: NextRequest) {
  const { movimiento_id, accion } = await req.json() as { movimiento_id: string; accion: 'descartar' | 'reactivar' | 'desconciliar' };
  if (!movimiento_id || !accion) return NextResponse.json({ error: 'movimiento_id y accion requeridos' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: mov } = await db.from('movimientos_banco_import').select('id, estado_conciliacion, pago_id').eq('id', movimiento_id).single();
  if (!mov) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 });

  let update: Record<string, unknown>;
  if (accion === 'descartar') {
    if (mov.estado_conciliacion !== 'pendiente') return NextResponse.json({ error: 'Solo se descartan movimientos pendientes' }, { status: 400 });
    update = { estado_conciliacion: 'descartado' };
  } else if (accion === 'reactivar') {
    if (mov.estado_conciliacion !== 'descartado') return NextResponse.json({ error: 'Solo se reactivan movimientos descartados' }, { status: 400 });
    update = { estado_conciliacion: 'pendiente' };
  } else if (accion === 'desconciliar') {
    if (mov.estado_conciliacion !== 'conciliado') return NextResponse.json({ error: 'Solo se desconcilian movimientos conciliados' }, { status: 400 });
    // Solo desenlaza; el pago permanece (si hay que anularlo, se elimina en Registrar pago).
    update = { estado_conciliacion: 'pendiente', pago_id: null, conciliado_en: null };
  } else {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  }

  const { error } = await db.from('movimientos_banco_import').update(update).eq('id', movimiento_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
