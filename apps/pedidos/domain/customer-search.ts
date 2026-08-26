/**
 * Búsqueda de clientes para el selector del flujo de pedido.
 *
 * Estas son las piezas puras: qué término es buscable, cómo se limpia
 * antes de armar el filtro de PostgREST, y cómo se muestra el nombre. La
 * consulta vive en `services/customers.ts` y corre en el SERVIDOR — la
 * cartera son 3.4k clientes y PostgREST tope las respuestas en 1.000
 * filas, así que no se puede filtrar en el navegador sobre una lista
 * precargada (era exactamente el bug).
 */

/** Menos de esto no vale la pena consultar: devolvería media cartera. */
export const MIN_SEARCH_LENGTH = 2;

/** Tope de resultados por búsqueda. Suficiente para elegir, no para scrollear. */
export const SEARCH_RESULT_LIMIT = 50;

/** Cuántos clientes se precargan antes de que el vendedor escriba nada. */
export const INITIAL_CUSTOMER_LIMIT = 50;

/**
 * Nombre a mostrar.
 *
 * La cartera migrada del piloto de WhatsApp trae 21 razones sociales con
 * asteriscos escritos a mano al inicio (`'**** COMERCIAL EJEMPLO S.C.R.L.'`,
 * y hasta barras después de los asteriscos). No son un score ni un
 * indicador del sistema: alguien los tipeó en el sistema anterior y el
 * importador los cargó literales. No significan nada para el vendedor, y
 * como `*` ordena antes que las letras, coparon el tope de la lista.
 *
 * Se limpian solo para MOSTRAR. El dato original queda intacto en
 * `customers.razon_social` hasta que se decida si esos asteriscos
 * significaban algo — ver docs/business-rules.md.
 */
export function displayRazonSocial(razonSocial: string): string {
  const limpio = razonSocial.replace(/^[\s*\/\\-]+/, "").trim();
  // Si el nombre era SOLO puntuación, mejor mostrar el original que nada.
  return limpio === "" ? razonSocial.trim() : limpio;
}

/** ¿Vale la pena consultar al servidor con esto? */
export function esTerminoBuscable(raw: string): boolean {
  return normalizeSearchTerm(raw).length >= MIN_SEARCH_LENGTH;
}

/**
 * Limpia el término antes de meterlo en un filtro `or=(...)` de PostgREST.
 *
 * En esa gramática la coma separa condiciones y los paréntesis las
 * delimitan, así que un término con `,` `(` `)` rompe la consulta o —peor—
 * la cambia en silencio. `%` y `_` son comodines de LIKE, y `*` es el alias
 * de `%` en PostgREST: los tres harían que buscar `*EJEMPLO` signifique algo
 * distinto de lo que el vendedor escribió.
 *
 * También colapsa espacios: buscar `"EJEMPLO   SCRL"` no debería fallar por
 * el doble espacio.
 */
export function normalizeSearchTerm(raw: string): string {
  return raw
    .replace(/[,()%_*\\"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Solo los dígitos, para poder buscar un RUC tipeado con espacios o guiones. */
export function soloDigitos(raw: string): string {
  return raw.replace(/\D/g, "");
}
