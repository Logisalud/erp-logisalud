export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Confirma la conciliación de un movimiento con una factura: registra el pago
// (monto y fecha del banco, referencia = N° de operación) y enlaza el movimiento.
export async function POST(req: NextRequest) {
  const { movimiento_id, documento_id } = await req.json();
  if (!movimiento_id || !documento_id)
    return NextResponse.json({ error: 'movimiento_id y documento_id son requeridos' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: mov } = await db
    .from('movimientos_banco_import')
    .select('id, fecha, monto, operacion_numero, estado_conciliacion, clasificacion')
    .eq('id', movimiento_id)
    .single();
  if (!mov) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 });
  if (mov.clasificacion !== 'cobro') return NextResponse.json({ error: 'Solo los cobros se pueden conciliar' }, { status: 400 });
  if (mov.estado_conciliacion === 'conciliado') return NextResponse.json({ error: 'Este movimiento ya está conciliado' }, { status: 409 });

  const monto = Number(mov.monto);
  if (monto <= 0) return NextResponse.json({ error: 'El monto del cobro debe ser mayor a 0' }, { status: 400 });

  // La factura no debe tener letras (esas se pagan marcando la letra).
  const { data: saldoRow } = await db.from('v_saldos').select('tiene_letras').eq('id', documento_id).single();
  if (saldoRow?.tiene_letras)
    return NextResponse.json({ error: 'Esta factura tiene letras. Regístrala marcando la letra correspondiente.' }, { status: 400 });

  // Guarda anti-duplicado: no re-insertar un pago idéntico (mismo doc, monto, tipo)
  // creado en los últimos 30 s.
  const hace30s = new Date(Date.now() - 30_000).toISOString();
  const { data: dup } = await db.from('pagos').select('id')
    .eq('documento_id', documento_id).eq('tipo', 'pago').eq('monto', monto)
    .gte('created_at', hace30s).limit(1);
  if (dup && dup.length)
    return NextResponse.json({ error: 'Pago duplicado detectado (mismo monto en los últimos segundos).' }, { status: 409 });

  // Registrar el pago
  const { data: pago, error: errPago } = await db.from('pagos').insert({
    documento_id,
    monto,
    fecha_pago: mov.fecha,
    referencia: mov.operacion_numero ?? null,
    voucher_path: null,
    tipo: 'pago',
  }).select('id').single();
  if (errPago) return NextResponse.json({ error: errPago.message }, { status: 500 });

  // Enlazar el movimiento
  const { error: errMov } = await db.from('movimientos_banco_import')
    .update({ estado_conciliacion: 'conciliado', pago_id: pago.id, conciliado_en: new Date().toISOString() })
    .eq('id', movimiento_id);
  if (errMov) return NextResponse.json({ error: errMov.message }, { status: 500 });

  return NextResponse.json({ ok: true, pago_id: pago.id }, { headers: { 'Cache-Control': 'no-store' } });
}
