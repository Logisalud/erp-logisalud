const BOM = String.fromCharCode(0xfeff)

/**
 * Limpia variables de entorno antes de usarlas. Defensa en profundidad
 * contra un BOM (U+FEFF) al inicio del valor — ver el mismo helper en
 * apps/pedidos/lib/env.ts, donde ya causó un fallo real de `fetch` al
 * armar el header `Authorization: Bearer <key>`.
 */
export function cleanEnv(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed.startsWith(BOM) ? trimmed.slice(BOM.length) : trimmed
}
