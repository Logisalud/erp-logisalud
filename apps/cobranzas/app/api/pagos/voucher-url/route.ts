export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const path = new URL(req.url).searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path requerido' }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db.storage
    .from('vouchers')
    .createSignedUrl(path, 120);

  if (error || !data?.signedUrl)
    return NextResponse.json({ error: error?.message ?? 'Error generando URL' }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
