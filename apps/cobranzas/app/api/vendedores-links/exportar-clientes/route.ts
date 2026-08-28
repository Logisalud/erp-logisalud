import { NextRequest } from 'next/server';
import { carteraClientesXlsx } from '@/lib/exportCarteraClientes';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export const dynamic = 'force-dynamic';

// Cartera de clientes COMPLETA de un vendedor, desde admin (/vendedores-links).
// Se descarga y se envía manualmente (WhatsApp/correo): un link wa.me no
// puede adjuntar archivos, así que este paso siempre es manual.
export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const vendedorId = new URL(req.url).searchParams.get('vendedor_id')?.trim() ?? '';
    if (!vendedorId) return Response.json({ error: 'vendedor_id requerido' }, { status: 400 });

    const result = await carteraClientesXlsx(vendedorId);
    if (!result) return Response.json({ error: 'Vendedor no encontrado' }, { status: 404 });

    return new Response(result.buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
