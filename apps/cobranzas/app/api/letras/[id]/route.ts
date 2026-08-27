export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_BORRADO, AREAS_ESCRITURA } from '@/lib/autorizacion';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  const body = await req.json();
  const db   = supabaseAdmin();

  // Edición de fecha de vencimiento: flujo aparte, disparado por
  // `nueva_fecha_vencimiento`. Solo toca fecha_vencimiento y las dos
  // columnas de auditoría — nunca estado, importe, banco ni fecha_pago.
  if (body.nueva_fecha_vencimiento !== undefined) {
    const nueva = body.nueva_fecha_vencimiento;
    if (typeof nueva !== 'string' || !FECHA_RE.test(nueva) || Number.isNaN(Date.parse(nueva))) {
      return NextResponse.json({ error: 'nueva_fecha_vencimiento inválida (formato YYYY-MM-DD)' }, { status: 400 });
    }

    const { data: actual, error: errActual } = await db
      .from('letras')
      .select('fecha_vencimiento, fecha_vencimiento_original')
      .eq('id', params.id)
      .single();
    if (errActual || !actual) return NextResponse.json({ error: 'Letra no encontrada' }, { status: 404 });

    const update: Record<string, unknown> = {
      fecha_vencimiento: nueva,
      fecha_vencimiento_editada_en: new Date().toISOString(),
    };
    // Solo se captura la original la PRIMERA vez que se edita — si ya tiene
    // valor, se conserva (es la fecha con la que se giró la letra).
    if (actual.fecha_vencimiento_original === null) {
      update.fecha_vencimiento_original = actual.fecha_vencimiento;
    }

    const { data, error } = await db
      .from('letras')
      .update(update)
      .eq('id', params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ letra: data });
  }

  if (body.estado === 'pagada' && !body.fecha_pago) {
    body.fecha_pago = new Date().toISOString().split('T')[0];
  }
  if (body.estado && body.estado !== 'pagada') {
    body.fecha_pago = null;
  }

  const { data, error } = await db
    .from('letras')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ letra: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await exigirArea(AREAS_BORRADO);
  if (!auth.ok) return auth.respuesta;

  const db = supabaseAdmin();
  const { error } = await db.from('letras').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
