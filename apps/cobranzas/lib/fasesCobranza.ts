import type { SupabaseClient } from '@supabase/supabase-js';

// Fases de cobranza (Bloque A) — agenda de gestión por cliente según los
// días vencido de su factura (o letra) vencida más antigua. Fuente:
// fn_documentos_cobranza(p_fecha_corte), que lee v_saldos sin tocarla (ver
// supabase/migrations/20261102_fn_documentos_cobranza.sql para la regla
// exacta de letras).

export type NumeroFase = 0 | 1 | 2 | 3 | 4;

/**
 * Cinco fases, no siete.
 *
 * Hasta nov-2026 eran siete, heredadas del Excel de Finanzas: Preventivo /
 * Recordatorio / Gestión / Alerta / Bloqueo / Pre-legal / Legal. En la
 * práctica nadie distinguía "Recordatorio" de "Gestión" ni "Bloqueo" de
 * "Pre-legal" —la acción era la misma y el responsable también—, así que
 * el negocio las fusionó. Lo que define una fase es QUIÉN la trabaja:
 * cuando dos tramos tienen el mismo responsable y la misma acción, son
 * una sola fase.
 *
 * La fase legal (reporte a Infocorp) ya no es un tramo de días: no se
 * entra por antigüedad sino porque alguien decide reportar al cliente.
 * Vive aparte, en la pantalla de Infocorp.
 */
export const FASE_NOMBRE: Record<NumeroFase, string> = {
  0: 'Preventivo',
  1: 'Gestión',
  2: 'Alerta',
  3: 'Pre bloqueo',
  4: 'Bloqueo y Pre legal',
};

/**
 * Los días que incluye cada fase, para mostrarlos en pantalla: la pregunta
 * "¿por qué este cliente está acá?" se contesta sola si el tramo está a la
 * vista.
 */
export const FASE_DIAS: Record<NumeroFase, string> = {
  0: '1 semana antes del vencimiento',
  1: '1 a 15 días vencido',
  2: '16 a 30 días vencido',
  3: '31 a 60 días vencido',
  4: 'más de 60 días vencido',
};

/** Quién trabaja cada fase. Es lo que las separa. */
export const FASE_RESPONSABLE: Record<NumeroFase, string> = {
  0: 'Vendedor',
  1: 'Vendedor',
  2: 'Vendedor con apoyo de Mily',
  3: 'Vendedor, Mily y Natalia',
  4: 'Andrés (bloqueo) y Finanzas (Equifax)',
};

export const FASE_ACCION: Record<NumeroFase, string> = {
  0: 'El vendedor manda el mensaje recordatorio y acuerda una fecha de compromiso de pago, al menos con los clientes de mayor deuda',
  1: 'El vendedor cobra y visita al cliente',
  2: 'El vendedor sigue la cobranza apoyándose en Mily',
  3: 'El vendedor, Mily y Natalia trabajan al cliente juntos',
  4: 'Andrés bloquea al cliente en el ERP y Finanzas lo pasa a Equifax (Infocorp)',
};

export function faseDeDiasVencido(diasVencido: number): NumeroFase {
  if (diasVencido <= 0) return 0;
  if (diasVencido <= 15) return 1;
  if (diasVencido <= 30) return 2;
  if (diasVencido <= 60) return 3;
  return 4;
}

type FilaDocumento = {
  documento_id: string;
  cliente_ruc: string;
  razon_social: string;
  vendedor_nombre: string | null;
  comprobante: string;
  fecha_emision: string;
  fecha_vencimiento_efectiva: string;
  dias_vencido: number;
  saldo: number;
  tiene_letras: boolean;
};

export type FacturaCobranza = {
  documentoId: string;
  fase: NumeroFase;
  comprobante: string;
  fechaEmision: string;
  fechaVencimiento: string;
  diasVencido: number;
  saldo: number;
  tieneLetras: boolean;
};

export type ClienteFase = {
  clienteRuc: string;
  razonSocial: string;
  vendedores: string; // concatenados si hay más de uno (no debería pasar: un cliente tiene un solo vendedor_actual)
  fase: NumeroFase;
  maxDiasVencido: number; // en fase 0: días para vencer (negativo)
  montoAGestionar: number; // fases 1-6: saldo vencido total; fase 0: lo que vence en 7 días
  saldoTotalPorCobrar: number; // todas las facturas del cliente, vencidas o no
  nDocs: number;
  pctDeLaFase: number;
  pctAcumulado: number;
  top80: boolean;
  facturas: FacturaCobranza[];
};

export type ResumenFase = {
  fase: NumeroFase;
  nombre: string;
  dias: string;
  responsable: string;
  accion: string;
  nClientes: number;
  monto: number;
  pctDelTotal: number;
  clientesTop80: number;
};

export type ReporteFasesCobranza = {
  fechaCorte: string;
  clientes: ClienteFase[];
  resumen: ResumenFase[];
  totalClientes: number;
  totalMonto: number;
};

export async function construirFasesCobranza(
  db: SupabaseClient,
  fechaCorte: string
): Promise<ReporteFasesCobranza> {
  const { data, error } = await db.rpc('fn_documentos_cobranza', { p_fecha_corte: fechaCorte });
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as FilaDocumento[];

  const porCliente = new Map<string, FilaDocumento[]>();
  for (const f of filas) {
    const arr = porCliente.get(f.cliente_ruc) ?? [];
    arr.push(f);
    porCliente.set(f.cliente_ruc, arr);
  }

  const clientes: ClienteFase[] = [];

  for (const [ruc, docs] of porCliente) {
    const vencidos = docs.filter(d => d.dias_vencido > 0);
    const porVencerEn7 = docs.filter(d => d.dias_vencido < 0 && d.dias_vencido >= -7);

    const saldoTotalPorCobrar = docs.reduce((s, d) => s + Number(d.saldo), 0);
    const vendedores = Array.from(new Set(docs.map(d => d.vendedor_nombre?.trim()).filter(Boolean))).join(', ') || '—';
    const razonSocial = docs[0].razon_social;

    const facturas: FacturaCobranza[] = docs
      .map(d => ({
        documentoId: d.documento_id,
        fase: faseDeDiasVencido(d.dias_vencido),
        comprobante: d.comprobante,
        fechaEmision: d.fecha_emision,
        fechaVencimiento: d.fecha_vencimiento_efectiva,
        diasVencido: d.dias_vencido,
        saldo: Number(d.saldo),
        tieneLetras: d.tiene_letras,
      }))
      .sort((a, b) => b.diasVencido - a.diasVencido);

    if (vencidos.length > 0) {
      const maxDiasVencido = Math.max(...vencidos.map(d => d.dias_vencido));
      const montoAGestionar = vencidos.reduce((s, d) => s + Number(d.saldo), 0);
      clientes.push({
        clienteRuc: ruc,
        razonSocial,
        vendedores,
        fase: faseDeDiasVencido(maxDiasVencido),
        maxDiasVencido,
        montoAGestionar,
        saldoTotalPorCobrar,
        nDocs: vencidos.length,
        pctDeLaFase: 0,
        pctAcumulado: 0,
        top80: false,
        facturas,
      });
    } else if (porVencerEn7.length > 0) {
      const maxDiasVencido = Math.max(...porVencerEn7.map(d => d.dias_vencido)); // el menos negativo = el más próximo a vencer
      const montoAGestionar = porVencerEn7.reduce((s, d) => s + Number(d.saldo), 0);
      clientes.push({
        clienteRuc: ruc,
        razonSocial,
        vendedores,
        fase: 0,
        maxDiasVencido,
        montoAGestionar,
        saldoTotalPorCobrar,
        nDocs: porVencerEn7.length,
        pctDeLaFase: 0,
        pctAcumulado: 0,
        top80: false,
        facturas,
      });
    }
    // Cliente sin vencidos y sin nada por vencer en 7 días: no entra al reporte.
  }

  // Pareto por fase: ordenar de mayor a menor monto, acumular %, marcar
  // Top 80% hasta que el acumulado alcance o supere 80% (incluye al
  // cliente que cruza el umbral).
  const resumen: ResumenFase[] = [];
  const totalMonto = clientes.reduce((s, c) => s + c.montoAGestionar, 0);

  for (let fase = 0 as NumeroFase; fase <= 4; fase++) {
    const deLaFase = clientes.filter(c => c.fase === fase).sort((a, b) => b.montoAGestionar - a.montoAGestionar);
    const montoFase = deLaFase.reduce((s, c) => s + c.montoAGestionar, 0);
    let acumulado = 0;
    let clientesTop80 = 0;
    let yaAlcanzo80 = false;
    for (const c of deLaFase) {
      acumulado += c.montoAGestionar;
      c.pctDeLaFase = montoFase > 0 ? (c.montoAGestionar / montoFase) * 100 : 0;
      c.pctAcumulado = montoFase > 0 ? (acumulado / montoFase) * 100 : 0;
      if (!yaAlcanzo80) {
        c.top80 = true;
        clientesTop80++;
        if (c.pctAcumulado >= 80) yaAlcanzo80 = true;
      } else {
        c.top80 = false;
      }
    }
    resumen.push({
      fase,
      nombre: FASE_NOMBRE[fase],
      dias: FASE_DIAS[fase],
      responsable: FASE_RESPONSABLE[fase],
      accion: FASE_ACCION[fase],
      nClientes: deLaFase.length,
      monto: montoFase,
      pctDelTotal: totalMonto > 0 ? (montoFase / totalMonto) * 100 : 0,
      clientesTop80,
    });
  }

  clientes.sort((a, b) => a.fase - b.fase || b.montoAGestionar - a.montoAGestionar);

  return {
    fechaCorte,
    clientes,
    resumen,
    totalClientes: clientes.length,
    totalMonto,
  };
}
