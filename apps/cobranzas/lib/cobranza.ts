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

// Rellena con 0 los días del rango sin ningún pago — `computeCobranza`
// devuelve `dias` disperso (solo fechas con cobro real), que alcanza para
// el ranking por vendedor pero no para un reporte "día por día": ahí un día
// flojo (o sin cobros) tiene que verse como una fila en 0, no faltar.
export function diasCompletos(desde: string, hasta: string, dias: DiaItem[]): DiaItem[] {
  const porFecha = new Map(dias.map(d => [d.fecha, d]));
  const [y0, m0, d0] = desde.split('-').map(Number);
  const [y1, m1, d1] = hasta.split('-').map(Number);
  const cursor = new Date(Date.UTC(y0, m0 - 1, d0));
  const fin = new Date(Date.UTC(y1, m1 - 1, d1));
  const out: DiaItem[] = [];
  while (cursor <= fin) {
    const fecha = cursor.toISOString().slice(0, 10);
    out.push(porFecha.get(fecha) ?? { fecha, total: 0, vencido: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function rankingPorVencido(data: CobranzaData): RankItem[] {
  return [...data.ranking].sort((a, b) => b.vencido - a.vencido || b.total - a.total);
}

// Genera un .xlsx (Buffer) con una hoja "por vendedor" por cada sección dada,
// y opcionalmente una hoja día por día (para el acumulado del mes en el
// reporte diario — el ranking por vendedor no sirve ahí, se quiere ver la
// evolución día a día).
export function buildCobranzaXlsx(
  secciones: { nombre: string; data: CobranzaData }[],
  diasSeccion?: { nombre: string; data: CobranzaData },
): Buffer {
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
  if (diasSeccion) {
    const filas = diasSeccion.data.dias.map(d => ({
      'Fecha': d.fecha,
      'Cobrado': d.total,
      'De lo Vencido': d.vencido,
      'Al Día': d.total - d.vencido,
    }));
    const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ 'Fecha': '', 'Cobrado': 0, 'De lo Vencido': 0, 'Al Día': 0 }]);
    ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    if (filas.length) {
      const totalCobrado = filas.reduce((s, f) => s + f['Cobrado'], 0);
      const totalVencido = filas.reduce((s, f) => s + f['De lo Vencido'], 0);
      XLSX.utils.sheet_add_json(ws, [{ 'Fecha': 'TOTAL', 'Cobrado': totalCobrado, 'De lo Vencido': totalVencido, 'Al Día': totalCobrado - totalVencido }], {
        header: Object.keys(filas[0]), skipHeader: true, origin: -1,
      });
    }
    XLSX.utils.book_append_sheet(wb, ws, diasSeccion.nombre.slice(0, 31));
  }
  const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return raw;
}
