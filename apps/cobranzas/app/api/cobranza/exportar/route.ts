import { NextRequest } from 'next/server';
import { crearClienteServidor } from '@logisalud/auth/server';
import { computeCobranza, diasCompletos, buildCobranzaXlsx, CobranzaData } from '@/lib/cobranza';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export const dynamic = 'force-dynamic';

// Exporta el desglose de cobranza (por vendedor y día por día) del rango.
//
// Sale de las MISMAS funciones que la pantalla `/cobranzas/cobranza` y que el
// correo diario (`/api/cron/reporte-cobranza`): `computeCobranza` +
// `diasCompletos` + `buildCobranzaXlsx`. Antes esta ruta tenía su propia copia
// del cálculo leyendo solo `pagos`, así que el Excel no contaba las letras
// cobradas (la pantalla sí, desde que se unificaron las dos fuentes) y los
// días sin cobro faltaban en vez de verse en 0. Si hay que cambiar una regla
// de cobranza, se cambia en `lib/cobranza.ts` y los tres lados la heredan.
export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const { searchParams } = new URL(req.url);
    const desde = searchParams.get('desde')?.trim() ?? '';
    const hasta = searchParams.get('hasta')?.trim() ?? '';
    if (!desde || !hasta) return Response.json({ error: 'desde y hasta requeridos' }, { status: 400 });

    const data = await computeCobranza(crearClienteServidor(), desde, hasta);
    const conDiasEnCero: CobranzaData = { ...data, dias: diasCompletos(desde, hasta, data.dias) };

    const raw = buildCobranzaXlsx(
      [{ nombre: 'Por vendedor', data }],
      { nombre: 'Día por día', data: conDiasEnCero },
    );
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cobranza-${desde}_${hasta}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
