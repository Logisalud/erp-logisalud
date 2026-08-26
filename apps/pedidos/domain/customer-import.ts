/**
 * Parser y mapeo puro de la cartera real de clientes exportada del
 * sistema del piloto de WhatsApp (CSV). La lectura del archivo y la
 * escritura en Supabase viven en services/customers-import.ts; acá solo
 * hay transformación de datos, para poder testear el criterio completo
 * sin base de datos ni archivos.
 *
 * El CSV de vendedores del origen trae una columna `token_acceso` con
 * tokens en claro. Este módulo lee de ese archivo ÚNICAMENTE `id` y
 * `codigo` — ver buildLegacyVendorMap. Ningún token llega a un tipo, a
 * un log ni a la base de datos.
 */

import {
  resolveEstadoInicialImportacion,
  resolveTipoComprobantePermitido,
  type CustomerEstado,
  type TipoComprobantePermitido,
} from "./customers";

export type CsvTable = {
  headers: string[];
  /** Filas como mapa cabecera->valor. rowNumber es 1-indexado sobre el archivo (la cabecera es 1). */
  rows: Array<{ rowNumber: number; values: Record<string, string> }>;
};

export type RowIssue = {
  rowNumber: number;
  code: string;
  message: string;
};

/**
 * Parser CSV mínimo pero correcto sobre el subconjunto de RFC 4180 que
 * usan estos archivos: comillas dobles opcionales, comillas escapadas
 * duplicándolas, y saltos de línea dentro de un campo entrecomillado
 * (las razones sociales del origen traen comas y comillas).
 */
export function parseCsv(text: string): CsvTable {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < withoutBom.length; i++) {
    const char = withoutBom[i];

    if (inQuotes) {
      if (char === '"') {
        if (withoutBom[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  // Última fila si el archivo no termina en salto de línea.
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows = records
    .slice(1)
    .map((cells, index) => ({ cells, rowNumber: index + 2 }))
    // Fila totalmente vacía (típica al final del archivo): se ignora.
    .filter(({ cells }) => cells.some((c) => c.trim() !== ""))
    .map(({ cells, rowNumber }) => {
      const values: Record<string, string> = {};
      headers.forEach((header, i) => {
        values[header] = (cells[i] ?? "").trim();
      });
      return { rowNumber, values };
    });

  return { headers, rows };
}

/**
 * Mapa uuid-del-origen -> código de representante, armado desde el CSV de
 * vendedores. Solo se leen las columnas `id` y `codigo`: el resto del
 * archivo (incluido token_acceso) se descarta acá y no sale de esta
 * función.
 */
export function buildLegacyVendorMap(vendedores: CsvTable): {
  codigoByLegacyId: Map<string, string>;
  errors: RowIssue[];
} {
  const codigoByLegacyId = new Map<string, string>();
  const errors: RowIssue[] = [];

  for (const { rowNumber, values } of vendedores.rows) {
    const legacyId = values["id"] ?? "";
    const codigo = values["codigo"] ?? "";
    if (!legacyId || !codigo) {
      errors.push({
        rowNumber,
        code: "VENDOR_ROW_INCOMPLETA",
        message: "Fila de vendedor sin id o sin código — no se puede usar para mapear clientes.",
      });
      continue;
    }
    codigoByLegacyId.set(legacyId, codigo);
  }

  return { codigoByLegacyId, errors };
}

export type ImportRefs = {
  /** codigo_zona (ej. "LIMH02") -> pedidos.zones.id */
  zoneIdByCodigo: Map<string, number>;
  /** codigo_representante (ej. "CRP1001") -> pedidos.sellers.id */
  sellerIdByCodigo: Map<string, string>;
  /** zone id -> codigo_zona, para derivar la zona desde el vendedor */
  zoneCodigoBySellerCodigo: Map<string, string>;
  /** uuid del sistema de origen -> codigo_representante */
  codigoByLegacyId: Map<string, string>;
};

export type MappedCustomer = {
  rowNumber: number;
  rucODocumento: string;
  razonSocial: string;
  zonaId: number | null;
  vendedorId: string;
  vendedorCodigo: string;
  tipoComprobantePermitido: TipoComprobantePermitido;
  estado: CustomerEstado;
  zonaAsignadaManualmente: boolean;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  celular: string | null;
  /** Presente solo si el origen trae vendedor anterior + fecha de reasignación. */
  reasignacion: {
    vendedorAnteriorId: string;
    fechaReasignacion: string;
  } | null;
};

export type MapCustomersResult = {
  customers: MappedCustomer[];
  errors: RowIssue[];
  warnings: RowIssue[];
};

function orNull(value: string): string | null {
  return value === "" ? null : value;
}

/**
 * Mapea las filas del CSV de clientes al modelo de pedidos.customers.
 *
 * Criterios (ver docs/business-rules.md):
 *  - El vendedor sale de `vendedor_actual_id`, que en el origen ya
 *    refleja los overrides manuales. `vendedor_manual_id` no se usa.
 *  - La zona sale de `codigo_zona`. Si viene vacía se deriva de la zona
 *    del vendedor, con warning: dejarla en null esconde al cliente de su
 *    propio vendedor, porque la RLS de customers filtra por zona.
 *  - Estado y tipo de comprobante se derivan del documento; no vienen en
 *    el archivo.
 *  - Un cliente sin vendedor resoluble es error, no warning: sin
 *    vendedor ni zona el registro es inservible.
 */
export function mapCustomerRows(clientes: CsvTable, refs: ImportRefs): MapCustomersResult {
  const customers: MappedCustomer[] = [];
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  for (const { rowNumber, values } of clientes.rows) {
    const ruc = (values["ruc"] ?? "").trim();
    const razonSocial = (values["razon_social"] ?? "").trim();

    if (!ruc) {
      errors.push({ rowNumber, code: "RUC_FALTANTE", message: "Fila sin RUC/documento." });
      continue;
    }
    if (!razonSocial) {
      errors.push({
        rowNumber,
        code: "RAZON_SOCIAL_FALTANTE",
        message: `${ruc}: fila sin razón social.`,
      });
      continue;
    }

    const vendedorCodigo = refs.codigoByLegacyId.get(values["vendedor_actual_id"] ?? "");
    if (!vendedorCodigo) {
      errors.push({
        rowNumber,
        code: "VENDEDOR_NO_RESUELTO",
        message: `${ruc}: vendedor_actual_id no corresponde a ningún vendedor del archivo de vendedores.`,
      });
      continue;
    }
    const vendedorId = refs.sellerIdByCodigo.get(vendedorCodigo);
    if (!vendedorId) {
      errors.push({
        rowNumber,
        code: "VENDEDOR_NO_EN_CATALOGO",
        message: `${ruc}: el vendedor ${vendedorCodigo} no existe en pedidos.sellers.`,
      });
      continue;
    }

    let codigoZona = values["codigo_zona"] ?? "";
    if (!codigoZona) {
      const derivado = refs.zoneCodigoBySellerCodigo.get(vendedorCodigo);
      if (derivado) {
        codigoZona = derivado;
        warnings.push({
          rowNumber,
          code: "ZONA_DERIVADA_DEL_VENDEDOR",
          message: `${ruc}: sin codigo_zona en el origen; se asigna ${derivado} por la zona de su vendedor ${vendedorCodigo}.`,
        });
      }
    }

    const zonaId = codigoZona ? (refs.zoneIdByCodigo.get(codigoZona) ?? null) : null;
    if (codigoZona && zonaId === null) {
      errors.push({
        rowNumber,
        code: "ZONA_NO_EN_CATALOGO",
        message: `${ruc}: el código de zona ${codigoZona} no existe en pedidos.zones.`,
      });
      continue;
    }
    if (zonaId === null) {
      warnings.push({
        rowNumber,
        code: "SIN_ZONA",
        message: `${ruc}: queda sin zona — no será visible para vendedores por RLS.`,
      });
    }

    const estado = resolveEstadoInicialImportacion(ruc);
    if (estado === "PENDIENTE_DE_VALIDACION") {
      warnings.push({
        rowNumber,
        code: "DOCUMENTO_NO_ES_RUC",
        message: `${ruc}: no es RUC de contribuyente; entra PENDIENTE_DE_VALIDACION y solo BOLETA.`,
      });
    }

    // Reasignación: solo si el origen trae ambos datos y el vendedor
    // anterior es resoluble. Si falta la fecha no se inventa una.
    const anteriorCodigo = refs.codigoByLegacyId.get(values["vendedor_anterior_id"] ?? "");
    const anteriorId = anteriorCodigo ? refs.sellerIdByCodigo.get(anteriorCodigo) : undefined;
    const fechaReasignacion = (values["fecha_reasignacion"] ?? "").trim();
    let reasignacion: MappedCustomer["reasignacion"] = null;
    if (anteriorId && fechaReasignacion && anteriorId !== vendedorId) {
      reasignacion = { vendedorAnteriorId: anteriorId, fechaReasignacion };
    } else if ((values["vendedor_anterior_id"] ?? "").trim() && !reasignacion) {
      warnings.push({
        rowNumber,
        code: "REASIGNACION_INCOMPLETA",
        message: `${ruc}: trae vendedor_anterior_id pero no se pudo registrar el historial (falta fecha, vendedor no resoluble, o es el mismo vendedor).`,
      });
    }

    customers.push({
      rowNumber,
      rucODocumento: ruc,
      razonSocial,
      zonaId,
      vendedorId,
      vendedorCodigo,
      tipoComprobantePermitido: resolveTipoComprobantePermitido(ruc),
      estado,
      zonaAsignadaManualmente: (values["zona_manual"] ?? "").toLowerCase() === "true",
      distrito: orNull(values["distrito"] ?? ""),
      provincia: orNull(values["provincia"] ?? ""),
      departamento: orNull(values["departamento"] ?? ""),
      celular: orNull(values["celular"] ?? ""),
      reasignacion,
    });
  }

  // RUC duplicado en el archivo: se descartan TODAS las filas con ese
  // RUC en vez de adivinar cuál es la buena — mismo criterio que el
  // importador de listas de precios con los códigos duplicados.
  const countByRuc = new Map<string, number>();
  for (const c of customers) {
    countByRuc.set(c.rucODocumento, (countByRuc.get(c.rucODocumento) ?? 0) + 1);
  }
  const duplicados = new Set(
    Array.from(countByRuc.entries())
      .filter(([, count]) => count > 1)
      .map(([ruc]) => ruc),
  );
  for (const c of customers) {
    if (duplicados.has(c.rucODocumento)) {
      errors.push({
        rowNumber: c.rowNumber,
        code: "RUC_DUPLICADO",
        message: `RUC duplicado en el archivo: ${c.rucODocumento}.`,
      });
    }
  }

  return {
    customers: customers.filter((c) => !duplicados.has(c.rucODocumento)),
    errors,
    warnings,
  };
}

export type MappedLegacySnapshot = {
  rowNumber: number;
  ruc: string;
  vendedorIdSnapshot: string | null;
};

/**
 * Snapshot legacy de cartera (clientes_vendedor_snap). Es referencia
 * histórica: no determina el vendedor actual de nadie. Una fila cuyo
 * vendedor no se puede resolver se carga igual con vendedor en null —
 * el ruc sigue siendo información útil — pero se reporta como warning.
 */
export function mapLegacySnapshotRows(
  snapshot: CsvTable,
  refs: Pick<ImportRefs, "codigoByLegacyId" | "sellerIdByCodigo">,
): { rows: MappedLegacySnapshot[]; errors: RowIssue[]; warnings: RowIssue[] } {
  const rows: MappedLegacySnapshot[] = [];
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  for (const { rowNumber, values } of snapshot.rows) {
    const ruc = (values["ruc"] ?? "").trim();
    if (!ruc) {
      errors.push({ rowNumber, code: "RUC_FALTANTE", message: "Fila de snapshot sin RUC." });
      continue;
    }
    const legacyId = (values["vendedor_actual_id"] ?? "").trim();
    const codigo = refs.codigoByLegacyId.get(legacyId);
    const vendedorIdSnapshot = codigo ? (refs.sellerIdByCodigo.get(codigo) ?? null) : null;

    if (legacyId && vendedorIdSnapshot === null) {
      warnings.push({
        rowNumber,
        code: "VENDEDOR_SNAPSHOT_NO_RESUELTO",
        message: `${ruc}: vendedor del snapshot no resoluble; se carga la fila sin vendedor.`,
      });
    }

    rows.push({ rowNumber, ruc, vendedorIdSnapshot });
  }

  return { rows, errors, warnings };
}
