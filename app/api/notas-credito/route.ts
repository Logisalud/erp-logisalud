export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

export interface NcFila {
  id: string;
  comprobante: string;
  fecha_emision: string;
  cliente_ruc: string;
  razon_social: string;
  factura_relacionada: string | null;
  importe_total: number;
}

// Todas las NC del sistema como lista propia, para análisis/auditoría — no
// ligado a mirar una factura a la vez. Solo lectura, no toca v_saldos/v_cobros.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde')?.trim() ?? '';
  const hasta = searchParams.get('hasta')?.trim() ?? '';
  const cliente = searchParams.get('cliente')?.trim() ?? '';

  const db = supabaseAdmin();

  const ncs = await fetchAll<{
    id: string; serie: string; numero: number; fecha_emision: string;
    cliente_ruc: string; importe_total: number; documento_relacionado_id: string | null;
  }>((from, to) => {
    let q = db
      .from('documentos')
      .select('id, serie, numero, fecha_emision, cliente_ruc, importe_total, documento_relacionado_id')
      .eq('tipo', '07')
      .eq('anulado', false)
      .order('fecha_emision', { ascending: false });
    if (desde) q = q.gte('fecha_emision', desde);
    if (hasta) q = q.lte('fecha_emision', hasta);
    return q.range(from, to);
  });

  const rucs = Array.from(new Set(ncs.map(n => n.cliente_ruc)));
  const clienteMap = new Map<string, string>();
  for (let i = 0; i < rucs.length; i += 500) {
    const { data } = await db.from('clientes').select('ruc, razon_social').in('ruc', rucs.slice(i, i + 500));
    for (const c of data ?? []) clienteMap.set(c.ruc, c.razon_social);
  }

  const facturaIds = Array.from(new Set(ncs.map(n => n.documento_relacionado_id).filter(Boolean))) as string[];
  const facturaMap = new Map<string, string>();
  for (let i = 0; i < facturaIds.length; i += 500) {
    const { data } = await db.from('documentos').select('id, serie, numero').in('id', facturaIds.slice(i, i + 500));
    for (const f of data ?? []) facturaMap.set(f.id, `${f.serie}-${f.numero}`);
  }

  // Si buscan por nombre (no coincide con RUC), filtramos por razón social en memoria.
  let filas: NcFila[] = ncs.map(n => ({
    id: n.id,
    comprobante: `${n.serie}-${n.numero}`,
    fecha_emision: n.fecha_emision,
    cliente_ruc: n.cliente_ruc,
    razon_social: clienteMap.get(n.cliente_ruc) ?? '',
    factura_relacionada: n.documento_relacionado_id ? (facturaMap.get(n.documento_relacionado_id) ?? null) : null,
    importe_total: Number(n.importe_total) || 0,
  }));

  if (cliente) {
    const q = cliente.toLowerCase();
    filas = filas.filter(f => f.cliente_ruc.includes(cliente) || f.razon_social.toLowerCase().includes(q));
  }

  return NextResponse.json(
    { filas, total: filas.reduce((s, f) => s + f.importe_total, 0) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
