type Versioned = {
  vigenteDesde: string;
  vigenteHasta: string | null;
};

/**
 * Cierra la versión activa (vigenteHasta null) el día antes de que
 * empiece la nueva, y agrega la nueva como versión activa. Nunca
 * elimina la versión anterior. Refleja el mismo criterio que los
 * triggers de Postgres para product_tax_profiles, price_lists y
 * zone_assignments (ver supabase/migrations).
 *
 * Si la versión activa también empezó el mismo día que la nueva (ej.
 * reimportar dos veces en un día), "el día antes de la nueva" caería
 * ANTES de su propio vigenteDesde — inconsistente. En ese caso se
 * cierra el mismo día que empezó (ventana de un día) en vez de eso.
 */
export function applyNewVersion<T extends Versioned>(existing: T[], nueva: T): T[] {
  const diaAntes = dayBefore(nueva.vigenteDesde);
  const cerradas = existing.map((v) =>
    v.vigenteHasta === null ? { ...v, vigenteHasta: maxDate(v.vigenteDesde, diaAntes) } : v,
  );
  return [...cerradas, nueva];
}

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}
