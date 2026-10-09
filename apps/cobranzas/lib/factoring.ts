import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from './fetchAll';

interface CanjeActivoInfo { canjeId: string; montoCanje: number }

/**
 * Para los documentos dados, el canje a factoring ACTIVO (canje no
 * anulado) con su monto_canje — el valor que se acordó factorizar, que no
 * siempre es el saldo_pendiente completo (retención, % parcial, etc.).
 */
async function canjesActivosPorDocumento(db: SupabaseClient, documentoIds: string[]): Promise<Map<string, CanjeActivoInfo>> {
  if (documentoIds.length === 0) return new Map();

  const canjeFacturas = await fetchAll<{ documento_id: string; canje_id: string; monto_canje: number }>((from, to) =>
    db.from('factoring_canje_facturas').select('documento_id, canje_id, monto_canje').in('documento_id', documentoIds).order('id').range(from, to)
  );
  if (canjeFacturas.length === 0) return new Map();

  const canjeIds = Array.from(new Set(canjeFacturas.map(c => c.canje_id)));
  const { data: canjes } = await db.from('factoring_canjes').select('id, anulado').in('id', canjeIds);
  const canjesActivos = new Set((canjes ?? []).filter(c => !c.anulado).map(c => c.id));

  const resultado = new Map<string, CanjeActivoInfo>();
  for (const cf of canjeFacturas) {
    if (canjesActivos.has(cf.canje_id)) resultado.set(cf.documento_id, { canjeId: cf.canje_id, montoCanje: Number(cf.monto_canje) || 0 });
  }
  return resultado;
}

/** Documentos con un canje a factoring ACTIVO (canje no anulado), haya tenido ingreso o no. */
export async function documentosEnFactoringActivo(db: SupabaseClient, documentoIds: string[]): Promise<Set<string>> {
  const mapa = await canjesActivosPorDocumento(db, documentoIds);
  return new Set(mapa.keys());
}

/** Documentos que ya tienen un ingreso al banco ACTIVO (ingreso no anulado) — ya se procesaron, aunque les quede saldo (factoring parcial). */
export async function documentosYaIngresados(db: SupabaseClient, documentoIds: string[]): Promise<Set<string>> {
  if (documentoIds.length === 0) return new Set();

  const ingresoFacturas = await fetchAll<{ documento_id: string; ingreso_id: string }>((from, to) =>
    db.from('factoring_ingreso_facturas').select('documento_id, ingreso_id').in('documento_id', documentoIds).order('id').range(from, to)
  );
  if (ingresoFacturas.length === 0) return new Set();

  const ingresoIds = Array.from(new Set(ingresoFacturas.map(f => f.ingreso_id)));
  const { data: ingresos } = await db.from('factoring_ingresos').select('id, anulado').in('id', ingresoIds);
  const ingresosActivos = new Set((ingresos ?? []).filter(i => !i.anulado).map(i => i.id));

  const resultado = new Set<string>();
  for (const f of ingresoFacturas) {
    if (ingresosActivos.has(f.ingreso_id)) resultado.add(f.documento_id);
  }
  return resultado;
}

export interface PendienteDeIngreso { documentoId: string; montoCanje: number }

/**
 * Documentos con un canje activo que TODAVÍA no tuvieron su ingreso al
 * banco — son los que de verdad están "esperando" la Parte 2, y los únicos
 * sobre los que /api/pagos debe bloquear un pago normal. Una vez que una
 * factura tuvo su ingreso (aunque haya quedado saldo por un factoring
 * parcial), un pago normal sobre el resto es válido de nuevo.
 */
export async function documentosPendientesDeIngreso(db: SupabaseClient, documentoIds: string[]): Promise<Map<string, number>> {
  const canjesActivos = await canjesActivosPorDocumento(db, documentoIds);
  if (canjesActivos.size === 0) return new Map();
  const yaIngresados = await documentosYaIngresados(db, Array.from(canjesActivos.keys()));

  const resultado = new Map<string, number>();
  for (const [docId, info] of canjesActivos) {
    if (!yaIngresados.has(docId)) resultado.set(docId, info.montoCanje);
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

/** Facturas actualmente esperando el ingreso al banco (Parte 3: reporte). */
export async function construirReporteFactoring(db: SupabaseClient, filtros: { cliente_ruc?: string | null }): Promise<FilaReporteFactoring[]> {
  const canjes = await fetchAll<{ id: string; cliente_ruc: string; fecha_canje: string; anulado: boolean }>((from, to) =>
    db.from('factoring_canjes').select('id, cliente_ruc, fecha_canje, anulado').eq('anulado', false).order('id').range(from, to)
  );
  if (canjes.length === 0) return [];

  const canjeIds = canjes.map(c => c.id);
  const canjeFacturas = await fetchAll<{ canje_id: string; documento_id: string; monto_canje: number }>((from, to) =>
    db.from('factoring_canje_facturas').select('canje_id, documento_id, monto_canje').in('canje_id', canjeIds).order('id').range(from, to)
  );

  const canjePorId = new Map(canjes.map(c => [c.id, c]));
  const documentoIds = Array.from(new Set(canjeFacturas.map(cf => cf.documento_id)));
  if (documentoIds.length === 0) return [];

  const yaIngresados = await documentosYaIngresados(db, documentoIds);

  let query = db
    .from('v_saldos')
    .select('id, comprobante, cliente_ruc, razon_social, fecha_vencimiento')
    .in('id', documentoIds);
  if (filtros.cliente_ruc) query = query.eq('cliente_ruc', filtros.cliente_ruc);

  const facturas = await fetchAll<{ id: string; comprobante: string; cliente_ruc: string; razon_social: string; fecha_vencimiento: string | null }>(
    (from, to) => query.range(from, to)
  );
  const facturaPorId = new Map(facturas.map(f => [f.id, f]));

  const hoy = new Date();
  const filas: FilaReporteFactoring[] = [];
  for (const cf of canjeFacturas) {
    if (yaIngresados.has(cf.documento_id)) continue; // ya se procesó — no es "en factoring" pendiente
    const factura = facturaPorId.get(cf.documento_id);
    if (!factura) continue; // no matchea el filtro de cliente
    const canje = canjePorId.get(cf.canje_id)!;
    const dias = Math.max(0, Math.floor((hoy.getTime() - new Date(canje.fecha_canje).getTime()) / 86400000));
    filas.push({
      documento_id: factura.id,
      comprobante: factura.comprobante,
      cliente_ruc: factura.cliente_ruc,
      razon_social: factura.razon_social,
      fecha_vencimiento: factura.fecha_vencimiento,
      monto: Number(cf.monto_canje) || 0,
      fecha_canje: canje.fecha_canje,
      dias_en_factoring: dias,
    });
  }

  filas.sort((a, b) => (a.fecha_vencimiento ?? '').localeCompare(b.fecha_vencimiento ?? ''));
  return filas;
}
