export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search       = searchParams.get('search')?.trim() ?? '';
    const sinAsignar   = searchParams.get('sin_asignar') === 'true';
    const soloOverride = searchParams.get('solo_override') === 'true';
    const page         = Math.max(0, parseInt(searchParams.get('page') ?? '0'));
    const pageSize    = 50;

    const db = supabaseAdmin();

    let query = db
      .from('clientes')
      .select(`
        ruc,
        razon_social,
        vendedor_actual_id,
        vendedor_anterior_id,
        fecha_reasignacion,
        codigo_zona,
        vendedor_manual_id,
        vendedor_actual:vendedor_actual_id ( id, nombres, apellidos, codigo ),
        vendedor_manual:vendedor_manual_id ( id, nombres, apellidos, codigo )
      `, { count: 'exact' })
      .order('razon_social')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (sinAsignar) {
      query = query.is('codigo_zona', null);
    }

    if (soloOverride) {
      query = query.not('vendedor_manual_id', 'is', null);
    }

    if (search) {
      query = query.or(`ruc.ilike.%${search}%,razon_social.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ clientes: data ?? [], total: count ?? 0, page, pageSize }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
