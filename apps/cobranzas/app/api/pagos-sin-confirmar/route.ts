export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { UMBRAL_DIAS_CONTADO, UMBRAL_DIAS_CREDITO, ALERTAS_DESDE } from '@/lib/config-pagos';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

interface PagoRow {
  id: string;
  documento_id: string;
  monto: number;
  fecha_pago: string;
  voucher_path: string | null;
  referencia: string | null;
  created_at: string;
  registrado_por: string | null;
  investigado: boolean;
  investigado_comentario: string | null;
  investigado_en: string | null;
  documentos: {
    serie: string;
    numero: number;
    forma_pago: string | null;
    cliente_ruc: string;
    clientes: { razon_social: string } | null;
  } | null;
}

// Lista los pagos tipo='pago' aún sin confirmar contra el extracto bancario,
// cuya antigüedad ya superó el umbral de alerta (2 días CONTADO / 5 días
// CRÉDITO). Por defecto solo mira pagos registrados desde el lanzamiento de
// esta pantalla (?historico=1 para ver todo) y oculta los ya investigados
// (?investigados=1 para incluirlos).
export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const url = new URL(req.url);
  const historico = url.searchParams.get('historico') === '1';
  const incluirInvestigados = url.searchParams.get('investigados') === '1';

  const db = supabaseAdmin();
  let query = db
    .from('pagos')
    .select(`
      id, documento_id, monto, fecha_pago, voucher_path, referencia, created_at,
      registrado_por, investigado, investigado_comentario, investigado_en,
      documentos:documento_id ( serie, numero, forma_pago, cliente_ruc, clientes:cliente_ruc ( razon_social ) )
    `)
    .eq('tipo', 'pago')
    .eq('estado_verificacion', 'pendiente_confirmar')
    .order('created_at', { ascending: true });

  if (!historico) query = query.gte('created_at', ALERTAS_DESDE);
  if (!incluirInvestigados) query = query.eq('investigado', false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hoy = Date.now();
  const filas = ((data ?? []) as unknown as PagoRow[])
    .map(p => {
      const formaPago = p.documentos?.forma_pago ?? null;
      const umbral = formaPago === 'CONTADO' ? UMBRAL_DIAS_CONTADO : UMBRAL_DIAS_CREDITO;
      const diasTranscurridos = Math.floor((hoy - new Date(p.created_at).getTime()) / 86_400_000);
      return {
        id: p.id,
        documento_id: p.documento_id,
        comprobante: p.documentos ? `${p.documentos.serie}-${p.documentos.numero}` : '—',
        cliente_ruc: p.documentos?.cliente_ruc ?? null,
        razon_social: p.documentos?.clientes?.razon_social ?? '—',
        forma_pago: formaPago,
        monto: p.monto,
        fecha_registro: p.created_at,
        registrado_por: p.registrado_por,
        voucher_path: p.voucher_path,
        referencia: p.referencia,
        dias_transcurridos: diasTranscurridos,
        umbral_dias: umbral,
        investigado: p.investigado,
        investigado_comentario: p.investigado_comentario,
        investigado_en: p.investigado_en,
      };
    })
    .filter(f => f.dias_transcurridos >= f.umbral_dias)
    .sort((a, b) => b.dias_transcurridos - a.dias_transcurridos);

  return NextResponse.json(
    { filas, total: filas.length },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
