export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_ESCRITURA, AREAS_LECTURA } from '@/lib/autorizacion';

// Lista las operaciones de factoring con sus facturas (para la pantalla de
// historial). Trae todo (anuladas incluidas) — la pantalla las muestra
// tachadas, no las esconde: anular una operación es una corrección visible,
// no un borrado silencioso.
export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const db = supabaseAdmin();

  const operaciones = await fetchAll<{
    id: string; entidad: string; fecha_operacion: string; monto_adelantado: number;
    porcentaje_adelanto: number | null; comision: number | null; referencia: string | null;
    observaciones: string | null; registrado_por: string | null; anulada: boolean;
    anulada_motivo: string | null; created_at: string;
  }>((from, to) =>
    db.from('factoring_operaciones').select('*').order('fecha_operacion', { ascending: false }).range(from, to)
  );

  const operacionIds = operaciones.map(o => o.id);
  const facturas = operacionIds.length
    ? await fetchAll<{ id: string; operacion_id: string; documento_id: string; monto_factorizado: number }>((from, to) =>
        db.from('factoring_facturas').select('id, operacion_id, documento_id, monto_factorizado').in('operacion_id', operacionIds).range(from, to)
      )
    : [];

  const documentoIds = Array.from(new Set(facturas.map(f => f.documento_id)));
  const documentosPorId = new Map<string, { comprobante: string; cliente_ruc: string; razon_social: string }>();
  for (let i = 0; i < documentoIds.length; i += 500) {
    const { data } = await db
      .from('documentos')
      .select('id, serie, numero, cliente_ruc, clientes(razon_social)')
      .in('id', documentoIds.slice(i, i + 500));
    for (const d of (data ?? []) as unknown as { id: string; serie: string; numero: number; cliente_ruc: string; clientes: { razon_social: string } | null }[]) {
      documentosPorId.set(d.id, {
        comprobante: `${d.serie}-${d.numero}`,
        cliente_ruc: d.cliente_ruc,
        razon_social: d.clientes?.razon_social ?? d.cliente_ruc,
      });
    }
  }

  const facturasPorOperacion = new Map<string, typeof facturas>();
  for (const f of facturas) {
    const arr = facturasPorOperacion.get(f.operacion_id) ?? [];
    arr.push(f);
    facturasPorOperacion.set(f.operacion_id, arr);
  }

  const resultado = operaciones.map(o => ({
    ...o,
    facturas: (facturasPorOperacion.get(o.id) ?? []).map(f => ({
      ...f,
      ...documentosPorId.get(f.documento_id),
    })),
  }));

  return NextResponse.json({ operaciones: resultado }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}

// Registra una operación de factoring: una entidad, una fecha, un adelanto,
// y las facturas que se le vendieron. El monto_factorizado de cada factura
// es su saldo_pendiente ACTUAL (no lo manda el cliente) — se factoriza la
// factura entera, nunca una parte, así el saldo baja a 0 de forma
// consistente con v_cobros (ver migración 20261005_factoring.sql).
export async function POST(req: NextRequest) {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  const body = await req.json();
  const { entidad, fecha_operacion, monto_adelantado, porcentaje_adelanto, comision, referencia, observaciones, registrado_por, documento_ids } = body as {
    entidad?: string;
    fecha_operacion?: string;
    monto_adelantado?: number;
    porcentaje_adelanto?: number;
    comision?: number;
    referencia?: string;
    observaciones?: string;
    registrado_por?: string;
    documento_ids?: string[];
  };

  if (!entidad?.trim() || !fecha_operacion || monto_adelantado === undefined || !Array.isArray(documento_ids) || documento_ids.length === 0)
    return NextResponse.json(
      { error: 'entidad, fecha_operacion, monto_adelantado y al menos una factura son requeridos' },
      { status: 400 }
    );
  if (Number(monto_adelantado) < 0)
    return NextResponse.json({ error: 'El monto adelantado no puede ser negativo' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: saldos, error: errSaldos } = await db
    .from('v_saldos')
    .select('id, comprobante, tiene_letras, factorizado, saldo_pendiente')
    .in('id', documento_ids);
  if (errSaldos) return NextResponse.json({ error: errSaldos.message }, { status: 500 });

  const saldoPorId = new Map((saldos ?? []).map(s => [s.id, s]));
  for (const id of documento_ids) {
    const s = saldoPorId.get(id);
    if (!s) return NextResponse.json({ error: `Factura ${id} no encontrada` }, { status: 400 });
    if (s.tiene_letras)
      return NextResponse.json({ error: `${s.comprobante} tiene letras — no se puede factorizar (se cobra marcando la letra).` }, { status: 400 });
    if (s.factorizado)
      return NextResponse.json({ error: `${s.comprobante} ya está factorizada.` }, { status: 400 });
    if (Number(s.saldo_pendiente) <= 0)
      return NextResponse.json({ error: `${s.comprobante} no tiene saldo pendiente — no hay nada que factorizar.` }, { status: 400 });
  }

  const { data: operacion, error: errOp } = await db
    .from('factoring_operaciones')
    .insert({
      entidad: entidad.trim(),
      fecha_operacion,
      monto_adelantado: Number(monto_adelantado),
      porcentaje_adelanto: porcentaje_adelanto !== undefined ? Number(porcentaje_adelanto) : null,
      comision: comision !== undefined ? Number(comision) : null,
      referencia: referencia?.trim() || null,
      observaciones: observaciones?.trim() || null,
      registrado_por: registrado_por?.trim() || null,
    })
    .select()
    .single();
  if (errOp) return NextResponse.json({ error: errOp.message }, { status: 500 });

  const filas = documento_ids.map(id => ({
    operacion_id: operacion.id,
    documento_id: id,
    monto_factorizado: Number(saldoPorId.get(id)!.saldo_pendiente),
  }));

  const { data: facturasInsertadas, error: errFact } = await db.from('factoring_facturas').insert(filas).select();
  if (errFact) {
    // La operación quedó huérfana si esto falla — se borra para no dejar un
    // registro con 0 facturas, ya que ninguna API la deja crear así a propósito.
    await db.from('factoring_operaciones').delete().eq('id', operacion.id);
    return NextResponse.json({ error: errFact.message }, { status: 500 });
  }

  return NextResponse.json({ operacion, facturas: facturasInsertadas });
}
