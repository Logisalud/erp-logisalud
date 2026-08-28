export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { crearClienteServidor } from '@logisalud/auth/server';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export async function GET(
  req: NextRequest,
  { params }: { params: { ruc: string } }
) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const soloDeuda = new URL(req.url).searchParams.get('solo_deuda') !== 'false';
    const db = crearClienteServidor();

    const data = await fetchAll((from, to) => {
      let q = db
        .from('v_saldos')
        .select('*')
        .eq('cliente_ruc', params.ruc)
        .order('fecha_vencimiento', { ascending: false, nullsFirst: false });
      if (soloDeuda) q = q.gt('saldo_pendiente', 0);
      return q.range(from, to);
    });

    return NextResponse.json({ facturas: data }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
