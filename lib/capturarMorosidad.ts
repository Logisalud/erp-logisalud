import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

// Calcula la morosidad por vendedor desde v_saldos y la guarda (upsert
// idempotente) en morosidad_diaria para la fecha dada. Solo escribe en su tabla.
export async function capturarMorosidad(fecha: string): Promise<{ fecha: string; vendedores: number }> {
  const db = supabaseAdmin();

  const filas = await fetchAll<{
    vendedor_id: string | null; saldo_pendiente: number;
    d1_30: number; d31_60: number; d61_90: number; mas90: number;
  }>((from, to) =>
    db.from('v_saldos')
      .select('vendedor_id, saldo_pendiente, d1_30, d31_60, d61_90, mas90')
      .range(from, to)
  );

  const agg = new Map<string, { total: number; vencido: number; nVencidas: number }>();
  for (const f of filas) {
    if (!f.vendedor_id) continue;
    const vencido = (Number(f.d1_30) || 0) + (Number(f.d31_60) || 0) + (Number(f.d61_90) || 0) + (Number(f.mas90) || 0);
    let a = agg.get(f.vendedor_id);
    if (!a) { a = { total: 0, vencido: 0, nVencidas: 0 }; agg.set(f.vendedor_id, a); }
    a.total += Number(f.saldo_pendiente) || 0;
    a.vencido += vencido;
    if (vencido > 0.005) a.nVencidas++;
  }

  const rows = [...agg.entries()].map(([vendedor_id, a]) => ({
    fecha,
    vendedor_id,
    saldo_total: Math.round(a.total * 100) / 100,
    saldo_vencido: Math.round(a.vencido * 100) / 100,
    pct_morosidad: a.total > 0 ? Math.round(a.vencido / a.total * 100) : 0,
    n_facturas_vencidas: a.nVencidas,
  }));

  if (rows.length > 0) {
    const { error } = await db.from('morosidad_diaria').upsert(rows, { onConflict: 'fecha,vendedor_id' });
    if (error) throw new Error(error.message);
  }

  return { fecha, vendedores: rows.length };
}
