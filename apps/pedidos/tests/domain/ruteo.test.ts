import { describe, expect, it } from "vitest";
import { armarHojaDeRuta, diaSemanaISO, type ParaPreparar } from "@/domain/ruteo";

function pedido(p: Partial<ParaPreparar> & { numero: number }): ParaPreparar {
  return {
    id: `o-${p.numero}`,
    razonSocial: "BOTICA X",
    direccion: "Av. Siempre Viva 123",
    distrito: "LURIN",
    zonaId: 1,
    zonaNombre: "Sur",
    ordenZona: 1,
    ordenDistrito: 6,
    fechaEnvio: "2026-10-27T12:00:00Z",
    celular: null,
    ...p,
  };
}

describe("armarHojaDeRuta", () => {
  it("ordena por zona y después por distrito, y numera las paradas corridas", () => {
    const hoja = armarHojaDeRuta([
      pedido({ numero: 3, zonaId: 5, zonaNombre: "Norte y Callao", ordenZona: 5, ordenDistrito: 3, distrito: "COMAS" }),
      pedido({ numero: 1, zonaId: 1, zonaNombre: "Sur", ordenZona: 1, ordenDistrito: 11, distrito: "CHORRILLOS" }),
      pedido({ numero: 2, zonaId: 1, zonaNombre: "Sur", ordenZona: 1, ordenDistrito: 6, distrito: "LURIN" }),
    ]);

    expect(hoja.grupos.map((g) => g.zonaNombre)).toEqual(["Sur", "Norte y Callao"]);
    expect(hoja.grupos[0].paradas.map((p) => p.distrito)).toEqual(["LURIN", "CHORRILLOS"]);
    // La numeración es de toda la hoja, no por zona: el chofer sigue una
    // sola lista de 1 a N.
    expect(hoja.grupos[0].paradas.map((p) => p.orden)).toEqual([1, 2]);
    expect(hoja.grupos[1].paradas[0].orden).toBe(3);
    expect(hoja.paradas).toBe(3);
  });

  it("junta los pedidos del mismo cliente y los cuenta como un solo destino", () => {
    const hoja = armarHojaDeRuta([
      pedido({ numero: 10, razonSocial: "BOTICA A" }),
      pedido({ numero: 20, razonSocial: "BOTICA B" }),
      pedido({ numero: 11, razonSocial: "BOTICA A" }),
    ]);

    expect(hoja.grupos[0].paradas.map((p) => p.numero)).toEqual([10, 11, 20]);
    expect(hoja.paradas).toBe(3);
    expect(hoja.destinos).toBe(2);
  });

  it("manda al final lo que no tiene zona, sin perderlo", () => {
    // Un pedido a provincia no se despacha en esta ruta, pero tampoco
    // puede desaparecer de la pantalla sin que nadie se entere.
    const hoja = armarHojaDeRuta([
      pedido({ numero: 9, zonaId: null, zonaNombre: null, ordenZona: null, ordenDistrito: null, distrito: "TRUJILLO" }),
      pedido({ numero: 1 }),
    ]);

    expect(hoja.grupos.map((g) => g.zonaNombre)).toEqual(["Sur", "Fuera de Lima y Callao"]);
    expect(hoja.paradas).toBe(2);
  });
});

describe("diaSemanaISO", () => {
  it("usa lunes = 1 y domingo = 7, como el plan semanal", () => {
    expect(diaSemanaISO(new Date(2026, 9, 26))).toBe(1); // lunes
    expect(diaSemanaISO(new Date(2026, 9, 30))).toBe(5); // viernes
    expect(diaSemanaISO(new Date(2026, 10, 1))).toBe(7); // domingo
  });
});
