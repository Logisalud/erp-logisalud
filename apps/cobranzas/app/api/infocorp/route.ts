export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA, AREAS_ESCRITURA } from '@/lib/autorizacion';
import { candidatosAInfocorp, type FilaCobranza } from '@/lib/infocorp';

/**
 * La lista de la fase legal: a quién hay que reportar a Equifax
 * (Infocorp) y a quién ya se reportó.
 *
 * Antes esto viajaba por correo y por WhatsApp mezclado con todo lo demás
 * y se perdía. Acá es una sola lista con dos estados.
 */

function hoyLima() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

/** Los clientes de la última fase, con su deuda y sus días al día de hoy. */
async function candidatos(db: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await db.rpc('fn_documentos_cobranza', { p_fecha_corte: hoyLima() });
  if (error) throw new Error(error.message);
  return candidatosAInfocorp((data ?? []) as FilaCobranza[]);
}

export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const db = supabaseAdmin();

  const [lista, marcadosRes] = await Promise.all([
    candidatos(db),
    db
      .from('infocorp_clientes')
      .select('*, cliente:clientes(razon_social)')
      .order('reportado')
      .order('marcado_en', { ascending: false }),
  ]);

  if (marcadosRes.error)
    return NextResponse.json({ error: marcadosRes.error.message }, { status: 500 });

  const marcados = marcadosRes.data ?? [];
  const yaMarcados = new Set(marcados.map((m: { cliente_ruc: string }) => m.cliente_ruc));

  return NextResponse.json({
    // Candidatos = los de la última fase que todavía nadie marcó.
    candidatos: lista.filter(c => !yaMarcados.has(c.clienteRuc)),
    marcados,
  });
}

/** Marcar un cliente para reportar. */
export async function POST(req: NextRequest) {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  const { cliente_ruc, observaciones } = (await req.json()) as {
    cliente_ruc?: string;
    observaciones?: string;
  };
  if (!cliente_ruc) return NextResponse.json({ error: 'cliente_ruc requerido' }, { status: 400 });

  const db = supabaseAdmin();

  // El saldo y los días se congelan acá, no se calculan al leer: son la
  // foto de la decisión. Si el cliente paga mañana, la pregunta "¿por qué
  // lo reportamos?" tiene que seguir teniendo respuesta.
  const lista = await candidatos(db);
  const hoy = lista.find(c => c.clienteRuc === cliente_ruc);

  const { error } = await db.from('infocorp_clientes').insert({
    cliente_ruc,
    marcado_por: auth.perfil.nombre ?? 'sin nombre',
    observaciones: observaciones?.trim() || null,
    saldo_al_marcar: hoy?.saldoVencido ?? null,
    dias_vencido_al_marcar: hoy?.maxDiasVencido ?? null,
  });

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'Ese cliente ya está en la lista.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Marcar como ya reportado, con su constancia. */
export async function PATCH(req: NextRequest) {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  const { cliente_ruc, reportado, adjunto_path, adjunto_nombre, observaciones } =
    (await req.json()) as {
      cliente_ruc?: string;
      reportado?: boolean;
      adjunto_path?: string | null;
      adjunto_nombre?: string | null;
      observaciones?: string | null;
    };
  if (!cliente_ruc) return NextResponse.json({ error: 'cliente_ruc requerido' }, { status: 400 });

  const db = supabaseAdmin();

  // Guardar una observación es su propia operación: se escribe mientras se
  // gestiona el caso, mucho antes de que haya un reporte que marcar. Si
  // viniera junto con el estado, anotar algo tildaría "ya reportado" sin
  // que nadie lo pidiera.
  if (reportado === undefined) {
    const { error } = await db
      .from('infocorp_clientes')
      .update({ observaciones: observaciones?.trim() || null })
      .eq('cliente_ruc', cliente_ruc);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const marcarlo = reportado !== false;

  const { error } = await db
    .from('infocorp_clientes')
    .update(
      marcarlo
        ? {
            reportado: true,
            reportado_en: new Date().toISOString(),
            reportado_por: auth.perfil.nombre ?? 'sin nombre',
            adjunto_path: adjunto_path ?? null,
            adjunto_nombre: adjunto_nombre ?? null,
          }
        : // Desmarcar deja la fila en la lista, pero sin constancia: el
          // adjunto se va con el estado que lo justificaba.
          {
            reportado: false,
            reportado_en: null,
            reportado_por: null,
            adjunto_path: null,
            adjunto_nombre: null,
          },
    )
    .eq('cliente_ruc', cliente_ruc);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Sacar al cliente de la lista. */
export async function DELETE(req: NextRequest) {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  const ruc = new URL(req.url).searchParams.get('ruc');
  if (!ruc) return NextResponse.json({ error: 'ruc requerido' }, { status: 400 });

  const db = supabaseAdmin();

  // Un cliente ya reportado no se saca de la lista: el reporte a Infocorp
  // ya salió y la constancia es lo único que prueba cuándo. Primero se
  // desmarca el reporte, y recién ahí se puede sacar.
  const { data: fila, error: errorLectura } = await db
    .from('infocorp_clientes')
    .select('reportado')
    .eq('cliente_ruc', ruc)
    .maybeSingle();
  if (errorLectura) return NextResponse.json({ error: errorLectura.message }, { status: 500 });
  if (!fila) return NextResponse.json({ ok: true });
  if (fila.reportado)
    return NextResponse.json(
      { error: 'Ese cliente ya fue reportado a Infocorp. Desmarcá el reporte antes de sacarlo.' },
      { status: 409 },
    );

  const { error } = await db.from('infocorp_clientes').delete().eq('cliente_ruc', ruc);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
