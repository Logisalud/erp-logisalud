export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { crearClienteServidor } from '@logisalud/auth/server';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import { fetchAll } from '@/lib/fetchAll';
import {
  construirEstadoCuenta,
  type FacturaCruda,
  type LetraCruda,
  type NotaCruda,
  type PagoCrudo,
} from '@/lib/estado-cuenta';

const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

/** PostgREST no acepta listas enormes en un `.in()`: se va por tandas. */
const TANDA = 300;

/**
 * El historial completo de un cliente, ya armado como extracto.
 *
 * Las facturas salen de `v_saldos` y no de `documentos` a propósito: esa
 * vista ya trae el `saldo_pendiente` real —el de las cuatro ramas— y ya
 * excluye anuladas y rechazadas por SUNAT. Es la fuente de verdad contra la
 * que el extracto tiene que cuadrar.
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
      .select('ruc, razon_social, direccion, distrito, provincia, celular')
      .eq('ruc', ruc)
      .maybeSingle();

    const facturas = (await fetchAll<FacturaCruda>((from, to) =>
      db
        .from('v_saldos')
        .select('id, tipo, comprobante, fecha_emision, importe_total, saldo_pendiente, forma_pago, contado_pendiente')
        .eq('cliente_ruc', ruc)
        .order('fecha_emision')
        .range(from, to),
    )) as FacturaCruda[];

    const ids = facturas.map((f) => f.id);

    const notas = (await fetchAll((from, to) =>
      db
        .from('documentos')
        .select('id, tipo, serie, numero, fecha_emision, importe_total, documento_relacionado_id')
        .eq('cliente_ruc', ruc)
        .in('tipo', ['07', '08'])
        .eq('anulado', false)
        .order('fecha_emision')
        .range(from, to),
    )) as unknown as Array<NotaCruda & { serie: string; numero: number }>;

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

      const letraIds = Array.from(new Set((ld ?? []).map((x) => x.letra_id as string)));
      const porLetra = new Map<string, { numero_letra: string | null; fecha_vencimiento: string | null; estado: string }>();
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

    const { movimientos, resumen } = construirEstadoCuenta({
      facturas,
      notas: notas.map((n) => ({
        id: n.id,
        tipo: n.tipo,
        comprobante: `${String(n.serie).trim()}-${n.numero}`,
        fecha_emision: n.fecha_emision,
        importe_total: Number(n.importe_total) || 0,
        documento_relacionado_id: n.documento_relacionado_id,
      })),
      pagos,
      letras,
      desde,
      hasta,
    });

    return NextResponse.json(
      {
        cliente: cliente.data ?? { ruc, razon_social: ruc },
        movimientos,
        resumen,
        rango: { desde, hasta },
      },
      { headers: noStore },
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
