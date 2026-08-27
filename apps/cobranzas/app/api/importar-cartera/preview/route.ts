export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { parsearCartera } from '@/lib/cartera-parser';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_IMPORTACION } from '@/lib/autorizacion';

export async function POST(req: NextRequest) {
  const auth = await exigirArea(AREAS_IMPORTACION);
  if (!auth.ok) return auth.respuesta;

  try {
    const form = await req.formData();
    const file = form.get('archivo') as File | null;
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });

    const buffer  = await file.arrayBuffer();
    const { vendedores, clientes, conflictos } = parsearCartera(buffer);

    const db = supabaseAdmin();

    // Zonas únicas del Excel
    const zonasSet = new Set(vendedores.map(v => v.zona));
    const zonas    = Array.from(zonasSet);

    // Qué clientes del Excel ya existen en BD
    const rucsExcel = clientes.map(c => c.ruc);
    const { data: existentes } = await db.from('clientes').select('ruc').in('ruc', rucsExcel);
    const rucsExistentes = new Set((existentes ?? []).map((c: { ruc: string }) => c.ruc));
    const clientesNuevos = clientes.filter(c => !rucsExistentes.has(c.ruc));

    // Clientes en BD que NO aparecen en el Excel (quedarán sin asignar)
    const { data: todosEnBD } = await db.from('clientes').select('ruc, razon_social');
    const rucsEnExcel = new Set(rucsExcel);
    const sinAsignar  = (todosEnBD ?? []).filter((c: { ruc: string }) => !rucsEnExcel.has(c.ruc));

    // Cuántos cambian de vendedor
    const cambiosVendedor = clientes.filter(c => c.codigo_original !== null).length;

    return NextResponse.json({
      zonas,
      total_vendedores:   vendedores.length,
      total_a_asignar:    clientes.length,
      clientes_nuevos:    clientesNuevos.length,
      cambios_vendedor:   cambiosVendedor,
      sin_asignar:        sinAsignar.length,
      conflictos,
      // Payload para el confirmar
      _vendedores: vendedores,
      _clientes:   clientes,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
