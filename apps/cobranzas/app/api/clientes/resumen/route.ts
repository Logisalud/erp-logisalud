export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

// Resumen de distribución de la cartera de clientes: cuántos por zona y por
// vendedor efectivo. Solo lectura, para el panorama cuando no hay filtro.
export async function GET() {
  const db = supabaseAdmin();

  const clientes = await fetchAll<{ codigo_zona: string | null; vendedor_actual_id: string | null }>((from, to) =>
    db.from('clientes').select('codigo_zona, vendedor_actual_id').range(from, to)
  );

  const porZona: Record<string, number> = {};
  const porVendedor: Record<string, number> = {};
  let sinZona = 0;

  for (const c of clientes) {
    if (c.codigo_zona) porZona[c.codigo_zona] = (porZona[c.codigo_zona] ?? 0) + 1;
    else sinZona++;
    if (c.vendedor_actual_id) porVendedor[c.vendedor_actual_id] = (porVendedor[c.vendedor_actual_id] ?? 0) + 1;
  }

  return NextResponse.json(
    { total: clientes.length, sinZona, porZona, porVendedor },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  );
}
