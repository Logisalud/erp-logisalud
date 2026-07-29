// Deriva un nombre de saludo natural para el mensaje de WhatsApp, a partir de
// los datos de `clientes`. Prioridad:
//   1. Persona natural  -> su primer nombre de pila.
//   2. Empresa con `nombre_comercial` cargado -> ese nombre, tal cual.
//   3. Empresa sin `nombre_comercial` -> razón social sin el sufijo societario.

// SUNAT: RUC de persona natural empieza con 10/15/17 (o "00" para clientes
// cargados sin RUC formal, con DNI/placeholder). Solo el prefijo "20" es
// persona jurídica (empresa).
export function esPersonaNatural(ruc: string): boolean {
  return !ruc.startsWith('20');
}

const CONECTORES = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'VDA']);

function capitalizar(palabra: string): string {
  return palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
}

// Heurística sobre el formato estándar SUNAT "APELLIDO APELLIDO NOMBRE(S)":
// se asumen 2 unidades de apellido (cada una puede incluir conectores como
// DE/DEL/LA) y se toma la primera palabra siguiente como nombre de pila.
// Limitación conocida: algunos registros cargados manualmente no siguen este
// orden (nombre primero) y en esos casos el resultado será una palabra
// equivocada (un apellido en vez de un nombre) — no hay forma de detectarlo
// sin un diccionario de nombres.
export function primerNombrePersonaNatural(razonSocial: string): string | null {
  // Si el dato viene duplicado con "/", nos quedamos con la primera variante.
  const texto = razonSocial.split('/')[0].trim();
  if (!texto) return null;

  // Formato "APELLIDOS, NOMBRES": señal más confiable cuando está presente.
  const coma = texto.indexOf(',');
  if (coma !== -1) {
    const nombres = texto.slice(coma + 1).trim();
    const primero = nombres.split(/\s+/).filter(Boolean)[0];
    if (primero) return capitalizar(primero);
  }

  const tokens = texto.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.length === 1) return capitalizar(tokens[0]);

  let i = 0;
  for (let unidad = 0; unidad < 2 && i < tokens.length; unidad++) {
    i++; // núcleo del apellido
    while (i < tokens.length && CONECTORES.has(tokens[i].toUpperCase())) {
      i += 2; // conector + palabra que lo acompaña, ambos parte del mismo apellido
    }
  }
  const resto = tokens.slice(i);
  const primero = resto[0] ?? tokens[tokens.length - 1];
  return primero ? capitalizar(primero) : null;
}

// Sufijos societarios peruanos, abreviados y escritos en extenso. El orden
// importa: los más específicos/largos van primero para no cortar a mitad.
const SUFIJOS_SOCIETARIOS = [
  'SOCIEDAD AN[OÓ]NIMA CERRADA',
  'SOCIEDAD AN[OÓ]NIMA ABIERTA',
  'SOCIEDAD AN[OÓ]NIMA',
  'SOCIEDAD COMERCIAL DE RESPONSABILIDAD LIMITADA',
  'SOCIEDAD DE RESPONSABILIDAD LIMITADA',
  'EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA',
  'S\\.?\\s?A\\.?\\s?C\\.?',
  'S\\.?\\s?A\\.?\\s?A\\.?',
  'S\\.?\\s?R\\.?\\s?L\\.?',
  'E\\.?\\s?I\\.?\\s?R\\.?\\s?L\\.?',
  'S\\.?\\s?C\\.?\\s?R\\.?\\s?L\\.?',
  'S\\.?\\s?A\\.?',
];
const SUFIJO_RE = new RegExp(`[\\s,-]+(${SUFIJOS_SOCIETARIOS.join('|')})\\s*$`, 'i');

// Quita el sufijo societario final (puede haber más de uno encadenado, ej.
// "... SOCIEDAD ANONIMA CERRADA S.A.C."); conserva el resto del nombre
// completo, no solo las primeras palabras.
export function quitarSufijoSocietario(razonSocial: string): string {
  let s = razonSocial.trim();
  let anterior;
  do {
    anterior = s;
    s = s.replace(SUFIJO_RE, '').trim();
  } while (s !== anterior && s.length > 0);
  return s || razonSocial.trim(); // si no queda nada (el nombre era solo el sufijo), usa el original
}

export function nombreSaludo(cliente: {
  ruc: string;
  razon_social: string;
  nombre_comercial?: string | null;
}): string {
  if (esPersonaNatural(cliente.ruc)) {
    const nombre = primerNombrePersonaNatural(cliente.razon_social);
    if (nombre) return nombre;
  } else if (cliente.nombre_comercial && cliente.nombre_comercial.trim()) {
    return cliente.nombre_comercial.trim();
  }
  return quitarSufijoSocietario(cliente.razon_social);
}
