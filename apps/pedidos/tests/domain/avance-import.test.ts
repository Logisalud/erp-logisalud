import { describe, expect, it } from "vitest";
import {
  ErrorDeFormato,
  parsearAvance,
  parsearDetalle,
  resumirCarga,
  type FilaCruda,
} from "@/domain/avance-import";

/**
 * El cuadro, con la forma real de la hoja "AVANCE 2026": dos filas de
 * rótulos arriba, los bloques AVANCE/CUOTA/% por semana, el bloque del
 * total, y las columnas por día al final.
 */
function hojaAvance(filas: FilaCruda[]): FilaCruda[] {
  const rotulos: FilaCruda = [];
  rotulos[20] = "Inicio mes";
  rotulos[22] = "Días del mes";

  const secciones: FilaCruda = [];
  secciones[1] = new Date(Date.UTC(2026, 9, 12));
  secciones[4] = "1RA SEMANA (01 AL 07)";
  secciones[7] = "2RA SEMANA (08 AL 14)";
  secciones[10] = "3RA SEMANA (15 AL 21)";
  secciones[13] = "4TA SEMANA (22 AL 31)";
  secciones[16] = "TOTAL VENTAS";
  secciones[20] = new Date(Date.UTC(2026, 9, 1));
  secciones[22] = 31;

  const cab: FilaCruda = [];
  cab[1] = "ZONAS LOGISALUD";
  cab[2] = "CODIGO";
  cab[3] = "VENDEDOR";
  for (const i of [4, 7, 10, 13, 16]) {
    cab[i] = "AVANCE";
    cab[i + 1] = "CUOTA";
    cab[i + 2] = "%";
  }
  cab[20] = "PROM. VTA. DIARIA";
  cab[21] = "PROY. LINEAL %";
  cab[22] = "CUOTA DIARIA 100%";
  cab[24] = 1;
  cab[25] = 2;
  cab[26] = 3;

  return [rotulos, secciones, cab, ...filas];
}

function fila(zona: unknown, codigo: unknown, vendedor: unknown, avance: number, cuota: number): FilaCruda {
  const f: FilaCruda = [];
  f[1] = zona as string;
  f[2] = codigo as string;
  f[3] = vendedor as string;
  f[4] = avance;
  f[5] = cuota;
  f[16] = avance;
  f[17] = cuota;
  f[20] = 90.01;
  f[24] = avance;
  return f;
}

describe("parsearAvance", () => {
  it("lee la cabecera: corte, inicio de mes, días y período", () => {
    const r = parsearAvance(hojaAvance([fila("SUR ESTE", "CRP1007", "Cinthya Vilchez", 1080.13, 31160)]));

    expect(r.fechaCorte).toBe("2026-10-12");
    expect(r.inicioMes).toBe("2026-10-01");
    expect(r.diasMes).toBe(31);
    expect(r.diasTranscurridos).toBe(12);
    expect(r.periodo).toBe("2026-10");
  });

  it("distingue total, grupo, vendedor y línea, y cuelga cada uno de su grupo", () => {
    const r = parsearAvance(
      hojaAvance([
        fila("TOTAL LOGISSA", null, null, -11372.28, 750000),
        fila("LIMA HORIZONTAL", null, null, 8487.29, 200880),
        fila("SUR ESTE", "CRP1007", "Cinthya Vilchez", 1080.13, 31160),
        fila("CRP1007 PRADES", "CRP1007", "PRADES", 1278.81, 2200),
        fila("REGIONES", null, null, 18560.53, 299340),
        fila("REGIÓN SUR COSTA", "DAQP01", "Malena Gaona", 1177.53, 35580),
      ]),
    );

    expect(r.filas.map((f) => f.tipo)).toEqual([
      "total",
      "grupo",
      "vendedor",
      "linea",
      "grupo",
      "vendedor",
    ]);
    expect(r.filas[2].grupo).toBe("LIMA HORIZONTAL");
    expect(r.filas[3].grupo).toBe("LIMA HORIZONTAL");
    expect(r.filas[5].grupo).toBe("REGIONES");
    // El total no cuelga de nadie, y después de él se empieza de cero.
    expect(r.filas[0].grupo).toBeNull();
  });

  it("no toma por vendedor una celda combinada que repite el nombre del grupo", () => {
    // Al leer el archivo, una celda combinada B:D devuelve el mismo texto
    // en CODIGO y en VENDEDOR. Sin distinguirlo, "TOTAL LOGISSA" entraba
    // como una línea de un vendedor llamado TOTAL LOGISSA.
    const r = parsearAvance(
      hojaAvance([
        fila("TOTAL LOGISSA", "TOTAL LOGISSA", "TOTAL LOGISSA", -11372.28, 750000),
        fila("SUR ESTE", "CRP1007", "Cinthya Vilchez", 1080.13, 31160),
      ]),
    );

    expect(r.filas[0].tipo).toBe("total");
    expect(r.filas[0].codigo).toBeNull();
    expect(r.filas[1].tipo).toBe("vendedor");
  });

  it("guarda las semanas y los días con movimiento, y redondea a dos decimales", () => {
    const f = fila("SUR ESTE", "CRP1007", "Cinthya Vilchez", 1080.13, 31160);
    f[16] = -11372.280000000006; // la basura binaria con la que viene de Excel
    f[24] = 0; // día sin venta
    f[25] = 137.27;

    const r = parsearAvance(hojaAvance([f]));

    expect(r.filas[0].avance).toBe(-11372.28);
    expect(r.filas[0].semanas[0]).toEqual({ avance: 1080.13, cuota: 31160 });
    expect(r.filas[0].porDia).toEqual({ "2": 137.27 });
  });

  it("avisa si la hoja no es la que espera", () => {
    expect(() => parsearAvance([[], [], []])).toThrow(ErrorDeFormato);
    // Encabezados correctos pero sin una sola fila de vendedor: es el
    // archivo equivocado, no una hoja vacía legítima.
    expect(() => parsearAvance(hojaAvance([fila("TOTAL LOGISSA", null, null, 0, 0)]))).toThrow(
      /no trae ninguna fila de vendedor/i,
    );
  });
});

describe("parsearDetalle", () => {
  const cab = [
    "TIPO",
    "RV",
    "Columna1",
    "FECHA",
    "TIPO DOCUMENTO",
    "NRO DOCUMENTO",
    "RUC",
    "RAZ_SOC",
    "PRODUCTO",
    "LINEA",
    "SUMA_CANTIDAD",
    "SUMA_NETO_VTA",
  ];

  it("lee las filas y limpia el RUC que viene como número", () => {
    const d = parsearDetalle([
      cab,
      [1, "CRP1007", "CINTHYA VILCHEZ", new Date(Date.UTC(2026, 9, 5)), "FACTURA", "FFF1-002711", 20100047218, "BOTICA", "PLUS CJA X 34", "OTC", 2, 180],
    ]);

    expect(d).toHaveLength(1);
    expect(d[0].codigo).toBe("CRP1007");
    expect(d[0].fecha).toBe("2026-10-05");
    expect(d[0].ruc).toBe("20100047218");
    expect(d[0].neto).toBe(180);
  });

  it("reconstruye el tipo de documento desde el código numérico", () => {
    // La columna "TIPO DOCUMENTO" es una fórmula con formato de fecha
    // encima: el lector devuelve una fecha inválida y se pierde el texto.
    // La columna "TIPO" trae el mismo dato como número.
    const invalida = new Date("no es una fecha");
    const d = parsearDetalle([
      cab,
      [7, "CKA2001", "TITO MINGUILLO", new Date(Date.UTC(2026, 9, 2)), invalida, "FC01-00230", 20545457386, "PIONERO", "DESCUENTO", "DESCUENTO", -1, -137.27],
      [3, "CKA2001", "TITO MINGUILLO", new Date(Date.UTC(2026, 9, 2)), invalida, "BBB1-001", 20545457386, "PIONERO", "X", "OTC", 1, 10],
      [99, "CKA2001", "TITO MINGUILLO", new Date(Date.UTC(2026, 9, 2)), invalida, "ZZZ1-001", 20545457386, "PIONERO", "X", "OTC", 1, 10],
    ]);

    expect(d.map((x) => x.tipoDocumento)).toEqual(["NOTA DE CREDITO", "BOLETA DE VENTA", "NO REGISTRADO"]);
  });

  it("se queja si falta una columna que no se puede inventar", () => {
    expect(() => parsearDetalle([["RV", "PRODUCTO"], ["CRP1007", "X"]])).toThrow(ErrorDeFormato);
  });
});

describe("resumirCarga", () => {
  it("cuenta lo que entra y avisa de los códigos sin vendedor", () => {
    const avance = parsearAvance(
      hojaAvance([
        fila("TOTAL LOGISSA", null, null, -11372.28, 750000),
        fila("SUR ESTE", "CRP1007", "Cinthya Vilchez", 1080.13, 31160),
        fila("CRP1007 PRADES", "CRP1007", "PRADES", 1278.81, 2200),
        fila("SUR ESTE", "CRP1009", "Vacante", 0, 16860),
      ]),
    );

    const r = resumirCarga(avance, [], new Set(["CRP1007"]));

    expect(r.vendedores).toBe(2);
    expect(r.lineas).toBe(1);
    expect(r.totalAvance).toBe(-11372.28);
    expect(r.totalCuota).toBe(750000);
    // CRP1009 no tiene vendedor cargado: su fila no la vería nadie.
    expect(r.codigosSinVendedor).toEqual(["CRP1009"]);
  });

  it("cuenta las líneas de detalle que no son de nadie, por código o por nombre", () => {
    // La columna RV del detalle viene vacía muy seguido y ahí lo único
    // que identifica al vendedor es el nombre. Lo que no se pueda
    // atribuir por ninguna de las dos vías no lo va a ver nadie.
    const avance = parsearAvance(
      hojaAvance([fila("SUR ESTE", "CRP1007", "Cinthya Vilchez", 1080.13, 31160)]),
    );
    const linea = (codigo: string | null, vendedor: string | null) =>
      ({ codigo, vendedor, neto: 10 }) as unknown as Parameters<typeof resumirCarga>[1][number];

    const r = resumirCarga(
      avance,
      [
        linea("CRP1007", null), // por código
        linea(null, "KARINA BENDEZU"), // por nombre, sin tilde
        linea(null, "Karina  Bendezú"), // por nombre, con espacio de más
        linea(null, "QUIEN SABE"), // de nadie
        linea(null, null), // de nadie
      ],
      new Set(["CRP1007"]),
      new Set(["KARINA BENDEZU"]),
    );

    expect(r.filasDetalle).toBe(5);
    expect(r.detalleSinVendedor).toBe(2);
  });
});
