export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { capturarMorosidad } from '@/lib/capturarMorosidad';
import { capturarIndicadoresSnapshot } from '@/lib/capturarIndicadoresSnapshot';

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

    // Snapshot de los 6 indicadores de cobranza (Bloque B) — se aprovecha
    // este mismo cron porque Vercel ya tiene 2 crons (el límite de un plan
    // Hobby). Envuelto en try/catch a propósito: un fallo acá NUNCA debe
    // tumbar la captura de morosidad de arriba, que ya funcionaba antes.
    let indicadores: { fecha: string; filas: number } | null = null;
    let errorIndicadores: string | null = null;
    try {
      indicadores = await capturarIndicadoresSnapshot(fecha, 'diario');
    } catch (err) {
      errorIndicadores = String(err instanceof Error ? err.message : err);
      console.error('[cron] capturarIndicadoresSnapshot falló (no afecta morosidad):', errorIndicadores);
    }

    return NextResponse.json(
      { ok: true, ...res, indicadores, errorIndicadores },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
