import type { SupabaseClient } from '@supabase/supabase-js';

// Limpia el nombre del banco para el match: quita sufijos societarios comunes.
export function limpiarNombreBanco(n: string): string {
  return n
    .replace(/\b(s\.?a\.?c\.?|e\.?i\.?r\.?l\.?|s\.?r\.?l\.?|s\.?a\.?|eirl|sac|srl)\b/gi, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type Categoria = 'nombre_y_monto' | 'nombre_sin_monto' | 'solo_monto_unica' | 'ambiguo' | 'sin_candidata';

export interface FacturaCandidata {
  id: string; comprobante: string; cliente_ruc: string; razon_social: string;
  importe_total: number; saldo_pendiente: number; fecha_emision: string; tiene_letras: boolean;
  match: 'cliente_y_monto' | 'monto_exacto';
}

// Motor de sugerencias por nombre+monto, con coherencia temporal (nunca
// sugiere una factura emitida después del depósito bancario). Única fuente
// de verdad usada tanto por /api/conciliacion/sugerencias (una a una) como
// por /api/conciliacion/importar (resumen del lote completo), para que
// nunca queden desincronizadas.
export async function sugerirParaMovimiento(
  db: SupabaseClient,
  mov: { id: string; fecha: string; monto: number; nombre_banco_detectado: string | null },
): Promise<{ categoria: Categoria; clientes: { ruc: string; razon_social: string }[]; facturas: FacturaCandidata[] }> {
  const monto = Number(mov.monto);
  const tol = 0.5; // tolerancia de monto ±S/0.50
  const fechaMovimiento = mov.fecha;

  let clientes: { ruc: string; razon_social: string }[] = [];
  if (mov.nombre_banco_detectado) {
    const limpio = limpiarNombreBanco(mov.nombre_banco_detectado);
    if (limpio.length >= 4) {
      const { data } = await db
        .from('clientes')
        .select('ruc, razon_social')
        .ilike('razon_social', `%${limpio}%`)
        .limit(8);
      clientes = data ?? [];
    }
  }

  const rucs = clientes.map(c => c.ruc);
  const facturas: FacturaCandidata[] = [];
  const push = (rows: Record<string, unknown>[], match: 'cliente_y_monto' | 'monto_exacto') => {
    for (const f of rows) {
      if (facturas.some(x => x.id === f.id)) continue;
      facturas.push({
        id: f.id as string, comprobante: f.comprobante as string, cliente_ruc: f.cliente_ruc as string,
        razon_social: f.razon_social as string, importe_total: Number(f.importe_total) || 0,
        saldo_pendiente: Number(f.saldo_pendiente) || 0, fecha_emision: f.fecha_emision as string,
        tiene_letras: !!f.tiene_letras, match,
      });
    }
  };
  const cols = 'id, comprobante, cliente_ruc, razon_social, importe_total, saldo_pendiente, fecha_emision, tiene_letras';

  if (rucs.length > 0) {
    const { data } = await db.from('v_saldos').select(cols)
      .in('cliente_ruc', rucs)
      .gte('saldo_pendiente', monto - tol).lte('saldo_pendiente', monto + tol)
      .lte('fecha_emision', fechaMovimiento)
      .limit(20);
    push(data ?? [], 'cliente_y_monto');
  }

  const { data: exactas } = await db.from('v_saldos').select(cols)
    .gte('saldo_pendiente', monto - tol).lte('saldo_pendiente', monto + tol)
    .lte('fecha_emision', fechaMovimiento)
    .limit(20);
  push(exactas ?? [], 'monto_exacto');

  const facturasConNombre = facturas.filter(f => f.match === 'cliente_y_monto');
  let categoria: Categoria;
  if (facturasConNombre.length > 0) categoria = 'nombre_y_monto';
  else if (clientes.length > 0) categoria = 'nombre_sin_monto';
  else if (facturas.length === 1) categoria = 'solo_monto_unica';
  else if (facturas.length >= 2) categoria = 'ambiguo';
  else categoria = 'sin_candidata';

  // "nombre_sin_monto" nunca ofrece factura para confirmar: las que hubiera
  // (monto_exacto) pertenecen a OTROS clientes, no al identificado por nombre.
  const facturasParaMostrar = categoria === 'nombre_sin_monto' ? [] : facturas;

  return { categoria, clientes, facturas: facturasParaMostrar };
}
