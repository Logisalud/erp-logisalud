import { describe, expect, it } from "vitest";
import {
  armarHojaDeRuta,
  repartirEnLaSemana,
  diaAnterior,
  diaSemanaISO,
  hoyEnLima,
  type ParaPreparar,
} from "@/domain/ruteo";

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

describe("el corte de 'desde ayer'", () => {
  it("toma el día de Perú, no el del servidor en UTC", () => {
    // 27/10 a las 00:30 UTC es todavía el 26 en Lima (UTC-5). Sin esto, un
    // pedido enviado a las 7 de la noche quedaría del día siguiente y el
    // corte lo dejaría afuera.
    expect(hoyEnLima(new Date("2026-10-27T00:30:00Z"))).toBe("2026-10-26");
    expect(hoyEnLima(new Date("2026-10-27T05:00:00Z"))).toBe("2026-10-27");

    expect(diaAnterior("2026-10-27")).toBe("2026-10-26");
    // Cruza el fin de mes sin pedir ayuda a ninguna librería.
    expect(diaAnterior("2026-11-01")).toBe("2026-10-31");
    expect(diaAnterior("2026-01-01")).toBe("2025-12-31");
  });
});

describe("repartirEnLaSemana", () => {
  // El plan real: cada zona dos veces por semana, dos zonas por día.
  const PLAN = [
    { dia: 1, zonaIds: [5, 3] },
    { dia: 2, zonaIds: [1, 2] },
    { dia: 3, zonaIds: [4, 3] },
    { dia: 4, zonaIds: [5, 4] },
    { dia: 5, zonaIds: [1, 2] },
  ];

  const sur = (numero: number) => pedido({ numero, zonaId: 1, zonaNombre: "Sur", ordenZona: 1 });
  const centro = (numero: number) =>
    pedido({ numero, zonaId: 3, zonaNombre: "Centro", ordenZona: 3, distrito: "LIMA" });

  it("manda cada pedido al próximo día en que se visita su zona", () => {
    // Lunes: Sur se visita martes y viernes, así que le toca el martes.
    const semana = repartirEnLaSemana([sur(1), centro(2)], PLAN, 1);

    const porDia = Object.fromEntries(semana.dias.map((d) => [d.dia, d.pedidos.map((p) => p.numero)]));
    expect(porDia[2]).toEqual([1]);
    expect(porDia[1]).toEqual([2]); // Centro se visita hoy mismo
    expect(porDia[5]).toEqual([]);
  });

  it("da la vuelta a la semana cuando la zona ya pasó", () => {
    // Jueves: Centro se visita lunes y miércoles, los dos ya pasaron esta
    // semana, así que le toca el lunes que viene.
    const semana = repartirEnLaSemana([centro(7)], PLAN, 4);
    expect(semana.dias.find((d) => d.dia === 1)?.pedidos.map((p) => p.numero)).toEqual([7]);
  });

  it("cuenta cada pedido una sola vez aunque su zona se visite dos veces", () => {
    const semana = repartirEnLaSemana([sur(1), sur(2), sur(3)], PLAN, 1);
    const total = semana.dias.reduce((acc, d) => acc + d.pedidos.length, 0);
    expect(total).toBe(3);
  });

  it("cuenta destinos, no pedidos: dos del mismo cliente son una parada", () => {
    const semana = repartirEnLaSemana(
      [sur(1), pedido({ numero: 2, razonSocial: "BOTICA X" }), pedido({ numero: 3, razonSocial: "OTRA" })],
      PLAN,
      1,
    );
    const martes = semana.dias.find((d) => d.dia === 2);
    expect(martes?.pedidos.length).toBe(3);
    expect(martes?.destinos).toBe(2);
  });

  it("aparta lo que no tiene día en vez de perderlo", () => {
    const provincia = pedido({ numero: 9, zonaId: null, zonaNombre: null, ordenZona: null, distrito: "TRUJILLO" });
    const semana = repartirEnLaSemana([sur(1), provincia], PLAN, 1);

    expect(semana.sinDia.map((p) => p.numero)).toEqual([9]);
    expect(semana.dias.reduce((acc, d) => acc + d.pedidos.length, 0)).toBe(1);
  });
});
