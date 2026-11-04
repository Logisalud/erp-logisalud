type Props = {
  children: React.ReactNode;
};

// Contenedor de filtros: envuelve inputs/selects con espaciado y fondo
// consistentes. No impone qué filtros van adentro.
export function FilterBar({ children }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-ds-card border border-ink-200 bg-ink-50/60 p-3">
      {children}
    </div>
  );
}

export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-poppins">
      <span className="font-medium text-ink-600">{label}</span>
      {children}
    </label>
  );
}
