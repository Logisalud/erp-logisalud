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

export interface DatosEstadoCuenta {
  cliente: ClienteEstadoCuenta;
  movimientos: Movimiento[];
  porFactura: FacturaResumen[];
  resumen: Resumen;
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

  const facturas = (await fetchAll<FacturaCruda>((from, to) =>
    db
      .from('v_saldos')
      .select(
        'id, tipo, comprobante, fecha_emision, fecha_vencimiento, importe_total, saldo_pendiente, forma_pago, contado_pendiente, factorizado, factoring_entidad',
      )
      .eq('cliente_ruc', ruc)
      .order('fecha_emision')
      .order('id').range(from, to),
  )) as FacturaCruda[];

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
      .select('documento_id, fecha_pago, monto, tipo, referencia')
      .in('documento_id', tanda);
    if (ePg) throw new Error(ePg.message);
    pagos.push(...((pg ?? []) as PagoCrudo[]));

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

  return {
    cliente: (cliente.data as ClienteEstadoCuenta | null) ?? { ruc, razon_social: ruc },
    movimientos,
    porFactura,
    resumen,
  };
}
