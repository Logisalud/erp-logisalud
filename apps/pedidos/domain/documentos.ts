/**
 * El mismo cliente, escrito distinto en cada ERP.
 *
 * Cobranzas guarda la llave como once dígitos siempre, porque su columna
 * `clientes.ruc` tiene un CHECK de `^[0-9]{11}$`: un RUC entra tal cual y
 * un DNI entra relleno con ceros a la izquierda (`74920171` → `00074920171`).
 * Pedidos guarda el documento pelado, como lo escribió el vendedor.
 *
 * Comparar los dos en crudo hace que ningún cliente con DNI cruce nunca:
 * ni se le completa el contacto, ni se le mira la deuda. Se descubrió el
 * 2026-11-03, con un cliente que tenía celular y dirección en pedidos y
 * seguía en blanco en la cartera de cobranzas.
 *
 * Se rellena SOLO el documento de ocho dígitos, que es la forma del DNI.
 * Rellenar cualquier cosa corta inventaría cruces: un documento de diez
 * dígitos no es un DNI ni un RUC, y hacerlo pasar por uno de once lo
 * emparejaría con el cliente equivocado.
 */
export function claveDeCobranzas(documento: string | null | undefined): string | null {
  const t = (documento ?? "").trim();
  if (t === "") return null;
  if (/^[0-9]{8}$/.test(t)) return t.padStart(11, "0");
  return t;
}
