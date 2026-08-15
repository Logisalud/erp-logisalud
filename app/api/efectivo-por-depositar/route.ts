export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface PagoRow {
  id: string;
  documento_id: string;
  monto: number;
  fecha_pago: string;
  created_at: string;
  registrado_por: string | null;
  documentos: {
    serie: string;
    numero: number;
    cliente_ruc: string;
    clientes: { razon_social: string } | null;
  } | null;
}

// Pagos en efectivo aún no llevados al banco. No toca conciliación ni saldos:
// el pago ya está registrado y la factura ya bajó de saldo — esto es solo
// trazabilidad de dónde está físicamente esa plata.
export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('pagos')
    .select(`
      id, documento_id, monto, fecha_pago, created_at, registrado_por,
      documentos:documento_id ( serie, numero, cliente_ruc, clientes:cliente_ruc ( razon_social ) )
    `)
    .eq('medio_cobro', 'efectivo')
    .eq('estado_efectivo', 'cobrado_por_depositar')
    .order('fecha_pago', { ascending: true });

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
    dias_sin_depositar: Math.floor((hoy - new Date(p.fecha_pago).getTime()) / 86_400_000),
  }));

  return NextResponse.json(
    { filas, total: filas.reduce((s, f) => s + Number(f.monto), 0) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
