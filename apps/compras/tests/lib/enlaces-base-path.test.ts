import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * La app corre con `basePath: '/compras'` (next.config.js). Next antepone ese
 * prefijo solo a next/link y al router: un `<a href="/algo">` pelado apunta a
 * la raíz de erp.logisalud.com, que es Cobranzas. Así se rompió "Exportar a
 * Excel" en Cuentas por Pagar, Caja Chica y Aportes del accionista (los tres
 * son descargas de un Route Handler, que no pueden ir por <Link>).
 *
 * Esta prueba lee el código y falla si un `<a>` vuelve a apuntar a una ruta
 * absoluta sin `NEXT_PUBLIC_BASE_PATH`. La única excepción es `href="/"`: el
 * "← Módulos" del inicio va a la raíz a propósito, al menú de Cobranzas.
 */

const RAIZ = join(__dirname, '..', '..')

function archivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return archivosTsx(ruta)
    return ruta.endsWith('.tsx') ? [ruta] : []
  })
}

/** Cada `<a ...>` del archivo, con el href que tenga (literal o template). */
function hrefsDeAnclas(fuente: string): string[] {
  const anclas = fuente.match(/<a\b[^>]*?>/g) ?? []
  return anclas
    .map((a) => a.match(/href=(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\})/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => m[1] ?? m[2] ?? m[3])
}

describe('enlaces <a> y el basePath /compras', () => {
  it('ningún <a> apunta a una ruta absoluta sin el prefijo', () => {
    const malos: string[] = []
    for (const carpeta of ['app', 'components']) {
      for (const archivo of archivosTsx(join(RAIZ, carpeta))) {
        for (const href of hrefsDeAnclas(readFileSync(archivo, 'utf8'))) {
          if (href.startsWith('/') && href !== '/') {
            malos.push(`${relative(RAIZ, archivo)}: ${href}`)
          }
        }
      }
    }
    expect(malos).toEqual([])
  })

  it('la prueba detecta el error que la motivó', () => {
    expect(hrefsDeAnclas('<a href="/caja-chica/descargar" className="x">')).toEqual(['/caja-chica/descargar'])
    expect(hrefsDeAnclas('<a\n  href={`/cuentas-por-pagar/descargar${q}`}\n  className="x"\n>'))
      .toEqual(['/cuentas-por-pagar/descargar${q}'])
  })
})
