export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { crearClienteServidor } from '@logisalud/auth/server';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

interface SaldoRow {
  cliente_ruc: string; razon_social: string;
  saldo_pendiente: number;
  vigente: number; d0_7: number; d8_15: number; d16_30: number; d31_60: number; d61_mas: number;
}

interface GrupoCliente {
  cliente_ruc: string; razon_social: string;
  vigente: number; d0_7: number; d8_15: number; d16_30: number; d31_60: number; d61_mas: number;
  saldo_total: number; cant_facturas: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { vendedorId: string } }
) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const url = new URL(req.url);
    const soloDeuda = url.searchParams.get('solo_deuda') !== 'false';
    // Zona opcional: cuando el resumen viene desglosado por vendedor+zona
    // (ver /api/estado-cuenta/resumen), el drill-down de una fila puntual
    // (ej. "Cinthya · LIMH05") debe traer solo esa zona, no toda su cartera.
    const zona = url.searchParams.get('zona')?.trim() || null;
    const { vendedorId } = params;
    const db = crearClienteServidor();

    const data = await fetchAll<SaldoRow>((from, to) => {
      let q = db
        .from('v_saldos')
        .select('cliente_ruc, razon_social, saldo_pendiente, vigente, d0_7, d8_15, d16_30, d31_60, d61_mas');
      q = vendedorId === 'sin-asignar'
        ? q.is('vendedor_id', null)
        : q.eq('vendedor_id', vendedorId);
      if (zona) q = q.eq('zona_nombre', zona);
      if (soloDeuda) q = q.gt('saldo_pendiente', 0);
      return q.range(from, to);
    });

    const grupos = new Map<string, GrupoCliente>();
    for (const row of data) {
      if (!grupos.has(row.cliente_ruc)) {
        grupos.set(row.cliente_ruc, {
          cliente_ruc: row.cliente_ruc, razon_social: row.razon_social,
          vigente: 0, d0_7: 0, d8_15: 0, d16_30: 0, d31_60: 0, d61_mas: 0,
          saldo_total: 0, cant_facturas: 0,
        });
      }
      const g = grupos.get(row.cliente_ruc)!;
      g.saldo_total   += Number(row.saldo_pendiente) || 0;
      g.vigente       += Number(row.vigente)         || 0;
      g.d0_7          += Number(row.d0_7)            || 0;
      g.d8_15         += Number(row.d8_15)           || 0;
      g.d16_30        += Number(row.d16_30)          || 0;
      g.d31_60        += Number(row.d31_60)          || 0;
      g.d61_mas       += Number(row.d61_mas)         || 0;
      g.cant_facturas += 1;
    }

    const clientes = Array.from(grupos.values()).sort((a, b) => b.saldo_total - a.saldo_total);
    return NextResponse.json({ clientes }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
