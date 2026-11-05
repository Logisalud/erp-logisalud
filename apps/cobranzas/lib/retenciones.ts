import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from './fetchAll';

/**
 * La retención de IGV de cada documento, leída de donde siempre vivió.
 *
 * No hay una columna `retencion` en las tablas de canje a propósito: la
 * retención es `pagos` con `tipo = 'retencion'`, que es lo que descuentan
 * `v_cobros`/`v_saldos`. Dos lugares para el mismo número terminan siempre
 * igual —no coinciden y nadie sabe cuál vale—, así que los reporteadores
 * leen de acá.
 */
export async function retencionesPorDocumento(db: SupabaseClient, documentoIds: string[]): Promise<Map<string, number>> {
  if (documentoIds.length === 0) return new Map();

  const mapa = new Map<string, number>();
  for (let i = 0; i < documentoIds.length; i += 500) {
    const filas = await fetchAll<{ documento_id: string; monto: number }>((from, to) =>
      db.from('pagos').select('documento_id, monto').eq('tipo', 'retencion')
        .in('documento_id', documentoIds.slice(i, i + 500)).order('id').range(from, to)
    );
    for (const f of filas) mapa.set(f.documento_id, (mapa.get(f.documento_id) ?? 0) + (Number(f.monto) || 0));
  }
  return mapa;
}

