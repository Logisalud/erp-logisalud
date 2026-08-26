export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

interface SaldoRow {
  cliente_ruc: string;
  razon_social: string;
  vendedor_id: string | null;
  vendedor_codigo: string | null;
  vendedor_nombre: string | null;
  zona_nombre: string | null;
  saldo_pendiente: number;
  dias_retraso: number;
  d0_7: number; d8_15: number; d16_30: number; d31_60: number; d61_mas: number;
}

export interface ClienteConcentracion {
  cliente_ruc: string;
  razon_social: string;
  vendedor_id: string | null;
  vendedor_codigo: string | null;
  vendedor_nombre: string | null;
  zona_nombre: string | null;
  monto_vencido: number;
  n_facturas_vencidas: number;
  dias_retraso_max: number;
}

// Concentración de cartera vencida por cliente. Fuente: v_saldos agrupado
// por cliente_ruc (una fila por documento ya viene agregada por la vista) —
// no usa el export plano de Estado de Cuenta, que hace fan-out por pago.
export async function GET() {
  try {
    const db = supabaseAdmin();

    const data = await fetchAll<SaldoRow>((from, to) =>
      db.from('v_saldos')
        .select('cliente_ruc, razon_social, vendedor_id, vendedor_codigo, vendedor_nombre, zona_nombre, saldo_pendiente, dias_retraso, d0_7, d8_15, d16_30, d31_60, d61_mas')
        .gt('saldo_pendiente', 0)
        .range(from, to)
    );

    const map = new Map<string, ClienteConcentracion>();
    for (const row of data) {
      const vencidoDoc = (Number(row.d0_7) || 0) + (Number(row.d8_15) || 0) + (Number(row.d16_30) || 0)
                       + (Number(row.d31_60) || 0) + (Number(row.d61_mas) || 0);

      if (!map.has(row.cliente_ruc)) {
        map.set(row.cliente_ruc, {
          cliente_ruc: row.cliente_ruc,
          razon_social: row.razon_social,
          vendedor_id: row.vendedor_id,
          vendedor_codigo: row.vendedor_codigo,
          vendedor_nombre: row.vendedor_nombre,
          zona_nombre: row.zona_nombre,
          monto_vencido: 0,
          n_facturas_vencidas: 0,
          dias_retraso_max: 0,
        });
      }
      const c = map.get(row.cliente_ruc)!;
      if (vencidoDoc > 0.005) {
        c.monto_vencido += vencidoDoc;
        c.n_facturas_vencidas += 1;
        c.dias_retraso_max = Math.max(c.dias_retraso_max, Number(row.dias_retraso) || 0);
      }
    }

    const clientes = Array.from(map.values())
      .filter(c => c.monto_vencido > 0.005)
      .sort((a, b) => b.monto_vencido - a.monto_vencido);

    return NextResponse.json({ clientes }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
