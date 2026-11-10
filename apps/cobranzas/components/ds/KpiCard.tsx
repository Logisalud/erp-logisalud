import type { Semaforo } from './tokens';
import { SEMAFORO_CLASES } from './tokens';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

type Props = {
  etiqueta: string;
  valor: string;
  meta?: string;
  tono?: Semaforo;
  variacion?: { valor: string; direccion: 'sube' | 'baja' | 'igual'; esBueno?: boolean };
  alerta?: string;
  onClick?: () => void;
};

// Tarjeta KPI: valor grande + meta + semáforo + variación vs. período
// anterior. `esBueno` decide si la flecha se pinta verde o roja (ej. que
// "sube" el DSO es malo, pero que "sube" la efectividad es bueno).
export function KpiCard({ etiqueta, valor, meta, tono = 'neutral', variacion, alerta, onClick }: Props) {
  const c = SEMAFORO_CLASES[tono];
  const Icono = !variacion ? null : variacion.direccion === 'sube' ? TrendingUp : variacion.direccion === 'baja' ? TrendingDown : Minus;
  const colorVariacion = !variacion ? '' : variacion.esBueno === false ? 'text-red-600' : variacion.esBueno === true ? 'text-brand-green-600' : 'text-ink-500';

  return (
    <div
      onClick={onClick}
      className={`rounded-ds-card border bg-white p-4 shadow-ds-xs ${onClick ? 'cursor-pointer transition hover:shadow-ds-sm' : ''} ${c.borde}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500 font-poppins">{etiqueta}</p>
        <span className={`h-2 w-2 shrink-0 rounded-full ${c.punto}`} aria-hidden title={tono} />
      </div>
      <p className="mt-2 font-oswald text-3xl text-ink-900">{valor}</p>
      <div className="mt-1 flex items-center gap-3 text-xs font-poppins">
        {meta && <span className="text-ink-400">Meta: {meta}</span>}
        {variacion && Icono && (
          <span className={`inline-flex items-center gap-0.5 ${colorVariacion}`}>
            <Icono size={12} /> {variacion.valor}
          </span>
        )}
      </div>
      {alerta && (
        <p className="mt-2 rounded-ds-xs bg-red-50 px-2 py-1 text-xs text-red-700 font-poppins">{alerta}</p>
      )}
    </div>
  );
}
