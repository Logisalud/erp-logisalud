export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { crearClienteServidor } from '@logisalud/auth/server';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { cargarSaldosAFavor } from '@/lib/saldos-a-favor';

export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const clientes = await cargarSaldosAFavor(crearClienteServidor() as never);
    return NextResponse.json({ clientes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
