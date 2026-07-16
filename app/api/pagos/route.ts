export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const documento_id = new URL(req.url).searchParams.get('documento_id');
  if (!documento_id)
    return NextResponse.json({ error: 'documento_id requerido' }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('pagos')
    .select('*')
    .eq('documento_id', documento_id)
    .order('fecha_pago', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pagos: data ?? [] }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { documento_id, monto, fecha_pago, referencia, voucher_path, retencion, solo_retencion } = body as {
    documento_id: string;
    monto: number;
    fecha_pago: string;
    referencia?: string;
    voucher_path?: string;
    retencion?: number;      // monto de retención de IGV (3%), opcional
    solo_retencion?: boolean; // si true, inserta SOLO la retención (el pago ya existe)
  };

  if (!documento_id || !monto || !fecha_pago)
    return NextResponse.json(
      { error: 'documento_id, monto y fecha_pago son requeridos' },
      { status: 400 }
    );
  if (Number(monto) <= 0)
    return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 });
  if (retencion !== undefined && Number(retencion) < 0)
    return NextResponse.json({ error: 'La retención no puede ser negativa' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: saldoRow } = await db
    .from('v_saldos')
    .select('tiene_letras')
    .eq('id', documento_id)
    .single();

  if (saldoRow?.tiene_letras)
    return NextResponse.json(
      { error: 'Esta factura tiene letras. Paga marcando la letra correspondiente.' },
      { status: 400 }
    );

  // Sin límite de monto: v_cobros ya usa GREATEST(0,...) para que el saldo no baje de cero

  // Guarda anti-duplicado: rechaza una fila idéntica (mismo documento, mismo
  // monto, mismo tipo) creada en los últimos 30 s (protege contra doble envío).
  const hace30s = new Date(Date.now() - 30_000).toISOString();
  const esDuplicadoReciente = async (montoRow: number, tipoRow: 'pago' | 'retencion') => {
    const { data } = await db
      .from('pagos')
      .select('id')
      .eq('documento_id', documento_id)
      .eq('tipo', tipoRow)
      .eq('monto', montoRow)
      .gte('created_at', hace30s)
      .limit(1);
    return !!(data && data.length);
  };

  // Caso "solo retención": el depósito ya se registró antes y solo falta el 3%.
  // Inserta UNA fila tipo='retencion' por 'monto', sin registrar ningún pago.
  if (solo_retencion) {
    if (await esDuplicadoReciente(Number(monto), 'retencion'))
      return NextResponse.json({ error: 'Retención duplicada detectada (mismo monto en los últimos segundos). No se registró de nuevo.' }, { status: 409 });
    const { data, error } = await db
      .from('pagos')
      .insert({
        documento_id,
        monto: Number(monto),
        fecha_pago,
        referencia: 'Retención IGV 3%',
        voucher_path: null,
        tipo: 'retencion',
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pagos: [data], pago: data });
  }

  if (await esDuplicadoReciente(Number(monto), 'pago'))
    return NextResponse.json({ error: 'Pago duplicado detectado (mismo monto en los últimos segundos). No se registró de nuevo.' }, { status: 409 });

  // El pago real + (opcional) la retención de IGV se insertan juntos: ambos
  // suman en pagos y llevan la factura a saldo 0. La retención se distingue
  // por tipo='retencion' para el desglose y la trazabilidad.
  const rows: Record<string, unknown>[] = [{
    documento_id,
    monto: Number(monto),
    fecha_pago,
    referencia: referencia ?? null,
    voucher_path: voucher_path ?? null,
    tipo: 'pago',
  }];
  if (retencion !== undefined && Number(retencion) > 0) {
    rows.push({
      documento_id,
      monto: Number(retencion),
      fecha_pago,
      referencia: 'Retención IGV 3%',
      voucher_path: null,
      tipo: 'retencion',
    });
  }

  const { data, error } = await db.from('pagos').insert(rows).select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pagos: data, pago: data?.[0] });
}
