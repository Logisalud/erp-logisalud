import { fetchAll } from '@/lib/fetchAll';

/**
 * Saldo contable por cliente: lo que dicen los documentos, con signo.
 *
 * Es una lectura distinta de la misma factura, pedida por Contabilidad.
 * `saldo_pendiente` responde "¿cuánto hay que salir a cobrar?" y para eso
 * aplica cuatro reglas de negocio (CONTADO al despacho, tolerancia de
 * céntimos, canje en letras, y nada baja de cero). `saldo_contable` responde
 * "¿qué dicen los documentos?":
 *
 *     importe + notas de débito − notas de crédito − pagos − letras pagadas
 *
 * No da nada por cobrado sin un pago registrado, no perdona el redondeo, una
 * factura dada de baja por incobrable sigue figurando, y una factura a la
 * que se le aplicó de más queda en NEGATIVO en vez de en cero.
 *
 * Las dos conviven: este reporte muestra las dos columnas y el motivo de
 * cada diferencia, para que nadie tenga que adivinar por qué no coinciden.
 */

export type MotivoDiferencia =
  | 'CONTADO cobrado al despacho'
  | 'Dada de baja por incobrable'
  | 'Canjeada por letras'
  | 'Aplicado de más'
  | 'Redondeo (hasta S/ 0,09)'
  | 'Factorizada'
  | null;

export interface FacturaContable {
  id: string;
  comprobante: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  importe: number;
  total_nc: number;
  total_nd: number;
  total_pagado: number;
  letras_pagadas: number;
  saldo_contable: number;
  saldo_cartera: number;
  diferencia: number;
  motivo: MotivoDiferencia;
}

export interface ClienteContable {
  cliente_ruc: string;
  razon_social: string;
  vendedor_nombre: string | null;
  saldo_contable: number;
  saldo_cartera: number;
  diferencia: number;
  facturas: FacturaContable[];
}

interface Fila {
  id: string; comprobante: string; cliente_ruc: string; razon_social: string;
  fecha_emision: string; fecha_vencimiento: string | null; forma_pago: string | null;
  contado_pendiente: boolean | null; importe_total: number | string;
  total_nc: number | string; total_nd: number | string; total_pagado: number | string;
  letras_pagadas: number | string; saldo_pendiente: number | string; saldo_contable: number | string;
  tiene_letras: boolean; incobrable: boolean; factorizado: boolean;
  vendedor_nombre: string | null;
}

type Db = { from: (t: string) => { select: (c: string) => { order: (c: string) => { range: (a: number, b: number) => PromiseLike<{ data: Fila[] | null; error: { message: string } | null }> } } } };

const n = (v: number | string | null) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

// Misma fecha de corte que `v_cobros`: literal, no CURRENT_DATE.
const CORTE_CONTADO = '2026-08-11';

const COLS = [
  'id', 'comprobante', 'cliente_ruc', 'razon_social', 'fecha_emision', 'fecha_vencimiento',
  'forma_pago', 'contado_pendiente', 'importe_total', 'total_nc', 'total_nd', 'total_pagado',
  'letras_pagadas', 'saldo_pendiente', 'saldo_contable', 'tiene_letras', 'incobrable',
  'factorizado', 'vendedor_nombre',
].join(', ');

function motivoDe(f: Fila, diferencia: number): MotivoDiferencia {
  if (Math.abs(diferencia) < 0.005) return null;
  // El orden importa: una factura puede caer en más de una, y se nombra la
  // regla que de verdad explica la diferencia.
  if (f.incobrable) return 'Dada de baja por incobrable';
  if (f.tiene_letras) return 'Canjeada por letras';
  if (f.factorizado) return 'Factorizada';
  if ((f.forma_pago ?? '') === 'CONTADO' && f.contado_pendiente === false && f.fecha_emision < CORTE_CONTADO)
    return 'CONTADO cobrado al despacho';
  if (n(f.saldo_contable) < -0.09) return 'Aplicado de más';
  if (Math.abs(diferencia) <= 0.09) return 'Redondeo (hasta S/ 0,09)';
  return null;
}

export async function cargarSaldoContable(db: Db): Promise<ClienteContable[]> {
  const filas = await fetchAll<Fila>((from, to) =>
    db.from('v_saldos').select(COLS).order('id').range(from, to)
  );

  const porCliente = new Map<string, ClienteContable>();
  for (const f of filas) {
    const contable = r2(n(f.saldo_contable));
    const cartera = r2(n(f.saldo_pendiente));
    // Una factura que no debe nada por ninguna de las dos lecturas no aporta
    // nada al reporte y sólo lo hace ilegible: son más de la mitad.
    if (Math.abs(contable) < 0.005 && cartera < 0.005) continue;

    const diferencia = r2(contable - cartera);
    let c = porCliente.get(f.cliente_ruc);
    if (!c) {
      c = {
        cliente_ruc: f.cliente_ruc,
        razon_social: f.razon_social,
        vendedor_nombre: f.vendedor_nombre,
        saldo_contable: 0, saldo_cartera: 0, diferencia: 0,
        facturas: [],
      };
      porCliente.set(f.cliente_ruc, c);
    }
    c.saldo_contable = r2(c.saldo_contable + contable);
    c.saldo_cartera = r2(c.saldo_cartera + cartera);
    c.facturas.push({
      id: f.id,
      comprobante: f.comprobante,
      fecha_emision: f.fecha_emision,
      fecha_vencimiento: f.fecha_vencimiento,
      importe: n(f.importe_total),
      total_nc: n(f.total_nc),
      total_nd: n(f.total_nd),
      total_pagado: n(f.total_pagado),
      letras_pagadas: n(f.letras_pagadas),
      saldo_contable: contable,
      saldo_cartera: cartera,
      diferencia,
      motivo: motivoDe(f, diferencia),
    });
  }

  const salida = [...porCliente.values()];
  for (const c of salida) {
    c.diferencia = r2(c.saldo_contable - c.saldo_cartera);
    c.facturas.sort((a, b) => a.fecha_emision.localeCompare(b.fecha_emision) || a.comprobante.localeCompare(b.comprobante));
  }
  // Los negativos primero —es lo que Contabilidad vino a ver— y después de
  // mayor a menor deuda.
  salida.sort((a, b) => a.saldo_contable - b.saldo_contable);
  return salida;
}
