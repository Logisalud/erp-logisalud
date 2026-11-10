// Formato canónico para pantallas nuevas del sistema de diseño: S/ 1,234.56
// y fechas dd/mm/aaaa. No reemplaza los `fmt`/`fmtFecha` locales de pantallas
// viejas (eso es trabajo de la Fase Final, pantalla por pantalla).

export function fmtMoneda(valor: number | null | undefined): string {
  const n = Number(valor) || 0;
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.slice(0, 10).split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

export function fmtEntero(valor: number | null | undefined): string {
  const n = Number(valor) || 0;
  return n.toLocaleString('es-PE');
}

export function fmtPorcentaje(valor: number | null | undefined, decimales = 1): string {
  const n = Number(valor) || 0;
  return `${n.toFixed(decimales)}%`;
}
