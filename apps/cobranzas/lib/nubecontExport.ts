import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from './fetchAll';

/**
 * Exporta los pagos de cobranza en el formato exacto de la plantilla de
 * importación de Nubecont (hoja "PLANTILLA ", con el espacio al final del
 * nombre — así viene en el archivo real, se respeta tal cual).
 *
 * Una fila por factura/documento que un pago cubre. Los campos comunes de
 * un mismo medio de pago (tipo de ingreso, cuenta, medio, N° operación,
 * fecha, total) se repiten en TODAS las filas del grupo — así lo pidió
 * Finanzas explícitamente, aunque el excel de ejemplo que mandaron mostraba
 * algunas filas con esos campos en blanco (son notas instructivas, no datos
 * reales: el total ahí decía literalmente "TRAER VALOR SEGÚN # DE
 * OPERACIÓN" partido en dos filas).
 *
 * Agrupación de "TOTAL DEL MEDIO DE PAGO": por (cliente_ruc, fecha_pago,
 * referencia) — NO por referencia sola. Verificado contra datos reales que
 * dos clientes distintos pueden compartir el mismo N° de operación por
 * coincidencia (un caso real: referencia "02357536" en 31 pagos de 26
 * clientes distintos, de una carga histórica). Agrupar solo por referencia
 * sumaría montos de clientes que no tienen nada que ver. Un pago sin
 * referencia (vacío/null) nunca se agrupa con otro — cada uno es su propio
 * grupo, porque no hay forma de saber si son el mismo depósito.
 */

export const HEADERS_PLANTILLA = [
  'CÓDIGO DE TIPO DE INGRESO',
  'CÓDIGO DE CUENTA FINANCIERA',
  'CÓDIGO DE MEDIO DE PAGO',
  'NUMERO DE MEDIO DE PAGO',
  'FECHA (FORMATO DD/MM/AAAA)',
  'T/C',
  'TOTAL DEL MEDIO DE PAGO',
  'DESCRIPCIÓN - GLOSA',
  '(DOC. RELACIONADO)\r\nENTIDAD - TIPO DE DOC.',
  '(DOC. RELACIONADO)\r\nENTIDAD - NÚMERO DE DOC.',
  '(DOC. RELACIONADO)\r\nTIPO',
  '(DOC. RELACIONADO)\r\nSERIE',
  '(DOC. RELACIONADO)\r\nNÚMERO',
  'IMPORTE DEL COBRO REALIZADO\r\n (NO ES TOTAL DEL CPE RELACIONADO)',
] as const;

/** CÓDIGO DE CUENTA FINANCIERA para efectivo (catálogo B, "CAJA / EFECTIVO SOLES"). */
const CUENTA_EFECTIVO_SOLES = 'CF001';

const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

interface PagoCrudo {
  id: string;
  documento_id: string;
  monto: number;
  fecha_pago: string;
  referencia: string | null;
  medio_cobro: 'transferencia' | 'efectivo';
  cuenta_bancaria_codigo: string | null;
  documentos: { tipo: string; serie: string; numero: number; cliente_ruc: string } | null;
}

export async function construirFilasNubecont(db: SupabaseClient, desde: string, hasta: string): Promise<(string | number)[][]> {
  const pagos = (await fetchAll<unknown>((from, to) =>
    db.from('pagos')
      .select('id, documento_id, monto, fecha_pago, referencia, medio_cobro, cuenta_bancaria_codigo, documentos(tipo, serie, numero, cliente_ruc)')
      .eq('tipo', 'pago')
      .gte('fecha_pago', desde)
      .lte('fecha_pago', hasta)
      .order('fecha_pago')
      .range(from, to)
  )) as unknown as PagoCrudo[];

  const pagosValidos = pagos.filter(p => p.documentos);

  // Agrupar para el total por medio de pago
  const totalesPorGrupo = new Map<string, number>();
  const grupoDe = (p: PagoCrudo): string => {
    const ref = p.referencia?.trim();
    if (!ref) return `__single__${p.id}`;
    return `${p.documentos!.cliente_ruc}::${p.fecha_pago}::${ref}`;
  };
  for (const p of pagosValidos) {
    const key = grupoDe(p);
    totalesPorGrupo.set(key, (totalesPorGrupo.get(key) ?? 0) + (Number(p.monto) || 0));
  }

  const filas: (string | number)[][] = [];
  for (const p of pagosValidos) {
    const doc = p.documentos!;
    const esTransferencia = p.medio_cobro === 'transferencia';
    const codigoCuenta = esTransferencia ? (p.cuenta_bancaria_codigo ?? '') : CUENTA_EFECTIVO_SOLES;
    const codigoMedioPago = esTransferencia ? '003' : '008';
    const total = totalesPorGrupo.get(grupoDe(p)) ?? (Number(p.monto) || 0);

    filas.push([
      'TI001',
      codigoCuenta,
      codigoMedioPago,
      p.referencia ?? '',
      fmtFecha(p.fecha_pago),
      '',
      Number(total.toFixed(2)),
      `Cobranza Factura ${doc.serie}-${doc.numero}`,
      '6',
      doc.cliente_ruc,
      doc.tipo,
      doc.serie,
      doc.numero,
      Number((Number(p.monto) || 0).toFixed(2)),
    ]);
  }

  return filas;
}
