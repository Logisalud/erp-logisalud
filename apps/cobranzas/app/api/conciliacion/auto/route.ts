export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_ESCRITURA } from '@/lib/autorizacion';

// Auto-concilia los cobros cuyo N° de operación bancaria coincide con la
// referencia de un pago ya registrado. Solo detecta y enlaza; no crea pagos.
export async function POST() {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  const db = supabaseAdmin();

  const pendientes = await fetchAll<{ id: string; operacion_numero: string | null }>((from, to) =>
    db.from('movimientos_banco_import')
      .select('id, operacion_numero')
      .eq('clasificacion', 'cobro')
      .eq('estado_conciliacion', 'pendiente')
      .not('operacion_numero', 'is', null)
      .range(from, to)
  );

  const ops = Array.from(new Set(pendientes.map(p => p.operacion_numero).filter(Boolean))) as string[];
  if (ops.length === 0) return NextResponse.json({ conciliados: 0 });

  // Pago (primero por antigüedad) por cada referencia = n° de operación.
  const pagoPorRef = new Map<string, string>();
  for (let i = 0; i < ops.length; i += 300) {
    const { data } = await db
      .from('pagos')
      .select('id, referencia, created_at')
      .in('referencia', ops.slice(i, i + 300))
      .order('created_at', { ascending: true });
    for (const p of data ?? []) {
      if (p.referencia && !pagoPorRef.has(p.referencia)) pagoPorRef.set(p.referencia, p.id);
    }
  }

  let conciliados = 0;
  const pagosConfirmados: string[] = [];
  const ahora = new Date().toISOString();
  for (const m of pendientes) {
    const pagoId = m.operacion_numero ? pagoPorRef.get(m.operacion_numero) : undefined;
    if (!pagoId) continue;
    const { error } = await db
      .from('movimientos_banco_import')
      .update({ estado_conciliacion: 'conciliado', pago_id: pagoId, conciliado_en: ahora })
      .eq('id', m.id);
    if (!error) { conciliados++; pagosConfirmados.push(pagoId); }
  }

  // El match exacto por N° de operación contra el extracto es la confirmación
  // bancaria: el pago pasa de pendiente_confirmar a confirmado.
  if (pagosConfirmados.length > 0) {
    await db
      .from('pagos')
      .update({ estado_verificacion: 'confirmado', confirmado_en: ahora })
      .in('id', pagosConfirmados);
  }

  return NextResponse.json({ conciliados }, { headers: { 'Cache-Control': 'no-store' } });
}
