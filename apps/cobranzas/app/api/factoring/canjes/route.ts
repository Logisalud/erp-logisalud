export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_ESCRITURA, AREAS_LECTURA } from '@/lib/autorizacion';
import { documentosEnFactoringActivo, documentosYaIngresados, retencionesPorDocumento, registrarRetencionDeCanje } from '@/lib/factoring';

// Historial de canjes (Parte 1), con sus facturas, su monto_canje y el
// estado de cada una hoy: 'ingresada' (ya tiene un ingreso al banco activo
// — no necesariamente saldo 0, un factoring parcial deja resto por cobrar),
// 'anulada' (el canje se anuló) o 'en_factoring'.
export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const db = supabaseAdmin();

  const canjes = await fetchAll<{
    id: string; cliente_ruc: string; fecha_canje: string; observaciones: string | null;
    registrado_por: string | null; anulado: boolean; anulado_motivo: string | null; created_at: string;
  }>((from, to) => db.from('factoring_canjes').select('*').order('fecha_canje', { ascending: false }).order('id').range(from, to));

  const canjeIds = canjes.map(c => c.id);
  const canjeFacturas = canjeIds.length
    ? await fetchAll<{ id: string; canje_id: string; documento_id: string; monto_canje: number; fecha_vencimiento: string | null }>((from, to) =>
        db.from('factoring_canje_facturas').select('id, canje_id, documento_id, monto_canje, fecha_vencimiento').in('canje_id', canjeIds).order('id').range(from, to)
      )
    : [];

  const documentoIds = Array.from(new Set(canjeFacturas.map(f => f.documento_id)));
  const docsPorId = new Map<string, { comprobante: string; cliente_ruc: string; razon_social: string; fecha_vencimiento: string | null }>();
  for (let i = 0; i < documentoIds.length; i += 500) {
    const { data } = await db
      .from('v_saldos')
      .select('id, comprobante, cliente_ruc, razon_social, fecha_vencimiento')
      .in('id', documentoIds.slice(i, i + 500));
    for (const d of data ?? []) docsPorId.set(d.id, { comprobante: d.comprobante, cliente_ruc: d.cliente_ruc, razon_social: d.razon_social, fecha_vencimiento: d.fecha_vencimiento });
  }
  const retencionPorDocumento = await retencionesPorDocumento(db, documentoIds);
  const yaIngresados = await documentosYaIngresados(db, documentoIds);

  const clienteRucsCanje = Array.from(new Set(canjes.map(c => c.cliente_ruc)));
  const razonSocialPorRuc = new Map<string, string>();
  for (let i = 0; i < clienteRucsCanje.length; i += 500) {
    const { data } = await db.from('clientes').select('ruc, razon_social').in('ruc', clienteRucsCanje.slice(i, i + 500));
    for (const c of data ?? []) razonSocialPorRuc.set(c.ruc, c.razon_social);
  }

  const facturasPorCanje = new Map<string, typeof canjeFacturas>();
  for (const f of canjeFacturas) {
    const arr = facturasPorCanje.get(f.canje_id) ?? [];
    arr.push(f);
    facturasPorCanje.set(f.canje_id, arr);
  }

  const resultado = canjes.map(c => ({
    ...c,
    razon_social: razonSocialPorRuc.get(c.cliente_ruc) ?? c.cliente_ruc,
    facturas: (facturasPorCanje.get(c.id) ?? []).map(f => {
      const doc = docsPorId.get(f.documento_id);
      const ingresada = yaIngresados.has(f.documento_id);
      return {
        documento_id: f.documento_id,
        comprobante: doc?.comprobante ?? '—',
        monto_canje: Number(f.monto_canje) || 0,
        // Vacía en los canjes anteriores al 2026-11-05: ahí vale la de la factura.
        fecha_vencimiento: f.fecha_vencimiento,
        fecha_vencimiento_factura: doc?.fecha_vencimiento ?? null,
        retencion: retencionPorDocumento.get(f.documento_id) ?? 0,
        estado: ingresada ? 'ingresada' : c.anulado ? 'anulada' : 'en_factoring',
      };
    }),
  }));

  return NextResponse.json({ canjes: resultado }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}

export async function POST(req: NextRequest) {
  const auth = await exigirArea(AREAS_ESCRITURA);
  if (!auth.ok) return auth.respuesta;

  const body = await req.json();
  const { cliente_ruc, fecha_canje, facturas: facturasInput, observaciones, registrado_por } = body as {
    cliente_ruc?: string; fecha_canje?: string;
    facturas?: { documento_id: string; monto_canje: number; fecha_vencimiento?: string | null; retencion?: number }[];
    observaciones?: string; registrado_por?: string;
  };

  if (!cliente_ruc || !fecha_canje || !Array.isArray(facturasInput) || facturasInput.length === 0)
    return NextResponse.json({ error: 'cliente_ruc, fecha_canje y al menos una factura son requeridos' }, { status: 400 });

  const documento_ids = facturasInput.map(f => f.documento_id);
  const montoCanjePorId = new Map(facturasInput.map(f => [f.documento_id, Number(f.monto_canje)]));
  // La fecha que va al contrato con la entidad: puede ser la de la factura o
  // unos días más. Vacía significa "la de la factura", no se inventa.
  const vencimientoPorId = new Map(facturasInput.map(f => [f.documento_id, f.fecha_vencimiento?.trim() || null]));
  const retencionPorId = new Map(facturasInput.map(f => [f.documento_id, Number(f.retencion) || 0]));

  const db = supabaseAdmin();

  const { data: saldos, error: errSaldos } = await db
    .from('v_saldos')
    .select('id, comprobante, cliente_ruc, tiene_letras, saldo_pendiente')
    .in('id', documento_ids);
  if (errSaldos) return NextResponse.json({ error: errSaldos.message }, { status: 500 });

  const saldoPorId = new Map((saldos ?? []).map(s => [s.id, s]));
  const enFactoring = await documentosEnFactoringActivo(db, documento_ids);

  for (const id of documento_ids) {
    const s = saldoPorId.get(id);
    if (!s) return NextResponse.json({ error: `Factura ${id} no encontrada` }, { status: 400 });
    if (s.cliente_ruc !== cliente_ruc)
      return NextResponse.json({ error: `${s.comprobante} no pertenece al cliente seleccionado` }, { status: 400 });
    if (s.tiene_letras)
      return NextResponse.json({ error: `${s.comprobante} tiene letras — no se puede pasar a factoring.` }, { status: 400 });
    if (Number(s.saldo_pendiente) <= 0)
      return NextResponse.json({ error: `${s.comprobante} no tiene saldo pendiente.` }, { status: 400 });
    if (enFactoring.has(id))
      return NextResponse.json({ error: `${s.comprobante} ya está en factoring.` }, { status: 400 });
    const monto = montoCanjePorId.get(id);
    if (!monto || monto <= 0)
      return NextResponse.json({ error: `Indica el valor a factorizar de ${s.comprobante}.` }, { status: 400 });
    if (monto > Number(s.saldo_pendiente) + 0.005)
      return NextResponse.json({ error: `El valor a factorizar de ${s.comprobante} no puede superar su saldo pendiente (${s.saldo_pendiente}).` }, { status: 400 });

    const venc = vencimientoPorId.get(id);
    if (venc && !/^\d{4}-\d{2}-\d{2}$/.test(venc))
      return NextResponse.json({ error: `La fecha de vencimiento de ${s.comprobante} no es una fecha válida.` }, { status: 400 });

    const ret = retencionPorId.get(id) ?? 0;
    if (ret < 0)
      return NextResponse.json({ error: `La retención de ${s.comprobante} no puede ser negativa.` }, { status: 400 });
    // El canje más la retención no pueden pasar lo que la factura debe: si
    // pasa, uno de los dos números está mal y es mejor frenar que guardar
    // una retención que después nadie va a poder explicar.
    if (ret > 0 && monto + ret > Number(s.saldo_pendiente) + 0.005)
      return NextResponse.json({ error: `El valor a factorizar más la retención de ${s.comprobante} (${(monto + ret).toFixed(2)}) superan su saldo pendiente (${s.saldo_pendiente}).` }, { status: 400 });
  }

  const { data: canje, error: errCanje } = await db
    .from('factoring_canjes')
    .insert({
      cliente_ruc,
      fecha_canje,
      observaciones: observaciones?.trim() || null,
      registrado_por: registrado_por?.trim() || null,
    })
    .select()
    .single();
  if (errCanje) return NextResponse.json({ error: errCanje.message }, { status: 500 });

  const filas = documento_ids.map(id => ({
    canje_id: canje.id,
    documento_id: id,
    monto_canje: montoCanjePorId.get(id),
    fecha_vencimiento: vencimientoPorId.get(id) ?? null,
  }));
  const { error: errFilas } = await db.from('factoring_canje_facturas').insert(filas);
  if (errFilas) {
    await db.from('factoring_canjes').update({ anulado: true, anulado_motivo: 'Error al insertar facturas — ver logs' }).eq('id', canje.id);
    return NextResponse.json({ error: errFilas.message }, { status: 500 });
  }

  // La retención va al mismo lugar de siempre (`pagos` con tipo='retencion'),
  // no a una columna nueva de factoring: ver el comentario de la migración
  // 20261105. Si falla, el canje ya quedó registrado y se avisa, en vez de
  // tirar abajo una operación que está bien.
  const retenciones = documento_ids
    .map(id => ({ documento_id: id, monto: retencionPorId.get(id) ?? 0 }))
    .filter(r => r.monto > 0);
  const avisoRetencion = await registrarRetencionDeCanje(db, retenciones, fecha_canje, 'factoring', registrado_por);

  return NextResponse.json({ canje, aviso: avisoRetencion });
}
