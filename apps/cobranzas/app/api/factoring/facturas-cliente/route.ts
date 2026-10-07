export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { documentosEnFactoringActivo } from '@/lib/factoring';

// Facturas de un cliente con saldo pendiente, marcando cuáles ya están
// "en_factoring" (canje activo). Sirve para los dos pickers de la pantalla:
// Parte 1 (canjear) muestra las que NO están en_factoring, Parte 2
// (ingreso al banco) muestra solo las que SÍ lo están.
export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const cliente_ruc = new URL(req.url).searchParams.get('cliente_ruc')?.trim();
  if (!cliente_ruc) return NextResponse.json({ error: 'cliente_ruc requerido' }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('v_saldos')
    .select('id, comprobante, fecha_vencimiento, saldo_pendiente, tiene_letras')
    .eq('cliente_ruc', cliente_ruc)
    .gt('saldo_pendiente', 0.005)
    .order('fecha_vencimiento');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enFactoring = await documentosEnFactoringActivo(db, (data ?? []).map(f => f.id));

  const facturas = (data ?? []).map(f => ({
    id: f.id,
    comprobante: f.comprobante,
    fecha_vencimiento: f.fecha_vencimiento,
    saldo_pendiente: Number(f.saldo_pendiente) || 0,
    tiene_letras: f.tiene_letras,
    en_factoring: enFactoring.has(f.id),
  }));

  return NextResponse.json({ facturas }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
