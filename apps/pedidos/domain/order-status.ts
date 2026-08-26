/**
 * Cómo se le muestra a una persona el estado de un pedido.
 *
 * Vivía duplicado dentro de `app/pedidos/[id]/page.tsx`, así que cualquier
 * otra pantalla que quisiera mostrar un estado tenía dos opciones malas:
 * copiar las tablas, o imprimir el enum crudo (`READY_FOR_OPERATIONS`), que
 * es lo que terminó haciendo la pantalla de despacho. Con la lista de "Mis
 * pedidos" ya son tres lugares, y tres copias de la misma tabla divergen.
 *
 * Es dominio puro: sin Next.js, sin Supabase, testeable sin levantar nada.
 */

export type OrderEstadoVisible =
  | "DRAFT"
  | "SUBMITTED"
  | "NEW_CUSTOMER_VALIDATION"
  | "ADMINISTRATIVE_EXCEPTION"
  | "COMMERCIAL_EXCEPTION"
  | "READY_FOR_OPERATIONS"
  | "DISPATCHED";

const LABELS: Record<OrderEstadoVisible, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Enviado",
  NEW_CUSTOMER_VALIDATION: "Esperando validación de cliente nuevo",
  ADMINISTRATIVE_EXCEPTION: "Excepción administrativa",
  COMMERCIAL_EXCEPTION: "Excepción comercial",
  READY_FOR_OPERATIONS: "Listo para operaciones",
  DISPATCHED: "Despachado",
};

/**
 * En una fila de lista no entra "Esperando validación de cliente nuevo" sin
 * empujar la fecha a otra línea. La versión corta dice lo mismo en menos, y
 * la larga se sigue usando en el detalle, donde hay lugar.
 */
const LABELS_CORTOS: Record<OrderEstadoVisible, string> = {
  ...LABELS,
  NEW_CUSTOMER_VALIDATION: "Validando cliente",
  ADMINISTRATIVE_EXCEPTION: "Excepción admin.",
  COMMERCIAL_EXCEPTION: "Excepción comercial",
  // "Listo" a secas no dice listo para qué, y el badge tiene lugar de sobra
  // ahora que ocupa su propia línea. Se deja igual que la etiqueta larga.
  READY_FOR_OPERATIONS: "Listo para operaciones",
};

/**
 * El estado nunca se comunica solo por color: cada uno lleva su etiqueta en
 * palabras. Un vendedor con daltonismo, o mirando la pantalla al sol, tiene
 * que poder leerlo igual.
 */
const ESTILOS: Record<OrderEstadoVisible, string> = {
  DRAFT: "border-slate-300 bg-slate-100 text-slate-700",
  SUBMITTED: "border-logisalud-teal/40 bg-logisalud-teal/10 text-[#1c6d71]",
  NEW_CUSTOMER_VALIDATION: "border-amber-300 bg-amber-50 text-amber-900",
  ADMINISTRATIVE_EXCEPTION: "border-amber-300 bg-amber-50 text-amber-900",
  COMMERCIAL_EXCEPTION: "border-amber-300 bg-amber-50 text-amber-900",
  READY_FOR_OPERATIONS: "border-logisalud-green/40 bg-logisalud-green/10 text-[#276b3b]",
  DISPATCHED: "border-logisalud-green/40 bg-logisalud-green/10 text-[#276b3b]",
};

const ESTILO_DESCONOCIDO = "border-slate-300 bg-slate-100 text-slate-700";

/**
 * Un estado que no está en la tabla se muestra tal cual en vez de romper la
 * pantalla: si mañana una migración agrega uno nuevo, la lista sigue
 * funcionando y el estado sin traducir se ve feo, que es exactamente la
 * señal de que falta agregarlo acá.
 */
export function estadoLabel(estado: string): string {
  return LABELS[estado as OrderEstadoVisible] ?? estado;
}

export function estadoLabelCorto(estado: string): string {
  return LABELS_CORTOS[estado as OrderEstadoVisible] ?? estado;
}

export function estadoEstilo(estado: string): string {
  return ESTILOS[estado as OrderEstadoVisible] ?? ESTILO_DESCONOCIDO;
}

/**
 * Las pestañas de "Mis pedidos".
 *
 * La división es la que le importa al vendedor, no la de la máquina de
 * estados: un borrador es trabajo suyo a medio hacer, y todo lo demás ya
 * salió de sus manos. Por eso "Enviados" junta desde SUBMITTED hasta
 * DISPATCHED en vez de abrir una pestaña por estado.
 */
export type PestanaPedidos = "borradores" | "enviados" | "todos";

export const PESTANAS: { id: PestanaPedidos; label: string }[] = [
  { id: "borradores", label: "Borradores" },
  { id: "enviados", label: "Enviados" },
  { id: "todos", label: "Todos" },
];

/** Estados que caen en cada pestaña. `todos` no filtra: devuelve null. */
export function estadosDePestana(pestana: PestanaPedidos): OrderEstadoVisible[] | null {
  if (pestana === "borradores") return ["DRAFT"];
  if (pestana === "enviados") {
    return [
      "SUBMITTED",
      "NEW_CUSTOMER_VALIDATION",
      "ADMINISTRATIVE_EXCEPTION",
      "COMMERCIAL_EXCEPTION",
      "READY_FOR_OPERATIONS",
      "DISPATCHED",
    ];
  }
  return null;
}

/**
 * La pestaña llega por querystring, o sea desde el navegador: cualquier cosa
 * que no sea una de las tres conocidas cae a "todos" en vez de romper.
 */
export function parsePestana(valor: string | undefined): PestanaPedidos {
  return PESTANAS.some((p) => p.id === valor) ? (valor as PestanaPedidos) : "todos";
}
