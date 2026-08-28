export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { crearClienteServidor } from '@logisalud/auth/server';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ clientes: [] });

  const db = crearClienteServidor();
  const { data, error } = await db
    .from('v_saldos')
    .select('cliente_ruc, razon_social, vendedor_nombre, vendedor_codigo, zona_nombre, saldo_pendiente, vigente, d0_7, d8_15, d16_30, d31_60, d61_mas')
    .or(`razon_social.ilike.%${q}%,cliente_ruc.ilike.%${q}%`)
    .order('razon_social')
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map = new Map<string, {
    cliente_ruc: string; razon_social: string;
    vendedor_nombre: string | null; vendedor_codigo: string | null; zona_nombre: string | null;
    vigente: number; d0_7: number; d8_15: number; d16_30: number; d31_60: number; d61_mas: number;
    saldo_total: number; cant_facturas: number;
  }>();

  for (const row of data ?? []) {
    const ruc = row.cliente_ruc;
    if (!map.has(ruc)) {
      map.set(ruc, {
        cliente_ruc: ruc, razon_social: row.razon_social,
        vendedor_nombre: row.vendedor_nombre, vendedor_codigo: row.vendedor_codigo,
        zona_nombre: row.zona_nombre,
        vigente: 0, d0_7: 0, d8_15: 0, d16_30: 0, d31_60: 0, d61_mas: 0,
        saldo_total: 0, cant_facturas: 0,
      });
    }
    const c = map.get(ruc)!;
    c.vigente      += Number(row.vigente)         || 0;
    c.d0_7         += Number(row.d0_7)            || 0;
    c.d8_15        += Number(row.d8_15)           || 0;
    c.d16_30       += Number(row.d16_30)          || 0;
    c.d31_60       += Number(row.d31_60)          || 0;
    c.d61_mas      += Number(row.d61_mas)         || 0;
    c.saldo_total  += Number(row.saldo_pendiente) || 0;
    c.cant_facturas += 1;
  }

  const clientes = Array.from(map.values())
    .sort((a, b) => a.razon_social.localeCompare(b.razon_social))
    .slice(0, 10);

  return NextResponse.json({ clientes });
}
