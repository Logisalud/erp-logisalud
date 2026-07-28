export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

// Lista los movimientos importados + resumen. Solo lectura.
export async function GET() {
  const db = supabaseAdmin();
  const filas = await fetchAll<Record<string, unknown>>((from, to) =>
    db.from('movimientos_banco_import')
      .select('id, fecha, descripcion, monto, operacion_numero, clasificacion, nombre_banco_detectado, importado_en')
      .order('fecha', { ascending: false })
      .order('importado_en', { ascending: false })
      .range(from, to)
  );

  const cobros = filas.filter(f => f.clasificacion === 'cobro');
  const noCobranza = filas.filter(f => f.clasificacion === 'no_cobranza');

  return NextResponse.json({
    total: filas.length,
    resumen: {
      cobros_n: cobros.length,
      cobros_suma: Math.round(cobros.reduce((s, f) => s + Number(f.monto), 0) * 100) / 100,
      no_cobranza_n: noCobranza.length,
      no_cobranza_suma: Math.round(noCobranza.reduce((s, f) => s + Number(f.monto), 0) * 100) / 100,
    },
    filas,
  }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
