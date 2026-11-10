export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_BORRADO, AREAS_ESCRITURA } from '@/lib/autorizacion';

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dos cosas sobre un canje ya registrado, con permisos distintos:
 *
 *  - Anular: las facturas vuelven a cartera normal (nunca tuvieron el saldo
 *    tocado, así que no hay nada que revertir ahí). Solo admin.
 *  - Cargarle o corregirle el vencimiento del factoring a sus facturas.
 *    Eso es completar un dato, no deshacer una operación, así que alcanza
 *    con permiso de escritura. Hace falta porque los canjes registrados
 *    antes del 05/11/2026 quedaron sin esa fecha: el campo no existía.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json() as {
    anulado_motivo?: string;
    vencimientos?: Array<{ documento_id: string; fecha_vencimiento: string | null }>;
  };

  if (Array.isArray(body.vencimientos)) {
    const auth = await exigirArea(AREAS_ESCRITURA);
    if (!auth.ok) return auth.respuesta;
    return guardarVencimientos(params.id, body.vencimientos);
  }

  const auth = await exigirArea(AREAS_BORRADO);
  if (!auth.ok) return auth.respuesta;

  if (!body.anulado_motivo?.trim())
    return NextResponse.json({ error: 'Indica el motivo de la anulación' }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('factoring_canjes')
    .update({ anulado: true, anulado_motivo: body.anulado_motivo.trim(), anulado_en: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ canje: data });
}

async function guardarVencimientos(
  canjeId: string,
  vencimientos: Array<{ documento_id: string; fecha_vencimiento: string | null }>,
) {
  const db = supabaseAdmin();

  // Las filas del canje, para no dejar que una llamada escriba sobre la
  // factura de otro canje pasando un documento_id cualquiera.
  const { data: filas, error: errFilas } = await db
    .from('factoring_canje_facturas')
    .select('id, documento_id')
    .eq('canje_id', canjeId);
  if (errFilas) return NextResponse.json({ error: errFilas.message }, { status: 500 });
  if (!filas?.length) return NextResponse.json({ error: 'El canje no tiene facturas' }, { status: 404 });

  const filaPorDocumento = new Map(filas.map(f => [f.documento_id as string, f.id as string]));

  for (const v of vencimientos) {
    if (!filaPorDocumento.has(v.documento_id))
      return NextResponse.json({ error: 'Esa factura no es de este canje' }, { status: 400 });
    if (v.fecha_vencimiento !== null && !ES_FECHA.test(v.fecha_vencimiento ?? ''))
      return NextResponse.json({ error: 'La fecha de vencimiento no es una fecha válida' }, { status: 400 });
  }

  // Una por una y no en lote: son pocas (el canje más grande tiene cuatro
  // facturas) y un upsert pediría repetir monto_canje, que acá no se toca.
  for (const v of vencimientos) {
    const { error } = await db
      .from('factoring_canje_facturas')
      .update({ fecha_vencimiento: v.fecha_vencimiento })
      .eq('id', filaPorDocumento.get(v.documento_id)!);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, actualizadas: vencimientos.length });
}
