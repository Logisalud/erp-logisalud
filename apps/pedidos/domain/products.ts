/**
 * Reglas de presentación de productos.
 *
 * Los códigos que empiezan con `BO` son la versión de BONIFICACIÓN de su par
 * regular: `BOBSA207` es la bonificación de `BSA207`, y ambos traen la
 * **misma descripción exacta**. En pantalla se ven idénticos, así que un
 * vendedor puede agregar el equivocado sin darse cuenta.
 *
 * La solución es de presentación, no de datos: se marca visualmente, sin
 * tocar `products.descripcion`.
 */

/**
 * ¿Es la versión de bonificación?
 *
 * OJO — la regla es el prefijo `BO` y nada más, que es como lo confirmó el
 * usuario. Eso significa que **un producto regular cuyo código empiece con
 * `BO` se marcaría como bonificación por error**. Hoy no hay ninguno, pero
 * si el catálogo crece con un código así, esto hay que endurecerlo
 * (por ejemplo, exigiendo que exista el par sin el prefijo).
 */
export function esBonificacion(codigoInterno: string): boolean {
  const codigo = codigoInterno.trim().toUpperCase();
  return codigo.startsWith("BO") && codigo.length > 2;
}

/** El código del producto regular del que esto es bonificación. */
export function codigoRegularDeBonificacion(codigoInterno: string): string | null {
  const codigo = codigoInterno.trim().toUpperCase();
  return esBonificacion(codigo) ? codigo.slice(2) : null;
}

export const SUFIJO_BONIFICACION = " (Bonificación)";

/**
 * Nombre a mostrar. Agrega "(Bonificación)" cuando corresponde, para que sea
 * imposible confundir el producto con su par regular.
 *
 * **No se usa en los documentos fiscales**: la descripción del comprobante y
 * de la guía tiene que ser la del producto, y marcar una bonificación ahí es
 * una decisión tributaria (transferencia gratuita), no de interfaz.
 */
export function displayNombreProducto(descripcion: string, codigoInterno: string): string {
  const nombre = descripcion.trim();
  if (!esBonificacion(codigoInterno)) return nombre;
  // Si ya viene marcada desde el origen, no se marca dos veces.
  if (nombre.toLowerCase().includes("bonificaci")) return nombre;
  return `${nombre}${SUFIJO_BONIFICACION}`;
}

/**
 * ¿Este producto se le puede ofrecer al vendedor al armar un pedido?
 *
 * Dos condiciones, y las dos son de negocio, no de interfaz:
 *
 * - **Activo.** Un producto inactivo no se puede facturar. Desde `0052` eso
 *   incluye a los que no existen en el catálogo de NubeFact.
 * - **Con precio vigente** en algún canal, o no hay con qué valorizar la
 *   línea.
 *
 * Vive acá y no dentro de la pantalla para que la regla se pueda probar y
 * para que no se desincronice entre los lugares que la aplican. La garantía
 * fuerte igual está en el servidor: `addOrderItem` rechaza un producto
 * inactivo aunque la petición venga armada a mano.
 */
export function esOfrecibleEnPedido(producto: {
  estado: string;
  hasCurrentPrice: boolean;
}): boolean {
  return producto.estado === "activo" && producto.hasCurrentPrice;
}
