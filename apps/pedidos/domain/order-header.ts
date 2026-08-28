/**
 * Edición del encabezado de un pedido en borrador: cliente, dirección y
 * condición de pago, con las líneas ya cargadas.
 *
 * El vendedor tiene que poder corregir el encabezado sin perder el trabajo
 * de haber cargado 15 productos. Pero el precio de cada línea se resuelve
 * por el CANAL del cliente (`price_list_items` por producto + canal), así
 * que cambiar el cliente puede mover precios en silencio.
 *
 * Decisión de negocio tomada con el usuario: **el cambio de cliente se
 * permite solo si ninguna línea cambia de precio.** Si alguna cambiaría —o
 * si el canal nuevo no tiene precio para ese producto— se frena y se
 * explica cuál y por qué, en vez de grabar un pedido con precios de otro
 * cliente.
 *
 * Dirección y condición de pago no tocan el precio: se editan libres.
 */

export type LineaParaRevaluar = {
  itemId: string;
  codigo: string;
  descripcion: string;
  /** Precio unitario con el que la línea está grabada hoy. */
  precioActual: number;
  /**
   * Precio que tendría con el canal del cliente nuevo, o null si ese canal
   * no tiene precio vigente para el producto.
   */
  precioConNuevoCliente: number | null;
};

export type ConflictoDePrecio = {
  itemId: string;
  codigo: string;
  descripcion: string;
  precioActual: number;
  precioNuevo: number | null;
  motivo: "CAMBIA_DE_PRECIO" | "SIN_PRECIO_EN_EL_CANAL";
};

export type EvaluacionCambioCliente =
  | { permitido: true; conflictos: [] }
  | { permitido: false; conflictos: ConflictoDePrecio[] };

/**
 * Los precios se comparan en céntimos enteros: comparar decimales con `!==`
 * haría que 10.1 + 0.2 se declare distinto de 10.3 y bloquee un cambio que
 * en realidad no mueve nada.
 */
function mismoPrecio(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export function evaluarCambioDeCliente(lineas: LineaParaRevaluar[]): EvaluacionCambioCliente {
  // Sin líneas cargadas no hay nada que proteger: el cambio es libre.
  if (lineas.length === 0) return { permitido: true, conflictos: [] };

  const conflictos: ConflictoDePrecio[] = [];

  for (const linea of lineas) {
    if (linea.precioConNuevoCliente === null) {
      conflictos.push({
        itemId: linea.itemId,
        codigo: linea.codigo,
        descripcion: linea.descripcion,
        precioActual: linea.precioActual,
        precioNuevo: null,
        motivo: "SIN_PRECIO_EN_EL_CANAL",
      });
      continue;
    }

    if (!mismoPrecio(linea.precioActual, linea.precioConNuevoCliente)) {
      conflictos.push({
        itemId: linea.itemId,
        codigo: linea.codigo,
        descripcion: linea.descripcion,
        precioActual: linea.precioActual,
        precioNuevo: linea.precioConNuevoCliente,
        motivo: "CAMBIA_DE_PRECIO",
      });
    }
  }

  return conflictos.length === 0
    ? { permitido: true, conflictos: [] }
    : { permitido: false, conflictos };
}

/**
 * Mensaje del bloqueo. Dice el problema y la salida, no solo que no se
 * puede: el vendedor está parado frente al cliente y necesita saber qué
 * hacer ahora.
 */
export function mensajeCambioBloqueado(conflictos: ConflictoDePrecio[]): string {
  const n = conflictos.length;
  const sinPrecio = conflictos.filter((c) => c.motivo === "SIN_PRECIO_EN_EL_CANAL").length;

  const cuantas =
    n === 1 ? "1 producto del pedido tiene" : `${n} productos del pedido tienen`;

  const detalle =
    sinPrecio === n
      ? "sin precio en la lista del cliente nuevo"
      : sinPrecio > 0
        ? "otro precio o ningún precio en la lista del cliente nuevo"
        : "otro precio en la lista del cliente nuevo";

  return (
    `No se puede cambiar de cliente: ${cuantas} ${detalle}. ` +
    "Cambiarlo dejaría el pedido con precios que no corresponden. " +
    "Quita esos productos y vuelve a agregarlos, o empieza un pedido nuevo para el otro cliente."
  );
}

/** ¿El encabezado quedó completo y el pedido puede existir? */
export function encabezadoCompleto(input: {
  customerId: string;
  customerAddressId: string;
  paymentTermsId: number | null;
}): boolean {
  return (
    input.customerId.trim() !== "" &&
    input.customerAddressId.trim() !== "" &&
    input.paymentTermsId !== null &&
    Number.isFinite(input.paymentTermsId) &&
    input.paymentTermsId > 0
  );
}
