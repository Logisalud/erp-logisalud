import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const allowed = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
  if (!allowed.includes(ext))
    return NextResponse.json({ error: 'Solo imágenes (jpg, png, webp) o PDF' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const path   = `${randomUUID()}.${ext}`;

  const db = supabaseAdmin();
  const { error } = await db.storage
    .from('vouchers')
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ path, nombre: file.name });
}
