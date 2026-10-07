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
 * Agrupación de "TOTAL DEL MEDIO DE PAGO": por (cliente_ruc, fecha efectiva,
 * referencia) — NO por referencia sola. Verificado contra datos reales que
 * dos clientes distintos pueden compartir el mismo N° de operación por
 * coincidencia (un caso real: referencia "02357536" en 31 pagos de 26
 * clientes distintos, de una carga histórica). Agrupar solo por referencia
 * sumaría montos de clientes que no tienen nada que ver. Un pago sin
 * referencia (vacío/null) nunca se agrupa con otro — cada uno es su propio
 * grupo, porque no hay forma de saber si son el mismo depósito.
 *
 * Efectivo: el efectivo siempre se termina depositando en la cuenta CF010
 * (confirmado — no hay selector de cuenta en la pantalla de depósito, es
 * siempre la misma cuenta). Un pago en efectivo entra al export recién
 * cuando está DEPOSITADO (`estado_efectivo = 'depositado'`): mientras está
 * "cobrado, por depositar" todavía no es un movimiento de banco real, así
 * que no tiene nada que reportarle a Nubecont. La "fecha efectiva" de un
 * efectivo depositado es `fecha_deposito` (la fecha real del movimiento de
 * banco), no `fecha_pago` (cuándo se cobró al cliente) — y el filtro de
 * rango de fechas del export también mira esa fecha efectiva, no
 * `fecha_pago`, para que el rango represente bien "qué entró al banco en
 * este período". Su código de medio de pago es '001' (depósito en cuenta),
 * no un código de "efectivo" — ya que para cuando aparece acá, el dinero ya
 * está en el banco.
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

/** El efectivo siempre se deposita en esta cuenta (confirmado, no varía). */
const CUENTA_EFECTIVO_DEPOSITADO = 'CF010';

const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

interface PagoCrudo {
  id: string;
  documento_id: string;
  monto: number;
  fecha_pago: string;
  referencia: string | null;
  medio_cobro: 'transferencia' | 'efectivo';
  cuenta_bancaria_codigo: string | null;
  estado_efectivo: 'cobrado_por_depositar' | 'depositado' | null;
  fecha_deposito: string | null;
  documentos: { tipo: string; serie: string; numero: number; cliente_ruc: string } | null;
}

export async function construirFilasNubecont(db: SupabaseClient, desde: string, hasta: string): Promise<(string | number)[][]> {
  const pagos = (await fetchAll<unknown>((from, to) =>
    db.from('pagos')
      .select('id, documento_id, monto, fecha_pago, referencia, medio_cobro, cuenta_bancaria_codigo, estado_efectivo, fecha_deposito, documentos(tipo, serie, numero, cliente_ruc)')
      .eq('tipo', 'pago')
      .range(from, to)
  )) as unknown as PagoCrudo[];

  // Fecha efectiva: fecha_deposito para efectivo ya depositado (es cuando
  // el dinero realmente entró al banco), fecha_pago para todo lo demás. Un
  // efectivo sin depositar queda fuera — no es un movimiento de banco aún.
  const fechaEfectiva = (p: PagoCrudo): string | null =>
    p.medio_cobro === 'efectivo' ? p.fecha_deposito : p.fecha_pago;

  const pagosValidos = pagos.filter(p => {
    if (!p.documentos) return false;
    if (p.medio_cobro === 'efectivo' && p.estado_efectivo !== 'depositado') return false;
    const fecha = fechaEfectiva(p);
    return !!fecha && fecha >= desde && fecha <= hasta;
  });

  // Agrupar para el total por medio de pago
  const totalesPorGrupo = new Map<string, number>();
  const grupoDe = (p: PagoCrudo): string => {
    const ref = p.referencia?.trim();
    if (!ref) return `__single__${p.id}`;
    return `${p.documentos!.cliente_ruc}::${fechaEfectiva(p)}::${ref}`;
  };
  for (const p of pagosValidos) {
    const key = grupoDe(p);
    totalesPorGrupo.set(key, (totalesPorGrupo.get(key) ?? 0) + (Number(p.monto) || 0));
  }

  const filas: (string | number)[][] = [];
  for (const p of pagosValidos) {
    const doc = p.documentos!;
    const esTransferencia = p.medio_cobro === 'transferencia';
    const codigoCuenta = esTransferencia ? (p.cuenta_bancaria_codigo ?? '') : CUENTA_EFECTIVO_DEPOSITADO;
    const codigoMedioPago = esTransferencia ? '003' : '001';
    const total = totalesPorGrupo.get(grupoDe(p)) ?? (Number(p.monto) || 0);

    filas.push([
      'TI001',
      codigoCuenta,
      codigoMedioPago,
      p.referencia ?? '',
      fmtFecha(fechaEfectiva(p)!),
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
