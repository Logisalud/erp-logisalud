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
  return NextResponse.json({ pagos: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { documento_id, monto, fecha_pago, referencia, voucher_path } = body as {
    documento_id: string;
    monto: number;
    fecha_pago: string;
    referencia?: string;
    voucher_path: string;
  };

  if (!documento_id || !monto || !fecha_pago || !voucher_path)
    return NextResponse.json(
      { error: 'documento_id, monto, fecha_pago y voucher son requeridos' },
      { status: 400 }
    );
  if (Number(monto) <= 0)
    return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: saldoRow } = await db
    .from('v_saldos')
    .select('saldo_pendiente, tiene_letras')
    .eq('id', documento_id)
    .single();

  if (saldoRow?.tiene_letras)
    return NextResponse.json(
      { error: 'Esta factura tiene letras. Paga marcando la letra correspondiente.' },
      { status: 400 }
    );

  if (saldoRow && Number(monto) > Number(saldoRow.saldo_pendiente) + 0.01)
    return NextResponse.json(
      { error: `El monto (S/ ${Number(monto).toFixed(2)}) supera el saldo pendiente (S/ ${Number(saldoRow.saldo_pendiente).toFixed(2)}).` },
      { status: 400 }
    );

  const { data, error } = await db
    .from('pagos')
    .insert({
      documento_id,
      monto: Number(monto),
      fecha_pago,
      referencia: referencia ?? null,
      voucher_path,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pago: data });
}
