export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

// Devuelve la URL base de PRODUCCIÓN (pública), para que los links de vendedor
// nunca se generen contra una URL de deployment protegida por Vercel.
// VERCEL_PROJECT_PRODUCTION_URL lo inyecta Vercel automáticamente (sin config).
export async function GET(req: NextRequest) {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const baseUrl = prod ? `https://${prod}` : new URL(req.url).origin;
  return NextResponse.json({ baseUrl }, { headers: { 'Cache-Control': 'no-store' } });
}
