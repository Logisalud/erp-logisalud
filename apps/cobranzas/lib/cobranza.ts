import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from '@/lib/fetchAll';

export interface RankItem {
  vendedor_id: string; nombre: string; codigo: string | null;
  total: number; vencido: number; alDia: number; nCobros: number;
}
export interface DiaItem { fecha: string; total: number; vencido: number; }
export interface CobranzaData {
  desde: string; hasta: string;
  totalCobrado: number; totalVencido: number; totalAlDia: number;
  pctVencido: number; nCobros: number;
  ranking: RankItem[]; dias: DiaItem[];
}

const SIN_VEND = '__sin__';

// Cobranza del rango: por cada pago real (tipo='pago'), enlaza a su factura y
// vendedor y marca si al pagar la factura ya estaba vencida. Solo lectura.
//
// Recibe el cliente de Supabase en vez de crear el suyo: lo llaman tanto
// /api/cobranza (sesión del usuario, sujeta a RLS) como el cron de reporte
// diario (sin sesión, tiene que ser service role) — cada caller decide cuál
// le corresponde, esta función no asume ninguno de los dos.
export async function computeCobranza(db: SupabaseClient, desde: string, hasta: string): Promise<CobranzaData> {
  const pagos = await fetchAll<{ documento_id: string; monto: number; fecha_pago: string }>((from, to) =>
    db.from('pagos').select('documento_id, monto, fecha_pago').eq('tipo', 'pago')
      .gte('fecha_pago', desde).lte('fecha_pago', hasta).range(from, to)
  );

  const docIds = Array.from(new Set(pagos.map(p => p.documento_id)));
  const docMap = new Map<string, { cliente_ruc: string; fecha_vencimiento: string | null }>();
  for (let i = 0; i < docIds.length; i += 500) {
    const { data } = await db.from('documentos').select('id, cliente_ruc, fecha_vencimiento').in('id', docIds.slice(i, i + 500));
    for (const d of data ?? []) docMap.set(d.id, { cliente_ruc: d.cliente_ruc, fecha_vencimiento: d.fecha_vencimiento });
  }
  const rucs = Array.from(new Set([...docMap.values()].map(d => d.cliente_ruc)));
  const vendedorPorRuc = new Map<string, string | null>();
  for (let i = 0; i < rucs.length; i += 500) {
    const { data } = await db.from('clientes').select('ruc, vendedor_actual_id').in('ruc', rucs.slice(i, i + 500));
    for (const c of data ?? []) vendedorPorRuc.set(c.ruc, c.vendedor_actual_id);
  }
  const vendedores = await fetchAll<{ id: string; nombres: string; apellidos: string | null; codigo: string | null }>((from, to) =>
    db.from('vendedores').select('id, nombres, apellidos, codigo').range(from, to));
  const vendMap = new Map(vendedores.map(v => [v.id, { nombre: `${v.nombres} ${v.apellidos ?? ''}`.trim(), codigo: v.codigo }]));

  let totalCobrado = 0, totalVencido = 0;
  const porVendedor = new Map<string, RankItem>();
  const porDia = new Map<string, DiaItem>();

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
    pv.total += monto; pv.nCobros++;
    if (fueVencido) pv.vencido += monto; else pv.alDia += monto;

    let pd = porDia.get(p.fecha_pago);
    if (!pd) { pd = { fecha: p.fecha_pago, total: 0, vencido: 0 }; porDia.set(p.fecha_pago, pd); }
    pd.total += monto; if (fueVencido) pd.vencido += monto;
  }

  return {
    desde, hasta, totalCobrado, totalVencido,
    totalAlDia: totalCobrado - totalVencido,
    pctVencido: totalCobrado > 0 ? Math.round(totalVencido / totalCobrado * 100) : 0,
    nCobros: pagos.length,
    ranking: [...porVendedor.values()].sort((a, b) => b.total - a.total),
    dias: [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

export function rankingPorVencido(data: CobranzaData): RankItem[] {
  return [...data.ranking].sort((a, b) => b.vencido - a.vencido || b.total - a.total);
}

// Genera un .xlsx (Buffer) con una hoja "por vendedor" por cada sección dada.
export function buildCobranzaXlsx(secciones: { nombre: string; data: CobranzaData }[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of secciones) {
    const filas = rankingPorVencido(s.data).map((v, i) => ({
      'Pos': i + 1,
      'Vendedor': v.codigo ? `${v.nombre} (${v.codigo})` : v.nombre,
      'De lo Vencido': v.vencido,
      'Cobranza Total': v.total,
      'Al Día': v.alDia,
      'N° Cobros': v.nCobros,
    }));
    const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ 'Pos': '', 'Vendedor': 'Sin cobros', 'De lo Vencido': 0, 'Cobranza Total': 0, 'Al Día': 0, 'N° Cobros': 0 }]);
    ws['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 13 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, s.nombre.slice(0, 31));
  }
  const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return raw;
}
