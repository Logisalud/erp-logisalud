export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { crearClienteServidor } from '@logisalud/auth/server';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export async function GET(
  _req: NextRequest,
  { params }: { params: { ruc: string } }
) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const db = crearClienteServidor();

    const { data: docs, error: docsErr } = await db
      .from('v_saldos')
      .select('id')
      .eq('cliente_ruc', params.ruc);

    if (docsErr) return NextResponse.json({ error: docsErr.message }, { status: 500 });

    const docIds = (docs ?? []).map(d => d.id as string);
    if (docIds.length === 0) return NextResponse.json({ letras: [] }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });

    // Buscar a través de letra_documento
    const { data: ldData, error: ldErr } = await db
      .from('letra_documento')
      .select('letra_id')
      .in('documento_id', docIds);

    if (ldErr) return NextResponse.json({ error: ldErr.message }, { status: 500 });

    const letraIds = [...new Set((ldData ?? []).map(r => r.letra_id as string))];
    if (letraIds.length === 0) return NextResponse.json({ letras: [] }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });

    const { data, error } = await db
      .from('letras')
      .select('id, documento_id, numero_letra, importe, fecha_giro, fecha_vencimiento, estado, banco, observaciones, fecha_pago')
      .in('id', letraIds)
      .order('fecha_vencimiento', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Abonos: pagos que apuntan a una letra puntual (migración 20261112). Van
    // acá y no en una llamada aparte porque sin ellos la letra se ve por su
    // importe de giro aunque el cliente ya haya pagado parte.
    const abonado = new Map<string, number>();
    for (let i = 0; i < letraIds.length; i += 300) {
      const { data: abonos } = await db
        .from('pagos')
        .select('letra_id, monto')
        .in('letra_id', letraIds.slice(i, i + 300));
      for (const a of abonos ?? []) {
        const k = a.letra_id as string;
        abonado.set(k, (abonado.get(k) ?? 0) + (Number(a.monto) || 0));
      }
    }

    const letras = (data ?? []).map(l => ({ ...l, abonado: abonado.get(l.id as string) ?? 0 }));

    return NextResponse.json({ letras }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
