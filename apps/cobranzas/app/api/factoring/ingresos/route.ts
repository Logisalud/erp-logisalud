export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_ESCRITURA, AREAS_LECTURA } from '@/lib/autorizacion';
import { documentosPendientesDeIngreso } from '@/lib/factoring';

type GastoInput = {
  tipo: 'garantia' | 'comision' | 'otros';
  monto: number;
  incluye_igv?: boolean;
  numero_factura?: string;
  recuperado?: boolean;
  observaciones?: string;
};

export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const db = supabaseAdmin();

  const ingresos = await fetchAll<{
    id: string; entidad: string; fecha_ingreso: string; monto_neto_recibido: number;
    referencia: string | null; observaciones: string | null; registrado_por: string | null;
    anulado: boolean; anulado_motivo: string | null; created_at: string;
  }>((from, to) => db.from('factoring_ingresos').select('*').order('fecha_ingreso', { ascending: false }).order('id').range(from, to));

  const ingresoIds = ingresos.map(i => i.id);
  const facturas = ingresoIds.length
    ? await fetchAll<{ id: string; ingreso_id: string; documento_id: string; monto_factorizado: number; pago_id: string | null }>((from, to) =>
        db.from('factoring_ingreso_facturas').select('*').in('ingreso_id', ingresoIds).order('id').range(from, to)
      )
    : [];
  const gastos = ingresoIds.length
    ? await fetchAll<{ id: string; ingreso_id: string; tipo: string; monto: number; incluye_igv: boolean | null; numero_factura: string | null; recuperado: boolean; observaciones: string | null }>((from, to) =>
        db.from('factoring_gastos').select('*').in('ingreso_id', ingresoIds).order('id').range(from, to)
      )
    : [];

  const documentoIds = Array.from(new Set(facturas.map(f => f.documento_id)));
  const docsPorId = new Map<string, { comprobante: string; cliente_ruc: string; razon_social: string }>();
  for (let i = 0; i < documentoIds.length; i += 500) {
    const { data } = await db.from('documentos').select('id, serie, numero, cliente_ruc, clientes(razon_social)').in('id', documentoIds.slice(i, i + 500));
    for (const d of (data ?? []) as unknown as { id: string; serie: string; numero: number; cliente_ruc: string; clientes: { razon_social: string } | null }[]) {
      docsPorId.set(d.id, { comprobante: `${d.serie}-${d.numero}`, cliente_ruc: d.cliente_ruc, razon_social: d.clientes?.razon_social ?? d.cliente_ruc });
    }
  }

  const facturasPorIngreso = new Map<string, typeof facturas>();
  for (const f of facturas) { const arr = facturasPorIngreso.get(f.ingreso_id) ?? []; arr.push(f); facturasPorIngreso.set(f.ingreso_id, arr); }
  const gastosPorIngreso = new Map<string, typeof gastos>();
  for (const g of gastos) { const arr = gastosPorIngreso.get(g.ingreso_id) ?? []; arr.push(g); gastosPorIngreso.set(g.ingreso_id, arr); }

  const resultado = ingresos.map(i => ({
    ...i,
    facturas: (facturasPorIngreso.get(i.id) ?? []).map(f => ({ ...f, ...docsPorId.get(f.documento_id) })),
    gastos: gastosPorIngreso.get(i.id) ?? [],
  }));

  return NextResponse.json({ ingresos: resultado }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}

// Registra el ingreso real al banco: crea un PAGO real por cada factura,
// por su monto_canje (el valor acordado al canjearla, no siempre el
// saldo_pendiente completo — puede quedar un resto por retención o un %
// no factorizado), y los gastos financieros asociados. Todas las facturas
// deben ser del MISMO cliente y estar pendientes de ingreso.
export async function POST(req: NextRequest) {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  const body = await req.json();
  const { entidad, fecha_ingreso, monto_neto_recibido, referencia, observaciones, registrado_por, documento_ids, gastos } = body as {
    entidad?: string; fecha_ingreso?: string; monto_neto_recibido?: number;
    referencia?: string; observaciones?: string; registrado_por?: string;
    documento_ids?: string[]; gastos?: GastoInput[];
  };

  if (!entidad?.trim() || !fecha_ingreso || monto_neto_recibido === undefined || !Array.isArray(documento_ids) || documento_ids.length === 0)
    return NextResponse.json({ error: 'entidad, fecha_ingreso, monto_neto_recibido y al menos una factura son requeridos' }, { status: 400 });
  if (Number(monto_neto_recibido) < 0)
    return NextResponse.json({ error: 'El monto neto recibido no puede ser negativo' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: saldos, error: errSaldos } = await db
    .from('v_saldos')
    .select('id, comprobante, cliente_ruc, tiene_letras, saldo_pendiente')
    .in('id', documento_ids);
  if (errSaldos) return NextResponse.json({ error: errSaldos.message }, { status: 500 });

  const saldoPorId = new Map((saldos ?? []).map(s => [s.id, s]));
  const pendientesDeIngreso = await documentosPendientesDeIngreso(db, documento_ids);

  const clientesDistintos = new Set((saldos ?? []).map(s => s.cliente_ruc));
  if (clientesDistintos.size > 1)
    return NextResponse.json({ error: 'Todas las facturas del ingreso deben ser del mismo cliente' }, { status: 400 });

  for (const id of documento_ids) {
    const s = saldoPorId.get(id);
    if (!s) return NextResponse.json({ error: `Factura ${id} no encontrada` }, { status: 400 });
    if (!pendientesDeIngreso.has(id))
      return NextResponse.json({ error: `${s.comprobante} no está en factoring pendiente de ingreso (hay que canjearla primero).` }, { status: 400 });
    if (Number(s.saldo_pendiente) <= 0)
      return NextResponse.json({ error: `${s.comprobante} ya no tiene saldo pendiente.` }, { status: 400 });
    const montoCanje = pendientesDeIngreso.get(id)!;
    if (montoCanje > Number(s.saldo_pendiente) + 0.005)
      return NextResponse.json({ error: `${s.comprobante}: el valor canjeado (${montoCanje}) supera su saldo pendiente actual (${s.saldo_pendiente}) — revisar.` }, { status: 400 });
  }

  const { data: ingreso, error: errIngreso } = await db
    .from('factoring_ingresos')
    .insert({
      entidad: entidad.trim(),
      fecha_ingreso,
      monto_neto_recibido: Number(monto_neto_recibido),
      referencia: referencia?.trim() || null,
      observaciones: observaciones?.trim() || null,
      registrado_por: registrado_por?.trim() || null,
    })
    .select()
    .single();
  if (errIngreso) return NextResponse.json({ error: errIngreso.message }, { status: 500 });

  // Un pago real por factura — mismo mecanismo que /api/pagos, medio_cobro
  // 'transferencia' porque es dinero real que entró por transferencia del
  // factor. Se identifica como pago de factoring por el link en
  // factoring_ingreso_facturas.pago_id, no por un medio_cobro aparte.
  const pagosRows = documento_ids.map(id => ({
    documento_id: id,
    monto: pendientesDeIngreso.get(id)!,
    fecha_pago: fecha_ingreso,
    referencia: `Factoring: ${entidad.trim()}`,
    tipo: 'pago' as const,
    medio_cobro: 'transferencia' as const,
    registrado_por: registrado_por?.trim() || null,
  }));

  const { data: pagosCreados, error: errPagos } = await db.from('pagos').insert(pagosRows).select();
  if (errPagos) {
    await db.from('factoring_ingresos').update({ anulado: true, anulado_motivo: 'Error al crear los pagos — ver logs' }).eq('id', ingreso.id);
    return NextResponse.json({ error: errPagos.message }, { status: 500 });
  }

  const pagoPorDocumento = new Map((pagosCreados ?? []).map(p => [p.documento_id as string, p.id as string]));
  const ingresoFacturasRows = documento_ids.map(id => ({
    ingreso_id: ingreso.id,
    documento_id: id,
    monto_factorizado: pendientesDeIngreso.get(id)!,
    pago_id: pagoPorDocumento.get(id) ?? null,
  }));
  const { error: errIF } = await db.from('factoring_ingreso_facturas').insert(ingresoFacturasRows);
  if (errIF) return NextResponse.json({ error: errIF.message }, { status: 500 });

  const gastosValidos = (gastos ?? []).filter(g => g.monto > 0);
  if (gastosValidos.length > 0) {
    const gastosRows = gastosValidos.map(g => ({
      ingreso_id: ingreso.id,
      tipo: g.tipo,
      monto: Number(g.monto),
      incluye_igv: g.tipo === 'comision' ? !!g.incluye_igv : null,
      numero_factura: g.tipo === 'comision' ? (g.numero_factura?.trim() || null) : null,
      recuperado: g.tipo === 'garantia' ? !!g.recuperado : false,
      observaciones: g.observaciones?.trim() || null,
    }));
    const { error: errGastos } = await db.from('factoring_gastos').insert(gastosRows);
    if (errGastos) return NextResponse.json({ error: errGastos.message }, { status: 500 });
  }

  return NextResponse.json({ ingreso });
}
