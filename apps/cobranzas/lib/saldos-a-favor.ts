import { fetchAll } from '@/lib/fetchAll';

/**
 * Saldos a favor del cliente: lo que se le aplicó de MÁS a una factura.
 *
 * Sale de `v_saldos.saldo_a_favor`, la columna aditiva que agregó la
 * migración `20261111_v_saldos_saldo_a_favor`. No se calcula acá a mano: si
 * se calculara, la pantalla y la base podrían discrepar en cuanto alguien
 * toque la regla, que es justo lo que pasó con el Excel de "Resumen por
 * vendedor" (ver `lib/fetchAll.ts`).
 *
 * El neto es `deuda - a_favor` y es el número que importa, porque el saldo a
 * favor **se compensa** contra las compras siguientes del cliente (decisión
 * del usuario, nov-2026): no se devuelve en efectivo salvo excepción.
 *   * neto > 0 → el cliente todavía nos debe.
 *   * neto < 0 → le debemos nosotros, y ese es el caso que nadie veía.
 */

export interface FacturaAFavor {
  id: string;
  comprobante: string;
  fecha_emision: string;
  importe_total: number;
  total_nc: number;
  total_pagado: number;
  a_favor: number;
}

/** Una factura abierta del cliente: lo que se va a comer su saldo a favor. */
export interface FacturaDeuda {
  id: string;
  comprobante: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  saldo: number;
  dias_retraso: number;
}

export interface ClienteAFavor {
  cliente_ruc: string;
  razon_social: string;
  vendedor_nombre: string | null;
  vendedor_codigo: string | null;
  a_favor: number;
  deuda: number;
  neto: number;
  /** De dónde sale el saldo a favor. */
  facturas: FacturaAFavor[];
  /**
   * Qué se lo está comiendo. Sin esto, un cliente con neto positivo muestra
   * una "deuda vigente" sin explicación y la pantalla parece decir que le
   * debemos plata cuando es al revés.
   */
  facturasDeuda: FacturaDeuda[];
}

interface FilaSaldo {
  id: string;
  comprobante: string;
  cliente_ruc: string;
  razon_social: string;
  fecha_emision: string;
  importe_total: number | string;
  total_nc: number | string;
  total_pagado: number | string;
  saldo_pendiente: number | string;
  saldo_a_favor: number | string;
  vendedor_nombre: string | null;
  vendedor_codigo: string | null;
  fecha_vencimiento: string | null;
  dias_retraso: number | string | null;
}

type Db = {
  from: (t: string) => {
    select: (c: string) => {
      gt: (col: string, v: number) => { order: (c: string) => { range: (a: number, b: number) => PromiseLike<{ data: FilaSaldo[] | null; error: { message: string } | null }> } };
      in: (col: string, v: string[]) => { gt: (col: string, v: number) => { order: (c: string) => { range: (a: number, b: number) => PromiseLike<{ data: FilaSaldo[] | null; error: { message: string } | null }> } } };
    };
  };
};

const n = (v: number | string | null) => Number(v) || 0;

const COLS = 'id, comprobante, cliente_ruc, razon_social, fecha_emision, fecha_vencimiento, dias_retraso, importe_total, total_nc, total_pagado, saldo_pendiente, saldo_a_favor, vendedor_nombre, vendedor_codigo';

export async function cargarSaldosAFavor(db: Db): Promise<ClienteAFavor[]> {
  // 1) Las facturas con excedente. Son pocas (80 al 2026-11-11), pero se
  //    pagina igual: esto crece con cada devolución mal aplicada.
  const conExcedente = await fetchAll<FilaSaldo>((from, to) =>
    db.from('v_saldos').select(COLS).gt('saldo_a_favor', 0).order('id').range(from, to)
  );
  if (!conExcedente.length) return [];

  // 2) La deuda viva de esos mismos clientes, para poder netear. Va en una
  //    consulta aparte porque un cliente puede deber en facturas que no
  //    tienen ningún excedente — justamente el caso que se quiere compensar.
  const rucs = Array.from(new Set(conExcedente.map(f => f.cliente_ruc)));
  const deudaPorRuc = new Map<string, number>();
  const facturasDeudaPorRuc = new Map<string, FacturaDeuda[]>();
  for (let i = 0; i < rucs.length; i += 300) {
    const lote = rucs.slice(i, i + 300);
    const filas = await fetchAll<FilaSaldo>((from, to) =>
      db.from('v_saldos').select(COLS).in('cliente_ruc', lote).gt('saldo_pendiente', 0).order('id').range(from, to)
    );
    for (const f of filas) {
      deudaPorRuc.set(f.cliente_ruc, (deudaPorRuc.get(f.cliente_ruc) ?? 0) + n(f.saldo_pendiente));
      const lista = facturasDeudaPorRuc.get(f.cliente_ruc) ?? [];
      lista.push({
        id: f.id,
        comprobante: f.comprobante,
        fecha_emision: f.fecha_emision,
        fecha_vencimiento: f.fecha_vencimiento,
        saldo: n(f.saldo_pendiente),
        dias_retraso: Number(f.dias_retraso) || 0,
      });
      facturasDeudaPorRuc.set(f.cliente_ruc, lista);
    }
  }

  const porCliente = new Map<string, ClienteAFavor>();
  for (const f of conExcedente) {
    let c = porCliente.get(f.cliente_ruc);
    if (!c) {
      c = {
        cliente_ruc: f.cliente_ruc,
        razon_social: f.razon_social,
        vendedor_nombre: f.vendedor_nombre,
        vendedor_codigo: f.vendedor_codigo,
        a_favor: 0,
        deuda: deudaPorRuc.get(f.cliente_ruc) ?? 0,
        neto: 0,
        facturas: [],
        facturasDeuda: facturasDeudaPorRuc.get(f.cliente_ruc) ?? [],
      };
      porCliente.set(f.cliente_ruc, c);
    }
    c.a_favor += n(f.saldo_a_favor);
    c.facturas.push({
      id: f.id,
      comprobante: f.comprobante,
      fecha_emision: f.fecha_emision,
      importe_total: n(f.importe_total),
      total_nc: n(f.total_nc),
      total_pagado: n(f.total_pagado),
      a_favor: n(f.saldo_a_favor),
    });
  }

  const salida = [...porCliente.values()];
  for (const c of salida) {
    c.neto = c.deuda - c.a_favor;
    c.facturas.sort((a, b) => b.a_favor - a.a_favor);
    // La más atrasada primero: es la que hay que cobrar o compensar antes.
    c.facturasDeuda.sort((a, b) => b.dias_retraso - a.dias_retraso || b.saldo - a.saldo);
  }
  // De mayor a favor a menor: el orden en que Contabilidad los va a atender.
  salida.sort((a, b) => b.a_favor - a.a_favor);
  return salida;
}
