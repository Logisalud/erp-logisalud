export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { crearClienteServidor } from '@logisalud/auth/server';
import { sugerirParaMovimiento } from '@/lib/conciliacion';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

// Para un movimiento (cobro), sugiere cliente(s) por nombre y factura(s) por
// monto + coherencia temporal, y clasifica el resultado en una categoría
// honesta (ver lib/conciliacion.ts). El único mecanismo que puede resolver
// un movimiento SIN intervención humana es el auto-conciliar por N° de
// operación exacto (/api/conciliacion/auto) — esto de aquí SIEMPRE requiere
// que una persona confirme, sin importar la categoría.
export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const db = crearClienteServidor();
  const { data: mov } = await db
    .from('movimientos_banco_import')
    .select('id, fecha, monto, nombre_banco_detectado')
    .eq('id', id)
    .single();
  if (!mov) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 });

  const { categoria, clientes, facturas } = await sugerirParaMovimiento(db, {
    id: mov.id, fecha: mov.fecha, monto: Number(mov.monto), nombre_banco_detectado: mov.nombre_banco_detectado,
  });

  return NextResponse.json({
    movimiento: { id: mov.id, fecha: mov.fecha, monto: Number(mov.monto), nombre_banco_detectado: mov.nombre_banco_detectado },
    categoria,
    clientes,
    facturas,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
