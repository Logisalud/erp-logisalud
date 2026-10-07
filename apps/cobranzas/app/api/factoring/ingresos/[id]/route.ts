export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_BORRADO } from '@/lib/autorizacion';

// Anular un ingreso: borra los pagos reales que creó (el saldo de cada
// factura vuelve) y marca el ingreso como anulado, con su motivo — mismo
// criterio que anular un pago normal: no se borra el registro, se corrige.
// Solo admin (AREAS_BORRADO), porque le devuelve saldo pendiente a facturas
// que ya se daban por cobradas.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirArea(AREAS_BORRADO);
  if (!auth.ok) return auth.respuesta;

  const body = await req.json() as { anulado_motivo?: string };
  if (!body.anulado_motivo?.trim())
    return NextResponse.json({ error: 'Indica el motivo de la anulación' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: facturas, error: errFacturas } = await db
    .from('factoring_ingreso_facturas')
    .select('pago_id')
    .eq('ingreso_id', params.id);
  if (errFacturas) return NextResponse.json({ error: errFacturas.message }, { status: 500 });

  const pagoIds = (facturas ?? []).map(f => f.pago_id).filter((id): id is string => !!id);
  if (pagoIds.length > 0) {
    const { error: errDelete } = await db.from('pagos').delete().in('id', pagoIds);
    if (errDelete) return NextResponse.json({ error: errDelete.message }, { status: 500 });
  }

  const { data, error } = await db
    .from('factoring_ingresos')
    .update({ anulado: true, anulado_motivo: body.anulado_motivo.trim(), anulado_en: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ingreso: data });
}
