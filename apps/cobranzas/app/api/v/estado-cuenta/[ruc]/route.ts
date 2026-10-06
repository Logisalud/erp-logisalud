export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cargarEstadoCuenta } from '@/lib/estado-cuenta-datos';
import { clienteEsDelVendedor, vendedorPorToken } from '@/lib/vendedorPorToken';

const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

/**
 * El estado de cuenta de un cliente, servido al link del vendedor.
 *
 * Mismos datos y mismas reglas que la pantalla de staff —la cuenta la hace
 * `cargarEstadoCuenta` para los dos— con el permiso resuelto por token: el
 * vendedor del link y un cliente suyo, o 403. Es de solo lectura, como todo
 * lo que cuelga de `/v/[token]`.
 */
export async function GET(req: NextRequest, { params }: { params: { ruc: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token')?.trim() ?? '';
    const desde = searchParams.get('desde')?.trim() || null;
    const hasta = searchParams.get('hasta')?.trim() || null;
    const ruc = params.ruc;

    const vendedor = await vendedorPorToken(token);
    if (!vendedor) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 });

    if (!(await clienteEsDelVendedor(ruc, vendedor.id))) {
      return NextResponse.json(
        { error: 'Este cliente no está en tu cartera.' },
        { status: 403, headers: noStore },
      );
    }

    const datos = await cargarEstadoCuenta(supabaseAdmin(), ruc, desde, hasta);
    return NextResponse.json({ ...datos, rango: { desde, hasta } }, { headers: noStore });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
