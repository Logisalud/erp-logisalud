export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_BORRADO, AREAS_ESCRITURA } from '@/lib/autorizacion';

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dos cosas sobre un canje ya registrado, con permisos distintos:
 *
 *  - Anular: las facturas vuelven a cartera normal. Si el canje ya tuvo
 *    ingreso al banco, ese ingreso se anula también y sus pagos se borran —
 *    ver `anularIngresosDelCanje`. Solo admin.
 *  - Cargarle o corregirle el vencimiento del factoring a sus facturas.
 *    Eso es completar un dato, no deshacer una operación, así que alcanza
 *    con permiso de escritura. Hace falta porque los canjes registrados
 *    antes del 05/11/2026 quedaron sin esa fecha: el campo no existía.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json() as {
    anulado_motivo?: string;
    vencimientos?: Array<{ documento_id: string; fecha_vencimiento: string | null }>;
    pagos_al_factor?: Array<{ documento_id: string; pagado: boolean; fecha_pago: string | null }>;
    registrado_por?: string;
  };

  // Marcar que el cliente ya le pagó a la entidad. Es anotar un hecho, no
  // deshacer una operación, así que alcanza con permiso de escritura — igual
  // que los vencimientos, y a diferencia de la anulación.
  if (Array.isArray(body.pagos_al_factor)) {
    const auth = await exigirArea(AREAS_ESCRITURA);
    if (!auth.ok) return auth.respuesta;
    return guardarPagosAlFactor(params.id, body.pagos_al_factor, body.registrado_por ?? null);
  }

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
  const motivo = body.anulado_motivo.trim();

  // Primero el ingreso, después el canje: si el ingreso falla, el canje queda
  // vigente y el estado sigue siendo coherente. Al revés quedaría un canje
  // anulado con su plata todavía cobrada, que es justo el agujero que esto
  // viene a tapar.
  const reversa = await anularIngresosDelCanje(db, params.id, motivo);
  if ('error' in reversa) return NextResponse.json({ error: reversa.error }, { status: reversa.status });

  const { data, error } = await db
    .from('factoring_canjes')
    .update({ anulado: true, anulado_motivo: motivo, anulado_en: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ canje: data, ingresos_anulados: reversa.ingresos, pagos_borrados: reversa.pagos });
}

/**
 * Anula los ingresos al banco del canje y borra los pagos que crearon.
 *
 * Hasta nov-2026 anular un canje solo marcaba el canje, con el argumento de
 * que "las facturas nunca tuvieron el saldo tocado". Eso es cierto mientras
 * el canje no haya llegado al ingreso al banco — pero si llegó, el ingreso
 * creó un pago real por factura y la factura queda PAGADA. Pasó: el canje de
 * CORPORACION BOTICAS PERU del 03/11 (FFF1-2002 + FFF1-2488) se anuló por un
 * cambio de facturas aprobadas, y S/ 36.964,84 siguieron figurando cobrados
 * de BANPRO en el estado de cuenta del cliente.
 *
 * Un ingreso puede juntar facturas de más de un canje. En ese caso NO se
 * anula solo: anularlo borraría pagos de facturas que no son de este canje.
 * Se rechaza y se dice qué hay que anular a mano.
 */
async function anularIngresosDelCanje(
  db: ReturnType<typeof supabaseAdmin>,
  canjeId: string,
  motivo: string,
): Promise<{ ingresos: number; pagos: number } | { error: string; status: number }> {
  const { data: filasCanje, error: errCanje } = await db
    .from('factoring_canje_facturas')
    .select('documento_id')
    .eq('canje_id', canjeId);
  if (errCanje) return { error: errCanje.message, status: 500 };

  const docsDelCanje = new Set((filasCanje ?? []).map(f => f.documento_id as string));
  if (docsDelCanje.size === 0) return { ingresos: 0, pagos: 0 };

  const { data: enIngresos, error: errIng } = await db
    .from('factoring_ingreso_facturas')
    .select('ingreso_id')
    .in('documento_id', [...docsDelCanje]);
  if (errIng) return { error: errIng.message, status: 500 };

  const ingresoIds = [...new Set((enIngresos ?? []).map(r => r.ingreso_id as string))];
  if (ingresoIds.length === 0) return { ingresos: 0, pagos: 0 };

  const { data: ingresos, error: errIngresos } = await db
    .from('factoring_ingresos')
    .select('id, anulado')
    .in('id', ingresoIds);
  if (errIngresos) return { error: errIngresos.message, status: 500 };

  const vigentes = (ingresos ?? []).filter(i => !i.anulado).map(i => i.id as string);
  if (vigentes.length === 0) return { ingresos: 0, pagos: 0 };

  // Todas las facturas de cada ingreso vigente, para detectar los mezclados.
  const { data: todasSusFacturas, error: errTodas } = await db
    .from('factoring_ingreso_facturas')
    .select('ingreso_id, documento_id, pago_id')
    .in('ingreso_id', vigentes);
  if (errTodas) return { error: errTodas.message, status: 500 };

  const ajenas = (todasSusFacturas ?? []).filter(f => !docsDelCanje.has(f.documento_id as string));
  if (ajenas.length > 0)
    return {
      error: 'Este canje tiene un ingreso al banco que también cubre facturas de otro canje. Anulá ese ingreso a mano desde Factoring → Ingresos y volvé a intentar.',
      status: 409,
    };

  const pagoIds = (todasSusFacturas ?? []).map(f => f.pago_id).filter((id): id is string => !!id);
  if (pagoIds.length > 0) {
    const { error: errDel } = await db.from('pagos').delete().in('id', pagoIds);
    if (errDel) return { error: errDel.message, status: 500 };
  }

  const { error: errUpd } = await db
    .from('factoring_ingresos')
    .update({
      anulado: true,
      anulado_motivo: `${motivo} — se anula junto con su canje`,
      anulado_en: new Date().toISOString(),
    })
    .in('id', vigentes);
  if (errUpd) return { error: errUpd.message, status: 500 };

  return { ingresos: vigentes.length, pagos: pagoIds.length };
}

/**
 * El tramo que sigue después de que cobramos del factor: el cliente le paga
 * —o no— a la entidad.
 *
 * No toca saldos. La factura ya quedó en cero cuando entró la plata del
 * factor, y que el cliente le pague o no al factor no cambia lo que el
 * cliente nos debe a NOSOTROS. Si el factor devolviera la factura, eso se
 * resuelve anulando el canje (que desde nov-2026 anula también el ingreso),
 * no con un estado más acá.
 */
async function guardarPagosAlFactor(
  canjeId: string,
  pagos: Array<{ documento_id: string; pagado: boolean; fecha_pago: string | null }>,
  registradoPor: string | null,
) {
  const db = supabaseAdmin();

  const { data: filas, error: errFilas } = await db
    .from('factoring_canje_facturas')
    .select('id, documento_id')
    .eq('canje_id', canjeId);
  if (errFilas) return NextResponse.json({ error: errFilas.message }, { status: 500 });
  if (!filas?.length) return NextResponse.json({ error: 'El canje no tiene facturas' }, { status: 404 });

  const filaPorDocumento = new Map(filas.map(f => [f.documento_id as string, f.id as string]));

  for (const p of pagos) {
    if (!filaPorDocumento.has(p.documento_id))
      return NextResponse.json({ error: 'Esa factura no es de este canje' }, { status: 400 });
    // Un "pagado" sin cuándo no sirve para hacer seguimiento, y la base lo
    // rechaza igual (chk_pago_al_factor_con_fecha). Mejor decirlo acá.
    if (p.pagado && !ES_FECHA.test(p.fecha_pago ?? ''))
      return NextResponse.json({ error: 'Indicá la fecha en que el cliente le pagó al factor' }, { status: 400 });
  }

  const ahora = new Date().toISOString();
  for (const p of pagos) {
    const { error } = await db
      .from('factoring_canje_facturas')
      .update({
        pagado_al_factor: p.pagado,
        fecha_pago_al_factor: p.pagado ? p.fecha_pago : null,
        pago_al_factor_registrado_por: p.pagado ? (registradoPor?.trim() || null) : null,
        pago_al_factor_en: p.pagado ? ahora : null,
      })
      .eq('id', filaPorDocumento.get(p.documento_id)!);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, actualizadas: pagos.length });
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
