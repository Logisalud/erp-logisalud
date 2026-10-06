import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COLUMNAS_ESCRIBIBLES_OBLIGACIONES } from '../fixtures/columnas-obligaciones'

/**
 * Todo `insert`/`update` sobre `obligaciones` usa columnas que EXISTEN.
 *
 * Por qué existe: la recepción de tres columnas insertaba
 * `storage_path_factura` en vez de `factura_storage_path`. PostgREST
 * rechazaba el insert entero, pero ese paso es best-effort (si falla, la
 * recepción queda guardada igual), así que el error se tragaba: desde el
 * rediseño, NINGUNA recepción generó su obligación, y 11 facturas de
 * proveedores no llegaron a Cuentas por Pagar (detectado el 2026-10-06).
 *
 * Ningún test lo vio porque el mock de Supabase acepta cualquier nombre de
 * columna. Este no ejecuta nada: lee el código fuente, encuentra cada
 * escritura sobre `obligaciones` y compara sus claves contra la lista real
 * de la base (tests/fixtures/columnas-obligaciones.ts).
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CARPETAS = ['services', 'app', 'domain', 'lib']
const VALIDAS = new Set<string>(COLUMNAS_ESCRIBIBLES_OBLIGACIONES)

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : archivos(p)
    return /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

/** Desde un `{`, devuelve el índice de su `}` — saltando strings y comentarios. */
function cierreDe(src: string, abre: number): number {
  let prof = 0
  for (let i = abre; i < src.length; i++) {
    const c = src[i]
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++
      continue
    }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue }
    if (c === '{') prof++
    if (c === '}' && --prof === 0) return i
  }
  return -1
}

/** Las claves de primer nivel de un literal de objeto (`a: 1, b, ...c`). */
function clavesDe(objeto: string): string[] {
  const claves: string[] = []
  let prof = 0
  let inicioProp = true
  for (let i = 1; i < objeto.length - 1; i++) {
    const c = objeto[i]
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < objeto.length && objeto[i] !== c; i++) if (objeto[i] === '\\') i++
      continue
    }
    if (c === '/' && objeto[i + 1] === '/') { i = objeto.indexOf('\n', i); continue }
    if (c === '/' && objeto[i + 1] === '*') { i = objeto.indexOf('*/', i) + 1; continue }
    if ('{[('.includes(c)) { prof++; continue }
    if ('}])'.includes(c)) { prof--; continue }
    if (prof !== 0) continue
    if (c === ',') { inicioProp = true; continue }
    if (inicioProp && /[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(objeto.slice(i))!
      claves.push(m[0])
      i += m[0].length - 1
      inicioProp = false
    } else if (inicioProp && c === '.' && objeto.startsWith('...', i)) {
      inicioProp = false // un spread: sus claves las cubre el objeto de origen
    }
  }
  return claves
}

type Escritura = { archivo: string; linea: number; claves: string[] }

function escriturasSobreObligaciones(): Escritura[] {
  const encontradas: Escritura[] = []
  for (const carpeta of CARPETAS) {
    for (const archivo of archivos(join(RAIZ, carpeta))) {
      const src = readFileSync(archivo, 'utf8')
      const re = /\.from\(\s*['"]obligaciones['"]\s*\)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        // La escritura es el primer .insert(/.update( antes del próximo .from(.
        const resto = src.slice(m.index + m[0].length)
        const proximoFrom = resto.search(/\.from\(/)
        const tramo = proximoFrom === -1 ? resto : resto.slice(0, proximoFrom)
        const w = /\.(insert|update)\(/.exec(tramo)
        if (!w) continue
        const desde = m.index + m[0].length + w.index
        const abre = src.indexOf('{', desde)
        // Solo si el argumento empieza con el objeto (o un .map que lo arma)
        // cerca: si no, es una variable y no hay literal que revisar acá.
        if (abre === -1 || abre - desde > 160) continue
        const cierra = cierreDe(src, abre)
        if (cierra === -1) continue
        encontradas.push({
          archivo: relative(RAIZ, archivo),
          linea: src.slice(0, abre).split('\n').length,
          claves: clavesDe(src.slice(abre, cierra + 1)),
        })
      }
    }
  }
  return encontradas
}

describe('escrituras sobre cuentas_x_pagar.obligaciones', () => {
  const escrituras = escriturasSobreObligaciones()

  it('encuentra las escrituras — si da cero, el detector se rompió y el test no protege nada', () => {
    expect(escrituras.length).toBeGreaterThan(10)
  })

  it('todas usan columnas que existen en la base', () => {
    const malas = escrituras.flatMap((e) =>
      e.claves.filter((k) => !VALIDAS.has(k)).map((k) => `${e.archivo}:${e.linea} → "${k}"`)
    )
    expect(malas).toEqual([])
  })

  it('el detector ve una columna mal escrita (prueba del propio test)', () => {
    expect(clavesDe(`{ storage_path_factura: x, igv: redondear(a * b), ...resto, sin_igv }`))
      .toEqual(['storage_path_factura', 'igv', 'sin_igv'])
    expect(VALIDAS.has('storage_path_factura')).toBe(false)
  })
})
