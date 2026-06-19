export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('vendedores')
      .select(`
        id, nombres, apellidos, codigo,
        zona_vendedor (
          fecha_hasta,
          zona:zona_id ( nombre )
        )
      `)
      .eq('activo', true)
      .order('apellidos');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Aplanar: tomar la asignacion vigente (fecha_hasta IS NULL) de cada vendedor
    const vendedores = (data ?? []).map((v: Record<string, unknown>) => {
      const asignaciones = (v.zona_vendedor as Array<{ fecha_hasta: string | null; zona: { nombre: string } | null }>) ?? [];
      const vigente      = asignaciones.find(a => a.fecha_hasta === null);
      return {
        id:       v.id,
        nombres:  v.nombres,
        apellidos: v.apellidos,
        codigo:   v.codigo,
        zona:     vigente?.zona?.nombre ?? null,
      };
    });

    return NextResponse.json({ vendedores });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
