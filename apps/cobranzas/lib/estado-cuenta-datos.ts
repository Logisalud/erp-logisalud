import { fetchAll } from '@/lib/fetchAll';
import {
  agruparPorFactura,
  construirEstadoCuenta,
  type FacturaCruda,
  type FacturaResumen,
  type LetraCruda,
  type Movimiento,
  type NotaCruda,
  type PagoCrudo,
  type Resumen,
} from '@/lib/estado-cuenta';

/** PostgREST no acepta listas enormes en un `.in()`: se va por tandas. */
const TANDA = 300;

/**
 * Lo mínimo que esta función necesita de un cliente de Supabase. Se tipea
 * así, y no como `SupabaseClient`, porque la llaman tres rutas con dos
 * clientes distintos: el de sesión (`crearClienteServidor`) desde las
 * pantallas de staff y el de service role (`supabaseAdmin`) desde el link
 * público del vendedor, que no tiene sesión que presentar.
 */
type Db = { from: (tabla: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ClienteEstadoCuenta {
  ruc: string;
  razon_social: string;
  direccion?: string | null;
  distrito?: string | null;
  provincia?: string | null;
  celular?: string | null;
}

export interface ComentarioCobranza {
  comentario: string;
  escrito_por: string | null;
  actualizado_en: string;
}

export interface DatosEstadoCuenta {
  cliente: ClienteEstadoCuenta;
  movimientos: Movimiento[];
  porFactura: FacturaResumen[];
  resumen: Resumen;
  /**
   * Lo acordado con el cliente, y lo anotado en cada factura.
   *
   * Van acá y no en una llamada aparte por la misma razón que todo lo
   * demás: las tres pantallas que usan esta función —staff, su Excel y el
   * link del vendedor— tienen que decir lo mismo. El vendedor los ve; el
   * permiso para escribirlos lo pone la API de comentarios, no esto.
   */
  comentarioCliente: ComentarioCobranza | null;
  comentariosPorFactura: Record<string, ComentarioCobranza>;
  /**
   * Lo que se le aplicó de MÁS al cliente, sumando sus facturas.
   *
   * Es plata que se le debe: se compensa contra sus compras siguientes. No
   * sale restando del saldo —`saldo_pendiente` nunca es negativo— sino de la
   * columna `saldo_a_favor` de `v_saldos`.
   */
  saldoAFavor: number;
  /** El mismo excedente, abierto por factura (solo las que tienen). */
  saldoAFavorPorFactura: Record<string, number>;
}

/**
 * Todo el estado de cuenta de un cliente, listo para pintar o exportar.
 *
 * Vive acá y no en cada ruta porque son tres las que lo necesitan —la
 * pantalla de staff, su Excel y el link del vendedor— y las tres tienen que
 * decir exactamente lo mismo. Que un vendedor y Contabilidad discrepen sobre
 * cuánto debe un cliente es peor que no tener la pantalla.
 *
 * Las facturas salen de `v_saldos` y no de `documentos` a propósito: esa
 * vista ya trae el `saldo_pendiente` real —el de las cuatro ramas— y ya
 * excluye anuladas y rechazadas por SUNAT. Es la fuente de verdad contra la
 * que el extracto tiene que cuadrar.
 */
export async function cargarEstadoCuenta(
  db: Db,
  ruc: string,
  desde: string | null,
  hasta: string | null,
): Promise<DatosEstadoCuenta> {
  const cliente = await db
    .from('clientes')
    .select('ruc, razon_social, direccion, distrito, provincia, celular')
    .eq('ruc', ruc)
    .maybeSingle();

  const facturasCrudas = await fetchAll<FacturaCruda & { saldo_a_favor?: number | string }>((from, to) =>
    db
      .from('v_saldos')
      .select(
        'id, tipo, comprobante, fecha_emision, fecha_vencimiento, importe_total, saldo_pendiente, forma_pago, contado_pendiente, factorizado, factoring_entidad, incobrable, incobrable_motivo, saldo_a_favor',
      )
      .eq('cliente_ruc', ruc)
      .order('fecha_emision')
      .order('id').range(from, to),
  );
  const facturas = facturasCrudas as FacturaCruda[];

  // Saldo a favor: lo aplicado de MÁS sobre una factura. Se lee de la vista
  // (`v_saldos.saldo_a_favor`, migración 20261111) y no se recalcula acá, por
  // lo mismo que `agruparPorFactura` no recalcula el saldo: dos cuentas del
  // mismo número terminan discrepando. `saldo_pendiente` lo ignora a
  // propósito — una factura nunca baja de cero.
  const saldoAFavorPorFactura: Record<string, number> = {};
  let saldoAFavor = 0;
  for (const f of facturasCrudas) {
    const v = Number(f.saldo_a_favor) || 0;
    if (v > 0) {
      saldoAFavorPorFactura[f.id] = v;
      saldoAFavor = Math.round((saldoAFavor + v) * 100) / 100;
    }
  }

  const notas = (await fetchAll((from, to) =>
    db
      .from('documentos')
      .select('id, tipo, serie, numero, fecha_emision, importe_total, documento_relacionado_id')
      .eq('cliente_ruc', ruc)
      .in('tipo', ['07', '08'])
      .eq('anulado', false)
      .order('fecha_emision')
      .order('id').range(from, to),
  )) as unknown as Array<NotaCruda & { serie: string; numero: number }>;

  const ids = facturas.map((f) => f.id);
  const pagos: PagoCrudo[] = [];
  const letras: LetraCruda[] = [];

  for (let i = 0; i < ids.length; i += TANDA) {
    const tanda = ids.slice(i, i + TANDA);

    const { data: pg, error: ePg } = await db
      .from('pagos')
      .select('documento_id, fecha_pago, monto, tipo, referencia, letra_id')
      .in('documento_id', tanda);
    if (ePg) throw new Error(ePg.message);
    pagos.push(...((pg ?? []) as PagoCrudo[]));

    // Abonos a letra, por (letra, documento). Salen de los mismos pagos que
    // ya se trajeron: un abono ES un pago, con `letra_id` puesto.
    const abonoPorLetraYDoc = new Map<string, number>();
    for (const p of (pg ?? []) as Array<{ letra_id?: string | null; documento_id: string; monto: number }>) {
      if (!p.letra_id) continue;
      const k = `${p.letra_id}|${p.documento_id}`;
      abonoPorLetraYDoc.set(k, (abonoPorLetraYDoc.get(k) ?? 0) + (Number(p.monto) || 0));
    }

    const { data: ld, error: eLd } = await db
      .from('letra_documento')
      .select('documento_id, monto_aplicado, letra_id')
      .in('documento_id', tanda);
    if (eLd) throw new Error(eLd.message);

    const letraIds = Array.from(new Set((ld ?? []).map((x: { letra_id: string }) => x.letra_id)));
    const porLetra = new Map<
      string,
      { numero_letra: string | null; fecha_vencimiento: string | null; estado: string }
    >();
    for (let j = 0; j < letraIds.length; j += TANDA) {
      const { data: ls, error: eLs } = await db
        .from('letras')
        .select('id, numero_letra, fecha_vencimiento, estado')
        .in('id', letraIds.slice(j, j + TANDA));
      if (eLs) throw new Error(eLs.message);
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
        numero_letra: l.numero_letra,
        fecha_vencimiento: l.fecha_vencimiento,
        estado: l.estado,
        abonado: abonoPorLetraYDoc.get(`${x.letra_id as string}|${x.documento_id as string}`) ?? 0,
      });
    }
  }

  const notasLimpias = notas.map((n) => ({
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

  // El agrupado por factura se arma SIEMPRE con el historial entero, aunque
  // haya filtro de fechas: el saldo de una factura es el que es y no depende
  // del rango que se esté mirando. Si se filtrara, una factura pagada en
  // enero aparecería como pendiente por mirar sólo marzo.
  const completo =
    desde || hasta
      ? construirEstadoCuenta({ facturas, notas: notasLimpias, pagos, letras }).movimientos
      : movimientos;

  const hoyISO = new Date().toISOString().slice(0, 10);
  const porFactura = agruparPorFactura(completo, facturas, hoyISO);

  const comentarioCliente = await db
    .from('comentarios_cliente')
    .select('comentario, escrito_por, actualizado_en')
    .eq('cliente_ruc', ruc)
    .maybeSingle();

  const comentariosPorFactura: Record<string, ComentarioCobranza> = {};
  const idsFacturas = facturas.map((f) => f.id);
  for (let i = 0; i < idsFacturas.length; i += 500) {
    const { data } = await db
      .from('comentarios_documento')
      .select('documento_id, comentario, escrito_por, actualizado_en')
      .in('documento_id', idsFacturas.slice(i, i + 500));
    for (const c of (data ?? []) as Array<ComentarioCobranza & { documento_id: string }>) {
      comentariosPorFactura[c.documento_id] = {
        comentario: c.comentario,
        escrito_por: c.escrito_por,
        actualizado_en: String(c.actualizado_en),
      };
    }
  }

  return {
    cliente: (cliente.data as ClienteEstadoCuenta | null) ?? { ruc, razon_social: ruc },
    movimientos,
    porFactura,
    resumen,
    comentarioCliente: (comentarioCliente.data as ComentarioCobranza | null) ?? null,
    comentariosPorFactura,
    saldoAFavor,
    saldoAFavorPorFactura,
  };
}
