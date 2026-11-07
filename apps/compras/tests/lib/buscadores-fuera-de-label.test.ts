import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Un buscador (BuscadorProveedor, BuscadorProducto, BuscadorPersona) no
 * puede quedar dentro de un <label>: en el iPhone, tocar una opción de la
 * lista le devuelve el foco al input del label y la opción no se elige.
 * Así se rompió "Proveedor" en Pago Directo (Sebas, 2026-10-23) — y estaba
 * igual en las tres pantallas de OC y en el anticipo.
 *
 * Los formularios envuelven cada campo en un `Campo` que es un <label>; para
 * un buscador se usa `<Campo … grupo>`, que lo vuelve un <div>. Esta prueba
 * lee el código y falla si un `<Campo>` sin `grupo` contiene un buscador.
 */

const RAIZ = join(__dirname, '..', '..')

function archivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return archivosTsx(ruta)
    return ruta.endsWith('.tsx') ? [ruta] : []
  })
}

/** Cada `<Campo …>…</Campo>` sin `grupo` que tenga un buscador adentro. */
export function camposConBuscadorEnLabel(fuente: string): string[] {
  const malos: string[] = []
  const re = /<Campo\b([^>]*)>([\s\S]*?)<\/Campo>/g
  for (const m of fuente.matchAll(re)) {
    const [, atributos, contenido] = m
    if (/<Buscador[A-Z]\w*/.test(contenido) && !/\bgrupo\b/.test(atributos)) {
      malos.push(atributos.match(/etiqueta="([^"]*)"/)?.[1] ?? atributos.trim())
    }
  }
  return malos
}

describe('buscadores fuera de un <label> (iPhone)', () => {
  it('ningún Campo-label envuelve un buscador', () => {
    const malos: string[] = []
    for (const archivo of archivosTsx(join(RAIZ, 'app'))) {
      for (const etiqueta of camposConBuscadorEnLabel(readFileSync(archivo, 'utf8'))) {
        malos.push(`${relative(RAIZ, archivo)}: ${etiqueta}`)
      }
    }
    expect(malos).toEqual([])
  })

  it('la prueba detecta el caso que la motivó', () => {
    expect(camposConBuscadorEnLabel(
      `<Campo etiqueta="Proveedor *" error={x}>\n  <BuscadorProveedor valor={p} />\n</Campo>`,
    )).toEqual(['Proveedor *'])
    expect(camposConBuscadorEnLabel(
      `<Campo etiqueta="Proveedor *" error={x} grupo>\n  <BuscadorProveedor valor={p} />\n</Campo>`,
    )).toEqual([])
  })
})
