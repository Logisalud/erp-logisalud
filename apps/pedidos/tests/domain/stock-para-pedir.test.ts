import { describe, expect, it } from "vitest";
import { etiquetaDeStock, excedeElStock, hayStockParaPedir } from "@/domain/products";

/**
 * Lo que el almacén no tiene no se vende.
 *
 * Hasta ahora el vendedor armaba el pedido sin ver el stock: lo ofrecía,
 * el pedido entraba, y el problema aparecía recién en el despacho con el
 * cliente esperando. Pedir de MÁS es distinto y no bloquea —el archivo de
 * stock es la foto del día y puede estar atrasado respecto de lo que entró
 * hoy—, pero tiene que verse.
 */
describe("stock al armar el pedido", () => {
  it("cero bloquea", () => {
    expect(hayStockParaPedir(0)).toBe(false);
    expect(hayStockParaPedir(1)).toBe(true);
  });

  it("un producto que no está en el archivo del almacén cuenta como cero", () => {
    // La pantalla resuelve el faltante con `?? 0`: no tener fila y tener
    // cero son lo mismo para quien vende.
    expect(hayStockParaPedir(Number(undefined ?? 0))).toBe(false);
  });

  it("un stock negativo —dato sucio— se trata como sin stock, no como disponible", () => {
    expect(hayStockParaPedir(-3)).toBe(false);
  });

  it("pedir más de lo que hay avisa, pero no es lo mismo que no tener", () => {
    expect(excedeElStock(20, 5)).toBe(true);
    expect(excedeElStock(5, 5)).toBe(false);
    expect(excedeElStock(1, 0)).toBe(false); // eso ya lo bloquea hayStockParaPedir
  });

  it("escribe el stock con su número, y «Sin stock» cuando no hay", () => {
    expect(etiquetaDeStock(0)).toBe("Sin stock");
    expect(etiquetaDeStock(-1)).toBe("Sin stock");
    expect(etiquetaDeStock(12)).toBe("Stock: 12");
    expect(etiquetaDeStock(13286)).toBe("Stock: 13,286");
  });
});
