export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_ESCRITURA, AREAS_LECTURA } from '@/lib/autorizacion';

// La dirección del cliente, para la letra de cambio (domicilio del
// aceptante). La mayoría de clientes no la tiene cargada: en vez de
// imprimir la letra sin domicilio, la pantalla de Letras la pide al
// generar la plantilla y la guarda acá — así se va completando el dato
// (Sebas, 2026-10-23). Solo toca `direccion`, nada más del cliente.

export async function GET(_req: NextRequest, { params }: { params: { ruc: string } }) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const { data, error } = await supabaseAdmin()
    .from('clientes')
    .select('ruc, razon_social, direccion, departamento, provincia, distrito')
    .eq('ruc', params.ruc)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { ruc: string } }) {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  let body: { direccion?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  const direccion = typeof body.direccion === 'string' ? body.direccion.trim().replace(/\s+/g, ' ') : '';
  if (!direccion) return NextResponse.json({ error: 'Escribe la dirección.' }, { status: 400 });
  if (direccion.length > 300) return NextResponse.json({ error: 'La dirección es demasiado larga.' }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from('clientes')
    .update({ direccion: direccion.toUpperCase() })
    .eq('ruc', params.ruc)
    .select('ruc')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
