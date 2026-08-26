import { describe, expect, it } from "vitest";
import {
  buildLegacyVendorMap,
  mapCustomerRows,
  mapLegacySnapshotRows,
  parseCsv,
  type ImportRefs,
} from "@/domain/customer-import";

const VENDEDORES_CSV = [
  "id,nombres,apellidos,email,telefono,activo,created_at,codigo,token_acceso,piloto_whatsapp",
  "v-luis,LUIS,VARGAS,,,true,2026-06-16 18:51:34+00,CRP1001,SECRETO_NO_DEBE_SALIR,true",
  "v-cinthya,CINTHYA,VILCHEZ,,,true,2026-06-16 18:51:34+00,CRP1007,OTRO_SECRETO,false",
  "v-omar,OMAR,RUBIO,,,true,2026-06-16 18:51:34+00,DTRU01,TERCER_SECRETO,true",
].join("\n");

function buildRefs(): ImportRefs {
  const { codigoByLegacyId } = buildLegacyVendorMap(parseCsv(VENDEDORES_CSV));
  return {
    zoneIdByCodigo: new Map([
      ["LIMH02", 2],
      ["LIMH06", 6],
      ["TRUM02", 12],
    ]),
    sellerIdByCodigo: new Map([
      ["CRP1001", "seller-luis"],
      ["CRP1007", "seller-cinthya"],
      ["DTRU01", "seller-omar"],
    ]),
    zoneCodigoBySellerCodigo: new Map([
      ["CRP1001", "LIMH02"],
      ["CRP1007", "LIMH06"],
      ["DTRU01", "TRUM02"],
    ]),
    codigoByLegacyId,
  };
}

const CLIENTES_HEADER =
  "ruc,razon_social,ubigeo,direccion,email,telefono,activo,created_at,vendedor_actual_id," +
  "vendedor_anterior_id,fecha_reasignacion,codigo_zona,vendedor_manual_id,zona_manual," +
  "distrito,provincia,departamento,celular";

function clientesCsv(...rows: string[]): string {
  return [CLIENTES_HEADER, ...rows].join("\n");
}

describe("parseCsv", () => {
  it("respeta comas y comillas dentro de un campo entrecomillado", () => {
    const table = parseCsv('a,b\n"EJEMPLO, S.R.L.","dice ""hola"""');
    expect(table.rows[0].values["a"]).toBe("EJEMPLO, S.R.L.");
    expect(table.rows[0].values["b"]).toBe('dice "hola"');
  });

  it("numera las filas respecto del archivo, contando la cabecera como fila 1", () => {
    const table = parseCsv("a\nx\ny");
    expect(table.rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it("ignora filas vacías y el BOM del inicio", () => {
    const table = parseCsv("﻿a,b\n1,2\n\n");
    expect(table.headers).toEqual(["a", "b"]);
    expect(table.rows).toHaveLength(1);
  });
});

describe("buildLegacyVendorMap", () => {
  it("mapea el uuid de origen al código de representante", () => {
    const { codigoByLegacyId } = buildLegacyVendorMap(parseCsv(VENDEDORES_CSV));
    expect(codigoByLegacyId.get("v-luis")).toBe("CRP1001");
    expect(codigoByLegacyId.size).toBe(3);
  });

  it("no expone el token de acceso del archivo de origen", () => {
    const { codigoByLegacyId } = buildLegacyVendorMap(parseCsv(VENDEDORES_CSV));
    const serializado = JSON.stringify(Array.from(codigoByLegacyId.entries()));
    expect(serializado).not.toContain("SECRETO");
  });
});

describe("mapCustomerRows", () => {
  it("mapea un cliente con RUC jurídico a ACTIVO y solo factura", () => {
    const csv = clientesCsv(
      "20100000001,CLINICA EJEMPLO,,,,,true,2026-07-08 22:26:51+00,v-luis,,,LIMH02,,false,SURCO,LIMA,LIMA,",
    );
    const { customers, errors } = mapCustomerRows(parseCsv(csv), buildRefs());

    expect(errors).toHaveLength(0);
    expect(customers[0]).toMatchObject({
      rucODocumento: "20100000001",
      razonSocial: "CLINICA EJEMPLO",
      zonaId: 2,
      vendedorId: "seller-luis",
      tipoComprobantePermitido: "FACTURA",
      estado: "ACTIVO",
      distrito: "SURCO",
      departamento: "LIMA",
      celular: null,
    });
  });

  it("un DNI cargado como RUC entra pendiente de validación, solo boleta, y avisa", () => {
    const csv = clientesCsv(
      "00000000003,PEREZ EJEMPLO JUAN CARLOS,,,,,true,2026-07-08 22:26:51+00,v-omar,,,TRUM02,,true,,,,969112933",
    );
    const { customers, warnings } = mapCustomerRows(parseCsv(csv), buildRefs());

    expect(customers[0]).toMatchObject({
      estado: "PENDIENTE_DE_VALIDACION",
      tipoComprobantePermitido: "BOLETA",
      zonaAsignadaManualmente: true,
      celular: "969112933",
    });
    expect(warnings.some((w) => w.code === "DOCUMENTO_NO_ES_RUC")).toBe(true);
  });

  it("deriva la zona del vendedor cuando el origen no trae codigo_zona", () => {
    const csv = clientesCsv(
      "20300000005,DISTRIBUIDORA EJEMPLO S.R.L.,,,,,true,2026-07-08 22:26:51+00,v-omar,,,,,false,,,,",
    );
    const { customers, warnings } = mapCustomerRows(parseCsv(csv), buildRefs());

    expect(customers[0].zonaId).toBe(12);
    expect(warnings.some((w) => w.code === "ZONA_DERIVADA_DEL_VENDEDOR")).toBe(true);
  });

  it("respeta el vendedor real aunque no sea el titular de su zona", () => {
    // Caso real: cliente en zona LIMH02 (titular CRP1001) atendido por
    // CRP1007. El vendedor NO se deriva de la zona.
    const csv = clientesCsv(
      "10300000004,BOTICA EJEMPLO,,,,,true,2026-07-08 22:26:51+00,v-cinthya,,,LIMH02,v-cinthya,true,,,,",
    );
    const { customers } = mapCustomerRows(parseCsv(csv), buildRefs());

    expect(customers[0].zonaId).toBe(2);
    expect(customers[0].vendedorId).toBe("seller-cinthya");
  });

  it("registra el historial cuando hay vendedor anterior y fecha", () => {
    const csv = clientesCsv(
      "20100000001,CLINICA EJEMPLO,,,,,true,2026-07-08 22:26:51+00,v-luis,v-omar,2026-07-01,LIMH02,,false,,,,",
    );
    const { customers } = mapCustomerRows(parseCsv(csv), buildRefs());

    expect(customers[0].reasignacion).toEqual({
      vendedorAnteriorId: "seller-omar",
      fechaReasignacion: "2026-07-01",
    });
  });

  it("no inventa una fecha de reasignación si el origen no la trae", () => {
    const csv = clientesCsv(
      "20100000001,CLINICA EJEMPLO,,,,,true,2026-07-08 22:26:51+00,v-luis,v-omar,,LIMH02,,false,,,,",
    );
    const { customers, warnings } = mapCustomerRows(parseCsv(csv), buildRefs());

    expect(customers[0].reasignacion).toBeNull();
    expect(warnings.some((w) => w.code === "REASIGNACION_INCOMPLETA")).toBe(true);
  });

  it("rechaza la fila si el vendedor no se puede resolver", () => {
    const csv = clientesCsv(
      "20100000001,CLINICA EJEMPLO,,,,,true,2026-07-08 22:26:51+00,v-desconocido,,,LIMH02,,false,,,,",
    );
    const { customers, errors } = mapCustomerRows(parseCsv(csv), buildRefs());

    expect(customers).toHaveLength(0);
    expect(errors[0].code).toBe("VENDEDOR_NO_RESUELTO");
  });

  it("rechaza la fila si la zona no existe en el catálogo", () => {
    const csv = clientesCsv(
      "20100000001,CLINICA EJEMPLO,,,,,true,2026-07-08 22:26:51+00,v-luis,,,ZZZZ99,,false,,,,",
    );
    const { customers, errors } = mapCustomerRows(parseCsv(csv), buildRefs());

    expect(customers).toHaveLength(0);
    expect(errors[0].code).toBe("ZONA_NO_EN_CATALOGO");
  });

  it("descarta todas las filas de un RUC duplicado en vez de adivinar", () => {
    const csv = clientesCsv(
      "20100000001,NOMBRE A,,,,,true,2026-07-08 22:26:51+00,v-luis,,,LIMH02,,false,,,,",
      "20100000001,NOMBRE B,,,,,true,2026-07-08 22:26:51+00,v-omar,,,TRUM02,,false,,,,",
    );
    const { customers, errors } = mapCustomerRows(parseCsv(csv), buildRefs());

    expect(customers).toHaveLength(0);
    expect(errors.filter((e) => e.code === "RUC_DUPLICADO")).toHaveLength(2);
  });

  it("rechaza filas sin RUC o sin razón social", () => {
    const csv = clientesCsv(
      ",SIN RUC,,,,,true,2026-07-08 22:26:51+00,v-luis,,,LIMH02,,false,,,,",
      "20100000001,,,,,,true,2026-07-08 22:26:51+00,v-luis,,,LIMH02,,false,,,,",
    );
    const { customers, errors } = mapCustomerRows(parseCsv(csv), buildRefs());

    expect(customers).toHaveLength(0);
    expect(errors.map((e) => e.code)).toEqual(["RUC_FALTANTE", "RAZON_SOCIAL_FALTANTE"]);
  });
});

describe("mapLegacySnapshotRows", () => {
  it("resuelve el vendedor del snapshot al catálogo actual", () => {
    const refs = buildRefs();
    const csv = "ruc,vendedor_actual_id\n20100000001,v-luis";
    const { rows, errors } = mapLegacySnapshotRows(parseCsv(csv), refs);

    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({ ruc: "20100000001", vendedorIdSnapshot: "seller-luis" });
  });

  it("carga la fila sin vendedor cuando el snapshot no lo trae, sin perder el ruc", () => {
    const refs = buildRefs();
    const csv = "ruc,vendedor_actual_id\n10000000006,";
    const { rows, warnings } = mapLegacySnapshotRows(parseCsv(csv), refs);

    expect(rows[0]).toMatchObject({ ruc: "10000000006", vendedorIdSnapshot: null });
    expect(warnings).toHaveLength(0);
  });
});
