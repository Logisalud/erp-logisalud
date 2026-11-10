import type { Semaforo } from './tokens';
import { SEMAFORO_CLASES, SEMAFORO_LABEL } from './tokens';

type Props = {
  tono: Semaforo;
  children?: React.ReactNode;
  conPunto?: boolean;
};

// Badge de estado — mismo semáforo que las tarjetas KPI y las fases de
// cobranza. `children` reemplaza el label por defecto si hace falta texto
// puntual (ej. el nombre de una fase).
export function Badge({ tono, children, conPunto = true }: Props) {
  const c = SEMAFORO_CLASES[tono];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-ds-input border px-2.5 py-1 text-xs font-medium font-poppins ${c.texto} ${c.fondo} ${c.borde}`}>
      {conPunto && <span className={`h-1.5 w-1.5 rounded-full ${c.punto}`} aria-hidden />}
      {children ?? SEMAFORO_LABEL[tono]}
    </span>
  );
}
