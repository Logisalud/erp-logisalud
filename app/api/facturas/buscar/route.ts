export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ facturas: [] });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('v_saldos')
    .select(
      'id, comprobante, cliente_ruc, razon_social, fecha_emision, fecha_vencimiento, ' +
      'importe_total, saldo_pendiente, rango_vencimiento, tiene_letras, forma_pago, contado_pendiente'
    )
    .or(`comprobante.ilike.%${q}%,cliente_ruc.ilike.%${q}%,razon_social.ilike.%${q}%`)
    .order('fecha_emision', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ facturas: data ?? [] }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
