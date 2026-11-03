import type { SupabaseClient } from '@supabase/supabase-js';
import {
  UMBRALES, PLAZO_MEDICION_BASE_DIAS, PLAZO_MEDICION_EXTENDIDO_DIAS,
  PLAZO_FACTURA_UMBRAL_EXTENDIDO, INDICADOR6_INCLUYE_RETENCIONES,
  type UmbralIndicador,
} from './configIndicadores';

// Los 6 indicadores de cobranza (Bloque B). Cálculo "as-of fecha_corte":
// documentos emitidos <= corte, NC/ND <= corte, pagos con fecha_pago <=
// corte. Fuente: fn_saldo_documentos_asof / fn_ventas_con_deuda_vencida
// (supabase/migrations/20261103_fn_indicadores_cobranza.sql y
// 20261103b_fn_ventas_deuda_vencida.sql) — ambas de solo lectura, no
// tocan v_cobros ni v_saldos.
//
// Letras: igual regla que Bloque A — el saldo de un documento canjeado
// usa sus letras no pagadas, y su "vencimiento" para ventanas es el de la
// letra peor. Limitación documentada: `letras.estado` no tiene historial
// por fecha, así que un corte pasado usa el estado ACTUAL de la letra.
// El Indicador 4 (venta a deudores) EXCLUYE del chequeo de "deuda vieja"
// los documentos canjeados a letras, por la misma razón — no se puede
// saber si una letra estaba pendiente en una fecha pasada arbitraria.

export type Semaforo = 'ok' | 'alerta' | 'critico';

export function semaforoPorUmbral(valor: number, u: UmbralIndicador): Semaforo {
  if (u.mejorSiSube) {
    if (valor >= u.verdeDesde) return 'ok';
    if (valor >= u.ambarDesde) return 'alerta';
    return 'critico';
  }
  if (valor <= u.verdeDesde) return 'ok';
  if (valor <= u.ambarDesde) return 'alerta';
  return 'critico';
}

type FilaSaldoAsof = {
  documento_id: string; cliente_ruc: string; vendedor_id: string | null; vendedor_nombre: string;
  fecha_emision: string; fecha_vencimiento: string; forma_pago: string;
  importe_neto: number; saldo: number; tiene_letras: boolean; fecha_vencimiento_efectiva: string;
};

async function cargarSaldoAsof(db: SupabaseClient, fechaCorte: string): Promise<FilaSaldoAsof[]> {
  const { data, error } = await db.rpc('fn_saldo_documentos_asof', { p_fecha_corte: fechaCorte });
  if (error) throw new Error(error.message);
  return (data ?? []) as FilaSaldoAsof[];
}

function diffDias(a: string, b: string): number {
  return Math.round((new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime()) / 86400000);
}

function sumaDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// ---------- 1) Efectividad de cobranza ----------

export type FilaEfectividadVendedor = { vendedorId: string | null; vendedor: string; vencido: number; cobrado: number; pendiente: number; efectividad: number };

export async function calcularEfectividadCobranza(db: SupabaseClient, fechaCorte: string) {
  const filas = await cargarSaldoAsof(db, fechaCorte);
  const inicioVentana = sumaDias(fechaCorte, -30);
  const enVentana = filas.filter(f => f.fecha_vencimiento > inicioVentana && f.fecha_vencimiento <= fechaCorte);

  const vencido = enVentana.reduce((s, f) => s + Number(f.importe_neto), 0);
  const pendiente = enVentana.reduce((s, f) => s + Number(f.saldo), 0);
  const cobrado = vencido - pendiente;
  const efectividad = vencido > 0 ? (cobrado / vencido) * 100 : 0;

  const porVendedor = new Map<string, FilaEfectividadVendedor>();
  for (const f of enVentana) {
    const key = f.vendedor_id ?? 'sin-vendedor';
    const acc = porVendedor.get(key) ?? { vendedorId: f.vendedor_id, vendedor: f.vendedor_nombre, vencido: 0, cobrado: 0, pendiente: 0, efectividad: 0 };
    acc.vencido += Number(f.importe_neto);
    acc.pendiente += Number(f.saldo);
    porVendedor.set(key, acc);
  }
  const vendedores = Array.from(porVendedor.values()).map(v => ({ ...v, cobrado: v.vencido - v.pendiente, efectividad: v.vencido > 0 ? ((v.vencido - v.pendiente) / v.vencido) * 100 : 0 }));

  const dondeEnfocarse = enVentana
    .filter(f => f.saldo > 0)
    .reduce((acc, f) => {
      const ex = acc.find(x => x.clienteRuc === f.cliente_ruc);
      const dias = diffDias(fechaCorte, f.fecha_vencimiento);
      if (ex) { ex.pendiente += Number(f.saldo); ex.docs += 1; ex.diasVencido = Math.max(ex.diasVencido, dias); }
      else acc.push({ clienteRuc: f.cliente_ruc, vendedor: f.vendedor_nombre, docs: 1, diasVencido: dias, pendiente: Number(f.saldo) });
      return acc;
    }, [] as { clienteRuc: string; vendedor: string; docs: number; diasVencido: number; pendiente: number }[])
    .sort((a, b) => b.pendiente - a.pendiente)
    .slice(0, 5);

  return {
    valor: efectividad,
    meta: UMBRALES.efectividadCobranza.meta,
    semaforo: semaforoPorUmbral(efectividad, UMBRALES.efectividadCobranza),
    vencido, cobrado, pendiente,
    vendedores: vendedores.sort((a, b) => a.efectividad - b.efectividad),
    dondeEnfocarse,
  };
}

// ---------- 2) DSO frente al plazo otorgado ----------

export async function calcularDSO(db: SupabaseClient, fechaCorte: string) {
  const filas = await cargarSaldoAsof(db, fechaCorte);
  const inicio90 = sumaDias(fechaCorte, -90);
  const ventas90 = filas.filter(f => f.fecha_emision > inicio90 && f.fecha_emision <= fechaCorte);

  const saldoTotal = filas.reduce((s, f) => s + Number(f.saldo), 0);
  const ventaPromedioDia = ventas90.reduce((s, f) => s + Number(f.importe_neto), 0) / 90;
  const dso = ventaPromedioDia > 0 ? saldoTotal / ventaPromedioDia : 0;

  const sumaMontoPlazo = ventas90.reduce((s, f) => {
    const plazo = f.forma_pago === 'CONTADO' ? 0 : diffDias(f.fecha_vencimiento, f.fecha_emision);
    return s + plazo * Number(f.importe_neto);
  }, 0);
  const sumaMonto = ventas90.reduce((s, f) => s + Number(f.importe_neto), 0);
  const plazoOtorgado = sumaMonto > 0 ? sumaMontoPlazo / sumaMonto : 0;
  const brecha = dso - plazoOtorgado;

  const porVendedor = new Map<string, { vendedorId: string | null; vendedor: string; saldo: number; montoPlazo: number; monto: number; ventaDia: number }>();
  for (const f of filas) {
    const key = f.vendedor_id ?? 'sin-vendedor';
    const acc = porVendedor.get(key) ?? { vendedorId: f.vendedor_id, vendedor: f.vendedor_nombre, saldo: 0, montoPlazo: 0, monto: 0, ventaDia: 0 };
    acc.saldo += Number(f.saldo);
    porVendedor.set(key, acc);
  }
  for (const f of ventas90) {
    const key = f.vendedor_id ?? 'sin-vendedor';
    const acc = porVendedor.get(key);
    if (!acc) continue;
    const plazo = f.forma_pago === 'CONTADO' ? 0 : diffDias(f.fecha_vencimiento, f.fecha_emision);
    acc.montoPlazo += plazo * Number(f.importe_neto);
    acc.monto += Number(f.importe_neto);
    acc.ventaDia += Number(f.importe_neto) / 90;
  }
  const vendedores = Array.from(porVendedor.values()).map(v => {
    const dsoV = v.ventaDia > 0 ? v.saldo / v.ventaDia : 0;
    const plazoV = v.monto > 0 ? v.montoPlazo / v.monto : 0;
    return { vendedorId: v.vendedorId, vendedor: v.vendedor, dso: dsoV, plazo: plazoV, brecha: dsoV - plazoV, saldo: v.saldo };
  }).filter(v => v.saldo > 0);

  const dondeEnfocarse = vendedores.sort((a, b) => b.brecha - a.brecha).slice(0, 5);

  return {
    valor: dso,
    meta: UMBRALES.dsoBrechaDias.meta,
    semaforo: semaforoPorUmbral(brecha, UMBRALES.dsoBrechaDias),
    dso, plazoOtorgado, brecha,
    vendedores: vendedores.sort((a, b) => b.brecha - a.brecha),
    dondeEnfocarse,
  };
}

// ---------- 3) Morosidad dura (>60 días) ----------

export async function calcularMorosidadDura(db: SupabaseClient, fechaCorte: string) {
  const filas = await cargarSaldoAsof(db, fechaCorte);
  const saldoTotal = filas.reduce((s, f) => s + Number(f.saldo), 0);

  const mas60 = filas.filter(f => f.saldo > 0 && diffDias(fechaCorte, f.fecha_vencimiento_efectiva) > 60);
  const saldoMas60 = mas60.reduce((s, f) => s + Number(f.saldo), 0);
  const clientesMas60 = new Set(mas60.map(f => f.cliente_ruc));
  const pct = saldoTotal > 0 ? (saldoMas60 / saldoTotal) * 100 : 0;

  const porCliente = new Map<string, { clienteRuc: string; vendedor: string; docs: number; maxDias: number; monto: number }>();
  for (const f of mas60) {
    const acc = porCliente.get(f.cliente_ruc) ?? { clienteRuc: f.cliente_ruc, vendedor: f.vendedor_nombre, docs: 0, maxDias: 0, monto: 0 };
    acc.docs += 1;
    acc.monto += Number(f.saldo);
    acc.maxDias = Math.max(acc.maxDias, diffDias(fechaCorte, f.fecha_vencimiento_efectiva));
    porCliente.set(f.cliente_ruc, acc);
  }
  const dondeEnfocarse = Array.from(porCliente.values()).sort((a, b) => b.monto - a.monto).slice(0, 5);

  return {
    valor: pct,
    meta: UMBRALES.morosidadDura.meta,
    semaforo: semaforoPorUmbral(pct, UMBRALES.morosidadDura),
    saldoTotal, saldoMas60, nClientes: clientesMas60.size,
    dondeEnfocarse,
  };
}

// ---------- 4) Venta a clientes con deuda vencida ----------

type FilaVentaDeuda = { documento_id: string; cliente_ruc: string; razon_social: string; vendedor_nombre: string; fecha_emision: string; venta: number; deuda_vencida_30: number; deuda_vencida_60: number };

export async function calcularVentaDeudaVencida(db: SupabaseClient, fechaCorte: string) {
  const { data, error } = await db.rpc('fn_ventas_con_deuda_vencida', { p_fecha_corte: fechaCorte });
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as FilaVentaDeuda[];

  const ventasMes = filas.reduce((s, f) => s + Number(f.venta), 0);
  const aDeudores30 = filas.filter(f => f.deuda_vencida_30 > 0);
  const ventaADeudores = aDeudores30.reduce((s, f) => s + Number(f.venta), 0);
  const pct = ventasMes > 0 ? (ventaADeudores / ventasMes) * 100 : 0;

  const alertaVenta60 = filas.filter(f => f.deuda_vencida_60 > 0);

  const porCliente = new Map<string, { clienteRuc: string; razonSocial: string; vendedor: string; ventaMes: number; deudaVencida: number }>();
  for (const f of aDeudores30) {
    const acc = porCliente.get(f.cliente_ruc) ?? { clienteRuc: f.cliente_ruc, razonSocial: f.razon_social, vendedor: f.vendedor_nombre, ventaMes: 0, deudaVencida: 0 };
    acc.ventaMes += Number(f.venta);
    acc.deudaVencida = Math.max(acc.deudaVencida, Number(f.deuda_vencida_30));
    porCliente.set(f.cliente_ruc, acc);
  }
  const dondeEnfocarse = Array.from(porCliente.values()).sort((a, b) => b.deudaVencida - a.deudaVencida).slice(0, 5);

  return {
    valor: pct,
    meta: UMBRALES.ventaDeudaVencida.meta,
    semaforo: semaforoPorUmbral(pct, UMBRALES.ventaDeudaVencida),
    ventasMes, ventaADeudores,
    alertaVenta60Count: new Set(alertaVenta60.map(f => f.cliente_ruc)).size,
    dondeEnfocarse,
  };
}

// ---------- 5) Cobro de lo vendido ----------

export async function calcularCobroDeLoVendido(db: SupabaseClient, fechaCorte: string) {
  // Necesita pagos reales (no solo saldo as-of): "cobrado en plazo" = pagos
  // con fecha_pago <= emision + ventana. Se consulta documentos+pagos
  // directo (no fn_saldo_documentos_asof, que da saldo a UN corte, no
  // "cobrado dentro de una ventana desde la emisión").
  const { data: docs, error: errDocs } = await db
    .from('documentos')
    .select('id, cliente_ruc, fecha_emision, fecha_vencimiento, importe_total, forma_pago')
    .in('tipo', ['01', '03'])
    .eq('anulado', false)
    .not('aceptado_sunat', 'is', false)
    .lte('fecha_emision', fechaCorte);
  if (errDocs) throw new Error(errDocs.message);

  const rucs = Array.from(new Set((docs ?? []).map(d => d.cliente_ruc)));
  const vendedorPorRuc = new Map<string, { id: string | null; nombre: string }>();
  for (let i = 0; i < rucs.length; i += 500) {
    const { data: clientesData } = await db.from('clientes').select('ruc, vendedor_actual_id').in('ruc', rucs.slice(i, i + 500));
    for (const c of clientesData ?? []) vendedorPorRuc.set(c.ruc, { id: c.vendedor_actual_id, nombre: 'Sin vendedor' });
  }
  const vendedorIds = Array.from(new Set(Array.from(vendedorPorRuc.values()).map(v => v.id).filter(Boolean))) as string[];
  if (vendedorIds.length) {
    const { data: vendedoresData } = await db.from('vendedores').select('id, nombres, apellidos').in('id', vendedorIds);
    const nombrePorId = new Map((vendedoresData ?? []).map(v => [v.id, `${v.nombres} ${v.apellidos}`]));
    for (const [ruc, v] of vendedorPorRuc) if (v.id) v.nombre = nombrePorId.get(v.id) ?? 'Sin vendedor';
    void rucs;
  }

  const docIds = (docs ?? []).map(d => d.id);
  const pagosDetalle: { documento_id: string; monto: number; fecha_pago: string }[] = [];
  for (let i = 0; i < docIds.length; i += 500) {
    const { data } = await db.from('pagos').select('documento_id, monto, fecha_pago').in('documento_id', docIds.slice(i, i + 500));
    pagosDetalle.push(...((data ?? []) as { documento_id: string; monto: number; fecha_pago: string }[]));
  }
  const pagosPorDocumento = new Map<string, { monto: number; fecha_pago: string }[]>();
  for (const p of pagosDetalle) {
    const arr = pagosPorDocumento.get(p.documento_id) ?? [];
    arr.push(p);
    pagosPorDocumento.set(p.documento_id, arr);
  }

  const inicioVentana = sumaDias(fechaCorte, -30);
  const porVendedor = new Map<string, { vendedorId: string | null; vendedor: string; vendido: number; cobradoEnPlazo: number }>();

  for (const d of docs ?? []) {
    const plazoFactura = d.forma_pago === 'CONTADO' ? 0 : diffDias(d.fecha_vencimiento ?? d.fecha_emision, d.fecha_emision);
    const ventana = plazoFactura >= PLAZO_FACTURA_UMBRAL_EXTENDIDO ? PLAZO_MEDICION_EXTENDIDO_DIAS : PLAZO_MEDICION_BASE_DIAS;
    const finVentana = sumaDias(d.fecha_emision, ventana);
    // Solo entran a la medición las ventas cuyo plazo de medición venció
    // en los últimos 30 días hasta el corte.
    if (!(finVentana > inicioVentana && finVentana <= fechaCorte)) continue;

    const vendedorInfo = vendedorPorRuc.get(d.cliente_ruc);
    const vendedorId = vendedorInfo?.id ?? null;
    const vendedorNombre = vendedorInfo?.nombre ?? 'Sin vendedor';

    const pagosDoc = pagosPorDocumento.get(d.id) ?? [];
    const cobradoEnPlazo = pagosDoc.filter(p => p.fecha_pago <= finVentana).reduce((s, p) => s + Number(p.monto), 0);
    const cobradoEnPlazoAcotado = Math.min(cobradoEnPlazo, Number(d.importe_total));

    const key = vendedorId ?? 'sin-vendedor';
    const acc = porVendedor.get(key) ?? { vendedorId, vendedor: vendedorNombre, vendido: 0, cobradoEnPlazo: 0 };
    acc.vendido += Number(d.importe_total);
    acc.cobradoEnPlazo += cobradoEnPlazoAcotado;
    porVendedor.set(key, acc);
  }

  const vendedores = Array.from(porVendedor.values()).map(v => ({ ...v, pct: v.vendido > 0 ? (v.cobradoEnPlazo / v.vendido) * 100 : 0 }));
  const vendidoTotal = vendedores.reduce((s, v) => s + v.vendido, 0);
  const cobradoTotal = vendedores.reduce((s, v) => s + v.cobradoEnPlazo, 0);
  const pct = vendidoTotal > 0 ? (cobradoTotal / vendidoTotal) * 100 : 0;

  const dondeEnfocarse = vendedores.filter(v => v.vendido > 0).sort((a, b) => a.pct - b.pct).slice(0, 5);

  return {
    valor: pct,
    meta: UMBRALES.cobroDeLoVendido.meta,
    semaforo: semaforoPorUmbral(pct, UMBRALES.cobroDeLoVendido),
    vendidoTotal, cobradoTotal,
    vendedores: vendedores.filter(v => v.vendido > 0).sort((a, b) => a.pct - b.pct),
    dondeEnfocarse,
    piloto: true,
  };
}

// ---------- 6) Registro oportuno de cobranzas ----------

function esFinDeSemana(fechaISO: string): boolean {
  const dow = new Date(fechaISO + 'T00:00:00Z').getUTCDay();
  return dow === 0 || dow === 6;
}

function diasHabilesEntre(desde: string, hasta: string): number {
  if (hasta <= desde) return 0;
  let dias = 0;
  let cursor = desde;
  while (cursor < hasta) {
    cursor = sumaDias(cursor, 1);
    if (!esFinDeSemana(cursor)) dias++;
  }
  return dias;
}

export async function calcularRegistroOportuno(db: SupabaseClient, fechaCorte: string) {
  const inicioMes = fechaCorte.slice(0, 7) + '-01';
  let q = db.from('pagos').select('id, monto, fecha_pago, created_at, registrado_por, tipo').gte('fecha_pago', inicioMes).lte('fecha_pago', fechaCorte);
  if (!INDICADOR6_INCLUYE_RETENCIONES) q = q.eq('tipo', 'pago');
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const pagos = (data ?? []) as { id: string; monto: number; fecha_pago: string; created_at: string; registrado_por: string | null }[];

  const conDias = pagos.map(p => {
    const fechaRegistro = (p.created_at ?? '').slice(0, 10);
    // Hora de Lima: el servidor guarda UTC; restamos 5h para aproximar la fecha calendario de Lima.
    const registroLima = new Date(new Date(p.created_at).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
    const dias = diasHabilesEntre(p.fecha_pago, registroLima || fechaRegistro);
    return { ...p, diasHabiles: dias };
  });

  const total = conDias.length;
  const aTiempo = conDias.filter(p => p.diasHabiles <= 1).length;
  const pct = total > 0 ? (aTiempo / total) * 100 : 0;

  const demorados = conDias.filter(p => p.diasHabiles > 5);

  const porRegistrador = new Map<string, { registrador: string; total: number; aTiempo: number }>();
  for (const p of conDias) {
    const key = p.registrado_por?.trim() || 'Sin registrar';
    const acc = porRegistrador.get(key) ?? { registrador: key, total: 0, aTiempo: 0 };
    acc.total += 1;
    if (p.diasHabiles <= 1) acc.aTiempo += 1;
    porRegistrador.set(key, acc);
  }
  const porRegistradorArr = Array.from(porRegistrador.values()).map(r => ({ ...r, pct: r.total > 0 ? (r.aTiempo / r.total) * 100 : 0 }));

  const dondeEnfocarse = conDias.sort((a, b) => b.diasHabiles - a.diasHabiles).slice(0, 10);

  return {
    valor: pct,
    meta: UMBRALES.registroOportuno.meta,
    semaforo: semaforoPorUmbral(pct, UMBRALES.registroOportuno),
    total, aTiempo,
    demoradosMas5: demorados.length,
    porRegistrador: porRegistradorArr,
    dondeEnfocarse,
  };
}
