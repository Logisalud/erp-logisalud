// Fase legal: quiénes son candidatos a reportarse a Equifax (Infocorp).
//
// La fase legal NO es un tramo de días como las otras cinco: no se entra
// por antigüedad sino porque alguien decide reportar al cliente. Lo que
// esto calcula es la lista de donde se elige.
//
// Se eligen desde PRE BLOQUEO (31 días) y no solo desde la última fase:
// la decisión de reportar no siempre espera a los 60. Un cliente que dejó
// de contestar a los 40 días no mejora por esperarlo, y quien decide es
// Natalia, no el calendario. Cada candidato viene con su fase para que se
// vea de dónde sale.

import { faseDeDiasVencido, type NumeroFase } from './fasesCobranza';

/** Una fila de fn_documentos_cobranza. */
export type FilaCobranza = {
  cliente_ruc: string;
  razon_social: string;
  vendedor_nombre: string | null;
  dias_vencido: number;
  saldo: number | string;
};

export type CandidatoInfocorp = {
  clienteRuc: string;
  fase: NumeroFase;
  razonSocial: string;
  vendedor: string;
  maxDiasVencido: number;
  saldoVencido: number;
  nDocs: number;
};

/** Desde Pre bloqueo (31 a 60 días) en adelante. */
const FASE_MINIMA_PARA_REPORTAR = 3;

export function candidatosAInfocorp(filas: FilaCobranza[]): CandidatoInfocorp[] {
  const porCliente = new Map<string, FilaCobranza[]>();
  for (const f of filas) {
    if (f.dias_vencido <= 0) continue;
    const arr = porCliente.get(f.cliente_ruc) ?? [];
    arr.push(f);
    porCliente.set(f.cliente_ruc, arr);
  }

  const candidatos: CandidatoInfocorp[] = [];

  for (const [ruc, docs] of porCliente) {
    const maxDiasVencido = Math.max(...docs.map(d => d.dias_vencido));
    // La fase del cliente la marca su factura más vieja, igual que en el
    // reporte de fases: un cliente está en la fase de su peor deuda.
    const fase = faseDeDiasVencido(maxDiasVencido);
    if (fase < FASE_MINIMA_PARA_REPORTAR) continue;

    candidatos.push({
      clienteRuc: ruc,
      fase,
      razonSocial: docs[0].razon_social,
      vendedor: docs[0].vendedor_nombre?.trim() || '—',
      maxDiasVencido,
      // Todo lo vencido del cliente, no solo lo de más de 60 días: a
      // Infocorp se reporta al deudor con lo que debe.
      saldoVencido: docs.reduce((s, d) => s + Number(d.saldo), 0),
      nDocs: docs.length,
    });
  }

  // Primero la fase más grave, y dentro de cada una la deuda más alta:
  // es el orden en el que conviene decidir.
  return candidatos.sort((a, b) => b.fase - a.fase || b.saldoVencido - a.saldoVencido);
}
