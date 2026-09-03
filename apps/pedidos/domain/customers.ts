export type CustomerEstado = "PENDIENTE_DE_VALIDACION" | "ACTIVO" | "RECHAZADO" | "INACTIVO";

export type TipoComprobantePermitido = "FACTURA" | "BOLETA" | "FACTURA_O_BOLETA";

/**
 * Un cliente solo puede usarse en un pedido si está ACTIVO. La
 * verificación real de esto ocurre en Fase 4 al crear el pedido; esta
 * función es la regla de dominio que esa fase deberá invocar.
 */
export function isCustomerOrderable(estado: CustomerEstado): boolean {
  return estado === "ACTIVO";
}

/**
 * Clasificación del documento del cliente por prefijo de RUC (SUNAT):
 *  - 20: persona jurídica.
 *  - 10: persona natural con negocio.
 *  - 15 / 17: RUC de contribuyente igualmente válido (casos residuales
 *    en la cartera real: no emitidos hoy, pero vigentes).
 *  - cualquier otro prefijo: NO es RUC de contribuyente. En la cartera
 *    migrada son DNI cargados en el campo de RUC en el sistema de origen.
 */
export type TipoDocumento = "RUC_JURIDICA" | "RUC_NATURAL" | "RUC_OTRO" | "DNI_COMO_RUC";

/**
 * Un RUC de contribuyente es prefijo válido MÁS 11 dígitos en total. No
 * alcanza con el prefijo: '20123' o '2099999999' empiezan bien y no son
 * RUC. Idéntico al CHECK customers_boleta_only_sin_ruc_valido (0041) — si
 * TS fuera más permisivo que SQL, el importador intentaría grabar
 * FACTURA en filas que la BD rechaza.
 */
const RUC_CONTRIBUYENTE = /^(10|15|17|20)[0-9]{9}$/;

export function classifyDocumento(rucODocumento: string): TipoDocumento {
  const doc = rucODocumento.trim();
  if (!RUC_CONTRIBUYENTE.test(doc)) return "DNI_COMO_RUC";
  const prefijo = doc.slice(0, 2);
  if (prefijo === "20") return "RUC_JURIDICA";
  if (prefijo === "10") return "RUC_NATURAL";
  return "RUC_OTRO";
}

/** Espejo en TS del constraint customers_boleta_only_sin_ruc_valido (0041). */
export function esRucContribuyenteValido(rucODocumento: string): boolean {
  return classifyDocumento(rucODocumento) !== "DNI_COMO_RUC";
}

/**
 * Comprobante permitido según el documento del cliente:
 *  - persona jurídica (20) -> FACTURA.
 *  - persona natural (10) y otros RUC válidos -> FACTURA_O_BOLETA; el
 *    vendedor elige caso por caso al tomar el pedido, no hay un default
 *    fijo por cliente.
 *  - sin RUC de contribuyente -> BOLETA únicamente. Esto lo garantiza
 *    además el constraint en la BD, así que sigue aplicando incluso
 *    después de que Control de Pedidos apruebe al cliente; solo se
 *    levanta corrigiendo el documento a un RUC real.
 */
export function resolveTipoComprobantePermitido(rucODocumento: string): TipoComprobantePermitido {
  switch (classifyDocumento(rucODocumento)) {
    case "RUC_JURIDICA":
      return "FACTURA";
    case "RUC_NATURAL":
    case "RUC_OTRO":
      return "FACTURA_O_BOLETA";
    case "DNI_COMO_RUC":
      return "BOLETA";
  }
}

/**
 * Estado con el que entra un cliente en la carga de la cartera real.
 * Los clientes con RUC válido ya operan y entran ACTIVO (saltan el flujo
 * de validación, que está pensado para clientes nuevos). Los que traen un
 * DNI en el campo de RUC quedan PENDIENTE_DE_VALIDACION para que Control
 * de Pedidos verifique el documento real.
 */
export function resolveEstadoInicialImportacion(rucODocumento: string): CustomerEstado {
  return esRucContribuyenteValido(rucODocumento) ? "ACTIVO" : "PENDIENTE_DE_VALIDACION";
}

export const ALERTA_DNI_COMO_RUC =
  "Posible DNI cargado como RUC — verificar documento real antes de aprobar";

/**
 * Alerta a mostrar en la ficha de validación. Devuelve null cuando no
 * hay nada que advertir, para que la UI no tenga que replicar el
 * criterio.
 */
export function documentoAlerta(rucODocumento: string): string | null {
  return esRucContribuyenteValido(rucODocumento) ? null : ALERTA_DNI_COMO_RUC;
}

/**
 * Un pedido no puede enviarse a un cliente sin dirección de entrega
 * registrada. Se bloquea, no se advierte: preferimos frenar la toma del
 * pedido a que salga un despacho sin dirección real (decisión de negocio,
 * ver docs/business-rules.md). La garantía dura es
 * orders.customer_address_id not null (0033); esto es la regla que la UI
 * usa para explicarlo antes de llegar al error de BD.
 */
export const MENSAJE_SIN_DIRECCION =
  "Este cliente no tiene dirección registrada, agrégala antes de continuar";

/**
 * El ubigeo no es opcional en una dirección nueva: sin él la guía de
 * remisión no se puede emitir, y descubrirlo el día del despacho es tarde.
 * Las 13 direcciones viejas que quedaron sin ubigeo son deuda de la carga
 * masiva, no un camino que la pantalla deba seguir abriendo.
 */
export const MENSAJE_UBIGEO_REQUERIDO =
  "Elegí departamento, provincia y distrito: sin eso no se puede emitir la guía de remisión.";

export const MENSAJE_UBIGEO_NO_RESUELTO =
  "Esa combinación de departamento, provincia y distrito no existe en el catálogo oficial. " +
  "Volvé a elegirla de las listas.";

export function puedeTomarPedido(input: {
  estado: CustomerEstado;
  direccionesActivas: number;
}): { ok: true } | { ok: false; motivo: string } {
  if (!isCustomerOrderable(input.estado)) {
    return { ok: false, motivo: "El cliente no está ACTIVO." };
  }
  if (input.direccionesActivas < 1) {
    return { ok: false, motivo: MENSAJE_SIN_DIRECCION };
  }
  return { ok: true };
}
