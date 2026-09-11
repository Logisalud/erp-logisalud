/**
 * "Pendientes de aprobar": la contraparte de domain/mis-operaciones.ts.
 * Aquella filtra por QUIÉN CREÓ el registro; esta por QUIÉN TIENE QUE
 * DECIDIR sobre él. Puro: sin Next, sin Supabase.
 *
 * ── Por qué el gate vive acá y no en RLS ──────────────────────────────
 * Las cuatro tablas tienen una policy `*_acceso_temporal` con
 * `compras_acceso_abierto()`, que lee el flag
 * `compras.flags.acceso_abierto_temporal` — hoy en `true` en producción.
 * Las policies se combinan con OR, así que mientras ese flag siga prendido
 * RLS no filtra nada y cualquier persona logueada ve y escribe todo.
 *
 * Por eso este archivo NO delega el filtro a la base: replica en JS el gate
 * que las policies definen nominalmente. Y por eso mismo esta pantalla es
 * una ayuda de PRIORIZACIÓN, no un control de acceso: quien no debería
 * aprobar algo lo sigue pudiendo hacer entrando por URL directa al detalle.
 * Cerrar eso (apagar el flag, chequear permiso en las 4 Server Actions y
 * tapar la auto-aprobación) está anotado como pendiente PRIORITARIO en
 * CONTEXTO.md — no es parte de esta pieza.
 *
 * ── La regla que gobierna qué estados entran ──────────────────────────
 * La bandeja muestra EXACTAMENTE las filas donde el botón de aprobar se
 * renderizaría de verdad. Nada que no se pueda decidir hoy: por eso
 * `pendiente_factura` de un Pago Directo queda afuera (sin la factura real
 * no hay nada que conformar — vive en "Mis operaciones" de quien lo cargó),
 * aunque sí se pueda rechazar desde su ficha.
 */

/** De qué tabla sale cada grupo — decide qué consultas correr. */
export const FUENTES_APROBACION = ['pago_directo', 'gasto', 'caja_chica', 'os', 'propuesta'] as const
export type FuenteAprobacion = (typeof FUENTES_APROBACION)[number]

/** Lo que ve la persona en la columna "Tipo" — `gasto` se abre en dos. */
export type TipoPendiente = 'pago_directo' | 'anticipo' | 'reembolso' | 'caja_chica' | 'os' | 'propuesta'

export const ETIQUETA_TIPO_PENDIENTE: Record<TipoPendiente, string> = {
  pago_directo: 'Pago Directo',
  anticipo: 'Anticipo',
  reembolso: 'Reembolso',
  caja_chica: 'Reposición de Caja Chica',
  os: 'Orden de Servicio',
  propuesta: 'Propuesta de pago',
}

/** Estados en los que cada fuente está esperando una decisión real. */
export const ESTADOS_QUE_ESPERAN_DECISION: Record<FuenteAprobacion, readonly string[]> = {
  // Mismo criterio que `puedeDarConformidad` en la ficha de la obligación.
  pago_directo: ['registrada', 'observada'],
  // El paso del jefe es vestigial (ver domain/gasto.ts): nacen acá.
  gasto: ['pendiente_contabilidad'],
  // Dos decisores distintos según el estado — ver `quienDecideCajaChica`.
  caja_chica: ['pendiente_jefe', 'pendiente_contabilidad'],
  os: ['pendiente_jefe'],
  // Un lote esperando la firma de Contabilidad. Quedó fuera de la primera
  // versión de esta pantalla porque entonces lo aprobaba Gerencia y tenía su
  // propia pantalla; la Pieza I cambió el aprobador a contabilidad+admin y
  // esa razón dejó de valer, pero la lista de fuentes no se actualizó — así
  // que había lotes esperando sin que ninguna bandeja los mostrara.
  propuesta: ['pendiente_aprobacion'],
}

export type PerfilAprobador = { area: string | null; rol: string | null } | null

/** `admin` es el rol transversal del módulo: aparece en todos los gates. */
export function esAdmin(perfil: PerfilAprobador): boolean {
  return perfil?.area === 'admin'
}

/**
 * Quién decide por Contabilidad. Uniforme para Pago Directo, Anticipo/
 * Reembolso y Caja Chica: `contabilidad` con rol `admin`.
 *
 * Hasta ahora solo Pago Directo lo exigía (Fase 1.7); en Gastos y Caja Chica
 * no había ningún gate y el botón le salía a cualquiera. Se unifica acá
 * porque esa ausencia era un descuido, no una decisión.
 */
export function esContabilidadDecisora(perfil: PerfilAprobador): boolean {
  return esAdmin(perfil) || (perfil?.area === 'contabilidad' && perfil?.rol === 'admin')
}

/**
 * Qué consultas vale la pena correr para esta persona. Si vuelve vacío no se
 * toca la base y la entrada del menú ni se renderiza.
 *
 * `misAreas` son las áreas de las que la persona es responsable
 * (`public.area_responsables`) — el equivalente en JS de `es_jefe_de()`.
 */
export function fuentesQueMeTocan(perfil: PerfilAprobador, misAreas: readonly string[]): FuenteAprobacion[] {
  const fuentes: FuenteAprobacion[] = []
  const contabilidad = esContabilidadDecisora(perfil)
  const jefe = misAreas.length > 0

  if (contabilidad) fuentes.push('pago_directo', 'gasto')
  // La reposición pasa por el jefe del área del fondo y después por
  // Contabilidad, así que le toca a los dos.
  if (contabilidad || jefe) fuentes.push('caja_chica')
  // La OS la aprueba el jefe del área usuaria. Contabilidad no decide acá.
  if (esAdmin(perfil) || jefe) fuentes.push('os')
  // Mismo gate que la pantalla de propuestas — se reusa `puedeAprobarPropuesta`
  // en el servicio en vez de repetir el criterio acá.
  if (contabilidad) fuentes.push('propuesta')
  return fuentes
}

/** Quién tiene que decidir sobre una reposición, según en qué paso está. */
export function quienDecideCajaChica(estado: string): 'jefe' | 'contabilidad' | null {
  if (estado === 'pendiente_jefe') return 'jefe'
  if (estado === 'pendiente_contabilidad') return 'contabilidad'
  return null
}

export function meTocaEstaReposicion(
  estado: string,
  areaDelFondo: string | null,
  perfil: PerfilAprobador,
  misAreas: readonly string[]
): boolean {
  const decide = quienDecideCajaChica(estado)
  if (!decide) return false
  if (esAdmin(perfil)) return true
  if (decide === 'contabilidad') return esContabilidadDecisora(perfil)
  return !!areaDelFondo && misAreas.includes(areaDelFondo)
}

export function meTocaEstaOS(
  estado: string,
  areaSolicitante: string | null,
  perfil: PerfilAprobador,
  misAreas: readonly string[]
): boolean {
  if (estado !== 'pendiente_jefe') return false
  if (esAdmin(perfil)) return true
  return !!areaSolicitante && misAreas.includes(areaSolicitante)
}

/**
 * Días enteros que lleva esperando. Se cuenta desde que entró al estado
 * actual, no desde que se creó: en una reposición que ya pasó por el jefe,
 * los días que tardó el jefe no son espera de Contabilidad (ver
 * `aprobado_jefe_fecha` en services/pendientes-aprobar.ts). Para las otras
 * tres fuentes no hay columna de entrada al estado y es `created_at`.
 */
export function diasEsperando(desdeISO: string, ahoraISO: string): number {
  const desde = new Date(desdeISO).getTime()
  const ahora = new Date(ahoraISO).getTime()
  if (!Number.isFinite(desde) || !Number.isFinite(ahora)) return 0
  return Math.max(0, Math.floor((ahora - desde) / 86_400_000))
}

export function etiquetaEspera(dias: number): string {
  if (dias === 0) return 'Hoy'
  if (dias === 1) return '1 día'
  return `${dias} días`
}

export type FilaPendiente = {
  id: string
  tipo: TipoPendiente
  codigo: string
  /** Nombre de quien lo creó; el correo si RLS de `perfiles` no deja leerlo. */
  quienLoCreo: string | null
  /** Momento en que empezó a esperar ESTA decisión. */
  esperandoDesde: string
  diasEsperando: number
  monto: number
  moneda: string
  /** "Contabilidad" o "Jefe de <área>" — útil para admin, que ve las cuatro. */
  quienDecide: string
  /** Anticipo/Reembolso: para cuándo pidieron el dinero (Pieza J). Null en
   * el resto — solo esas dos fuentes capturan el dato. */
  fechaRequerida: string | null
  /**
   * De qué se trata la fila, para no tener que entrar al detalle. Cada
   * fuente lo guarda en un campo distinto y con otro nombre, así que se
   * normaliza acá: categoría más el texto libre de quien lo cargó.
   *
   *  - Pago Directo → categoría de pago directo + `observaciones`
   *  - Anticipo/Reembolso → categoría de gasto + `descripcion`
   *  - OS → `descripcion_servicio` (no tiene categoría)
   *  - Caja Chica → la descripción del fondo (la reposición no tiene
   *    concepto propio: es la suma de movimientos ya registrados)
   */
  concepto: string | null
  href: string
}

/** Lo más viejo primero: la bandeja existe para atacar lo que más esperó. */
export function ordenarPorAntiguedad(filas: readonly FilaPendiente[]): FilaPendiente[] {
  return [...filas].sort((a, b) => a.esperandoDesde.localeCompare(b.esperandoDesde))
}
