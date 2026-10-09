import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from './fetchAll';

export interface FilaReporteLetras {
  letra_id: string;
  numero_letra: string;
  cliente_ruc: string;
  razon_social: string;
  comprobantes: string;
  fecha_vencimiento: string;
  importe: number;
  estado: 'en_cartera' | 'en_banco' | 'pagada' | 'protestada';
  banco: string | null;
  fecha_pago: string | null;
}

export interface FiltrosReporteLetras {
  estado?: string | null;   // uno de los 4 valores, o 'todos'/null
  cliente_ruc?: string | null;
  desde?: string | null;    // fecha_vencimiento >=
  hasta?: string | null;    // fecha_vencimiento <=
}

/**
 * Reporte plano de letras — una fila por letra (no por par letra-documento),
 * para la agenda de seguimiento con el banco. El N° de letra es el que ya
 * trae cada letra (numero_letra); no se genera ningún correlativo nuevo.
 *
 * Una letra puede cubrir varias facturas (letra_documento es N:N) — acá se
 * listan todas juntas en "comprobantes", separadas por coma, y el cliente
 * sale del primer documento asociado (en la práctica todos pertenecen al
 * mismo cliente).
 */
export async function construirReporteLetras(db: SupabaseClient, filtros: FiltrosReporteLetras): Promise<FilaReporteLetras[]> {
  let query = db
    .from('letras')
    .select('id, numero_letra, fecha_vencimiento, importe, estado, banco, fecha_pago');

  if (filtros.estado && filtros.estado !== 'todos') query = query.eq('estado', filtros.estado);
  if (filtros.desde) query = query.gte('fecha_vencimiento', filtros.desde);
  if (filtros.hasta) query = query.lte('fecha_vencimiento', filtros.hasta);

  const letras = await fetchAll<{
    id: string; numero_letra: string; fecha_vencimiento: string; importe: number;
    estado: 'en_cartera' | 'en_banco' | 'pagada' | 'protestada'; banco: string | null;
    fecha_pago: string | null;
  }>((from, to) => query.order('fecha_vencimiento').range(from, to));

  if (letras.length === 0) return [];

  const letraIds = letras.map(l => l.id);
  const ld = await fetchAll<{ letra_id: string; documento_id: string }>((from, to) =>
    db.from('letra_documento').select('letra_id, documento_id').in('letra_id', letraIds).order('documento_id').order('letra_id').range(from, to)
  );

  const documentoIds = Array.from(new Set(ld.map(x => x.documento_id)));
  const documentosPorId = new Map<string, { comprobante: string; cliente_ruc: string }>();
  for (let i = 0; i < documentoIds.length; i += 500) {
    const { data } = await db
      .from('documentos')
      .select('id, serie, numero, cliente_ruc')
      .in('id', documentoIds.slice(i, i + 500));
    for (const d of data ?? []) documentosPorId.set(d.id, { comprobante: `${d.serie}-${d.numero}`, cliente_ruc: d.cliente_ruc });
  }

  const clienteRucs = Array.from(new Set(Array.from(documentosPorId.values()).map(d => d.cliente_ruc)));
  const razonSocialPorRuc = new Map<string, string>();
  for (let i = 0; i < clienteRucs.length; i += 500) {
    const { data } = await db.from('clientes').select('ruc, razon_social').in('ruc', clienteRucs.slice(i, i + 500));
    for (const c of data ?? []) razonSocialPorRuc.set(c.ruc, c.razon_social);
  }

  const documentosPorLetra = new Map<string, { comprobante: string; cliente_ruc: string }[]>();
  for (const x of ld) {
    const doc = documentosPorId.get(x.documento_id);
    if (!doc) continue;
    const arr = documentosPorLetra.get(x.letra_id) ?? [];
    arr.push(doc);
    documentosPorLetra.set(x.letra_id, arr);
  }

  let filas: FilaReporteLetras[] = letras.map(l => {
    const docs = documentosPorLetra.get(l.id) ?? [];
    const clienteRuc = docs[0]?.cliente_ruc ?? '';
    return {
      letra_id: l.id,
      numero_letra: l.numero_letra,
      cliente_ruc: clienteRuc,
      razon_social: clienteRuc ? (razonSocialPorRuc.get(clienteRuc) ?? clienteRuc) : '—',
      comprobantes: Array.from(new Set(docs.map(d => d.comprobante))).join(', '),
      fecha_vencimiento: l.fecha_vencimiento,
      importe: Number(l.importe) || 0,
      estado: l.estado,
      banco: l.banco,
      fecha_pago: l.fecha_pago,
    };
  });

  if (filtros.cliente_ruc) filas = filas.filter(f => f.cliente_ruc === filtros.cliente_ruc);

  return filas;
}
