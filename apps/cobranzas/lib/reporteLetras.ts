import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from './fetchAll';
import { retencionesPorDocumento } from './retenciones';

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
  /**
   * La retención de IGV de las facturas de esta letra, contada UNA sola vez
   * aunque la factura se haya partido en varias letras — ver el comentario
   * de `construirReporteLetras`. Así la columna se puede sumar.
   */
  retencion: number;
  /** true cuando la factura tiene retención pero la lleva otra letra suya. */
  retencion_en_otra_letra: boolean;
  /**
   * Lo abonado a esta letra sin marcarla pagada (pagos con `letra_id`).
   * Existe para el cliente que paga una letra en cuotas: la letra conserva su
   * estado —una protestada sigue diciendo protestada— y lo que baja es esto.
   */
  abonado: number;
  /** Lo que queda de la letra: importe − abonado, nunca menos de 0. */
  saldo_letra: number;
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
 *
 * LA RETENCIÓN, UNA SOLA VEZ
 *
 * La retención es de la FACTURA, no de la letra, y 14 de las 40 facturas
 * con letras tienen más de una. Si cada letra mostrara la retención de su
 * factura, la columna sumaría dos o tres veces lo mismo y el total del
 * Excel saldría inflado. Así que la lleva una sola letra de cada factura
 * —la de vencimiento más cercano, desempatando por id— y las demás vienen
 * en cero con `retencion_en_otra_letra` en true, para que la pantalla pueda
 * mostrar un guión en vez de un cero que se lea como "no retuvo nada".
 *
 * El dueño se elige mirando TODAS las letras de la factura, no solo las que
 * pasaron el filtro: así no cambia de fila según lo que se esté filtrando.
 * La contra es que una vista filtrada puede no incluir a la que la lleva, y
 * ahí esa retención no aparece. Es a propósito: preferimos que el total de
 * lo que se ve sea correcto a que aparezca siempre.
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

  // Abonos: pagos que apuntan a una letra puntual (migración 20261112).
  const abonadoPorLetra = new Map<string, number>();
  for (let i = 0; i < letraIds.length; i += 300) {
    const abonos = await fetchAll<{ letra_id: string; monto: number }>((from, to) =>
      db.from('pagos').select('id, letra_id, monto').in('letra_id', letraIds.slice(i, i + 300)).order('id').range(from, to)
    );
    for (const a of abonos) {
      abonadoPorLetra.set(a.letra_id, (abonadoPorLetra.get(a.letra_id) ?? 0) + (Number(a.monto) || 0));
    }
  }

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

  // Quién lleva la retención de cada factura: su letra de vencimiento más
  // cercano. Se miran todas las letras del documento, también las que el
  // filtro dejó afuera.
  const retencionPorDocumento = await retencionesPorDocumento(db, documentoIds);
  const conRetencion = documentoIds.filter(id => (retencionPorDocumento.get(id) ?? 0) > 0);
  const letraQueLlevaRetencion = new Map<string, string>(); // documento_id → letra_id
  if (conRetencion.length > 0) {
    const todasLd = await fetchAll<{ letra_id: string; documento_id: string }>((from, to) =>
      db.from('letra_documento').select('letra_id, documento_id').in('documento_id', conRetencion).order('documento_id').order('letra_id').range(from, to)
    );
    const idsDeEsasLetras = Array.from(new Set(todasLd.map(x => x.letra_id)));
    const vencimientoPorLetra = new Map<string, string>();
    for (let i = 0; i < idsDeEsasLetras.length; i += 500) {
      const { data } = await db.from('letras').select('id, fecha_vencimiento').in('id', idsDeEsasLetras.slice(i, i + 500));
      for (const l of data ?? []) vencimientoPorLetra.set(l.id, l.fecha_vencimiento);
    }
    for (const x of todasLd) {
      const actual = letraQueLlevaRetencion.get(x.documento_id);
      if (!actual) { letraQueLlevaRetencion.set(x.documento_id, x.letra_id); continue; }
      const a = `${vencimientoPorLetra.get(x.letra_id) ?? ''}|${x.letra_id}`;
      const b = `${vencimientoPorLetra.get(actual) ?? ''}|${actual}`;
      if (a < b) letraQueLlevaRetencion.set(x.documento_id, x.letra_id);
    }
  }
  const documentosPorLetraId = new Map<string, string[]>();
  for (const x of ld) {
    const arr = documentosPorLetraId.get(x.letra_id) ?? [];
    arr.push(x.documento_id);
    documentosPorLetraId.set(x.letra_id, arr);
  }

  let filas: FilaReporteLetras[] = letras.map(l => {
    const docs = documentosPorLetra.get(l.id) ?? [];
    const clienteRuc = docs[0]?.cliente_ruc ?? '';

    const abonado = abonadoPorLetra.get(l.id) ?? 0;
    const idsDeLaLetra = Array.from(new Set(documentosPorLetraId.get(l.id) ?? []));
    let retencion = 0;
    let hayRetencionEnOtra = false;
    for (const docId of idsDeLaLetra) {
      const monto = retencionPorDocumento.get(docId) ?? 0;
      if (monto <= 0) continue;
      if (letraQueLlevaRetencion.get(docId) === l.id) retencion += monto;
      else hayRetencionEnOtra = true;
    }

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
      retencion,
      retencion_en_otra_letra: retencion === 0 && hayRetencionEnOtra,
      abonado,
      saldo_letra: Math.max(0, Math.round(((Number(l.importe) || 0) - abonado) * 100) / 100),
    };
  });

  if (filtros.cliente_ruc) filas = filas.filter(f => f.cliente_ruc === filtros.cliente_ruc);

  return filas;
}
