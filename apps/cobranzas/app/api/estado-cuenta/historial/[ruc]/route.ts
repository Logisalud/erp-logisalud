export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { crearClienteServidor } from '@logisalud/auth/server';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { cargarEstadoCuenta } from '@/lib/estado-cuenta-datos';

const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

/**
 * El historial completo de un cliente, ya armado como extracto.
 *
 * El armado vive en `lib/estado-cuenta-datos.ts`: lo comparten esta ruta, su
 * Excel y el link del vendedor, para que las tres salidas no puedan
 * discrepar sobre cuánto debe un cliente.
 */
export async function GET(req: NextRequest, { params }: { params: { ruc: string } }) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const { searchParams } = new URL(req.url);
    const desde = searchParams.get('desde')?.trim() || null;
    const hasta = searchParams.get('hasta')?.trim() || null;

    const datos = await cargarEstadoCuenta(crearClienteServidor(), params.ruc, desde, hasta);

    return NextResponse.json({ ...datos, rango: { desde, hasta } }, { headers: noStore });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
