/**
 * Quién recibe los avisos de un pedido.
 *
 * La lista fija (`order_notification_recipients`) es la oficina: siempre
 * los mismos, para cualquier pedido. A esa lista se le suma el vendedor
 * responsable del pedido concreto, que cambia en cada uno. Este archivo es
 * sólo la mezcla —pura, sin base de datos— porque es donde estaba el error
 * fácil: mandarle dos veces el mismo correo a alguien que además está en la
 * lista fija.
 */

/** Un correo utilizable: sin espacios, en minúsculas, con algo antes y después de la arroba. */
export function normalizarEmail(valor: string | null | undefined): string | null {
  const limpio = (valor ?? "").trim().toLowerCase();
  if (!limpio) return null;
  // No se valida de más: el formato lo garantiza el CHECK de la tabla y,
  // para el vendedor, la propia cuenta de Auth. Acá sólo se descarta lo que
  // no puede ser un destinatario.
  const partes = limpio.split("@");
  if (partes.length !== 2 || !partes[0] || !partes[1].includes(".")) return null;
  return limpio;
}

/**
 * La lista final de destinatarios: los fijos primero, y después los del
 * pedido que no estuvieran ya.
 *
 * El orden importa poco para el correo pero sí para el log y para los
 * tests: el mismo pedido tiene que dar siempre la misma lista.
 */
export function combinarDestinatarios(
  fijos: Array<string | null | undefined>,
  delPedido: Array<string | null | undefined>,
): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const crudo of [...fijos, ...delPedido]) {
    const email = normalizarEmail(crudo);
    if (!email || vistos.has(email)) continue;
    vistos.add(email);
    salida.push(email);
  }
  return salida;
}
