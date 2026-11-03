export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { construirFasesCobranza, FASE_NOMBRE, type NumeroFase } from '@/lib/fasesCobranza';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const toDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const params = new URL(req.url).searchParams;
  const fechaCorteParam = params.get('fecha_corte');
  const fechaCorte = fechaCorteParam && FECHA_RE.test(fechaCorteParam)
    ? fechaCorteParam
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

  const db = supabaseAdmin();
  const reporte = await construirFasesCobranza(db, fechaCorte);

  const wb = XLSX.utils.book_new();

  const wsResumen = XLSX.utils.json_to_sheet(reporte.resumen.map(r => ({
    'Fase': r.fase,
    'Nombre': r.nombre,
    'N° Clientes': r.nClientes,
    'Monto a gestionar': r.monto,
    '% del total': Number(r.pctDelTotal.toFixed(1)),
    'Clientes Top 80%': r.clientesTop80,
    'Acción': r.accion,
  })));
  wsResumen['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  const detalleRows = reporte.clientes.flatMap(c =>
    c.facturas.map(f => ({
      'Fase': f.fase,
      'Cliente': c.razonSocial,
      'RUC': c.clienteRuc,
      'Vendedor': c.vendedores,
      'Comprobante': f.comprobante,
      'Fecha Emisión': toDate(f.fechaEmision),
      'Fecha Vencimiento': toDate(f.fechaVencimiento),
      'Días Vencido': f.diasVencido,
      'Saldo': f.saldo,
      'Con letras': f.tieneLetras ? 'Sí' : 'No',
    }))
  );
  const wsDetalle = XLSX.utils.json_to_sheet(detalleRows, { cellDates: true });
  wsDetalle['!cols'] = [{ wch: 6 }, { wch: 35 }, { wch: 13 }, { wch: 16 }, { wch: 14 }, { wch: 13 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  const rD = XLSX.utils.decode_range(wsDetalle['!ref'] ?? 'A1');
  wsDetalle['!autofilter'] = { ref: XLSX.utils.encode_range(rD) };
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle por factura');

  for (let fase = 0 as NumeroFase; fase <= 6; fase++) {
    const clientesFase = reporte.clientes.filter(c => c.fase === fase);
    if (clientesFase.length === 0) continue;
    const rows = clientesFase.map(c => ({
      'Cliente': c.razonSocial,
      'RUC': c.clienteRuc,
      'Vendedor': c.vendedores,
      'Máx. días vencido': c.maxDiasVencido,
      'Monto a gestionar': c.montoAGestionar,
      '% de la fase': Number(c.pctDeLaFase.toFixed(1)),
      '% acumulado': Number(c.pctAcumulado.toFixed(1)),
      'Top 80%': c.top80 ? 'Sí' : 'No',
      'Saldo total por cobrar': c.saldoTotalPorCobrar,
      'N° docs': c.nDocs,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 35 }, { wch: 13 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 9 }, { wch: 18 }, { wch: 9 }];
    XLSX.utils.book_append_sheet(wb, ws, `Fase ${fase} ${FASE_NOMBRE[fase]}`.slice(0, 31));
  }

  const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="fases-cobranza-${fechaCorte}.xlsx"`,
    },
  });
}
