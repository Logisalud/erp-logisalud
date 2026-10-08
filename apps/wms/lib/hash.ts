import { createHash } from 'node:crypto'

/** JSON canónico: claves ordenadas, para que el mismo contenido dé siempre el mismo hash. */
export function canonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`
}

/** SHA-256 en hexadecimal del contenido canónico (lo que se firma). */
export const hashDe = (v: unknown) => createHash('sha256').update(canonico(v), 'utf8').digest('hex')
