import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

type Miga = { label: string; href?: string };

type Props = {
  titulo: string;
  subtitulo?: string;
  migas?: Miga[];
  acciones?: React.ReactNode;
};

// Encabezado consistente para toda pantalla nueva: título + subtítulo +
// migas de pan + zona de acciones a la derecha. Reemplaza el patrón viejo
// de header con degradado + "← Menú" suelto — pero solo en pantallas que
// lo adopten explícitamente (Fase Final), nunca de forma global.
export function PageHeader({ titulo, subtitulo, migas, acciones }: Props) {
  return (
    <header className="mb-6">
      {migas && migas.length > 0 && (
        <nav className="mb-2 flex items-center gap-1 text-xs text-ink-500 font-poppins" aria-label="Migas de pan">
          {migas.map((m, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-ink-300" />}
              {m.href ? (
                <Link href={m.href} className="hover:text-brand-green-600 hover:underline">{m.label}</Link>
              ) : (
                <span className="text-ink-700">{m.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-oswald text-2xl uppercase tracking-wide text-ink-900">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-sm text-ink-500 font-poppins">{subtitulo}</p>}
        </div>
        {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
      </div>
    </header>
  );
}
