export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface PagoRow {
  id: string;
  documento_id: string;
  monto: number;
  fecha_pago: string;
  created_at: string;
  registrado_por: string | null;
  voucher_path: string | null;
  voucher_deposito_path: string | null;
  estado_efectivo: 'cobrado_por_depositar' | 'depositado';
  fecha_deposito: string | null;
  documentos: {
    serie: string;
    numero: number;
    cliente_ruc: string;
    clientes: { razon_social: string } | null;
  } | null;
}

// Pagos en efectivo. Por defecto solo los que faltan llevar al banco; con
// ?depositados=1 también incluye los ya depositados (para ver su historial
// y voucher de depósito, no solo mientras están pendientes). No toca
// conciliación ni saldos: el pago ya está registrado y la factura ya bajó
// de saldo — esto es solo trazabilidad de dónde está físicamente esa plata.
export async function GET(req: NextRequest) {
  const incluirDepositados = new URL(req.url).searchParams.get('depositados') === '1';
  const db = supabaseAdmin();

  let query = db
    .from('pagos')
    .select(`
      id, documento_id, monto, fecha_pago, created_at, registrado_por,
      voucher_path, voucher_deposito_path, estado_efectivo, fecha_deposito,
      documentos:documento_id ( serie, numero, cliente_ruc, clientes:cliente_ruc ( razon_social ) )
    `)
    .eq('medio_cobro', 'efectivo')
    .order('fecha_pago', { ascending: true });

  query = incluirDepositados
    ? query.in('estado_efectivo', ['cobrado_por_depositar', 'depositado'])
    : query.eq('estado_efectivo', 'cobrado_por_depositar');

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hoy = Date.now();
  const filas = ((data ?? []) as unknown as PagoRow[]).map(p => ({
    id: p.id,
    documento_id: p.documento_id,
    comprobante: p.documentos ? `${p.documentos.serie}-${p.documentos.numero}` : '—',
    cliente_ruc: p.documentos?.cliente_ruc ?? null,
    razon_social: p.documentos?.clientes?.razon_social ?? '—',
    monto: p.monto,
    fecha_pago: p.fecha_pago,
    registrado_por: p.registrado_por,
    voucher_path: p.voucher_path,
    voucher_deposito_path: p.voucher_deposito_path,
    estado_efectivo: p.estado_efectivo,
    fecha_deposito: p.fecha_deposito,
    dias_sin_depositar: p.estado_efectivo === 'cobrado_por_depositar'
      ? Math.floor((hoy - new Date(p.fecha_pago).getTime()) / 86_400_000)
      : null,
  }));

  const pendientes = filas.filter(f => f.estado_efectivo === 'cobrado_por_depositar');

  return NextResponse.json(
    { filas, total: pendientes.reduce((s, f) => s + Number(f.monto), 0) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
