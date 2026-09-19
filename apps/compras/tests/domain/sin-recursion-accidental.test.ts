import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Guardián contra la recursión accidental.
 *
 * El 2026-09-18 `revalidarObligacion()` quedó llamándose a sí misma en vez de
 * llamar a `revalidatePath()`. `tsc` no dice nada —la llamada es válida— y
 * los tests tampoco, porque era código de una Server Action. En producción
 * reventó con "Maximum call stack size exceeded" DESPUÉS de escribir en la
 * base: la anulación se guardaba, el correo salía, y la pantalla moría con
 * un 500. Afectaba a las 11 acciones de la ficha de una obligación.
 *
 * Este test recorre el código y falla si una función se llama a sí misma.
 * Hoy no hay NINGUNA recursión legítima en el módulo. Si algún día hace
 * falta una de verdad, agregala a `RECURSION_LEGITIMA` con el porqué — el
 * punto no es prohibir recursión, es que sea deliberada.
 */
const RECURSION_LEGITIMA: readonly string[] = []

/** El cwd de vitest es la raíz del monorepo, no la de la app. */
const RAIZ_APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RAICES = ['domain', 'app', 'services', 'components', 'lib'].map((d) => join(RAIZ_APP, d))

function archivosDeCodigo(dir: string): string[] {
  let salida: string[] = []
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) salida = salida.concat(archivosDeCodigo(ruta))
    else if (/\.tsx?$/.test(entrada)) salida.push(ruta)
  }
  return salida
}

/** El cuerpo de la función desde su `{`, con las llaves balanceadas. */
function cuerpo(fuente: string, aperturaLlave: number): string {
  let profundidad = 0
  for (let i = aperturaLlave; i < fuente.length; i++) {
    if (fuente[i] === '{') profundidad++
    else if (fuente[i] === '}') {
      profundidad--
      if (profundidad === 0) return fuente.slice(aperturaLlave, i + 1)
    }
  }
  return fuente.slice(aperturaLlave)
}

function funcionesQueSeLlamanASiMismas(ruta: string): string[] {
  const fuente = readFileSync(ruta, 'utf8')
  const encontradas: string[] = []
  const declaracion = /\bfunction\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g
  let m: RegExpExecArray | null
  while ((m = declaracion.exec(fuente)) !== null) {
    const nombre = m[1]
    const apertura = fuente.indexOf('{', m.index + m[0].length)
    if (apertura < 0) continue
    // `(?<![.\w])` evita confundir `revalidatePath(` con `revalidar(`, y
    // `obj.metodo(` con una llamada suelta al mismo nombre.
    const seLlama = new RegExp(`(?<![.\\w])${nombre}\\s*\\(`)
    if (seLlama.test(cuerpo(fuente, apertura))) encontradas.push(`${ruta.slice(RAIZ_APP.length + 1)}: ${nombre}()`)
  }
  return encontradas
}

describe('ninguna función se llama a sí misma sin querer', () => {
  it('el módulo entero está libre de recursión accidental', () => {
    const halladas = RAICES.flatMap((raiz) =>
      archivosDeCodigo(raiz).flatMap(funcionesQueSeLlamanASiMismas)
    ).filter((h) => !RECURSION_LEGITIMA.includes(h))

    expect(halladas).toEqual([])
  })
})
