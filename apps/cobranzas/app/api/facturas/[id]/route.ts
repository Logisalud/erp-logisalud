export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('v_saldos')
    .select(
      'id, comprobante, cliente_ruc, razon_social, fecha_emision, fecha_vencimiento, ' +
      'importe_total, total_nc, total_nd, total_pagado, saldo_pendiente, ' +
      'rango_vencimiento, tiene_letras, forma_pago, contado_pendiente'
    )
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ factura: data }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
