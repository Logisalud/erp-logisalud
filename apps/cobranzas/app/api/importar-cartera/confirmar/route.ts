export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { VendedorCartera, ClienteCartera } from '@/lib/cartera-parser';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body: { _vendedores: VendedorCartera[]; _clientes: ClienteCartera[] } = await req.json();
    const { _vendedores: vendedores, _clientes: clientes } = body;
    if (!vendedores?.length || !clientes?.length) {
      return NextResponse.json({ error: 'Payload vacío' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const log: string[] = [];

    // ── 1. Upsert zonas ──────────────────────────────────────────────────────
    const zonasUnicas = Array.from(new Set(vendedores.map(v => v.zona)));
    const { data: zonasCreadas, error: errZonas } = await db
      .from('zonas')
      .upsert(zonasUnicas.map(nombre => ({ nombre })), { onConflict: 'nombre' })
      .select('id, nombre');
    if (errZonas) return NextResponse.json({ error: `Zonas: ${errZonas.message}` }, { status: 500 });

    const zonaIdPorNombre = new Map<string, string>();
    (zonasCreadas ?? []).forEach((z: { id: string; nombre: string }) => zonaIdPorNombre.set(z.nombre, z.id));

    // ── 2. Upsert vendedores ─────────────────────────────────────────────────
    const vendedoresPayload = vendedores.map(v => ({
      nombres:   v.nombres,
      apellidos: v.apellidos,
      codigo:    v.codigo,
    }));
    const { data: vendedoresCreados, error: errVend } = await db
      .from('vendedores')
      .upsert(vendedoresPayload, { onConflict: 'codigo' })
      .select('id, codigo');
    if (errVend) return NextResponse.json({ error: `Vendedores: ${errVend.message}` }, { status: 500 });

    const vendedorIdPorCodigo = new Map<string, string>();
    (vendedoresCreados ?? []).forEach((v: { id: string; codigo: string }) => vendedorIdPorCodigo.set(v.codigo, v.id));

    // ── 3. Upsert zona_vendedor (evita duplicados por zona+vendedor+fecha) ───
    const FECHA_DESDE = '2026-06-06';
    for (const v of vendedores) {
      const zona_id    = zonaIdPorNombre.get(v.zona);
      const vendedor_id = vendedorIdPorCodigo.get(v.codigo);
      if (!zona_id || !vendedor_id) { log.push(`Sin ID para zona/vendedor: ${v.zona} / ${v.codigo}`); continue; }

      const { data: existe } = await db
        .from('zona_vendedor')
        .select('id')
        .eq('zona_id',    zona_id)
        .eq('vendedor_id', vendedor_id)
        .eq('fecha_desde', FECHA_DESDE)
        .maybeSingle();

      if (!existe) {
        const { error: errZV } = await db.from('zona_vendedor').insert({ zona_id, vendedor_id, fecha_desde: FECHA_DESDE });
        if (errZV) log.push(`zona_vendedor ${v.codigo}: ${errZV.message}`);
      }
    }

    // ── 4. Upsert clientes y asignar vendedor ────────────────────────────────
    let asignados = 0;
    let erroresCliente = 0;

    for (const c of clientes) {
      const vendedor_actual_id = vendedorIdPorCodigo.get(c.nuevo_codigo) ?? null;
      if (!vendedor_actual_id) {
        log.push(`Código no encontrado para RUC ${c.ruc}: ${c.nuevo_codigo}`);
        erroresCliente++;
        continue;
      }

      const vendedor_anterior_id = c.codigo_original
        ? (vendedorIdPorCodigo.get(c.codigo_original) ?? null)
        : null;

      const payload: Record<string, unknown> = {
        ruc:                c.ruc,
        razon_social:       c.razon_social,
        vendedor_actual_id,
        ...(vendedor_anterior_id && {
          vendedor_anterior_id,
          fecha_reasignacion: FECHA_DESDE,
        }),
      };

      const { error: errC } = await db
        .from('clientes')
        .upsert(payload, { onConflict: 'ruc' });

      if (errC) { log.push(`Cliente ${c.ruc}: ${errC.message}`); erroresCliente++; }
      else asignados++;
    }

    return NextResponse.json({
      zonas_creadas:     zonasUnicas.length,
      vendedores_creados: vendedores.length,
      clientes_asignados: asignados,
      errores_cliente:    erroresCliente,
      log,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
