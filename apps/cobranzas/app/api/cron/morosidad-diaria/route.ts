export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { capturarMorosidad } from '@/lib/capturarMorosidad';

// Proceso diario (Vercel Cron): captura la foto de morosidad por vendedor.
// Protegido con CRON_SECRET: Vercel envía "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  // Falla CERRADO. Antes era `if (secret) { ...verificar... }`: sin la variable
  // definida, la ruta quedaba abierta a cualquiera en internet. Estaba puesto
  // así "para la primera captura" y quedó. Hoy CRON_SECRET sí está definida en
  // Vercel (verificado con una petición sin header, que devuelve 401), pero el
  // día que la variable falte o se borre, esto tiene que dejar de responder en
  // vez de abrirse.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET no está definida: se rechaza el disparo.');
    return NextResponse.json(
      { error: 'CRON_SECRET no configurada en el servidor' },
      { status: 503 }
    );
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const res = await capturarMorosidad(fecha);
    return NextResponse.json({ ok: true, ...res }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
