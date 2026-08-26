export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

// Devuelve la URL base de PRODUCCIÓN (pública), para que los links de vendedor
// nunca se generen contra una URL protegida.
//
// El orden importa. VERCEL_PROJECT_PRODUCTION_URL devuelve el dominio
// *.vercel.app, y en este proyecto la protección de deployments está activa en
// modo "all except custom domains": o sea, ese dominio SÍ está protegido y un
// link armado contra él le pide login de Vercel al vendedor, que no tiene
// cuenta. Por eso manda NEXT_PUBLIC_APP_URL, que apunta al dominio propio.
export async function GET(req: NextRequest) {
  const propio = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (propio) {
    return NextResponse.json({ baseUrl: propio }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const baseUrl = prod ? `https://${prod}` : new URL(req.url).origin;
  return NextResponse.json({ baseUrl }, { headers: { 'Cache-Control': 'no-store' } });
}
