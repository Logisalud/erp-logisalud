export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { crearClienteServidor } from '@logisalud/auth/server';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { fetchAll } from '@/lib/fetchAll';
import {
  agruparPorFactura,
  construirEstadoCuenta,
  type FacturaCruda,
  type LetraCruda,
  type NotaCruda,
  type PagoCrudo,
} from '@/lib/estado-cuenta';

const TANDA = 300;

const fecha = (f: string) => {
  if (!f) return '';
  const [a, m, d] = f.split('-');
  return `${d}/${m}/${a}`;
};

/**
 * El mismo extracto que se ve en pantalla, en un Excel listo para mandarle al
 * cliente: el resumen arriba y después el libro, columna por columna.
 *
 * Arma el estado de cuenta con el MISMO `construirEstadoCuenta` que la
 * pantalla. Si un día cambia una regla de saldo, cambia en un solo lugar y
 * las dos salidas siguen diciendo lo mismo — que un Excel y una pantalla
 * discrepen sobre cuánto debe un cliente es peor que no tener el Excel.
 */
export async function GET(req: NextRequest, { params }: { params: { ruc: string } }) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const { searchParams } = new URL(req.url);
    const desde = searchParams.get('desde')?.trim() || null;
    const hasta = searchParams.get('hasta')?.trim() || null;
    const ruc = params.ruc;
    const db = crearClienteServidor();

    const cliente = await db
      .from('clientes')
      .select('ruc, razon_social, direccion, distrito, provincia')
      .eq('ruc', ruc)
      .maybeSingle();

    const facturas = (await fetchAll<FacturaCruda>((from, to) =>
      db
        .from('v_saldos')
        .select('id, tipo, comprobante, fecha_emision, fecha_vencimiento, importe_total, saldo_pendiente, forma_pago, contado_pendiente')
        .eq('cliente_ruc', ruc)
        .order('fecha_emision')
        .range(from, to),
    )) as FacturaCruda[];

    const notasRaw = (await fetchAll((from, to) =>
      db
        .from('documentos')
        .select('id, tipo, serie, numero, fecha_emision, importe_total, documento_relacionado_id')
        .eq('cliente_ruc', ruc)
        .in('tipo', ['07', '08'])
        .eq('anulado', false)
        .order('fecha_emision')
        .range(from, to),
    )) as unknown as Array<NotaCruda & { serie: string; numero: number }>;

    const ids = facturas.map((f) => f.id);
    const pagos: PagoCrudo[] = [];
    const letras: LetraCruda[] = [];

    for (let i = 0; i < ids.length; i += TANDA) {
      const tanda = ids.slice(i, i + TANDA);

      const { data: pg } = await db
        .from('pagos')
        .select('documento_id, fecha_pago, monto, tipo, referencia')
        .in('documento_id', tanda);
      pagos.push(...((pg ?? []) as PagoCrudo[]));

      const { data: ld } = await db
        .from('letra_documento')
        .select('documento_id, monto_aplicado, letra_id')
        .in('documento_id', tanda);

      const letraIds = Array.from(new Set((ld ?? []).map((x) => x.letra_id as string)));
      const porLetra = new Map<string, { numero_letra: string | null; fecha_vencimiento: string | null; estado: string }>();
      for (let j = 0; j < letraIds.length; j += TANDA) {
        const { data: ls } = await db
          .from('letras')
          .select('id, numero_letra, fecha_vencimiento, estado')
          .in('id', letraIds.slice(j, j + TANDA));
        for (const l of ls ?? []) {
          porLetra.set(l.id as string, {
            numero_letra: (l.numero_letra as string) ?? null,
            fecha_vencimiento: (l.fecha_vencimiento as string) ?? null,
            estado: (l.estado as string) ?? '',
          });
        }
      }
      for (const x of ld ?? []) {
        const l = porLetra.get(x.letra_id as string);
        if (!l) continue;
        letras.push({
          documento_id: x.documento_id as string,
          monto_aplicado: Number(x.monto_aplicado) || 0,
          ...l,
        });
      }
    }

    const notasLimpias = notasRaw.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      comprobante: `${String(n.serie).trim()}-${n.numero}`,
      fecha_emision: n.fecha_emision,
      importe_total: Number(n.importe_total) || 0,
      documento_relacionado_id: n.documento_relacionado_id,
    }));

    const { movimientos, resumen } = construirEstadoCuenta({
      facturas,
      notas: notasLimpias,
      pagos,
      letras,
      desde,
      hasta,
    });

    // Igual que en la pantalla: el agrupado por factura se arma con el
    // historial entero, porque el saldo de una factura no depende del rango.
    const completo =
      desde || hasta
        ? construirEstadoCuenta({ facturas, notas: notasLimpias, pagos, letras }).movimientos
        : movimientos;
    const porFactura = agruparPorFactura(
      completo,
      facturas,
      new Date().toISOString().slice(0, 10),
    );

    const c = cliente.data;
    const rango =
      desde || hasta
        ? `Del ${desde ? fecha(desde) : 'inicio'} al ${hasta ? fecha(hasta) : 'hoy'}`
        : 'Histórico completo';

    // El resumen va arriba, como filas sueltas, y recién después la tabla:
    // así el Excel se imprime o se manda tal cual, sin retocar nada.
    const aoa: (string | number)[][] = [
      ['ESTADO DE CUENTA'],
      [c?.razon_social ?? ruc],
      [`RUC ${ruc}`],
      [[c?.direccion, c?.distrito, c?.provincia].filter(Boolean).join(' · ')],
      [rango],
      [],
      ['Saldo actual', resumen.saldoActual],
      ['Total facturado', resumen.totalFacturado],
      ['Total pagado (incluye letras y retención)', resumen.totalPagado],
      ['Total notas de crédito', resumen.totalNotasCredito],
      ['Total notas de débito', resumen.totalNotasDebito],
      [],
      ['Fecha', 'Tipo', 'Documento', 'Debe', 'Haber', 'Saldo', 'Detalle'],
    ];

    for (const m of movimientos) {
      aoa.push([fecha(m.fecha), m.etiqueta, m.documento, m.debe || '', m.haber || '', m.saldo, m.detalle ?? '']);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 12 }, { wch: 18 }, { wch: 14 },
      { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 42 },
    ];

    // Segunda hoja: la misma verdad por factura. Van las dos porque responden
    // preguntas distintas — "qué pasó" y "en qué va cada factura".
    const aoaF: (string | number)[][] = [
      ['POR FACTURA'],
      [c?.razon_social ?? ruc],
      [`RUC ${ruc}`],
      [],
      ['Factura', 'Emisión', 'Vence', 'Importe', 'Notas de crédito', 'Notas de débito', 'Cobrado', 'Ajuste', 'Motivo del ajuste', 'Saldo', 'Estado', 'Días vencida', 'NC vigentes'],
    ];
    for (const f of porFactura) {
      aoaF.push([
        f.comprobante,
        fecha(f.fechaEmision),
        f.fechaVencimiento ? fecha(f.fechaVencimiento) : '',
        f.importe,
        f.totalNotasCredito || '',
        f.totalNotasDebito || '',
        f.totalCobrado || '',
        f.ajuste || '',
        f.motivoAjuste ?? '',
        f.saldo,
        f.estado,
        f.saldo > 0.005 && (f.diasVencida ?? 0) > 0 ? (f.diasVencida as number) : '',
        f.notasCredito.map((n) => `${n.comprobante} (${fecha(n.fecha)}) ${n.importe.toFixed(2)}`).join(' · '),
      ]);
    }
    const wsF = XLSX.utils.aoa_to_sheet(aoaF);
    wsF['!cols'] = [
      { wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 13 }, { wch: 17 }, { wch: 16 },
      { wch: 13 }, { wch: 12 }, { wch: 34 }, { wch: 13 }, { wch: 11 }, { wch: 13 }, { wch: 46 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsF, 'Por factura');
    XLSX.utils.book_append_sheet(wb, ws, 'Estado de cuenta');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const nombre = `estado-cuenta-${ruc}${desde || hasta ? '-filtrado' : ''}.xlsx`;
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombre}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
