import { Inbox, Loader2, AlertTriangle } from 'lucide-react';

// Estado vacío, de carga y de error — los tres casos que toda pantalla
// nueva necesita cubrir (ver impeccable/craft-floor).

export function EstadoVacio({ titulo, descripcion, accion }: { titulo: string; descripcion?: string; accion?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-ds-card border border-dashed border-ink-200 bg-white px-6 py-12 text-center font-poppins">
      <Inbox size={28} className="text-ink-300" />
      <p className="text-sm font-medium text-ink-700">{titulo}</p>
      {descripcion && <p className="text-xs text-ink-400">{descripcion}</p>}
      {accion}
    </div>
  );
}

export function EstadoCargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-ds-card border border-ink-200 bg-white px-6 py-12 text-sm text-ink-400 font-poppins">
      <Loader2 size={16} className="animate-spin" /> {texto}
    </div>
  );
}

export function EstadoError({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex items-center gap-2 rounded-ds-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-poppins">
      <AlertTriangle size={16} className="shrink-0" /> {mensaje}
    </div>
  );
}
