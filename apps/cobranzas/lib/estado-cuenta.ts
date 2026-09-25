/**
 * Estado de cuenta de un cliente: el historial completo, como un extracto
 * bancario.
 *
 * Una fila por movimiento real, en orden cronológico, con saldo acumulado.
 * No es "el saldo de hoy" sino "cuánto debía el cliente en cada momento".
 *
 * ## Por qué esto no es una resta simple
 *
 * El saldo de una factura NO sale de una sola fórmula: `v_cobros` tiene
 * cuatro ramas (ver el CLAUDE.md de esta app). Un libro mayor ingenuo
 * —factura menos notas de crédito menos pagos— **no cuadra** con lo que el
 * sistema reporta, y ese fue exactamente el bug del desglose que ya se
 * corrigió una vez: faltaban los pagos y las letras.
 *
 * Acá se resuelve al revés. Primero se listan los movimientos REALES
 * (factura, nota de crédito, nota de débito, pago, retención, letra pagada).
 * Después, para cada factura, se compara el saldo que sale de esos
 * movimientos contra el saldo que reporta `v_saldos` —la fuente de verdad— y
 * si no coinciden se emite una fila de AJUSTE **explícita y con su motivo**:
 *
 * - `CONTADO cobrado al despacho` — las CONTADO anteriores al 2026-08-11 se
 *   daban por cobradas contra entrega y nunca tuvieron un pago registrado.
 * - `Redondeo` — saldo de hasta S/ 0.09, que la app trata como saldado.
 * - `Canje en letras` — las letras giradas no cubren el total de la factura.
 * - `Diferencia sin explicar` — no debería pasar. Al 2026-09-25 no le pasa a
 *   ninguna de las 2.497 facturas. Existe igual: si mañana aparece un caso
 *   nuevo, se ve en pantalla en vez de desaparecer dentro de un total. Es la
 *   misma decisión que ya tomó `lib/desglose.ts`.
 *
 * Así el saldo final del extracto es, por construcción, idéntico al que
 * muestra la ficha de cada factura — y cualquier cosa que no encaje queda a
 * la vista en lugar de tragarse.
 */

/** Tolerancia de céntimos: igual que `v_cobros`. */
export const TOLERANCIA_CENTIMOS = 0.09;

/** Desde esta fecha, un CONTADO ya no se da por cobrado al despacho. */
export const CORTE_CONTADO = '2026-08-11';

/** Redondeo a céntimos, para no arrastrar basura de coma flotante. */
export function aCentimos(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export type TipoMovimiento =
  | 'FACTURA'
  | 'BOLETA'
  | 'NOTA_CREDITO'
  | 'NOTA_DEBITO'
  | 'PAGO'
  | 'RETENCION'
  | 'LETRA'
  | 'AJUSTE';

export interface Movimiento {
  fecha: string;
  tipo: TipoMovimiento;
  /** Cómo se lee en pantalla: "Factura", "Nota de Crédito", … */
  etiqueta: string;
  /** El comprobante al que pertenece la fila (FFF1-831). */
  documento: string;
  /** Referencia, número de letra, motivo del ajuste. Puede faltar. */
  detalle: string | null;
  debe: number;
  haber: number;
  /** Saldo acumulado hasta esta fila, inclusive. */
  saldo: number;
}

export interface Resumen {
  saldoActual: number;
  totalFacturado: number;
  totalPagado: number;
  totalNotasCredito: number;
  totalNotasDebito: number;
  /** Suma de los ajustes que no son "sin explicar". Informativo. */
  totalAjustes: number;
  /** Lo que no encajó en ninguna regla conocida. Debería ser 0. */
  totalSinExplicar: number;
  movimientos: number;
}

// ---- Entrada -------------------------------------------------------------
// Son los datos crudos tal como salen de la base, sin transformar.

export interface FacturaCruda {
  id: string;
  /** '01' factura, '03' boleta. */
  tipo: string;
  comprobante: string;
  fecha_emision: string;
  importe_total: number;
  /** El saldo que reporta `v_saldos`. Es la fuente de verdad. */
  saldo_pendiente: number;
  forma_pago: string | null;
  contado_pendiente: boolean | null;
}

export interface NotaCruda {
  id: string;
  /** '07' crédito, '08' débito. */
  tipo: string;
  comprobante: string;
  fecha_emision: string;
  importe_total: number;
  /** La factura que corrige. */
  documento_relacionado_id: string | null;
}

export interface PagoCrudo {
  documento_id: string;
  fecha_pago: string;
  monto: number;
  /** 'pago' | 'retencion'. */
  tipo: string | null;
  referencia: string | null;
}

export interface LetraCruda {
  documento_id: string;
  numero_letra: string | null;
  fecha_vencimiento: string | null;
  /** Sólo las pagadas descuentan. */
  estado: string;
  monto_aplicado: number;
}

export interface EntradaEstadoCuenta {
  facturas: FacturaCruda[];
  notas: NotaCruda[];
  pagos: PagoCrudo[];
  letras: LetraCruda[];
  /** Filtro opcional, inclusive, en formato YYYY-MM-DD. */
  desde?: string | null;
  hasta?: string | null;
}

// ---- Etiquetas -----------------------------------------------------------

function etiquetaDocumento(tipo: string): { tipo: TipoMovimiento; etiqueta: string } {
  switch (tipo) {
    case '01': return { tipo: 'FACTURA', etiqueta: 'Factura' };
    case '03': return { tipo: 'BOLETA', etiqueta: 'Boleta' };
    case '07': return { tipo: 'NOTA_CREDITO', etiqueta: 'Nota de Crédito' };
    case '08': return { tipo: 'NOTA_DEBITO', etiqueta: 'Nota de Débito' };
    default: return { tipo: 'FACTURA', etiqueta: `Documento ${tipo}` };
  }
}

/**
 * Orden dentro de un mismo día.
 *
 * Importa para que el acumulado se lea bien: en la fecha de emisión primero
 * va la factura y recién después lo que la descuenta. Si no, una factura
 * pagada el mismo día mostraría un saldo negativo en la fila de arriba.
 */
const ORDEN_EN_EL_DIA: Record<TipoMovimiento, number> = {
  FACTURA: 0,
  BOLETA: 0,
  NOTA_DEBITO: 1,
  NOTA_CREDITO: 2,
  PAGO: 3,
  RETENCION: 4,
  LETRA: 5,
  AJUSTE: 6,
};

// ---- El cálculo ----------------------------------------------------------

/**
 * Arma el extracto. Devuelve los movimientos ya ordenados y con acumulado,
 * más el resumen de cabecera.
 *
 * El filtro de fechas se aplica DESPUÉS de calcular el acumulado sobre todo
 * el historial, y se abre con una fila de "Saldo anterior": si se recortara
 * antes, el saldo arrancaría en cero y el extracto mentiría.
 */
export function construirEstadoCuenta(entrada: EntradaEstadoCuenta): {
  movimientos: Movimiento[];
  resumen: Resumen;
} {
  const { facturas, notas, pagos, letras } = entrada;

  const comprobantePorId = new Map<string, string>();
  for (const f of facturas) comprobantePorId.set(f.id, f.comprobante);

  const movimientos: Movimiento[] = [];

  // Acumuladores por factura, para después comparar contra v_saldos.
  const nc = new Map<string, number>();
  const nd = new Map<string, number>();
  const cobrado = new Map<string, number>();

  const sumar = (m: Map<string, number>, k: string, v: number) =>
    m.set(k, aCentimos((m.get(k) ?? 0) + v));

  // 1. Facturas y boletas: lo que el cliente nos debe.
  for (const f of facturas) {
    const { tipo, etiqueta } = etiquetaDocumento(f.tipo);
    movimientos.push({
      fecha: f.fecha_emision,
      tipo,
      etiqueta,
      documento: f.comprobante,
      detalle: f.forma_pago ?? null,
      debe: aCentimos(f.importe_total),
      haber: 0,
      saldo: 0,
    });
  }

  // 2. Notas de crédito y débito.
  for (const n of notas) {
    const { tipo, etiqueta } = etiquetaDocumento(n.tipo);
    const facturaId = n.documento_relacionado_id;
    const ref = facturaId ? comprobantePorId.get(facturaId) : null;
    const esCredito = n.tipo === '07';
    const importe = aCentimos(n.importe_total);

    if (facturaId) sumar(esCredito ? nc : nd, facturaId, importe);

    movimientos.push({
      fecha: n.fecha_emision,
      tipo,
      etiqueta,
      documento: n.comprobante,
      detalle: ref ? `aplica a ${ref}` : null,
      debe: esCredito ? 0 : importe,
      haber: esCredito ? importe : 0,
      saldo: 0,
    });
  }

  // 3. Pagos y retenciones. `v_cobros` suma los dos sin distinguir, así que
  //    acá también cuentan los dos — pero se muestran por separado porque una
  //    retención de IGV no es plata que entró.
  for (const p of pagos) {
    const esRetencion = (p.tipo ?? 'pago') === 'retencion';
    const monto = aCentimos(p.monto);
    sumar(cobrado, p.documento_id, monto);

    movimientos.push({
      fecha: p.fecha_pago,
      tipo: esRetencion ? 'RETENCION' : 'PAGO',
      etiqueta: esRetencion ? 'Retención IGV' : 'Pago',
      documento: comprobantePorId.get(p.documento_id) ?? '—',
      detalle: p.referencia?.trim() || null,
      debe: 0,
      haber: monto,
      saldo: 0,
    });
  }

  // 4. Letras. Sólo las PAGADAS descuentan: una letra en cartera es una
  //    promesa, no un cobro. Las pendientes no generan fila porque la deuda
  //    ya está representada por su factura.
  for (const l of letras) {
    if (l.estado !== 'pagada') continue;
    const monto = aCentimos(l.monto_aplicado);
    sumar(cobrado, l.documento_id, monto);

    movimientos.push({
      fecha: l.fecha_vencimiento ?? '',
      tipo: 'LETRA',
      etiqueta: 'Letra pagada',
      documento: comprobantePorId.get(l.documento_id) ?? '—',
      detalle: l.numero_letra ? `letra ${l.numero_letra}` : null,
      debe: 0,
      haber: monto,
      saldo: 0,
    });
  }

  // 5. Ajustes: la diferencia entre lo que dicen los movimientos y lo que
  //    dice `v_saldos`, con su motivo. Es lo que hace que el total cuadre.
  let totalAjustes = 0;
  let totalSinExplicar = 0;

  for (const f of facturas) {
    // SIN recortar en cero. `v_cobros` aplica un `greatest(0, …)`: una
    // factura nunca baja de cero por más que le hayan aplicado notas de
    // crédito o pagos de más. Si acá se recortara también, ese sobrante se
    // colaría en el acumulado y el extracto cerraría por debajo del saldo
    // real — que es exactamente lo que pasó la primera vez que se probó
    // este módulo contra CORPORACION PIONERO: daba S/ 3.905,20 en vez de
    // S/ 6.006,85, y la diferencia eran tres facturas pagadas de más.
    const natural = aCentimos(
      f.importe_total + (nd.get(f.id) ?? 0) - (nc.get(f.id) ?? 0) - (cobrado.get(f.id) ?? 0),
    );
    const real = aCentimos(f.saldo_pendiente);
    const ajuste = aCentimos(real - natural);
    if (Math.abs(ajuste) < 0.005) continue;

    const esContadoViejo =
      (f.forma_pago ?? '') === 'CONTADO' &&
      f.contado_pendiente === false &&
      f.fecha_emision < CORTE_CONTADO;
    const tieneLetras = letras.some((l) => l.documento_id === f.id);

    let motivo: string;
    if (esContadoViejo) motivo = 'CONTADO cobrado al despacho';
    else if (natural < -0.005 && real <= 0.005) {
      motivo = 'Pagado de más (el saldo no baja de cero)';
    } else if (natural > 0 && natural <= TOLERANCIA_CENTIMOS) {
      motivo = 'Redondeo (hasta S/ 0.09)';
    } else if (tieneLetras) motivo = 'Canje en letras';
    else {
      motivo = 'Diferencia sin explicar — revisar';
      totalSinExplicar = aCentimos(totalSinExplicar + Math.abs(ajuste));
    }
    if (motivo !== 'Diferencia sin explicar — revisar') {
      totalAjustes = aCentimos(totalAjustes + ajuste);
    }

    // Un ajuste negativo baja la deuda (va al HABER) y uno positivo la sube.
    movimientos.push({
      fecha: esContadoViejo ? f.fecha_emision : ultimaFechaDe(f.id, pagos, letras, f.fecha_emision),
      tipo: 'AJUSTE',
      etiqueta: 'Ajuste',
      documento: f.comprobante,
      detalle: motivo,
      debe: ajuste > 0 ? ajuste : 0,
      haber: ajuste < 0 ? -ajuste : 0,
      saldo: 0,
    });
  }

  // 6. Orden cronológico y saldo corriendo.
  movimientos.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    const oa = ORDEN_EN_EL_DIA[a.tipo];
    const ob = ORDEN_EN_EL_DIA[b.tipo];
    if (oa !== ob) return oa - ob;
    return a.documento.localeCompare(b.documento);
  });

  let saldo = 0;
  for (const m of movimientos) {
    saldo = aCentimos(saldo + m.debe - m.haber);
    m.saldo = saldo;
  }

  // 7. Recorte por fechas, con saldo de arrastre.
  const visibles = recortarPorFecha(movimientos, entrada.desde, entrada.hasta);

  const resumen: Resumen = {
    saldoActual: saldo,
    totalFacturado: aCentimos(facturas.reduce((s, f) => s + Number(f.importe_total || 0), 0)),
    totalPagado: aCentimos(
      pagos.reduce((s, p) => s + Number(p.monto || 0), 0) +
        letras.filter((l) => l.estado === 'pagada').reduce((s, l) => s + Number(l.monto_aplicado || 0), 0),
    ),
    totalNotasCredito: aCentimos(
      notas.filter((n) => n.tipo === '07').reduce((s, n) => s + Number(n.importe_total || 0), 0),
    ),
    totalNotasDebito: aCentimos(
      notas.filter((n) => n.tipo === '08').reduce((s, n) => s + Number(n.importe_total || 0), 0),
    ),
    totalAjustes,
    totalSinExplicar,
    movimientos: visibles.length,
  };

  return { movimientos: visibles, resumen };
}

/** La fecha del último movimiento de una factura, para colgarle el ajuste. */
function ultimaFechaDe(
  facturaId: string,
  pagos: PagoCrudo[],
  letras: LetraCruda[],
  porDefecto: string,
): string {
  let ultima = porDefecto;
  for (const p of pagos) {
    if (p.documento_id === facturaId && p.fecha_pago > ultima) ultima = p.fecha_pago;
  }
  for (const l of letras) {
    if (l.documento_id === facturaId && l.estado === 'pagada' && (l.fecha_vencimiento ?? '') > ultima) {
      ultima = l.fecha_vencimiento as string;
    }
  }
  return ultima;
}

/**
 * Aplica el filtro de fechas conservando el acumulado.
 *
 * Todo lo anterior a `desde` se colapsa en una fila "Saldo anterior" con el
 * acumulado que traía. Sin eso, el extracto filtrado arrancaría en cero y
 * daría a entender que el cliente no debía nada antes — que es justo el tipo
 * de error que este módulo existe para no cometer.
 */
function recortarPorFecha(
  movimientos: Movimiento[],
  desde?: string | null,
  hasta?: string | null,
): Movimiento[] {
  if (!desde && !hasta) return movimientos;

  const dentro = movimientos.filter(
    (m) => (!desde || m.fecha >= desde) && (!hasta || m.fecha <= hasta),
  );
  if (!desde) return dentro;

  const previos = movimientos.filter((m) => m.fecha < desde);
  if (previos.length === 0) return dentro;

  const arrastre = previos[previos.length - 1].saldo;
  return [
    {
      fecha: desde,
      tipo: 'AJUSTE',
      etiqueta: 'Saldo anterior',
      documento: '—',
      detalle: `${previos.length} movimiento${previos.length === 1 ? '' : 's'} antes del ${desde}`,
      debe: 0,
      haber: 0,
      saldo: arrastre,
    },
    ...dentro,
  ];
}
