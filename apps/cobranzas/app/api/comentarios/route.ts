export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_ESCRITURA, AREAS_LECTURA } from '@/lib/autorizacion';

const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

/**
 * Los comentarios de cobranza de un cliente: el suyo y el de cada una de
 * sus facturas.
 *
 * Los dos juntos en una sola llamada porque la pantalla los muestra juntos
 * —la nota del cliente arriba, la de cada factura en su fila— y pedirlos
 * por separado dejaría la tabla cambiando dos veces al abrir un cliente.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const cliente_ruc = new URL(req.url).searchParams.get('cliente_ruc');
  if (!cliente_ruc) return NextResponse.json({ error: 'cliente_ruc requerido' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: delCliente, error: errCliente } = await db
    .from('comentarios_cliente')
    .select('comentario, escrito_por, actualizado_en')
    .eq('cliente_ruc', cliente_ruc)
    .maybeSingle();
  if (errCliente) return NextResponse.json({ error: errCliente.message }, { status: 500 });

  // Por los documentos del cliente y no por una lista de ids que mande la
  // pantalla: así el filtro lo pone la base y no depende de lo que el
  // navegador haya cargado.
  const { data: docs } = await db.from('documentos').select('id').eq('cliente_ruc', cliente_ruc);
  const ids = (docs ?? []).map(d => d.id as string);

  const porDocumento: Record<string, { comentario: string; escrito_por: string | null; actualizado_en: string }> = {};
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db
      .from('comentarios_documento')
      .select('documento_id, comentario, escrito_por, actualizado_en')
      .in('documento_id', ids.slice(i, i + 500));
    for (const c of data ?? []) {
      porDocumento[c.documento_id as string] = {
        comentario: c.comentario as string,
        escrito_por: c.escrito_por as string | null,
        actualizado_en: String(c.actualizado_en),
      };
    }
  }

  return NextResponse.json({ cliente: delCliente ?? null, documentos: porDocumento }, { headers: noStore });
}

/**
 * Guarda un comentario, del cliente o de una factura.
 *
 * Un texto vacío BORRA la fila en vez de guardar una cadena en blanco: en
 * la pantalla "sin comentario" y "comentario vacío" son lo mismo, y
 * guardar el segundo dejaría filas que parecen una nota y no dicen nada.
 */
export async function PUT(req: NextRequest) {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  const { cliente_ruc, documento_id, comentario, escrito_por } = await req.json() as {
    cliente_ruc?: string; documento_id?: string; comentario?: string; escrito_por?: string;
  };

  if (!cliente_ruc && !documento_id)
    return NextResponse.json({ error: 'Indica cliente_ruc o documento_id' }, { status: 400 });
  if (cliente_ruc && documento_id)
    return NextResponse.json({ error: 'Un comentario es del cliente o de una factura, no de los dos' }, { status: 400 });

  const texto = (comentario ?? '').trim();
  const db = supabaseAdmin();
  const tabla = cliente_ruc ? 'comentarios_cliente' : 'comentarios_documento';
  const columna = cliente_ruc ? 'cliente_ruc' : 'documento_id';
  const clave = cliente_ruc ?? documento_id!;

  if (texto === '') {
    const { error } = await db.from(tabla).delete().eq(columna, clave);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ comentario: null }, { headers: noStore });
  }

  const { data, error } = await db
    .from(tabla)
    .upsert({
      [columna]: clave,
      comentario: texto,
      escrito_por: escrito_por?.trim() || null,
      actualizado_en: new Date().toISOString(),
    }, { onConflict: columna })
    .select('comentario, escrito_por, actualizado_en')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comentario: data }, { headers: noStore });
}
