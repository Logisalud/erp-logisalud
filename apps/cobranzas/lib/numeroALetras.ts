// Convierte un importe a su representación en palabras para letras de
// cambio, ej. 3564.90 -> "TRES MIL QUINIENTOS SESENTA Y CUATRO CON 90/100
// SOLES". Formato verificado contra dos ejemplos reales ya girados
// (letra 000091 y la letra "002" del formato original).

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function decenasATexto(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return ESPECIALES[n - 10];
  const d = Math.floor(n / 10), u = n % 10;
  if (d === 2) return u === 0 ? 'VEINTE' : 'VEINTI' + UNIDADES[u];
  return DECENAS[d] + (u > 0 ? ' Y ' + UNIDADES[u] : '');
}

function centenasATexto(n: number): string {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100), resto = n % 100;
  let out = '';
  if (c > 0) out += CENTENAS[c];
  if (resto > 0) out += (out ? ' ' : '') + decenasATexto(resto);
  return out;
}

function enteroATexto(n: number): string {
  if (n === 0) return 'CERO';
  if (n < 1000) return centenasATexto(n);

  const millones = Math.floor(n / 1000000);
  const miles = Math.floor((n % 1000000) / 1000);
  const resto = n % 1000;

  const partes: string[] = [];
  if (millones > 0) partes.push(millones === 1 ? 'UN MILLON' : centenasATexto(millones) + ' MILLONES');
  if (miles > 0) partes.push(miles === 1 ? 'MIL' : centenasATexto(miles) + ' MIL');
  if (resto > 0) partes.push(centenasATexto(resto));
  return partes.join(' ');
}

export function montoEnPalabrasSoles(importe: number): string {
  const centavos = Math.round(importe * 100);
  const entero = Math.floor(centavos / 100);
  const dec = centavos % 100;
  return `${enteroATexto(entero)} CON ${String(dec).padStart(2, '0')}/100 SOLES`;
}
