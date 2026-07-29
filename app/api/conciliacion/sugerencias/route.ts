export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Limpia el nombre del banco para el match: quita sufijos societarios comunes.
function limpiarNombre(n: string): string {
  return n
    .replace(/\b(s\.?a\.?c\.?|e\.?i\.?r\.?l\.?|s\.?r\.?l\.?|s\.?a\.?|eirl|sac|srl)\b/gi, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Para un movimiento (cobro), sugiere cliente(s) por nombre y factura(s) por monto.
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: mov } = await db
    .from('movimientos_banco_import')
    .select('id, fecha, monto, nombre_banco_detectado')
    .eq('id', id)
    .single();
  if (!mov) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 });

  const monto = Number(mov.monto);
  const tol = 0.5; // tolerancia de monto ±S/0.50

  // 1) Clientes candidatos por nombre (solo si el nombre es suficientemente distintivo).
  let clientes: { ruc: string; razon_social: string }[] = [];
  if (mov.nombre_banco_detectado) {
    const limpio = limpiarNombre(mov.nombre_banco_detectado);
    if (limpio.length >= 4) {
      const { data } = await db
        .from('clientes')
        .select('ruc, razon_social')
        .ilike('razon_social', `%${limpio}%`)
        .limit(8);
      clientes = data ?? [];
    }
  }

  // 2) Facturas pendientes con saldo ≈ monto. Si hay clientes candidatos, priorizar
  //    los de esos clientes; además, mostrar cualquier factura con saldo == monto exacto.
  const rucs = clientes.map(c => c.ruc);
  const facturas: {
    id: string; comprobante: string; cliente_ruc: string; razon_social: string;
    importe_total: number; saldo_pendiente: number; fecha_emision: string; tiene_letras: boolean;
    match: 'cliente_y_monto' | 'monto_exacto';
  }[] = [];

  const push = (rows: Record<string, unknown>[], match: 'cliente_y_monto' | 'monto_exacto') => {
    for (const f of rows) {
      if (facturas.some(x => x.id === f.id)) continue;
      facturas.push({
        id: f.id as string, comprobante: f.comprobante as string, cliente_ruc: f.cliente_ruc as string,
        razon_social: f.razon_social as string, importe_total: Number(f.importe_total) || 0,
        saldo_pendiente: Number(f.saldo_pendiente) || 0, fecha_emision: f.fecha_emision as string,
        tiene_letras: !!f.tiene_letras, match,
      });
    }
  };

  const cols = 'id, comprobante, cliente_ruc, razon_social, importe_total, saldo_pendiente, fecha_emision, tiene_letras';

  if (rucs.length > 0) {
    const { data } = await db.from('v_saldos').select(cols)
      .in('cliente_ruc', rucs)
      .gte('saldo_pendiente', monto - tol).lte('saldo_pendiente', monto + tol)
      .limit(20);
    push(data ?? [], 'cliente_y_monto');
  }

  // Facturas de cualquier cliente cuyo saldo coincide con el monto exacto (±tol).
  const { data: exactas } = await db.from('v_saldos').select(cols)
    .gte('saldo_pendiente', monto - tol).lte('saldo_pendiente', monto + tol)
    .limit(20);
  push(exactas ?? [], 'monto_exacto');

  // Categoría de confianza: honesta sobre qué señales hay, nunca un score
  // numérico. El único mecanismo que puede resolver un movimiento SIN
  // intervención humana es el auto-conciliar por N° de operación exacto
  // (/api/conciliacion/auto) — esto de aquí (nombre/monto) SIEMPRE requiere
  // que una persona confirme, sin importar la categoría.
  //
  //   nombre_y_monto     el nombre coincide con un cliente Y ese cliente
  //                      tiene una factura con saldo cercano al monto.
  //   nombre_sin_monto   el nombre coincide con un cliente, pero ninguna de
  //                      sus facturas tiene saldo cercano — nunca se muestra
  //                      un botón de confirmar aquí, solo "buscar manualmente".
  //   solo_monto_unica   sin nombre de respaldo, pero una única factura en
  //                      todo el sistema tiene ese saldo.
  //   ambiguo            el monto coincide con 2+ facturas de clientes
  //                      distintos — máximo riesgo de aplicar el pago al
  //                      cliente equivocado.
  //   sin_candidata      ninguna señal disponible.
  const facturasConNombre = facturas.filter(f => f.match === 'cliente_y_monto');
  let categoria: 'nombre_y_monto' | 'nombre_sin_monto' | 'solo_monto_unica' | 'ambiguo' | 'sin_candidata';
  if (facturasConNombre.length > 0) categoria = 'nombre_y_monto';
  else if (clientes.length > 0) categoria = 'nombre_sin_monto';
  else if (facturas.length === 1) categoria = 'solo_monto_unica';
  else if (facturas.length >= 2) categoria = 'ambiguo';
  else categoria = 'sin_candidata';

  // En "nombre_sin_monto" no se ofrece ninguna factura para confirmar: las
  // que hubiera en `facturas` (monto_exacto) pertenecen a OTROS clientes, no
  // al identificado por nombre, y mostrarlas con un botón de confirmar
  // induciría a aplicar el pago al cliente equivocado.
  const facturasParaMostrar = categoria === 'nombre_sin_monto' ? [] : facturas;

  return NextResponse.json({
    movimiento: { id: mov.id, fecha: mov.fecha, monto, nombre_banco_detectado: mov.nombre_banco_detectado },
    categoria,
    clientes,
    facturas: facturasParaMostrar,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
