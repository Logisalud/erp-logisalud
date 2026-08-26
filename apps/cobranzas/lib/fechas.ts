// Utilidades de fecha en zona horaria Lima, compartidas entre server y client components.

export function hoyISOLima(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); // YYYY-MM-DD
}

export function diasEntre(fecha: string | null, hoyISO: string): number | null {
  if (!fecha) return null;
  const [y, m, d] = fecha.split('-').map(Number);
  const [hy, hm, hd] = hoyISO.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86400000);
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function diaSemanaEsp(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function fechaLegible(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}
