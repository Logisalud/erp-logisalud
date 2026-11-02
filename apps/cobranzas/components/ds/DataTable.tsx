export type Columna<T> = {
  clave: string;
  titulo: string;
  align?: 'left' | 'right' | 'center';
  render: (fila: T) => React.ReactNode;
  anchoClase?: string; // ej. 'w-32'
};

type Props<T> = {
  columnas: Columna<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  onClickFila?: (fila: T) => void;
  filaDestacada?: (fila: T) => boolean;
  vacio?: React.ReactNode;
  maxAltura?: string; // ej. 'max-h-[60vh]' — encabezado fijo si se pasa
};

const ALINEACION: Record<string, string> = { left: 'text-left', right: 'text-right', center: 'text-center' };

// Tabla de datos genérica: encabezado fijo (si `maxAltura`), columnas
// alineadas a la derecha para números, densidad cómoda (py-2.5), fila con
// hover y opción de destacar (ej. el cliente que cruza el 80% del Pareto).
export function DataTable<T>({ columnas, filas, claveFila, onClickFila, filaDestacada, vacio, maxAltura }: Props<T>) {
  if (filas.length === 0) {
    return vacio ? <>{vacio}</> : null;
  }

  return (
    <div className={`overflow-auto rounded-ds-card border border-ink-200 ${maxAltura ?? ''}`}>
      <table className="w-full border-collapse text-sm font-poppins">
        <thead className="sticky top-0 z-10 bg-ink-50">
          <tr>
            {columnas.map(c => (
              <th
                key={c.clave}
                className={`whitespace-nowrap border-b border-ink-200 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 ${ALINEACION[c.align ?? 'left']} ${c.anchoClase ?? ''}`}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {filas.map(fila => (
            <tr
              key={claveFila(fila)}
              onClick={onClickFila ? () => onClickFila(fila) : undefined}
              className={`${onClickFila ? 'cursor-pointer hover:bg-brand-green-50/40' : ''} ${filaDestacada?.(fila) ? 'bg-amber-50/60' : ''}`}
            >
              {columnas.map(c => (
                <td key={c.clave} className={`px-3 py-2.5 text-ink-700 ${ALINEACION[c.align ?? 'left']}`}>
                  {c.render(fila)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
