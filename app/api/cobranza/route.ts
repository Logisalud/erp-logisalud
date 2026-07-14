export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

// Panel de cobranza (doble lectura). Por cada pago real (tipo='pago') en el
// rango, se enlaza a su factura y vendedor y se marca si al pagar la factura
// ya estaba vencida (fecha_pago > fecha_vencimiento). Solo lectura.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde')?.trim() ?? '';
  const hasta = searchParams.get('hasta')?.trim() ?? '';
  if (!desde || !hasta) return NextResponse.json({ error: 'desde y hasta requeridos' }, { status: 400 });

  const db = supabaseAdmin();

  const pagos = await fetchAll<{ documento_id: string; monto: number; fecha_pago: string }>((from, to) =>
    db.from('pagos')
      .select('documento_id, monto, fecha_pago')
      .eq('tipo', 'pago')
      .gte('fecha_pago', desde)
      .lte('fecha_pago', hasta)
      .range(from, to)
  );

  const docIds = Array.from(new Set(pagos.map(p => p.documento_id)));
  const docMap = new Map<string, { cliente_ruc: string; fecha_vencimiento: string | null }>();
  for (let i = 0; i < docIds.length; i += 500) {
    const { data } = await db
      .from('documentos')
      .select('id, cliente_ruc, fecha_vencimiento')
      .in('id', docIds.slice(i, i + 500));
    for (const d of data ?? []) docMap.set(d.id, { cliente_ruc: d.cliente_ruc, fecha_vencimiento: d.fecha_vencimiento });
  }

  const rucs = Array.from(new Set([...docMap.values()].map(d => d.cliente_ruc)));
  const vendedorPorRuc = new Map<string, string | null>();
  for (let i = 0; i < rucs.length; i += 500) {
    const { data } = await db.from('clientes').select('ruc, vendedor_actual_id').in('ruc', rucs.slice(i, i + 500));
    for (const c of data ?? []) vendedorPorRuc.set(c.ruc, c.vendedor_actual_id);
  }

  const vendedores = await fetchAll<{ id: string; nombres: string; apellidos: string | null; codigo: string | null }>((from, to) =>
    db.from('vendedores').select('id, nombres, apellidos, codigo').range(from, to)
  );
  const vendMap = new Map(vendedores.map(v => [v.id, { nombre: `${v.nombres} ${v.apellidos ?? ''}`.trim(), codigo: v.codigo }]));

  let totalCobrado = 0, totalVencido = 0;
  const porVendedor = new Map<string, { vendedor_id: string; nombre: string; codigo: string | null; total: number; vencido: number; alDia: number; nCobros: number }>();
  const porDia = new Map<string, { fecha: string; total: number; vencido: number }>();
  const SIN_VEND = '__sin__';

  for (const p of pagos) {
    const monto = Number(p.monto) || 0;
    const doc = docMap.get(p.documento_id);
    const venc = doc?.fecha_vencimiento ?? null;
    const fueVencido = !!venc && p.fecha_pago > venc;
    const vid = (doc ? vendedorPorRuc.get(doc.cliente_ruc) : null) ?? SIN_VEND;

    totalCobrado += monto;
    if (fueVencido) totalVencido += monto;

    let pv = porVendedor.get(vid);
    if (!pv) {
      const info = vid === SIN_VEND ? { nombre: 'Sin vendedor', codigo: null } : (vendMap.get(vid) ?? { nombre: 'Desconocido', codigo: null });
      pv = { vendedor_id: vid, nombre: info.nombre, codigo: info.codigo, total: 0, vencido: 0, alDia: 0, nCobros: 0 };
      porVendedor.set(vid, pv);
    }
    pv.total += monto;
    pv.nCobros++;
    if (fueVencido) pv.vencido += monto; else pv.alDia += monto;

    let pd = porDia.get(p.fecha_pago);
    if (!pd) { pd = { fecha: p.fecha_pago, total: 0, vencido: 0 }; porDia.set(p.fecha_pago, pd); }
    pd.total += monto;
    if (fueVencido) pd.vencido += monto;
  }

  const ranking = [...porVendedor.values()].sort((a, b) => b.total - a.total);
  const dias = [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));

  return NextResponse.json({
    desde, hasta,
    totalCobrado,
    totalVencido,
    totalAlDia: totalCobrado - totalVencido,
    pctVencido: totalCobrado > 0 ? Math.round(totalVencido / totalCobrado * 100) : 0,
    nCobros: pagos.length,
    ranking,
    dias,
  }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
