export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cargarEstadoCuenta } from '@/lib/estado-cuenta-datos';
import { estadoCuentaXlsx } from '@/lib/exportEstadoCuenta';
import { clienteEsDelVendedor, vendedorPorToken } from '@/lib/vendedorPorToken';

/**
 * El mismo Excel del extracto que descarga Contabilidad, pero desde el link
 * del vendedor: sirve para mandárselo al cliente por WhatsApp desde el
 * celular. Permiso por token y sólo clientes propios, igual que la pantalla.
 */
export async function GET(req: NextRequest, { params }: { params: { ruc: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token')?.trim() ?? '';
    const desde = searchParams.get('desde')?.trim() || null;
    const hasta = searchParams.get('hasta')?.trim() || null;
    const ruc = params.ruc;

    const vendedor = await vendedorPorToken(token);
    if (!vendedor) return Response.json({ error: 'Enlace no válido' }, { status: 404 });

    if (!(await clienteEsDelVendedor(ruc, vendedor.id))) {
      return Response.json({ error: 'Este cliente no está en tu cartera.' }, { status: 403 });
    }

    const datos = await cargarEstadoCuenta(supabaseAdmin(), ruc, desde, hasta);
    const { buf, filename } = estadoCuentaXlsx(ruc, datos, desde, hasta);

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
