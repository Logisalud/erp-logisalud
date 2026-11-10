'use client';

import { useState } from 'react';

export type Columna<T> = {
  clave: string;
  titulo: string;
  align?: 'left' | 'right' | 'center';
  render: (fila: T) => React.ReactNode;
  anchoClase?: string; // ej. 'w-32'
  // Si se pasa, el encabezado se vuelve clicable y ordena la tabla por este valor.
  valorOrden?: (fila: T) => number | string;
};

type Props<T> = {
  columnas: Columna<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  onClickFila?: (fila: T) => void;
  filaDestacada?: (fila: T) => boolean;
  // Fila "atenuada" (ej. muestra pequeña): se muestra igual, con menor contraste.
  filaAtenuada?: (fila: T) => boolean;
  vacio?: React.ReactNode;
  maxAltura?: string; // ej. 'max-h-[60vh]' — encabezado fijo si se pasa
  // Fila fija al final que no entra en el ordenamiento (ej. "Total empresa").
  filaFinal?: T;
  // Orden por defecto al montar (clave de una columna con valorOrden).
  ordenInicial?: { clave: string; dir: 'asc' | 'desc' };
};

const ALINEACION: Record<string, string> = { left: 'text-left', right: 'text-right', center: 'text-center' };

// Tabla de datos genérica: encabezado fijo (si `maxAltura`), columnas
// alineadas a la derecha para números, densidad cómoda (py-2.5), fila con
// hover y opción de destacar (ej. el cliente que cruza el 80% del Pareto) o
// atenuar (ej. muestra pequeña). Ordenable por columna si esa columna trae
// `valorOrden`; la fila fija (`filaFinal`, ej. "Total empresa") no se mueve.
export function DataTable<T>({ columnas, filas, claveFila, onClickFila, filaDestacada, filaAtenuada, vacio, maxAltura, filaFinal, ordenInicial }: Props<T>) {
  const [orden, setOrden] = useState(ordenInicial ?? null);

  if (filas.length === 0 && !filaFinal) {
    return vacio ? <>{vacio}</> : null;
  }

  const colOrden = orden ? columnas.find(c => c.clave === orden.clave) : null;
  const filasOrdenadas = colOrden?.valorOrden
    ? [...filas].sort((a, b) => {
        const va = colOrden.valorOrden!(a);
        const vb = colOrden.valorOrden!(b);
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return orden!.dir === 'asc' ? cmp : -cmp;
      })
    : filas;

  function alternarOrden(c: Columna<T>) {
    if (!c.valorOrden) return;
    setOrden(prev => prev && prev.clave === c.clave ? { clave: c.clave, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { clave: c.clave, dir: 'asc' });
  }

  return (
    <div className={`overflow-auto rounded-ds-card border border-ink-200 ${maxAltura ?? ''}`}>
      <table className="w-full border-collapse text-sm font-poppins">
        <thead className="sticky top-0 z-10 bg-ink-50">
          <tr>
            {columnas.map(c => (
              <th
                key={c.clave}
                onClick={c.valorOrden ? () => alternarOrden(c) : undefined}
                className={`whitespace-nowrap border-b border-ink-200 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 ${ALINEACION[c.align ?? 'left']} ${c.anchoClase ?? ''} ${c.valorOrden ? 'cursor-pointer select-none hover:text-ink-700' : ''}`}
              >
                {c.titulo}{orden?.clave === c.clave ? (orden.dir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {filasOrdenadas.map(fila => (
            <tr
              key={claveFila(fila)}
              onClick={onClickFila ? () => onClickFila(fila) : undefined}
              className={`${onClickFila ? 'cursor-pointer hover:bg-brand-green-50/40' : ''} ${filaDestacada?.(fila) ? 'bg-amber-50/60' : ''} ${filaAtenuada?.(fila) ? 'opacity-50' : ''}`}
            >
              {columnas.map(c => (
                <td key={c.clave} className={`px-3 py-2.5 text-ink-700 ${ALINEACION[c.align ?? 'left']}`}>
                  {c.render(fila)}
                </td>
              ))}
            </tr>
          ))}
          {filaFinal && (
            <tr key={claveFila(filaFinal)} className="bg-ink-50 font-semibold">
              {columnas.map(c => (
                <td key={c.clave} className={`px-3 py-2.5 text-ink-900 ${ALINEACION[c.align ?? 'left']}`}>
                  {c.render(filaFinal)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
