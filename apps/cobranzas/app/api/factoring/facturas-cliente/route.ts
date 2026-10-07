export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { documentosEnFactoringActivo, documentosPendientesDeIngreso } from '@/lib/factoring';

// Facturas de un cliente con saldo pendiente, con dos flags:
// - en_canje_activo: tiene un canje a factoring activo (ingresado o no) —
//   Parte 1 (canjear) oculta/deshabilita estas, no se puede canjear dos
//   veces la misma factura.
// - en_factoring: tiene un canje activo Y TODAVÍA no tuvo su ingreso al
//   banco — Parte 2 (ingreso al banco) muestra solo estas, con
//   monto_canje (el valor acordado a factorizar, no siempre el
//   saldo_pendiente completo).
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

  const ids = (data ?? []).map(f => f.id);
  const [enCanjeActivo, pendientesDeIngreso] = await Promise.all([
    documentosEnFactoringActivo(db, ids),
    documentosPendientesDeIngreso(db, ids),
  ]);

  const facturas = (data ?? []).map(f => ({
    id: f.id,
    comprobante: f.comprobante,
    fecha_vencimiento: f.fecha_vencimiento,
    saldo_pendiente: Number(f.saldo_pendiente) || 0,
    tiene_letras: f.tiene_letras,
    en_canje_activo: enCanjeActivo.has(f.id),
    en_factoring: pendientesDeIngreso.has(f.id),
    monto_canje: pendientesDeIngreso.get(f.id) ?? null,
  }));

  return NextResponse.json({ facturas }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
