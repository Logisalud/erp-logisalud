export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_INCOBRABLE } from '@/lib/autorizacion';

/**
 * Dar de baja una factura por incobrable, y revertirla.
 *
 * No borra ni anula nada: escribe una fila en `documentos_incobrables` y
 * `v_cobros` deja de contarla (mismo mecanismo que el factoring). La
 * factura sigue en todas las pantallas, marcada y con el motivo a la vista,
 * para que la plata no desaparezca en silencio.
 *
 * El motivo es obligatorio y no admite dos palabras sueltas: dentro de seis
 * meses, "estafa" sin contexto no le sirve a nadie.
 */
const MOTIVO_MINIMO = 15;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirArea(AREAS_INCOBRABLE);
  if (!auth.ok) return auth.respuesta;

  const { motivo } = await req.json().catch(() => ({ motivo: null }));
  const limpio = typeof motivo === 'string' ? motivo.trim() : '';
  if (limpio.length < MOTIVO_MINIMO) {
    return NextResponse.json(
      { error: `Escribí el motivo de la baja (al menos ${MOTIVO_MINIMO} caracteres): dentro de seis meses tiene que entenderse solo.` },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  const { data: doc, error: eDoc } = await db
    .from('documentos')
    .select('id, serie, numero, importe_total, anulado')
    .eq('id', params.id)
    .maybeSingle();
  if (eDoc) return NextResponse.json({ error: eDoc.message }, { status: 500 });
  if (!doc) return NextResponse.json({ error: 'La factura no existe.' }, { status: 404 });
  if (doc.anulado) {
    return NextResponse.json({ error: 'La factura está anulada: no hay nada que dar de baja.' }, { status: 400 });
  }

  // Queda escrito quién la dio de baja: es el único rastro de la decisión.
  const quien = auth.perfil.nombre?.trim() || auth.perfil.id;

  const { error } = await db
    .from('documentos_incobrables')
    .upsert({ documento_id: params.id, motivo: limpio, marcado_por: quien }, { onConflict: 'documento_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ incobrable: true, motivo: limpio, marcado_por: quien });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirArea(AREAS_INCOBRABLE);
  if (!auth.ok) return auth.respuesta;

  const db = supabaseAdmin();
  const { error } = await db.from('documentos_incobrables').delete().eq('documento_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ incobrable: false });
}
