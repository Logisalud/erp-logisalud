export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

// Solo las cuentas marcadas visible_en_cobros: hoy CF010 (BCP Soles 1) y
// CF005 (Interbank Soles, incluye Yape/Plin). CF003 y CF004 existen en la
// tabla pero no se muestran aún — no se usan para cobranza de distribución.
export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('cuentas_bancarias')
    .select('codigo_interno, banco, numero_cuenta')
    .eq('visible_en_cobros', true)
    .order('codigo_interno');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cuentas: data ?? [] });
}
