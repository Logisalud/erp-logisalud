/**
 * Generación de BORRADORES de documentación electrónica (comprobante y
 * guía de remisión) con la estructura aproximada de la API de NubeFact.
 *
 * ⚠ NADA DE ESTO SE ENVÍA A NINGÚN SERVICIO. Es JSON local para que la
 * facturadora lo compare campo por campo contra el manual oficial.
 *
 * TODO — Pendiente: reemplazar generación de borrador por llamada real a la
 * API de NubeFact (POST a la ruta configurada con el token), una vez
 * confirmada la estructura exacta de campos contra el manual oficial y
 * rotado el token de forma segura (variables de entorno NUBEFACT_API_URL y
 * NUBEFACT_API_TOKEN, nunca en el repo).
 *
 * Los nombres de campo salen de la documentación pública de NubeFact y
 * están SIN CONFIRMAR. Cada payload lleva un bloque `_borrador` con las
 * advertencias que un humano tiene que resolver; ese bloque hay que
 * quitarlo antes de enviar nada de verdad.
 */

import { esRucContribuyenteValido, type TipoComprobantePermitido } from "./customers";
import { valorUnitarioSinIgv } from "./orders";

export const AVISO_BORRADOR =
  "BORRADOR SIN VALIDAR — generado localmente para revisión humana. No se envió a NubeFact. " +
  "Los nombres y códigos de campo están sin confirmar contra el manual oficial.";

/** NubeFact: 1 = Factura, 2 = Boleta. Sin confirmar. */
export const TIPO_DE_COMPROBANTE: Record<"FACTURA" | "BOLETA", number> = {
  FACTURA: 1,
  BOLETA: 2,
};

/** NubeFact: 6 = RUC, 1 = DNI. Sin confirmar. */
export const TIPO_DE_DOCUMENTO_CLIENTE = { RUC: 6, DNI: 1 } as const;

/**
 * Serie del comprobante. PLACEHOLDER: la serie real la autoriza SUNAT y se
 * configura en NubeFact, no la inventa esta app. Queda como advertencia en
 * el borrador.
 */
const SERIE_PLACEHOLDER: Record<"FACTURA" | "BOLETA", string> = {
  FACTURA: "F001",
  BOLETA: "B001",
};

export type DraftItem = {
  codigo: string;
  descripcion: string;
  unidadMedida: string;
  cantidad: number;
  /** Precio unitario CON IGV incluido, tal como lo grabó submit_order. */
  precioUnitario: number;
  igv: number;
  subtotal: number;
  total: number;
  afectacionTributaria: "GRAVADO" | "INAFECTO";
  tasaIgv: number;
  /** Peso unitario, si el producto lo tiene registrado. */
  pesoUnitario: number | null;
};

export type DraftOrderData = {
  numero: number;
  fechaEmision: string;
  cliente: {
    razonSocial: string;
    rucODocumento: string;
    direccion: string | null;
    /** Ubigeo de la dirección de entrega (orders.ubigeo_snapshot). */
    ubigeoCodigo: string | null;
  };
  vendedor: string | null;
  condicionPago: string | null;
  tipoComprobantePermitido: TipoComprobantePermitido;
  items: DraftItem[];
};

/** Datos legales del emisor, de pedidos.company_settings. */
export type DraftEmisorData = {
  razonSocial: string;
  ruc: string;
  direccion: string;
  ubigeoCodigo: string | null;
  telefono: string | null;
  email: string | null;
};

/**
 * Línea realmente despachada (de fulfillment_items). La GRE describe lo
 * que SALIÓ del almacén, no lo que se pidió, y es de acá de donde salen el
 * lote y el vencimiento capturados por Operaciones.
 */
export type DraftLineaDespachada = {
  codigo: string;
  descripcion: string;
  unidadMedida: string;
  cantidadPreparada: number;
  lote: string | null;
  fechaVencimiento: string | null;
  pesoUnitario: number | null;
};

export type DraftFulfillmentData = {
  fuenteStock: string | null;
  almacen: string | null;
  /** Dirección del almacén de salida (warehouses.direccion). */
  direccionPartida: string | null;
  /** Ubigeo del almacén de salida (warehouses.ubigeo_codigo). */
  ubigeoPartida: string | null;
  vehiculo: string | null;
  chofer: string | null;
  transportista: string | null;
  fechaDespacho: string | null;
  /** Líneas realmente despachadas; si viene vacío se cae a las del pedido. */
  lineasDespachadas: DraftLineaDespachada[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fechaISO(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // NubeFact usa dd-mm-yyyy en fecha_de_emision, según la doc pública.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

/**
 * Qué comprobante corresponde.
 *
 * OJO — hueco real del modelo: `orders` NO guarda qué comprobante eligió el
 * vendedor. Hoy nadie lo elige al tomar el pedido. Así que:
 *  - si el cliente solo admite uno, ese es.
 *  - si admite FACTURA_O_BOLETA, no hay dato: se usa FACTURA y se emite una
 *    advertencia para que un humano lo confirme. No se adivina en silencio.
 */
export function resolverTipoComprobante(permitido: TipoComprobantePermitido): {
  tipo: "FACTURA" | "BOLETA";
  sinDefinir: boolean;
} {
  if (permitido === "FACTURA") return { tipo: "FACTURA", sinDefinir: false };
  if (permitido === "BOLETA") return { tipo: "BOLETA", sinDefinir: false };
  return { tipo: "FACTURA", sinDefinir: true };
}

export type DraftResult<T> = { payload: T; advertencias: string[] };

/** Bloque de emisor común a comprobante y guía. */
function emisorPayload(emisor: DraftEmisorData) {
  return {
    ruc: emisor.ruc,
    razon_social: emisor.razonSocial,
    direccion: emisor.direccion,
    ubigeo: emisor.ubigeoCodigo ?? "",
    telefono: emisor.telefono ?? "",
    email: emisor.email ?? "",
  };
}

/** dd/mm/aaaa — el formato que usa la descripción de la guía. */
export function formatFechaVencimiento(fecha: string): string {
  const soloFecha = fecha.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(soloFecha);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return fecha;
}

/**
 * Descripción del item en la guía. Formato tomado de una GRE real ya
 * emitida: el lote y el vencimiento van CONCATENADOS en la descripción, no
 * en campos aparte.
 *
 *   "VITACAPIL SHAMPOO CJA X 1 FCO X 380 ML LT: 2030056 FV: 31/03/2029"
 *
 * Si el producto no controla lote ni vencimiento, la descripción va sola,
 * sin sufijo. Si solo hay uno de los dos, se agrega solo ese — no se
 * inventa el que falta.
 */
export function descripcionConLoteYVencimiento(input: {
  descripcion: string;
  lote: string | null;
  fechaVencimiento: string | null;
}): string {
  let out = input.descripcion.trim();
  if (input.lote && input.lote.trim() !== "") out += ` LT: ${input.lote.trim()}`;
  if (input.fechaVencimiento && input.fechaVencimiento.trim() !== "") {
    out += ` FV: ${formatFechaVencimiento(input.fechaVencimiento.trim())}`;
  }
  return out;
}

export function buildComprobanteBorrador(
  data: DraftOrderData,
  emisor: DraftEmisorData,
): DraftResult<Record<string, unknown>> {
  const advertencias: string[] = [];
  const { tipo, sinDefinir } = resolverTipoComprobante(data.tipoComprobantePermitido);

  if (sinDefinir) {
    advertencias.push(
      "El cliente admite FACTURA o BOLETA y el pedido no registra cuál eligió el vendedor " +
        "(orders no tiene ese campo todavía). Se asumió FACTURA — confirmar antes de emitir.",
    );
  }

  const esRuc = esRucContribuyenteValido(data.cliente.rucODocumento);
  if (tipo === "FACTURA" && !esRuc) {
    advertencias.push(
      "Se resolvió FACTURA pero el documento del cliente no es un RUC de contribuyente válido. " +
        "SUNAT no admite factura sin RUC; corregir el documento o emitir boleta.",
    );
  }
  if (!data.cliente.direccion) {
    advertencias.push("El cliente no tiene dirección registrada en el comprobante.");
  }

  advertencias.push(
    "El bloque `emisor` sale de pedidos.company_settings. NubeFact normalmente toma al emisor " +
      "de la configuración de la cuenta, así que este bloque puede sobrar en el payload real — " +
      "confirmar contra el manual.",
  );

  advertencias.push(
    `La serie "${SERIE_PLACEHOLDER[tipo]}" y el número ${data.numero} son PLACEHOLDER. ` +
      "La serie real la autoriza SUNAT y el correlativo fiscal lo lleva NubeFact; " +
      "orders.numero es el número interno del pedido, no el del comprobante.",
  );

  const totalGravada = round2(
    data.items.filter((i) => i.afectacionTributaria === "GRAVADO").reduce((s, i) => s + i.subtotal, 0),
  );
  const totalInafecta = round2(
    data.items.filter((i) => i.afectacionTributaria === "INAFECTO").reduce((s, i) => s + i.subtotal, 0),
  );
  const totalIgv = round2(data.items.reduce((s, i) => s + i.igv, 0));
  const total = round2(data.items.reduce((s, i) => s + i.total, 0));

  const payload = {
    _borrador: {
      aviso: AVISO_BORRADOR,
      generado_por: "erp-logisalud-pedidos",
      pedido_numero: data.numero,
      advertencias,
      quitar_este_bloque_antes_de_enviar: true,
    },
    operacion: "generar_comprobante",
    emisor: emisorPayload(emisor),
    tipo_de_comprobante: TIPO_DE_COMPROBANTE[tipo],
    serie: SERIE_PLACEHOLDER[tipo],
    numero: data.numero,
    sunat_transaction: 1,
    cliente_tipo_de_documento: esRuc ? TIPO_DE_DOCUMENTO_CLIENTE.RUC : TIPO_DE_DOCUMENTO_CLIENTE.DNI,
    cliente_numero_de_documento: data.cliente.rucODocumento,
    cliente_denominacion: data.cliente.razonSocial,
    cliente_direccion: data.cliente.direccion ?? "",
    fecha_de_emision: fechaISO(data.fechaEmision),
    moneda: 1,
    porcentaje_de_igv: data.items[0]?.tasaIgv ?? 18,
    total_gravada: totalGravada,
    total_inafecta: totalInafecta,
    total_igv: totalIgv,
    total,
    // Referencias internas, no fiscales — útiles para que la facturadora
    // cruce el borrador con el pedido.
    observaciones: [
      `Pedido interno #${data.numero}`,
      data.vendedor ? `Vendedor: ${data.vendedor}` : null,
      data.condicionPago ? `Condición de pago: ${data.condicionPago}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    items: data.items.map((i) => ({
      unidad_de_medida: i.unidadMedida,
      codigo: i.codigo,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      // `precio_unitario` en la base YA incluye IGV (las listas de canal son
      // precio final), así que el valor unitario del comprobante —que va sin
      // IGV— se deriva hacia atrás en vez de multiplicar hacia adelante.
      valor_unitario: valorUnitarioSinIgv(i.precioUnitario, i.afectacionTributaria, i.tasaIgv),
      precio_unitario: round2(i.precioUnitario),
      subtotal: i.subtotal,
      tipo_de_igv: i.afectacionTributaria === "GRAVADO" ? 1 : 8,
      igv: i.igv,
      total: i.total,
    })),
  };

  return { payload, advertencias };
}

/** NubeFact GRE: 01 = venta. Sin confirmar. */
const MOTIVO_TRASLADO_VENTA = "01";
/** 01 = transporte público (tercero), 02 = privado (propio). Sin confirmar. */
const TIPO_TRANSPORTE = { PUBLICO: "01", PRIVADO: "02" } as const;

export function buildGuiaRemisionBorrador(
  data: DraftOrderData,
  fulfillment: DraftFulfillmentData,
  emisor: DraftEmisorData,
): DraftResult<Record<string, unknown>> {
  const advertencias: string[] = [
    AVISO_BORRADOR,
    "La serie y el número de la guía son PLACEHOLDER; los autoriza SUNAT y los lleva NubeFact.",
  ];

  const esPropio = fulfillment.transportista === null;
  const tipoTransporte = esPropio ? TIPO_TRANSPORTE.PRIVADO : TIPO_TRANSPORTE.PUBLICO;

  if (esPropio && (!fulfillment.vehiculo || !fulfillment.chofer)) {
    advertencias.push(
      "Transporte privado sin vehículo o sin chofer completos; SUNAT exige placa y datos del conductor.",
    );
  }

  // La guía describe lo que SALIÓ del almacén. Si hay líneas despachadas
  // (fulfillment_items), se usan esas — traen el lote y el vencimiento que
  // capturó Operaciones. Si no, se cae a las del pedido y se avisa.
  const usandoDespacho = fulfillment.lineasDespachadas.length > 0;
  const lineas: DraftLineaDespachada[] = usandoDespacho
    ? fulfillment.lineasDespachadas
    : data.items.map((i) => ({
        codigo: i.codigo,
        descripcion: i.descripcion,
        unidadMedida: i.unidadMedida,
        cantidadPreparada: i.cantidad,
        lote: null,
        fechaVencimiento: null,
        pesoUnitario: i.pesoUnitario,
      }));

  if (!usandoDespacho) {
    advertencias.push(
      "No se encontraron líneas de despacho (fulfillment_items); la guía se armó con las líneas " +
        "del pedido, sin lote ni vencimiento. Verificar antes de emitir.",
    );
  }

  // El peso bruto es obligatorio en la GRE. products.peso_unitario_futuro
  // sigue sin cargar para buena parte del catálogo: se calcula con lo que
  // hay y se avisa de lo que falta.
  const sinPeso = lineas.filter((l) => l.pesoUnitario === null);
  const pesoBrutoTotal = round2(
    lineas.reduce((s, l) => s + (l.pesoUnitario ?? 0) * l.cantidadPreparada, 0),
  );
  if (sinPeso.length > 0) {
    advertencias.push(
      `${sinPeso.length} de ${lineas.length} producto(s) no tienen peso unitario registrado ` +
        `(${sinPeso.map((l) => l.codigo).join(", ")}), así que peso_bruto_total (${pesoBrutoTotal}) ` +
        "está incompleto. SUNAT exige el peso bruto real en la guía.",
    );
  }

  // Punto de partida: el almacén de salida. Resuelto para los almacenes con
  // dirección y ubigeo cargados; advertido para los que no.
  if (!fulfillment.direccionPartida) {
    advertencias.push(
      `El almacén de salida${fulfillment.almacen ? ` (${fulfillment.almacen})` : ""} no tiene ` +
        "dirección registrada; cargarla en Maestros → Despacho antes de emitir.",
    );
  }
  if (!fulfillment.ubigeoPartida) {
    advertencias.push(
      `El almacén de salida${fulfillment.almacen ? ` (${fulfillment.almacen})` : ""} no tiene ` +
        "ubigeo registrado; la guía lo exige como punto de partida.",
    );
  }
  if (!data.cliente.direccion) {
    advertencias.push("El cliente no tiene dirección de llegada registrada.");
  }
  if (!data.cliente.ubigeoCodigo) {
    advertencias.push(
      "La dirección de entrega del cliente no tiene ubigeo; la guía lo exige como punto de llegada.",
    );
  }

  const esRuc = esRucContribuyenteValido(data.cliente.rucODocumento);

  const payload = {
    _borrador: {
      aviso: AVISO_BORRADOR,
      generado_por: "erp-logisalud-pedidos",
      pedido_numero: data.numero,
      advertencias,
      quitar_este_bloque_antes_de_enviar: true,
    },
    operacion: "generar_guia",
    emisor: emisorPayload(emisor),
    tipo_de_comprobante: 7,
    serie: "T001",
    numero: data.numero,
    cliente_tipo_de_documento: esRuc ? TIPO_DE_DOCUMENTO_CLIENTE.RUC : TIPO_DE_DOCUMENTO_CLIENTE.DNI,
    cliente_numero_de_documento: data.cliente.rucODocumento,
    cliente_denominacion: data.cliente.razonSocial,
    cliente_destinatario: data.cliente.razonSocial,
    fecha_de_emision: fechaISO(fulfillment.fechaDespacho ?? data.fechaEmision),
    motivo_de_traslado: MOTIVO_TRASLADO_VENTA,
    peso_bruto_total: pesoBrutoTotal,
    peso_bruto_unidad_de_medida: "KGM",
    numero_de_bultos: lineas.length,
    tipo_de_transporte: tipoTransporte,
    fecha_de_inicio_de_traslado: fechaISO(fulfillment.fechaDespacho ?? data.fechaEmision),
    transportista_documento_tipo: esPropio ? "" : TIPO_DE_DOCUMENTO_CLIENTE.RUC,
    transportista_denominacion: fulfillment.transportista ?? "",
    transportista_placa_numero: esPropio ? (fulfillment.vehiculo ?? "") : "",
    conductor_denominacion: esPropio ? (fulfillment.chofer ?? "") : "",
    punto_de_partida_direccion: fulfillment.direccionPartida ?? "",
    punto_de_partida_ubigeo: fulfillment.ubigeoPartida ?? "",
    punto_de_llegada_direccion: data.cliente.direccion ?? "",
    punto_de_llegada_ubigeo: data.cliente.ubigeoCodigo ?? "",
    // Referencia interna para cruzar con el despacho.
    observaciones: [
      `Pedido interno #${data.numero}`,
      fulfillment.fuenteStock ? `Fuente: ${fulfillment.fuenteStock}` : null,
      fulfillment.almacen ? `Almacén: ${fulfillment.almacen}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    items: lineas.map((l) => ({
      unidad_de_medida: l.unidadMedida,
      codigo: l.codigo,
      // Lote y vencimiento van CONCATENADOS acá, no en campos aparte —
      // formato tomado de una GRE real ya emitida.
      descripcion: descripcionConLoteYVencimiento({
        descripcion: l.descripcion,
        lote: l.lote,
        fechaVencimiento: l.fechaVencimiento,
      }),
      cantidad: l.cantidadPreparada,
    })),
  };

  return { payload, advertencias };
}
