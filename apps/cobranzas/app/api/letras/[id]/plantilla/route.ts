export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { generarPlantillaLetra } from '@/lib/plantillaLetra';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const db = supabaseAdmin();

  const { data: letra, error: errLetra } = await db
    .from('letras')
    .select('id, numero_letra, importe, fecha_giro, fecha_vencimiento')
    .eq('id', params.id)
    .single();
  if (errLetra || !letra) return NextResponse.json({ error: 'Letra no encontrada' }, { status: 404 });

  if (!letra.fecha_giro)
    return NextResponse.json({ error: 'Esta letra no tiene fecha de giro registrada — complétala antes de generar la plantilla.' }, { status: 400 });

  const { data: ldRows, error: errLd } = await db
    .from('letra_documento')
    .select('documento_id')
    .eq('letra_id', letra.id);
  if (errLd) return NextResponse.json({ error: errLd.message }, { status: 500 });
  if (!ldRows?.length) return NextResponse.json({ error: 'La letra no tiene facturas asociadas' }, { status: 500 });

  const documentoIds = ldRows.map(r => r.documento_id as string);
  const { data: docs, error: errDocs } = await db
    .from('documentos')
    .select('id, serie, numero, cliente_ruc')
    .in('id', documentoIds);
  if (errDocs) return NextResponse.json({ error: errDocs.message }, { status: 500 });
  if (!docs?.length) return NextResponse.json({ error: 'No se encontraron las facturas de la letra' }, { status: 500 });

  const clienteRuc = docs[0].cliente_ruc as string;
  const { data: cliente, error: errCliente } = await db
    .from('clientes')
    .select('razon_social')
    .eq('ruc', clienteRuc)
    .single();
  if (errCliente || !cliente) return NextResponse.json({ error: 'No se encontró el cliente de la letra' }, { status: 500 });

  const referenciaGirador = docs
    .map(d => `${d.serie}-${String(d.numero).padStart(6, '0')}`)
    .join(', ');

  const buffer = await generarPlantillaLetra({
    numeroLetra: letra.numero_letra,
    referenciaGirador,
    fechaGiro: letra.fecha_giro,
    fechaVencimiento: letra.fecha_vencimiento,
    importe: Number(letra.importe),
    aceptante: cliente.razon_social,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Letra_${letra.numero_letra}.xlsx"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
