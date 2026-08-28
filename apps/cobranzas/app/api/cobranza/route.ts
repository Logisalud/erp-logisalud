export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { crearClienteServidor } from '@logisalud/auth/server';
import { computeCobranza } from '@/lib/cobranza';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

// Panel de cobranza (doble lectura). Ver lib/cobranza.ts para la lógica.
export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde')?.trim() ?? '';
  const hasta = searchParams.get('hasta')?.trim() ?? '';
  if (!desde || !hasta) return NextResponse.json({ error: 'desde y hasta requeridos' }, { status: 400 });

  const data = await computeCobranza(crearClienteServidor(), desde, hasta);
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
