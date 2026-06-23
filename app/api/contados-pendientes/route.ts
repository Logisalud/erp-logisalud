export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('v_saldos')
    .select('id, comprobante, fecha_emision, cliente_ruc, razon_social, vendedor_nombre, vendedor_codigo, zona_nombre, moneda, importe_total, total_pagado, saldo_pendiente, dias_retraso, rango_vencimiento, forma_pago, contado_pendiente')
    .eq('forma_pago', 'CONTADO')
    .eq('contado_pendiente', true)
    .order('fecha_emision', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documentos: data ?? [] }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
