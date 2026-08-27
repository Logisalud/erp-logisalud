export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_BORRADO, AREAS_ESCRITURA } from '@/lib/autorizacion';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  const body = await req.json() as {
    monto?: number;
    fecha_pago?: string;
    referencia?: string | null;
    voucher_path?: string;
    registrado_por?: string | null;
  };

  if (body.monto !== undefined && Number(body.monto) <= 0)
    return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 });

  const db = supabaseAdmin();
  const update: Record<string, unknown> = {};
  if (body.monto      !== undefined) update.monto       = Number(body.monto);
  if (body.fecha_pago !== undefined) update.fecha_pago  = body.fecha_pago;
  if ('referencia'     in body)      update.referencia  = body.referencia ?? null;
  if (body.voucher_path !== undefined) update.voucher_path = body.voucher_path;
  // Corrige la atribución si quedó mal (p. ej. dos personas comparten
  // computadora y el campo autocompletado por localStorage quedó con el
  // nombre de la persona anterior).
  if ('registrado_por' in body) update.registrado_por = body.registrado_por?.trim() || null;

  const { data, error } = await db
    .from('pagos')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pago: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await exigirArea(AREAS_BORRADO);
  if (!auth.ok) return auth.respuesta;

  const db = supabaseAdmin();
  const { error } = await db.from('pagos').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
