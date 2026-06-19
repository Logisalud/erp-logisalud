export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const documento_id = new URL(req.url).searchParams.get('documento_id');
  if (!documento_id)
    return NextResponse.json({ error: 'documento_id requerido' }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('letras')
    .select('*')
    .eq('documento_id', documento_id)
    .order('fecha_vencimiento', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ letras: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { documento_id, letras } = body as {
    documento_id: string;
    letras: Array<{
      numero_letra: string;
      importe: number;
      fecha_giro?: string;
      fecha_vencimiento: string;
      banco?: string;
      observaciones?: string;
    }>;
  };

  if (!documento_id || !letras?.length)
    return NextResponse.json({ error: 'documento_id y letras son requeridos' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: doc, error: docErr } = await db
    .from('documentos')
    .select('id, forma_pago, tipo')
    .eq('id', documento_id)
    .single();

  if (docErr || !doc)
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
  if (doc.tipo !== '01')
    return NextResponse.json({ error: 'Solo facturas (tipo 01) pueden tener letras' }, { status: 400 });
  if (doc.forma_pago !== 'CREDITO')
    return NextResponse.json({ error: 'Solo se pueden girar letras sobre facturas CREDITO' }, { status: 400 });

  const filas = letras.map(l => ({
    documento_id,
    numero_letra:     l.numero_letra,
    importe:          l.importe,
    fecha_giro:       l.fecha_giro       ?? null,
    fecha_vencimiento: l.fecha_vencimiento,
    banco:            l.banco            ?? null,
    observaciones:    l.observaciones    ?? null,
    estado:           'en_cartera',
  }));

  const { data, error } = await db.from('letras').insert(filas).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ letras: data, insertadas: data?.length ?? 0 });
}
