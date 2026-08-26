export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { capturarMorosidad } from '@/lib/capturarMorosidad';

// Proceso diario (Vercel Cron): captura la foto de morosidad por vendedor.
// Protegido con CRON_SECRET: Vercel envía "Authorization: Bearer <CRON_SECRET>".
// Si CRON_SECRET no está definida, se permite el disparo (para primera captura).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  try {
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const res = await capturarMorosidad(fecha);
    return NextResponse.json({ ok: true, ...res }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
