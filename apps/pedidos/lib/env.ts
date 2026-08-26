const BOM = String.fromCharCode(0xfeff);

/**
 * Limpia variables de entorno antes de usarlas. Defensa en profundidad
 * contra un BOM (U+FEFF) al inicio del valor — pasó una vez con las
 * keys de Supabase en Vercel (cargadas vía un pipe de PowerShell que
 * antepone BOM al pasar un string a un proceso nativo) y rompía
 * `fetch` al armar el header `Authorization: Bearer <key>`
 * ("Cannot convert argument to a ByteString..."). Aunque ya se
 * corrigió el valor en Vercel, esto evita que un BOM accidental futuro
 * (en cualquier entorno) rompa el login. Se usa fromCharCode en vez de
 * un literal para no dejar un carácter invisible en el código fuente.
 */
export function cleanEnv(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed.startsWith(BOM) ? trimmed.slice(BOM.length) : trimmed;
}
