export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';
import {
  calcularEfectividadCobranza, calcularDSO, calcularMorosidadDura,
  calcularVentaDeudaVencida, calcularCobroDeLoVendido, calcularRegistroOportuno,
} from '@/lib/indicadoresCobranza';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const AREAS_GERENCIA = ['gerencia'] as const;

export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const params = new URL(req.url).searchParams;
  const fechaCorteParam = params.get('fecha_corte');
  const fechaCorte = fechaCorteParam && FECHA_RE.test(fechaCorteParam)
    ? fechaCorteParam
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

  const db = supabaseAdmin();

  try {
    const [efectividad, dso, morosidad, ventaDeuda, cobroVendido, registroOportuno] = await Promise.all([
      calcularEfectividadCobranza(db, fechaCorte),
      calcularDSO(db, fechaCorte),
      calcularMorosidadDura(db, fechaCorte),
      calcularVentaDeudaVencida(db, fechaCorte),
      calcularCobroDeLoVendido(db, fechaCorte),
      calcularRegistroOportuno(db, fechaCorte),
    ]);

    // El desglose por registrado_por y la lista de pagos con mayor demora
    // del Indicador 6 son solo para gerencia (el valor general sí lo ven
    // las 3 áreas de lectura) — pedido explícito, fácil de revertir acá.
    const esGerencia = auth.perfil.area === 'admin' || (AREAS_GERENCIA as readonly string[]).includes(auth.perfil.area ?? '');
    const registroOportunoRespuesta = esGerencia
      ? registroOportuno
      : { valor: registroOportuno.valor, meta: registroOportuno.meta, semaforo: registroOportuno.semaforo, total: registroOportuno.total, aTiempo: registroOportuno.aTiempo, demoradosMas5: registroOportuno.demoradosMas5, porRegistrador: [], dondeEnfocarse: [] };

    return NextResponse.json(
      { fechaCorte, efectividad, dso, morosidad, ventaDeuda, cobroVendido, registroOportuno: registroOportunoRespuesta },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
