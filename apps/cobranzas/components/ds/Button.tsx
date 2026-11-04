import { Loader2 } from 'lucide-react';

type Variante = 'primario' | 'secundario' | 'peligro';
type Tamano = 'sm' | 'md';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamano?: Tamano;
  cargando?: boolean;
};

const VARIANTE_CLASES: Record<Variante, string> = {
  primario:   'bg-brand-green-500 text-white hover:bg-brand-green-600 disabled:bg-brand-green-300',
  secundario: 'bg-white text-ink-700 border border-ink-300 hover:bg-ink-50 disabled:text-ink-300',
  peligro:    'bg-white text-red-600 border border-red-200 hover:bg-red-50 disabled:text-red-200',
};

const TAMANO_CLASES: Record<Tamano, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

// Jerarquía clara: primario (una sola acción principal por vista),
// secundario (el resto) y peligro (anular/eliminar). `cargando` deshabilita
// y muestra spinner sin que el botón cambie de tamaño.
export function Button({ variante = 'secundario', tamano = 'md', cargando, disabled, className = '', children, ...rest }: Props) {
  return (
    <button
      disabled={disabled || cargando}
      className={`inline-flex items-center justify-center gap-1.5 rounded-ds-input font-medium font-poppins transition disabled:cursor-not-allowed ${VARIANTE_CLASES[variante]} ${TAMANO_CLASES[tamano]} ${className}`}
      {...rest}
    >
      {cargando && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}
