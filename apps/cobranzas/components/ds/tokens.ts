// Semáforo semántico compartido por tarjetas KPI, badges y fases de
// cobranza. Un solo lugar para que "verde significa lo mismo" en todas las
// pantallas nuevas. Ver DESIGN.md.

export type Semaforo = 'ok' | 'alerta' | 'riesgo' | 'critico' | 'neutral';

export const SEMAFORO_CLASES: Record<Semaforo, { texto: string; fondo: string; borde: string; punto: string }> = {
  ok:       { texto: 'text-brand-green-700', fondo: 'bg-brand-green-50',  borde: 'border-brand-green-200', punto: 'bg-brand-green-500' },
  alerta:   { texto: 'text-amber-700',       fondo: 'bg-amber-50',        borde: 'border-amber-200',       punto: 'bg-amber-500' },
  riesgo:   { texto: 'text-orange-700',      fondo: 'bg-orange-50',       borde: 'border-orange-200',      punto: 'bg-orange-500' },
  critico:  { texto: 'text-red-700',         fondo: 'bg-red-50',          borde: 'border-red-200',         punto: 'bg-red-500' },
  neutral:  { texto: 'text-ink-700',         fondo: 'bg-ink-50',          borde: 'border-ink-200',         punto: 'bg-ink-400' },
};

export const SEMAFORO_LABEL: Record<Semaforo, string> = {
  ok: 'En meta',
  alerta: 'Atención',
  riesgo: 'Riesgo',
  critico: 'Crítico',
  neutral: 'Sin dato',
};
