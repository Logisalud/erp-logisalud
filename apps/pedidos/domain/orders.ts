/**
 * Lógica pura del módulo de pedidos (Fase 4): quién puede tomar un
 * pedido a nombre de quién, a qué estado bifurca la validación
 * automática, y el cálculo de una línea de pedido. Espejo en TypeScript
 * de las mismas reglas que aplica supabase/migrations/0036_order_workflow_functions.sql
 * (SECURITY DEFINER, la autoridad real) — si alguna vez divergen, gana
 * SQL. Este archivo sirve para tests rápidos sin Postgres y para dar
 * feedback optimista en la UI antes de llamar al servidor.
 */

export type OrderEstado =
  | "DRAFT"
  | "SUBMITTED"
  | "NEW_CUSTOMER_VALIDATION"
  | "ADMINISTRATIVE_EXCEPTION"
  | "COMMERCIAL_EXCEPTION"
  | "READY_FOR_OPERATIONS";

export type OrderRole =
  | "vendedor"
  | "control_pedidos"
  | "aprobador_comercial"
  | "operaciones"
  | "administrador";

export type CustomerEstado = "PENDIENTE_DE_VALIDACION" | "ACTIVO" | "RECHAZADO" | "INACTIVO";

/**
 * A nombre de qué seller queda el pedido. El administrador SIEMPRE debe
 * elegir explícitamente (selector "a nombre de qué vendedor/zona"); el
 * vendedor nunca puede elegir otro seller que no sea el suyo, aunque el
 * payload traiga uno distinto.
 */
export function resolveOrderSellerId(input: {
  rol: OrderRole;
  callerSellerId: string | null;
  selectedSellerId?: string | null;
}): string {
  if (input.rol === "administrador") {
    if (!input.selectedSellerId) {
      throw new Error("El administrador debe elegir a nombre de qué vendedor/zona se registra el pedido.");
    }
    return input.selectedSellerId;
  }
  if (!input.callerSellerId) {
    throw new Error("Este usuario no tiene un vendedor vinculado.");
  }
  return input.callerSellerId;
}

/**
 * Mismo criterio que resolveOrderSellerId, expresado como filtro de
 * lectura ("qué seller_id puede ver este usuario") — proxy en TS de la
 * policy orders_select (0033), que es la garantía real. Un vendedor
 * jamás puede pedir ver los pedidos de otro seller, sin importar qué
 * pida el payload.
 */
export function resolveOrderSellerFilter(input: {
  rol: OrderRole;
  callerSellerId: string | null;
  requestedSellerId?: string | null;
}): string | "ALL" {
  if (input.rol === "vendedor") {
    if (!input.callerSellerId) {
      throw new Error("Este usuario no tiene un vendedor vinculado.");
    }
    return input.callerSellerId;
  }
  return "ALL";
}

/**
 * Bifurcación de la validación automática (DRAFT->SUBMITTED->?).
 * Precedencia: cliente nuevo > excepción administrativa > excepción
 * comercial > listo para operaciones. Confirmado con el usuario: la
 * excepción administrativa se dispara cuando la condición de pago del
 * pedido difiere de la condición de pago habitual del cliente.
 *
 * Si el cliente NO tiene condición habitual definida
 * (customerCondicionPagoHabitualId === null) no hay nada con qué
 * comparar: cualquier condición que elija el vendedor se acepta sin
 * excepción administrativa. Es el caso de la cartera real migrada, que
 * entró sin ese dato a propósito (ver docs/business-rules.md).
 */
export function computeAutomaticValidationOutcome(input: {
  customerEstado: CustomerEstado;
  orderPaymentTermsId: number;
  customerCondicionPagoHabitualId: number | null;
  /**
   * Días de crédito escritos a mano (condición de entrada libre). No hay
   * condición habitual con la cual puedan coincidir —por definición no es
   * una condición estándar—, así que Administración los revisa siempre.
   */
  diasCreditoSolicitados?: number | null;
  hasPendingApprovalRequest: boolean;
}): Exclude<OrderEstado, "DRAFT" | "SUBMITTED"> {
  if (input.customerEstado === "PENDIENTE_DE_VALIDACION") {
    return "NEW_CUSTOMER_VALIDATION";
  }
  if (input.diasCreditoSolicitados != null) {
    return "ADMINISTRATIVE_EXCEPTION";
  }
  if (
    input.customerCondicionPagoHabitualId !== null &&
    input.orderPaymentTermsId !== input.customerCondicionPagoHabitualId
  ) {
    return "ADMINISTRATIVE_EXCEPTION";
  }
  if (input.hasPendingApprovalRequest) {
    return "COMMERCIAL_EXCEPTION";
  }
  return "READY_FOR_OPERATIONS";
}

export type LineItemResult =
  | { ok: true; subtotal: number; igv: number; total: number }
  | { ok: false; reason: "NO_PRICE" };

/**
 * Cálculo de una línea de pedido. Nunca recibe un "precioUnitario" del
 * navegador — solo precioVigente, que en producción viene siempre de
 * una consulta server-side (supabase/migrations/0036, pedidos.submit_order)
 * a price_list_items en el momento de enviar el pedido. Sin precio
 * vigente, la línea se bloquea con un motivo explícito en vez de
 * inventar un precio o dejarla pasar en cero.
 */
export function calculateLineItem(input: {
  cantidad: number;
  precioVigente: number | null;
  afectacionTributaria: "GRAVADO" | "INAFECTO";
  tasaAplicable: number;
}): LineItemResult {
  if (input.precioVigente === null) {
    return { ok: false, reason: "NO_PRICE" };
  }
  // Los precios de las listas de canal (PVF Farma, Mayorista, Instituciones,
  // Subdistribuidores, Minicadenas) YA INCLUYEN IGV: son precio final, no
  // base imponible. Así que el total de la línea es cantidad × precio, sin
  // agregar nada encima.
  //
  // El desglose se deriva AL REVÉS, que es lo que exige el comprobante:
  // base = total / (1 + tasa/100), igv = total - base. `subtotal` sigue
  // siendo la base imponible, así que el invariante total = subtotal + igv
  // se mantiene y nada aguas abajo cambia de significado.
  const total = round2(input.cantidad * input.precioVigente);

  if (input.afectacionTributaria !== "GRAVADO") {
    return { ok: true, subtotal: total, igv: 0, total };
  }

  const subtotal = round2(total / (1 + input.tasaAplicable / 100));
  // El IGV se saca por resta y no por multiplicación, para que
  // subtotal + igv dé exactamente el total y no quede un céntimo suelto
  // por redondear las dos partes por separado.
  const igv = round2(total - subtotal);
  return { ok: true, subtotal, igv, total };
}

/**
 * Precio unitario SIN IGV, para el `valor_unitario` del comprobante.
 * `precio_unitario` en la base incluye IGV.
 */
export function valorUnitarioSinIgv(
  precioConIgv: number,
  afectacionTributaria: "GRAVADO" | "INAFECTO",
  tasaAplicable: number,
): number {
  if (afectacionTributaria !== "GRAVADO") return precioConIgv;
  return Math.round((precioConIgv / (1 + tasaAplicable / 100)) * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** La condición de pago solo se edita mientras el pedido sigue en DRAFT. */
export function canEditPaymentTerms(estado: OrderEstado): boolean {
  return estado === "DRAFT";
}
