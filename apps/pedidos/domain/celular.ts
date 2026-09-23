/**
 * El celular del cliente, que desde hoy es obligatorio para enviar un pedido.
 *
 * El número es el canal por el que Cobranzas y Operaciones llegan al cliente:
 * sin él, el pedido sale y después nadie lo puede contactar para coordinar la
 * entrega ni para cobrar. Por eso el pedido no pasa sin él, y por eso se
 * valida el FORMATO y no solo que haya algo escrito: un "123" anotado para
 * salir del paso es tan inútil como el vacío.
 *
 * Celular peruano: 9 dígitos, empieza en 9. De los 473 clientes que ya tienen
 * número cargado, 472 cumplen eso; el que no es un 5555555555 evidentemente
 * inventado.
 */

const CELULAR_PE = /^9\d{8}$/;

/**
 * Deja solo los dígitos. La gente escribe "987 654 321", "+51 987654321" o
 * "987-654-321", y las tres son el mismo número — rechazarlas por el formato
 * sería pelearse con quien está tratando de cargarlo bien.
 */
export function normalizarCelular(valor: string | null | undefined): string {
  if (!valor) return "";
  const soloDigitos = valor.replace(/\D/g, "");
  // Con prefijo de país: +51 999 888 777 -> 999888777.
  if (soloDigitos.length === 11 && soloDigitos.startsWith("51")) return soloDigitos.slice(2);
  return soloDigitos;
}

export function esCelularValido(valor: string | null | undefined): boolean {
  return CELULAR_PE.test(normalizarCelular(valor));
}

/** Qué decirle a quien lo está cargando, o null si está bien. */
export function errorDeCelular(valor: string | null | undefined): string | null {
  const n = normalizarCelular(valor);
  if (!n) return "Falta el celular del cliente.";
  if (!CELULAR_PE.test(n)) {
    return "El celular tiene que ser un número de 9 dígitos que empiece en 9.";
  }
  return null;
}
