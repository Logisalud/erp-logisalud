// Fase legal: quiénes son candidatos a reportarse a Equifax (Infocorp).
//
// La fase legal NO es un tramo de días como las otras cinco: no se entra
// por antigüedad sino porque alguien decide reportar al cliente. Lo que
// esto calcula es la lista de donde se elige — los clientes de la última
// fase, que es el único lugar de donde sale un candidato.

import { faseDeDiasVencido } from './fasesCobranza';

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
  razonSocial: string;
  vendedor: string;
  maxDiasVencido: number;
  saldoVencido: number;
  nDocs: number;
};

/** La última fase: más de 60 días vencido. */
const FASE_LEGAL = 4;

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
    if (faseDeDiasVencido(maxDiasVencido) !== FASE_LEGAL) continue;

    candidatos.push({
      clienteRuc: ruc,
      razonSocial: docs[0].razon_social,
      vendedor: docs[0].vendedor_nombre?.trim() || '—',
      maxDiasVencido,
      // Todo lo vencido del cliente, no solo lo de más de 60 días: a
      // Infocorp se reporta al deudor con lo que debe.
      saldoVencido: docs.reduce((s, d) => s + Number(d.saldo), 0),
      nDocs: docs.length,
    });
  }

  return candidatos.sort((a, b) => b.saldoVencido - a.saldoVencido);
}
