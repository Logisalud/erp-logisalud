export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import {
  calcularEfectividadCobranza, calcularDSO, calcularMorosidadDura,
  calcularVentaDeudaVencida, calcularCobroDeLoVendido, calcularRegistroOportuno,
} from '@/lib/indicadoresCobranza';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const params = new URL(req.url).searchParams;
  const fechaCorteParam = params.get('fecha_corte');
  const fechaCorte = fechaCorteParam && FECHA_RE.test(fechaCorteParam)
    ? fechaCorteParam
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

  const db = supabaseAdmin();
  const [efectividad, dso, morosidad, ventaDeuda, cobroVendido, registroOportuno] = await Promise.all([
    calcularEfectividadCobranza(db, fechaCorte),
    calcularDSO(db, fechaCorte),
    calcularMorosidadDura(db, fechaCorte),
    calcularVentaDeudaVencida(db, fechaCorte),
    calcularCobroDeLoVendido(db, fechaCorte),
    calcularRegistroOportuno(db, fechaCorte),
  ]);

  const wb = XLSX.utils.book_new();

  const wsResumen = XLSX.utils.json_to_sheet([
    { Indicador: '1. Efectividad de cobranza', Valor: Number(efectividad.valor.toFixed(1)), Meta: efectividad.meta, Semáforo: efectividad.semaforo },
    { Indicador: '2. DSO frente al plazo', Valor: Number(dso.dso.toFixed(1)), Meta: `Brecha <=${dso.meta}`, Semáforo: dso.semaforo },
    { Indicador: '3. Morosidad dura (>60d)', Valor: Number(morosidad.valor.toFixed(1)), Meta: morosidad.meta, Semáforo: morosidad.semaforo },
    { Indicador: '4. Venta a deuda vencida', Valor: Number(ventaDeuda.valor.toFixed(1)), Meta: ventaDeuda.meta, Semáforo: ventaDeuda.semaforo },
    { Indicador: '5. Cobro de lo vendido (piloto)', Valor: Number(cobroVendido.valor.toFixed(1)), Meta: cobroVendido.meta, Semáforo: cobroVendido.semaforo },
    { Indicador: '6. Registro oportuno', Valor: Number(registroOportuno.valor.toFixed(1)), Meta: registroOportuno.meta, Semáforo: registroOportuno.semaforo },
  ]);
  wsResumen['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  const hoja2 = XLSX.utils.json_to_sheet(efectividad.vendedores.map(v => ({ Vendedor: v.vendedor, Vencido: v.vencido, Cobrado: v.cobrado, Pendiente: v.pendiente, 'Efectividad %': Number(v.efectividad.toFixed(1)) })));
  XLSX.utils.book_append_sheet(wb, hoja2, '1. Efectividad');

  const hoja3 = XLSX.utils.json_to_sheet(dso.vendedores.map(v => ({ Vendedor: v.vendedor, 'DSO (días)': Number(v.dso.toFixed(1)), 'Plazo otorgado': Number(v.plazo.toFixed(1)), 'Brecha': Number(v.brecha.toFixed(1)), Saldo: v.saldo })));
  XLSX.utils.book_append_sheet(wb, hoja3, '2. DSO');

  const hoja4 = XLSX.utils.json_to_sheet(morosidad.dondeEnfocarse.map(c => ({ Cliente: c.clienteRuc, Vendedor: c.vendedor, Docs: c.docs, 'Máx. días': c.maxDias, Monto: c.monto })));
  XLSX.utils.book_append_sheet(wb, hoja4, '3. Morosidad dura');

  const hoja5 = XLSX.utils.json_to_sheet(ventaDeuda.dondeEnfocarse.map(c => ({ Cliente: c.razonSocial, RUC: c.clienteRuc, Vendedor: c.vendedor, 'Venta del mes': c.ventaMes, 'Deuda >30 días': c.deudaVencida })));
  XLSX.utils.book_append_sheet(wb, hoja5, '4. Venta a deudores');

  const hoja6 = XLSX.utils.json_to_sheet(cobroVendido.vendedores.map(v => ({ Vendedor: v.vendedor, Vendido: v.vendido, 'Cobrado en plazo': v.cobradoEnPlazo, '% Cobrado': Number(v.pct.toFixed(1)) })));
  XLSX.utils.book_append_sheet(wb, hoja6, '5. Cobro de lo vendido');

  const hoja7 = XLSX.utils.json_to_sheet(registroOportuno.dondeEnfocarse.map(p => ({ 'ID Pago': p.id, Monto: p.monto, 'Fecha depósito': p.fecha_pago, 'Días hábiles': p.diasHabiles, Registrador: p.registrado_por ?? '—' })));
  XLSX.utils.book_append_sheet(wb, hoja7, '6. Registro oportuno');

  const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="indicadores-cobranza-${fechaCorte}.xlsx"`,
    },
  });
}
