import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from './fetchAll';

export interface ItemCobranzaMes {
  id: string;
  comprobante: string;
  cliente_ruc: string;
  razon_social: string;
  distrito: string | null;
  celular: string | null;
  fecha_venc: string; // vencimiento efectivo: próxima letra si tiene, si no el vencimiento del documento
  saldo_pendiente: number;
  tiene_letras: boolean;
}

// Documentos de un vendedor que vencen (o cuya próxima letra vence) dentro del
// mes calendario de `hoyISO` y aún tienen saldo pendiente — el "a quién ir a
// cobrar este mes". Mismo criterio de vencimiento efectivo que /v/[token]
// (próxima letra pendiente si el documento fue canjeado por letra(s), si no
// el vencimiento del documento). Usado tanto por el export Excel como por la
// sección "Cobranza del mes" dentro de la vista del propio vendedor.
//
// Recibe el cliente: la vista del vendedor (sin sesión, entra por token)
// pasa service role; el export de admin pasa la sesión del usuario, sujeta
// a RLS.
export async function cobranzaDelMes(db: SupabaseClient, vendedorId: string, hoyISO: string): Promise<ItemCobranzaMes[]> {
  const [y, m] = hoyISO.split('-');
  const primerDia = `${y}-${m}-01`;
  const ultimoDiaNum = new Date(Number(y), Number(m), 0).getDate();
  const ultimoDia = `${y}-${m}-${String(ultimoDiaNum).padStart(2, '0')}`;

  const facturas = await fetchAll<{
    id: string; comprobante: string; cliente_ruc: string; razon_social: string;
    fecha_vencimiento: string | null; saldo_pendiente: number; tiene_letras: boolean;
  }>((from, to) =>
    db.from('v_saldos')
      .select('id, comprobante, cliente_ruc, razon_social, fecha_vencimiento, saldo_pendiente, tiene_letras')
      .eq('vendedor_id', vendedorId)
      .gt('saldo_pendiente', 0.005)
      .range(from, to)
  );

  const idsConLetras = facturas.filter(f => f.tiene_letras).map(f => f.id);
  const proximaLetra = new Map<string, string>();
  if (idsConLetras.length > 0) {
    const { data: letras } = await db
      .from('letras')
      .select('documento_id, fecha_vencimiento, estado')
      .in('documento_id', idsConLetras)
      .neq('estado', 'pagada')
      .order('fecha_vencimiento');
    for (const l of letras ?? []) {
      if (!proximaLetra.has(l.documento_id)) proximaLetra.set(l.documento_id, l.fecha_vencimiento);
    }
  }

  const enElMes = facturas
    .map(f => ({ ...f, fecha_venc: proximaLetra.get(f.id) ?? f.fecha_vencimiento }))
    .filter((f): f is typeof f & { fecha_venc: string } =>
      !!f.fecha_venc && f.fecha_venc >= primerDia && f.fecha_venc <= ultimoDia);

  const rucs = Array.from(new Set(enElMes.map(f => f.cliente_ruc)));
  const distritoPorRuc = new Map<string, string>();
  const celularPorRuc = new Map<string, string>();
  for (let i = 0; i < rucs.length; i += 500) {
    const { data: cls } = await db.from('clientes').select('ruc, distrito, celular').in('ruc', rucs.slice(i, i + 500));
    for (const c of cls ?? []) {
      if (c.distrito) distritoPorRuc.set(c.ruc, c.distrito);
      if (c.celular) celularPorRuc.set(c.ruc, c.celular);
    }
  }

  return enElMes
    .map(f => ({
      id: f.id,
      comprobante: f.comprobante,
      cliente_ruc: f.cliente_ruc,
      razon_social: f.razon_social,
      distrito: distritoPorRuc.get(f.cliente_ruc) ?? null,
      celular: celularPorRuc.get(f.cliente_ruc) ?? null,
      fecha_venc: f.fecha_venc,
      saldo_pendiente: Number(f.saldo_pendiente) || 0,
      tiene_letras: f.tiene_letras,
    }))
    .sort((a, b) => a.fecha_venc.localeCompare(b.fecha_venc));
}
