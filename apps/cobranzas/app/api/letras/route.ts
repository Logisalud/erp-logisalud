export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const documento_id = new URL(req.url).searchParams.get('documento_id');
  if (!documento_id)
    return NextResponse.json({ error: 'documento_id requerido' }, { status: 400 });

  const db = supabaseAdmin();

  // Buscar a través de letra_documento (soporta letra → varias facturas)
  const { data: ldRows, error: ldErr } = await db
    .from('letra_documento')
    .select('letra_id, monto_aplicado')
    .eq('documento_id', documento_id);

  if (ldErr) return NextResponse.json({ error: ldErr.message }, { status: 500 });
  if (!ldRows?.length) return NextResponse.json({ letras: [] }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });

  const letraIds = ldRows.map(r => r.letra_id as string);
  const montoMap: Record<string, number> = Object.fromEntries(
    ldRows.map(r => [r.letra_id as string, Number(r.monto_aplicado)])
  );

  // Contar cuántas facturas cubre cada letra
  const { data: allLd, error: allLdErr } = await db
    .from('letra_documento')
    .select('letra_id')
    .in('letra_id', letraIds);

  if (allLdErr) return NextResponse.json({ error: allLdErr.message }, { status: 500 });

  const nFacturasMap: Record<string, number> = {};
  for (const row of allLd ?? []) {
    const lid = row.letra_id as string;
    nFacturasMap[lid] = (nFacturasMap[lid] ?? 0) + 1;
  }

  const { data, error } = await db
    .from('letras')
    .select('*')
    .in('id', letraIds)
    .order('fecha_vencimiento', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const letras = (data ?? []).map(l => ({
    ...l,
    monto_aplicado: montoMap[l.id] ?? Number(l.importe),
    n_facturas: nFacturasMap[l.id] ?? 1,
  }));

  return NextResponse.json({ letras }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}

type LetraInput = {
  numero_letra: string;
  importe: number;
  fecha_giro?: string;
  fecha_vencimiento: string;
  banco?: string;
  observaciones?: string;
  // Si se envía, la letra cubre varias facturas; si no, se aplica todo al documento_id
  documentos?: Array<{ documento_id: string; monto_aplicado: number }>;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { documento_id, letras } = body as {
    documento_id: string;
    letras: LetraInput[];
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
  if (doc.tipo !== '01' && doc.tipo !== '03')
    return NextResponse.json({ error: 'Solo facturas (01) o boletas (03) pueden tener letras' }, { status: 400 });
  if (doc.forma_pago !== 'CREDITO')
    return NextResponse.json({ error: 'Solo se pueden girar letras sobre comprobantes CREDITO' }, { status: 400 });

  // Validar cuadre cuando hay multi-factura
  for (const l of letras) {
    if (l.documentos?.length) {
      const suma = l.documentos.reduce((a, d) => a + d.monto_aplicado, 0);
      if (Math.abs(suma - l.importe) > 0.01) {
        return NextResponse.json({
          error: `Letra ${l.numero_letra}: la suma de montos aplicados (${suma.toFixed(2)}) no cuadra con el importe (${l.importe.toFixed(2)})`,
        }, { status: 400 });
      }
    }
  }

  const { data: insertadas, error: insErr } = await db
    .from('letras')
    .insert(letras.map(l => ({
      documento_id,
      numero_letra:      l.numero_letra,
      importe:           l.importe,
      fecha_giro:        l.fecha_giro       ?? null,
      fecha_vencimiento: l.fecha_vencimiento,
      banco:             l.banco            ?? null,
      observaciones:     l.observaciones    ?? null,
      estado:            'en_cartera',
    })))
    .select('id');

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Insertar en letra_documento
  const ldRows: Array<{ letra_id: string; documento_id: string; monto_aplicado: number }> = [];
  (insertadas ?? []).forEach((letra, i) => {
    const l = letras[i];
    if (l.documentos?.length) {
      for (const d of l.documentos) {
        ldRows.push({ letra_id: letra.id, documento_id: d.documento_id, monto_aplicado: d.monto_aplicado });
      }
    } else {
      ldRows.push({ letra_id: letra.id, documento_id, monto_aplicado: l.importe });
    }
  });

  const { error: ldErr } = await db.from('letra_documento').insert(ldRows);
  if (ldErr) return NextResponse.json({ error: ldErr.message }, { status: 500 });

  return NextResponse.json({ letras: insertadas, insertadas: insertadas?.length ?? 0 });
}
