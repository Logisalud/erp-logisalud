export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

// Detecta si la query es un número (monto) — permite enteros y decimales con punto o coma
function parseMonto(q: string): number | null {
  const normalizado = q.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  const n = parseFloat(normalizado);
  return isNaN(n) ? null : n;
}

// Detecta RUC: exactamente 11 dígitos
function esRuc(q: string): boolean {
  return /^\d{11}$/.test(q);
}

// Detecta comprobante: letras-dígitos o F/B/E + serie-número (ej. FFF1-123, B001-456)
function esComprobante(q: string): boolean {
  return /^[A-Z0-9]{1,4}-\d+$/i.test(q);
}

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ facturas: [], pagos: [] });

  const db  = supabaseAdmin();
  const noCacheHeaders = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

  // ── Prioridad de detección: comprobante → RUC (11 dígitos) → monto → texto ──
  // El RUC (11 dígitos exactos) se decide ANTES que el monto: un monto no tiene
  // 11 dígitos enteros, así que los 11 dígitos siempre son RUC, no importe.
  const monto = (esComprobante(q) || esRuc(q)) ? null : parseMonto(q);

  // ── Búsqueda por monto ──────────────────────────────────────────────────────
  if (monto !== null) {
    const tolerancia = 1; // ± S/1 para aproximaciones
    const [resFacturas, resPagos] = await Promise.all([
      db.from('v_saldos')
        .select('id, comprobante, cliente_ruc, razon_social, fecha_emision, fecha_vencimiento, ' +
                'importe_total, total_pagado, saldo_pendiente, rango_vencimiento, tiene_letras, forma_pago, contado_pendiente')
        .or(`and(importe_total.gte.${monto - tolerancia},importe_total.lte.${monto + tolerancia}),and(saldo_pendiente.gte.${monto - tolerancia},saldo_pendiente.lte.${monto + tolerancia})`)
        .order('fecha_emision', { ascending: false })
        .limit(20),
      db.from('pagos')
        .select('id, monto, fecha_pago, referencia, documento_id, documentos(comprobante, cliente_ruc, razon_social)')
        .gte('monto', monto - tolerancia)
        .lte('monto', monto + tolerancia)
        .order('fecha_pago', { ascending: false })
        .limit(10),
    ]);

    const facturas = resFacturas.data ?? [];

    return NextResponse.json({ facturas, pagos: resPagos.data ?? [], tipoBusqueda: 'monto' }, { headers: noCacheHeaders });
  }

  // ── Búsqueda textual (comprobante / RUC / razón social) ────────────────────
  let orClause: string;
  if (esComprobante(q)) {
    orClause = `comprobante.ilike.${q}%`;
  } else if (esRuc(q)) {
    orClause = `cliente_ruc.eq.${q}`;
  } else {
    orClause = `comprobante.ilike.%${q}%,cliente_ruc.ilike.%${q}%,razon_social.ilike.%${q}%`;
  }

  const { data, error } = await db
    .from('v_saldos')
    .select(
      'id, comprobante, cliente_ruc, razon_social, fecha_emision, fecha_vencimiento, ' +
      'importe_total, total_pagado, saldo_pendiente, rango_vencimiento, tiene_letras, forma_pago, contado_pendiente'
    )
    .or(orClause)
    .order('fecha_emision', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ facturas: data ?? [], pagos: [], tipoBusqueda: 'texto' }, { headers: noCacheHeaders });
}
