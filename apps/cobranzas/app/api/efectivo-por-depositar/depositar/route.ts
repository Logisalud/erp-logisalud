export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Marca un pago en efectivo como depositado. Cualquiera con acceso al ERP
// puede hacer este cambio — no hay restricción de rol (no existe login).
export async function POST(req: NextRequest) {
  const { pago_id, fecha_deposito, voucher_deposito_path, referencia } = await req.json() as {
    pago_id: string; fecha_deposito: string; voucher_deposito_path?: string; referencia?: string;
  };
  if (!pago_id || !fecha_deposito)
    return NextResponse.json({ error: 'pago_id y fecha_deposito son requeridos' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: pago } = await db
    .from('pagos')
    .select('id, medio_cobro, estado_efectivo')
    .eq('id', pago_id)
    .single();

  if (!pago) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
  if (pago.medio_cobro !== 'efectivo' || pago.estado_efectivo !== 'cobrado_por_depositar')
    return NextResponse.json({ error: 'Este pago no está pendiente de depositar' }, { status: 400 });

  const { error } = await db
    .from('pagos')
    .update({
      estado_efectivo: 'depositado',
      fecha_deposito,
      ...(voucher_deposito_path ? { voucher_deposito_path } : {}),
      // Mismo campo `referencia` que usa cualquier pago por transferencia —
      // acá guarda el N° de operación del depósito bancario del efectivo,
      // para que la conciliación bancaria lo pueda cruzar exacto igual que
      // a cualquier otro pago (ver app/api/conciliacion/auto/route.ts).
      ...(referencia?.trim() ? { referencia: referencia.trim() } : {}),
    })
    .eq('id', pago_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
