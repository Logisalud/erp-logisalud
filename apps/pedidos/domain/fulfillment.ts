/**
 * Reglas puras de preparación y despacho. Espejo en TypeScript de
 * pedidos.confirm_dispatch (0046), que es la autoridad real: esto sirve
 * para validar en la UI antes de llamar al servidor y para testear el
 * criterio completo sin Postgres. Si alguna vez divergen, gana SQL.
 */

export type OrderEstadoParaDespacho =
  | "DRAFT"
  | "SUBMITTED"
  | "NEW_CUSTOMER_VALIDATION"
  | "ADMINISTRATIVE_EXCEPTION"
  | "COMMERCIAL_EXCEPTION"
  | "READY_FOR_OPERATIONS"
  | "DISPATCHED";

export const MENSAJE_SIN_DIRECCION_DESPACHO =
  "Este pedido no tiene una dirección de entrega activa; registra o reactiva la dirección del cliente antes de preparar el despacho";

/**
 * Un pedido solo se prepara desde READY_FOR_OPERATIONS y con dirección de
 * entrega activa.
 *
 * Lo segundo es un caso legacy: desde Fase 4 un pedido no puede enviarse
 * sin dirección, así que todo lo que llegue acá ya debería tenerla. Si un
 * pedido viejo se cuela, se bloquea con un mensaje que dice qué hacer en
 * vez de despachar a ninguna parte.
 */
export function puedePrepararDespacho(input: {
  estado: OrderEstadoParaDespacho;
  direccionEntregaActiva: boolean;
}): { ok: true } | { ok: false; motivo: string } {
  if (input.estado === "DISPATCHED") {
    return { ok: false, motivo: "Este pedido ya fue despachado." };
  }
  if (input.estado !== "READY_FOR_OPERATIONS") {
    return {
      ok: false,
      motivo: "Solo se puede preparar un pedido que ya está listo para operaciones.",
    };
  }
  if (!input.direccionEntregaActiva) {
    return { ok: false, motivo: MENSAJE_SIN_DIRECCION_DESPACHO };
  }
  return { ok: true };
}

export type LineaPreparada = {
  orderItemId: string;
  codigo: string;
  cantidadPedida: number;
  cantidadPreparada: number;
  controlaLote: boolean;
  controlaVencimiento: boolean;
  lote: string | null;
  fechaVencimiento: string | null;
  motivoDiferencia: string | null;
  pendienteDeStock: boolean;
  comentarioStock: string | null;
};

export type LineaIssue = { orderItemId: string; codigo: string; mensaje: string };

export type TransporteAsignado = {
  vehicleId: number | null;
  driverId: number | null;
  transporterId: number | null;
};

function vacio(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

/**
 * Transporte válido: vehículo propio CON chofer, o transportista externo.
 * Un vehículo sin chofer (o al revés) no es una asignación completa.
 */
export function validarTransporte(t: TransporteAsignado): string | null {
  const propioCompleto = t.vehicleId !== null && t.driverId !== null;
  const propioParcial =
    (t.vehicleId !== null) !== (t.driverId !== null) && t.transporterId === null;

  if (propioParcial) {
    return "El transporte propio necesita vehículo y chofer; si es un tercero, elige un transportista.";
  }
  if (!propioCompleto && t.transporterId === null) {
    return "Asigna el transporte: vehículo con chofer, o un transportista externo.";
  }
  return null;
}

/**
 * Valida las líneas preparadas. Devuelve un issue por línea problemática
 * en vez de cortar en la primera, para que Operaciones vea todo lo que
 * tiene que corregir de una sola pasada.
 */
export function validarLineasPreparadas(lineas: LineaPreparada[]): LineaIssue[] {
  const issues: LineaIssue[] = [];

  for (const l of lineas) {
    const push = (mensaje: string) =>
      issues.push({ orderItemId: l.orderItemId, codigo: l.codigo, mensaje });

    if (!Number.isFinite(l.cantidadPreparada) || l.cantidadPreparada < 0) {
      push("La cantidad preparada no puede ser negativa.");
      continue;
    }

    if (l.cantidadPreparada !== l.cantidadPedida && vacio(l.motivoDiferencia)) {
      push(
        `La cantidad preparada (${l.cantidadPreparada}) difiere de la pedida (${l.cantidadPedida}); indica el motivo.`,
      );
    }

    if (l.controlaLote && vacio(l.lote)) {
      push("Este producto controla lote; captura el lote antes de confirmar el despacho.");
    }

    if (l.controlaVencimiento && vacio(l.fechaVencimiento)) {
      push(
        "Este producto controla vencimiento; captura la fecha de vencimiento antes de confirmar el despacho.",
      );
    }

    if (l.pendienteDeStock && vacio(l.comentarioStock)) {
      push("Una línea marcada como pendiente de stock necesita un comentario.");
    }
  }

  return issues;
}

/** Las diferencias que van a auditoría al confirmar el despacho. */
export function resumirDiferencias(lineas: LineaPreparada[]) {
  return lineas
    .filter((l) => l.cantidadPreparada !== l.cantidadPedida)
    .map((l) => ({
      orderItemId: l.orderItemId,
      codigo: l.codigo,
      cantidadPedida: l.cantidadPedida,
      cantidadPreparada: l.cantidadPreparada,
      motivo: l.motivoDiferencia,
    }));
}

/**
 * Stock registrado vs. lo que se quiere preparar. Es informativo: NO
 * bloquea, porque stock_levels es un registro manual que puede estar
 * desfasado del almacén físico (no hay integración de inventario
 * todavía). Sirve para que la UI avise y Operaciones decida.
 */
export function faltaStockRegistrado(input: {
  cantidadPreparada: number;
  cantidadDisponible: number | null;
}): boolean {
  if (input.cantidadDisponible === null) return true;
  return input.cantidadPreparada > input.cantidadDisponible;
}
