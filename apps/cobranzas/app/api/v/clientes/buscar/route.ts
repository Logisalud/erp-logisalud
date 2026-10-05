export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { vendedorPorToken } from '@/lib/vendedorPorToken';

const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

/**
 * Buscador de clientes para el link del vendedor.
 *
 * Es el gemelo de `/api/clientes/buscar`, con una diferencia que es toda la
 * razón de que exista una ruta aparte en vez de un parámetro más: el
 * `.eq('vendedor_id', ...)` nunca sale de acá. Un vendedor busca entre sus
 * clientes y no entre los de la empresa.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token')?.trim() ?? '';
  const q = searchParams.get('q')?.trim() ?? '';

  const vendedor = await vendedorPorToken(token);
  if (!vendedor) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 });

  if (q.length < 2) return NextResponse.json({ clientes: [] }, { headers: noStore });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('v_saldos')
    .select('cliente_ruc, razon_social, saldo_pendiente')
    .eq('vendedor_id', vendedor.id)
    .or(`razon_social.ilike.%${q}%,cliente_ruc.ilike.%${q}%`)
    .order('razon_social')
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Una fila por cliente, no por factura: se suman los saldos de sus
  // documentos para poder ordenarlos y mostrar cuánto debe cada uno.
  const porRuc = new Map<string, { cliente_ruc: string; razon_social: string; saldo_total: number }>();
  for (const row of data ?? []) {
    const ruc = row.cliente_ruc as string;
    const acc = porRuc.get(ruc) ?? { cliente_ruc: ruc, razon_social: row.razon_social as string, saldo_total: 0 };
    acc.saldo_total += Number(row.saldo_pendiente) || 0;
    porRuc.set(ruc, acc);
  }

  const clientes = Array.from(porRuc.values())
    .sort((a, b) => a.razon_social.localeCompare(b.razon_social))
    .slice(0, 10);

  return NextResponse.json({ clientes }, { headers: noStore });
}
