export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_BORRADO } from '@/lib/autorizacion';

// Anular una operación de factoring: las facturas vuelven a la cartera
// (v_cobros deja de verlas como saldadas) sin borrar el registro — queda
// visible con su motivo, igual que un pago mal cargado no se borra, se
// corrige. Requiere AREAS_BORRADO: deshacer un factoring le devuelve saldo
// pendiente a facturas que un vendedor puede llevar rato sin ver en su
// cartera, así que es una decisión de admin, no de un PATCH cualquiera.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirArea(AREAS_BORRADO);
  if (!auth.ok) return auth.respuesta;

  const body = await req.json() as { anulada_motivo?: string };
  if (!body.anulada_motivo?.trim())
    return NextResponse.json({ error: 'Indica el motivo de la anulación' }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('factoring_operaciones')
    .update({ anulada: true, anulada_motivo: body.anulada_motivo.trim(), anulada_en: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ operacion: data });
}
