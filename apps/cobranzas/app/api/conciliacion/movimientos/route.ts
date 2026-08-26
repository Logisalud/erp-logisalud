export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

// Lista los movimientos importados + resumen + estado de conciliación.
export async function GET() {
  const db = supabaseAdmin();
  const filas = await fetchAll<Record<string, unknown>>((from, to) =>
    db.from('movimientos_banco_import')
      .select('id, fecha, descripcion, monto, operacion_numero, clasificacion, nombre_banco_detectado, estado_conciliacion, pago_id, importado_en')
      .order('fecha', { ascending: false })
      .order('importado_en', { ascending: false })
      .range(from, to)
  );

  // Factura enlazada (comprobante + cliente) para los conciliados.
  const pagoIds = Array.from(new Set(filas.map(f => f.pago_id).filter(Boolean))) as string[];
  const facturaPorPago = new Map<string, { comprobante: string; razon_social: string }>();
  if (pagoIds.length > 0) {
    for (let i = 0; i < pagoIds.length; i += 300) {
      const { data: pagos } = await db.from('pagos').select('id, documento_id').in('id', pagoIds.slice(i, i + 300));
      const docIds = Array.from(new Set((pagos ?? []).map(p => p.documento_id)));
      const { data: docs } = await db.from('v_saldos').select('id, comprobante, razon_social').in('id', docIds);
      const docMap = new Map((docs ?? []).map(d => [d.id, { comprobante: d.comprobante as string, razon_social: d.razon_social as string }]));
      for (const p of pagos ?? []) {
        const d = docMap.get(p.documento_id);
        if (d) facturaPorPago.set(p.id, d);
      }
    }
  }

  const filasOut = filas.map(f => ({ ...f, factura: f.pago_id ? facturaPorPago.get(f.pago_id as string) ?? null : null }));

  const cobros = filas.filter(f => f.clasificacion === 'cobro');
  const noCobranza = filas.filter(f => f.clasificacion === 'no_cobranza');

  return NextResponse.json({
    total: filas.length,
    resumen: {
      cobros_n: cobros.length,
      cobros_suma: Math.round(cobros.reduce((s, f) => s + Number(f.monto), 0) * 100) / 100,
      no_cobranza_n: noCobranza.length,
      no_cobranza_suma: Math.round(noCobranza.reduce((s, f) => s + Number(f.monto), 0) * 100) / 100,
      conciliados: cobros.filter(f => f.estado_conciliacion === 'conciliado').length,
      pendientes: cobros.filter(f => f.estado_conciliacion === 'pendiente').length,
      descartados: cobros.filter(f => f.estado_conciliacion === 'descartado').length,
    },
    filas: filasOut,
  }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
