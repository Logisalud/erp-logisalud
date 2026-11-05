/**
 * De dónde sale el saldo pendiente de una factura.
 *
 * El saldo que muestra la app no se calcula acá: lo calcula `v_cobros` en la
 * base (ver supabase/migrations). Esta función hace el camino inverso —
 * enumerar todo lo que bajó el saldo hasta llegar al número que manda la
 * vista— para que la pantalla pueda mostrar una resta que cierra.
 *
 * Está separada del componente porque la trampa está en que `v_cobros` no
 * tiene UNA fórmula sino cuatro ramas, y el desglose las tiene que conocer a
 * todas:
 *
 *  1. Factura normal: saldo = importe − NC + ND − pagos − retención.
 *  2. Factura canjeada por letras: los pagos no la tocan; el saldo es la suma
 *     de las letras que siguen sin pagarse. Lo que canceló la factura fueron
 *     las letras pagadas.
 *  3. CONTADO anterior al 2026-08-11: se asume cobrado al despacho, sin pago
 *     registrado. Ojo: esta rama solo puede explicar que FALTE cobro. Si
 *     sobra —se pagó de más, o llegó una nota de crédito después del pago—
 *     no es el despacho lo que lo explica, y decirlo esconde el sobrante.
 *  4. Saldo de hasta S/ 0.09: se da por pagado (tolerancia de redondeo).
 *  5. Factorizada: la factura entera se vendió a una empresa de factoring
 *     (ver `factoring_operaciones`/`factoring_facturas`); el saldo baja a 0
 *     sin que exista un pago real del cliente.
 *  6. Incobrable: alguien de admin la dio de baja de la cobranza con un
 *     motivo escrito (`documentos_incobrables`). El saldo baja a 0 y nadie
 *     pagó nada: es una pérdida asumida, no un cobro.
 *
 * Lo que no cae en ninguna de las seis se devuelve como diferencia sin
 * explicar, con `esProblema: true`. Eso es a propósito: antes esas
 * diferencias se las tragaba la pantalla y una factura podía mostrar
 * "26,247.03 − 1,221.43 = 0.00" sin que nada chirriara.
 */

export interface EntradaDesglose {
  importeTotal: number;
  totalNc: number;
  totalNd: number;
  /** Pagos reales registrados (sin la retención). */
  totalPagos: number;
  /** Retención de IGV (vive en `pagos` con tipo 'retencion'). */
  totalRetencion: number;
  /** Suma de `monto_aplicado` de las letras de esta factura ya pagadas. */
  totalLetrasPagadas: number;
  /** El saldo que manda `v_saldos` — la autoridad, no se recalcula. */
  saldoPendiente: number;
  formaPago: string | null;
  contadoPendiente: boolean;
  fechaEmision: string;
  tieneLetras: boolean;
  /** true si la factura entera se vendió a una empresa de factoring. */
  factorizado?: boolean;
  /** Para mostrar a quién se le vendió, si se conoce. */
  factoringEntidad?: string | null;
  /** true si admin la dio de baja de la cobranza por incobrable. */
  incobrable?: boolean;
  /** Por qué se dio de baja. Va a la vista: es toda la explicación que hay. */
  incobrableMotivo?: string | null;
  /** Fecha del último pago registrado, si hay alguno. */
  fechaUltimoPago?: string | null;
  /** Fecha de emisión de la nota de crédito más nueva, si hay alguna. */
  fechaUltimaNc?: string | null;
}

export interface Desglose {
  /** Diferencia entre lo que el desglose explica y el saldo real. */
  sinExplicar: number;
  /** Cómo llamarla en pantalla. */
  etiqueta: string;
  /** true = no hay regla de negocio que la justifique; hay que mirarla. */
  esProblema: boolean;
  /** Qué mirar, cuando `esProblema`. Va debajo de la etiqueta, en chico. */
  nota?: string;
}

/** La fecha desde la que un CONTADO exige un pago registrado (ver v_cobros). */
const CORTE_CONTADO = '2026-08-11';
/** Hasta acá un saldo se considera redondeo y no deuda (ver v_cobros). */
export const TOLERANCIA_CENTIMOS = 0.09;

const redondear2 = (n: number) => Math.round(n * 100) / 100;

export function calcularDesglose(e: EntradaDesglose): Desglose {
  const explicado = e.totalPagos + e.totalRetencion + e.totalLetrasPagadas;
  const restante = e.importeTotal - e.totalNc + e.totalNd - explicado;
  const sinExplicar = redondear2(restante - e.saldoPendiente);

  // Un dato que llega sin número arrastra un NaN por toda la resta. Mejor
  // decirlo que mostrar una columna que no suma y parece que sí.
  if (!Number.isFinite(sinExplicar)) {
    return {
      sinExplicar: NaN,
      etiqueta: 'No se pudo cuadrar el desglose',
      esProblema: true,
      nota: 'Falta algún dato de la factura para poder armar la resta.',
    };
  }

  const contadoCobradoAlDespacho =
    e.formaPago === 'CONTADO' && !e.contadoPendiente && e.fechaEmision < CORTE_CONTADO;

  // El orden importa. Una diferencia de céntimos es redondeo venga de donde
  // venga, incluso en un contado viejo que además tiene su pago registrado
  // (pasa: el pago entra por el monto redondeado y sobran o faltan 2
  // céntimos). Recién después se mira la regla del contado, que sí puede
  // explicar el importe entero.
  if (Math.abs(sinExplicar) <= TOLERANCIA_CENTIMOS) {
    return {
      sinExplicar,
      etiqueta: sinExplicar >= 0
        ? 'Diferencia de redondeo (tolerancia de S/ 0.09)'
        : 'Pagado de más (redondeo)',
      esProblema: false,
    };
  }
  // Solo cuando falta cobro por explicar. La regla del contado viejo SUMA un
  // cobro que no está registrado; no puede explicar un sobrante. Sin esta
  // condición se tragaba los pagos de más de 18 facturas —S/ 69.527,87— y
  // las mostraba como "cobrado al despacho" teniendo su pago registrado:
  // FFF1-1879 tenía su pago de S/ 180,00 del 22/07 y una nota de crédito de
  // S/ 48,00 de septiembre, y la pantalla decía que se había cobrado al
  // despacho. Lo levantó el usuario mirando esa factura.
  if (contadoCobradoAlDespacho && sinExplicar > 0) {
    return {
      sinExplicar,
      etiqueta: 'Cobrado al despacho (contado anterior al 11/08/2026)',
      esProblema: false,
    };
  }
  if (e.incobrable) {
    return {
      sinExplicar,
      etiqueta: 'Dada de baja por incobrable',
      esProblema: false,
      nota: e.incobrableMotivo ?? undefined,
    };
  }
  if (e.factorizado) {
    return {
      sinExplicar,
      etiqueta: e.factoringEntidad ? `Factorizada — ${e.factoringEntidad}` : 'Factorizada',
      esProblema: false,
    };
  }
  // Cobrado de más: los pagos superan lo que la factura pedía. v_cobros corta
  // el saldo en cero (`greatest(0, …)`), así que el exceso no se veía en
  // ningún lado.
  if (sinExplicar < 0 && e.saldoPendiente === 0) {
    // La nota de crédito llegó DESPUÉS de que el cliente pagara. No es un
    // error de imputación: es plata que se cobró y después se le acreditó,
    // y que hoy está a su favor. Es el caso de 7 de las 18 facturas que
    // antes decían "cobrado al despacho", entre ellas FFF1-1704 con
    // S/ 66.546,92. Hay que devolvérsela o aplicarla a otra factura, así
    // que se marca igual para revisar, pero con el motivo correcto: quien
    // lee tiene que saber que el pago está y que lo que sobra es el crédito.
    const ncDespuesDelPago =
      e.totalNc > 0 && !!e.fechaUltimaNc && !!e.fechaUltimoPago && e.fechaUltimaNc > e.fechaUltimoPago;

    if (ncDespuesDelPago) {
      return {
        sinExplicar,
        etiqueta: 'Nota de crédito posterior al pago — quedó a favor del cliente',
        esProblema: true,
        nota: 'El cliente ya había pagado la factura completa cuando se emitió la nota de crédito. Ese saldo a favor hay que devolvérselo o aplicarlo a otra factura.',
      };
    }

    return {
      sinExplicar,
      etiqueta: 'Pagado de más (el saldo no baja de cero)',
      esProblema: true,
      nota: 'Los pagos registrados superan lo que la factura pedía. Casi siempre es un pago imputado a la factura equivocada, o un pago redondeado hacia arriba.',
    };
  }
  return {
    sinExplicar,
    etiqueta: 'Diferencia sin explicar',
    esProblema: true,
    nota: e.tieneLetras
      ? 'El saldo de una factura canjeada sale de sus letras pendientes, y acá las letras no suman el importe menos las notas de crédito.'
      : 'No hay pago, nota de crédito ni letra que explique esta diferencia.',
  };
}
