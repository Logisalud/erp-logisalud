import { supabaseAdmin } from '@/lib/supabase';
import {
  calcularEfectividadCobranza, calcularDSO, calcularMorosidadDura,
  calcularVentaDeudaVencida, calcularCobroDeLoVendido, calcularRegistroOportuno,
} from './indicadoresCobranza';

type FilaSnapshot = {
  fecha: string; indicador: string; ambito: string; clave: string;
  valor: number; numerador: number | null; denominador: number | null; origen: 'diario' | 'backfill';
};

// Captura diaria (o backfill) de los 6 indicadores de cobranza en
// indicadores_snapshot, upsert idempotente por (fecha, indicador, ambito,
// clave). No hay cron propio todavía (ver vercel.json: 2 crons existentes,
// se asume en el límite del plan) — se llama desde el cron de
// morosidad-diaria, envuelto en try/catch para que un fallo acá NUNCA
// afecte esa captura.
export async function capturarIndicadoresSnapshot(fecha: string, origen: 'diario' | 'backfill' = 'diario'): Promise<{ fecha: string; filas: number }> {
  const db = supabaseAdmin();
  const filas: FilaSnapshot[] = [];

  const ef = await calcularEfectividadCobranza(db, fecha);
  filas.push({ fecha, indicador: 'efectividad_cobranza', ambito: 'empresa', clave: 'total', valor: ef.valor, numerador: ef.cobrado, denominador: ef.vencido, origen });
  for (const v of ef.vendedores) {
    filas.push({ fecha, indicador: 'efectividad_cobranza', ambito: 'vendedor', clave: v.vendedorId ?? 'sin-vendedor', valor: v.efectividad, numerador: v.cobrado, denominador: v.vencido, origen });
  }

  const dso = await calcularDSO(db, fecha);
  filas.push({ fecha, indicador: 'dso', ambito: 'empresa', clave: 'total', valor: dso.dso, numerador: null, denominador: null, origen });
  for (const v of dso.vendedores) {
    filas.push({ fecha, indicador: 'dso', ambito: 'vendedor', clave: v.vendedorId ?? 'sin-vendedor', valor: v.dso, numerador: v.saldo, denominador: null, origen });
  }

  const mor = await calcularMorosidadDura(db, fecha);
  filas.push({ fecha, indicador: 'morosidad_dura', ambito: 'empresa', clave: 'total', valor: mor.valor, numerador: mor.saldoMas60, denominador: mor.saldoTotal, origen });

  const vd = await calcularVentaDeudaVencida(db, fecha);
  filas.push({ fecha, indicador: 'venta_deuda_vencida', ambito: 'empresa', clave: 'total', valor: vd.valor, numerador: vd.ventaADeudores, denominador: vd.ventasMes, origen });

  const cv = await calcularCobroDeLoVendido(db, fecha);
  filas.push({ fecha, indicador: 'cobro_vendido', ambito: 'empresa', clave: 'total', valor: cv.valor, numerador: cv.cobradoTotal, denominador: cv.vendidoTotal, origen });
  for (const v of cv.vendedores) {
    filas.push({ fecha, indicador: 'cobro_vendido', ambito: 'vendedor', clave: v.vendedorId ?? 'sin-vendedor', valor: v.pct, numerador: v.cobradoEnPlazo, denominador: v.vendido, origen });
  }

  const ro = await calcularRegistroOportuno(db, fecha);
  filas.push({ fecha, indicador: 'registro_oportuno', ambito: 'empresa', clave: 'total', valor: ro.valor, numerador: ro.aTiempo, denominador: ro.total, origen });
  for (const r of ro.porRegistrador) {
    filas.push({ fecha, indicador: 'registro_oportuno', ambito: 'registrador', clave: r.registrador, valor: r.pct, numerador: r.aTiempo, denominador: r.total, origen });
  }

  const { error } = await db.from('indicadores_snapshot').upsert(filas, { onConflict: 'fecha,indicador,ambito,clave' });
  if (error) throw new Error(error.message);

  return { fecha, filas: filas.length };
}
