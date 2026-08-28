import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { carteraClientesXlsx } from '@/lib/exportCarteraClientes';

export const dynamic = 'force-dynamic';

// Descarga pública de la cartera de clientes del propio vendedor, desde su
// link privado /v/[token] — mismo archivo que genera el admin desde
// /vendedores-links, pero accesible directo por el vendedor sin depender de
// que se lo reenvíen. Resuelve el vendedor por token (igual que /api/acceso):
// el link nunca expone el UUID interno del vendedor.
export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get('token')?.trim() ?? '';
    if (token.length < 16) return Response.json({ error: 'Token inválido' }, { status: 400 });

    const db = supabaseAdmin();
    const { data: vendedor } = await db
      .from('vendedores')
      .select('id, activo')
      .eq('token_acceso', token)
      .single();
    if (!vendedor || !vendedor.activo) return Response.json({ error: 'Enlace no válido' }, { status: 404 });

    const result = await carteraClientesXlsx(db, vendedor.id);
    if (!result) return Response.json({ error: 'Vendedor no encontrado' }, { status: 404 });

    return new Response(result.buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
