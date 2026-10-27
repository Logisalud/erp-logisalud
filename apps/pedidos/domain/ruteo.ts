/**
 * Armado de la hoja de ruta: reglas puras, sin Next ni Supabase.
 *
 * El criterio sale del análisis de 2.894 guías de remisión que hizo
 * Administración (oct-2025 a oct-2026): cinco zonas, cada una visitada dos
 * veces por semana, dos zonas por día y zonas vecinas el mismo día.
 *
 * **Esto no es un optimizador de recorrido.** No mira kilómetros, tráfico,
 * capacidad del camión ni horarios de recepción del cliente. Ordena por un
 * orden de visita declarado en el catálogo (zona, después distrito), que es
 * exactamente lo que se hacía a mano. Decirlo importa: una hoja que se
 * presenta como "la ruta óptima" y manda al chofer a cruzar Lima dos veces
 * pierde la confianza de quien la usa.
 */

export type ParaPreparar = {
  id: string;
  numero: number;
  razonSocial: string;
  direccion: string | null;
  distrito: string | null;
  /** null = el destino no está en ninguna zona de reparto (provincia). */
  zonaId: number | null;
  zonaNombre: string | null;
  ordenZona: number | null;
  ordenDistrito: number | null;
  fechaEnvio: string | null;
  celular: string | null;
};

export type Parada = ParaPreparar & { orden: number };

export type GrupoDeRuta = {
  zonaId: number | null;
  zonaNombre: string;
  paradas: Parada[];
};

export type HojaDeRuta = {
  grupos: GrupoDeRuta[];
  paradas: number;
  /** Destinos distintos: dos pedidos del mismo cliente son UNA parada. */
  destinos: number;
  distritos: number;
};

/** Lunes = 1 … domingo = 7, igual que el plan semanal en la base. */
export function diaSemanaISO(fecha: Date): number {
  const d = fecha.getDay();
  return d === 0 ? 7 : d;
}

export const NOMBRE_DIA: Record<number, string> = {
  1: "lunes",
  2: "martes",
  3: "miércoles",
  4: "jueves",
  5: "viernes",
  6: "sábado",
  7: "domingo",
};

/** Lo que no tiene zona va al final, junto, y se llama por su nombre. */
const SIN_ZONA = "Fuera de Lima y Callao";

/**
 * Ordena los pedidos elegidos y los numera como paradas.
 *
 * El orden es: zona (`orden_ruta`), distrito (`orden_distrito`), y dentro
 * del distrito por cliente, para que dos pedidos de la misma botica salgan
 * pegados y el chofer baje una sola vez.
 */
export function armarHojaDeRuta(pedidos: ParaPreparar[]): HojaDeRuta {
  const ordenados = [...pedidos].sort((a, b) => {
    const za = a.ordenZona ?? 999;
    const zb = b.ordenZona ?? 999;
    if (za !== zb) return za - zb;
    const da = a.ordenDistrito ?? 99;
    const db = b.ordenDistrito ?? 99;
    if (da !== db) return da - db;
    const porDistrito = (a.distrito ?? "").localeCompare(b.distrito ?? "", "es");
    if (porDistrito !== 0) return porDistrito;
    const porCliente = a.razonSocial.localeCompare(b.razonSocial, "es");
    if (porCliente !== 0) return porCliente;
    return a.numero - b.numero;
  });

  const grupos: GrupoDeRuta[] = [];
  let orden = 0;

  for (const p of ordenados) {
    const nombre = p.zonaNombre ?? SIN_ZONA;
    let grupo = grupos.find((g) => g.zonaNombre === nombre);
    if (!grupo) {
      grupo = { zonaId: p.zonaId, zonaNombre: nombre, paradas: [] };
      grupos.push(grupo);
    }
    grupo.paradas.push({ ...p, orden: ++orden });
  }

  return {
    grupos,
    paradas: ordenados.length,
    destinos: new Set(ordenados.map((p) => `${p.razonSocial}|${p.direccion ?? ""}`)).size,
    distritos: new Set(ordenados.map((p) => p.distrito ?? "—")).size,
  };
}
