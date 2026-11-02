import type { SupabaseClient } from '@supabase/supabase-js';

// Fases de cobranza (Bloque A) — agenda de gestión por cliente según los
// días vencido de su factura (o letra) vencida más antigua. Fuente:
// fn_documentos_cobranza(p_fecha_corte), que lee v_saldos sin tocarla (ver
// supabase/migrations/20261102_fn_documentos_cobranza.sql para la regla
// exacta de letras).

export type NumeroFase = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const FASE_NOMBRE: Record<NumeroFase, string> = {
  0: 'Preventivo',
  1: 'Recordatorio',
  2: 'Gestión',
  3: 'Alerta',
  4: 'Bloqueo',
  5: 'Pre-legal',
  6: 'Legal',
};

// Texto de "Acción" por fase: no viene del Excel de Mariela (no se pudo
// leer en esta sesión) — es una propuesta razonable de playbook de
// cobranza estándar. CONFIRMAR/reemplazar por el texto real de la
// pestaña RESUMEN antes de darlo por definitivo.
export const FASE_ACCION: Record<NumeroFase, string> = {
  0: 'Recordatorio preventivo antes del vencimiento (WhatsApp o llamada).',
  1: 'Recordatorio de pago — contacto directo con el cliente.',
  2: 'Gestión de cobranza activa — seguimiento telefónico y acuerdo de pago.',
  3: 'Alerta a vendedor y supervisor — evaluar condiciones de crédito.',
  4: 'Bloqueo de nuevos pedidos a crédito hasta regularizar.',
  5: 'Notificación formal de pre-cobranza — última gestión antes de legal.',
  6: 'Derivar a gestión legal / cobranza especializada.',
};

export function faseDeDiasVencido(diasVencido: number): NumeroFase {
  if (diasVencido <= 0) return 0;
  if (diasVencido <= 7) return 1;
  if (diasVencido <= 15) return 2;
  if (diasVencido <= 30) return 3;
  if (diasVencido <= 60) return 4;
  if (diasVencido <= 90) return 5;
  return 6;
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

  for (let fase = 0 as NumeroFase; fase <= 6; fase++) {
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
