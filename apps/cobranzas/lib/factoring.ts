import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from './fetchAll';

/**
 * Documentos con un canje a factoring ACTIVO (canje no anulado). Si ya se
 * registró el ingreso al banco, el documento ya tiene saldo_pendiente = 0
 * (por el pago real que crea la Parte 2) y deja de calificar como "en
 * factoring" de forma natural — no hace falta revisar factoring_ingresos acá.
 */
export async function documentosEnFactoringActivo(db: SupabaseClient, documentoIds: string[]): Promise<Set<string>> {
  if (documentoIds.length === 0) return new Set();

  const canjeFacturas = await fetchAll<{ documento_id: string; canje_id: string }>((from, to) =>
    db.from('factoring_canje_facturas').select('documento_id, canje_id').in('documento_id', documentoIds).range(from, to)
  );
  if (canjeFacturas.length === 0) return new Set();

  const canjeIds = Array.from(new Set(canjeFacturas.map(c => c.canje_id)));
  const { data: canjes } = await db.from('factoring_canjes').select('id, anulado').in('id', canjeIds);
  const canjesActivos = new Set((canjes ?? []).filter(c => !c.anulado).map(c => c.id));

  const resultado = new Set<string>();
  for (const cf of canjeFacturas) {
    if (canjesActivos.has(cf.canje_id)) resultado.add(cf.documento_id);
  }
  return resultado;
}

export interface FilaReporteFactoring {
  documento_id: string;
  comprobante: string;
  cliente_ruc: string;
  razon_social: string;
  fecha_vencimiento: string | null;
  monto: number;
  fecha_canje: string;
  dias_en_factoring: number;
}

/** Facturas actualmente "en_factoring" (Parte 3: reporte). */
export async function construirReporteFactoring(db: SupabaseClient, filtros: { cliente_ruc?: string | null }): Promise<FilaReporteFactoring[]> {
  const canjes = await fetchAll<{ id: string; cliente_ruc: string; fecha_canje: string; anulado: boolean }>((from, to) =>
    db.from('factoring_canjes').select('id, cliente_ruc, fecha_canje, anulado').eq('anulado', false).range(from, to)
  );
  if (canjes.length === 0) return [];

  const canjeIds = canjes.map(c => c.id);
  const canjeFacturas = await fetchAll<{ canje_id: string; documento_id: string }>((from, to) =>
    db.from('factoring_canje_facturas').select('canje_id, documento_id').in('canje_id', canjeIds).range(from, to)
  );

  const canjePorId = new Map(canjes.map(c => [c.id, c]));
  const documentoIds = Array.from(new Set(canjeFacturas.map(cf => cf.documento_id)));
  if (documentoIds.length === 0) return [];

  let query = db
    .from('v_saldos')
    .select('id, comprobante, cliente_ruc, razon_social, fecha_vencimiento, saldo_pendiente')
    .in('id', documentoIds)
    .gt('saldo_pendiente', 0.005);
  if (filtros.cliente_ruc) query = query.eq('cliente_ruc', filtros.cliente_ruc);

  const facturas = await fetchAll<{ id: string; comprobante: string; cliente_ruc: string; razon_social: string; fecha_vencimiento: string | null; saldo_pendiente: number }>(
    (from, to) => query.range(from, to)
  );

  const hoy = new Date();
  const filas: FilaReporteFactoring[] = [];
  for (const cf of canjeFacturas) {
    const factura = facturas.find(f => f.id === cf.documento_id);
    if (!factura) continue; // ya tiene saldo 0 (ingresado) o no matchea el filtro de cliente
    const canje = canjePorId.get(cf.canje_id)!;
    const dias = Math.max(0, Math.floor((hoy.getTime() - new Date(canje.fecha_canje).getTime()) / 86400000));
    filas.push({
      documento_id: factura.id,
      comprobante: factura.comprobante,
      cliente_ruc: factura.cliente_ruc,
      razon_social: factura.razon_social,
      fecha_vencimiento: factura.fecha_vencimiento,
      monto: Number(factura.saldo_pendiente) || 0,
      fecha_canje: canje.fecha_canje,
      dias_en_factoring: dias,
    });
  }

  filas.sort((a, b) => (a.fecha_vencimiento ?? '').localeCompare(b.fecha_vencimiento ?? ''));
  return filas;
}
