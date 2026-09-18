/**
 * Recepción de mercadería, modelo de TRES COLUMNAS. Puro: sin Next, sin
 * Supabase.
 *
 * Reemplaza a `clasificarLinea` de domain/recepcion.ts, que comparaba lo
 * físico contra lo PEDIDO EN LA OC y de ahí sacaba `faltante`/`sobrante`.
 * Ese eje estaba mal elegido: una entrega parcial contra la OC es normal
 * —el resto llega en otra guía— y no tiene nada que ver con si el proveedor
 * nos está cobrando de más.
 *
 * Los dos ejes del modelo nuevo, y por qué son distintos:
 *
 *   ① FACTURA vs OC PEDIDA → seguimiento de entrega.
 *      "La OC pide 50, la factura dice 30." Informativo. No bloquea nada,
 *      no genera nota de crédito, no cambia el monto a pagar. Quedan 20 por
 *      recibir en otra guía... o no, si la OC se cierra con saldo.
 *
 *   ② FÍSICO vs FACTURA DECLARADA → la discrepancia que importa.
 *      "La factura dice 30, llegaron 28." Acá sí hay plata en juego: el
 *      proveedor está cobrando 30 y entregó 28.
 *
 * La obligación se calcula SIEMPRE sobre lo FACTURADO, nunca sobre lo
 * físico: la factura del proveedor dice 30 y eso es lo que legalmente se
 * debe hasta que exista una nota de crédito. Lo físico decide si esa
 * obligación puede pagarse o tiene que esperar la NC.
 *
 * Lo que este modelo YA NO hace, por decisión explícita (2026-09-18):
 * lote, fecha de vencimiento y vida útil mínima salen del alcance —
 * inventario y trazabilidad van a ser un módulo aparte. Las columnas siguen
 * en la base sin uso, igual que `matriz_resolucion_discrepancias`.
 */

import { redondear, TASA_IGV } from './obligacion'

/** Lo que Charlie llena por cada línea de la OC. */
export type LineaTresColumnas = {
  ocItemId: string
  /** Fija, de la OC. Referencia: no se edita. */
  cantidadPedida: number
  /** Precio unitario de esa línea EN LA OC. La factura no re-declara precio:
   *  si el proveedor cambió el precio, eso es otra conversación y no se
   *  resuelve en el almacén. */
  precioUnitario: number
  /** Lo que dice la factura. Por default = cantidadPedida ("conforme"). */
  cantidadFactura: number
  /** Lo que llegó de verdad. Por default = cantidadFactura ("conforme"). */
  cantidadFisica: number
  observaciones: string | null
}

/**
 * Qué pasa con una línea. `caso_a`/`caso_b` son los dos casos de
 * discrepancia factura↔físico; `entrega_parcial` es solo seguimiento.
 */
export type CasoLinea = 'conforme' | 'entrega_parcial' | 'caso_a' | 'caso_b'

export type ClasificacionTresColumnas = {
  caso: CasoLinea
  /** ¿Hay diferencia entre lo facturado y lo físico? Es lo único que decide
   *  si la obligación puede pagarse. */
  hayDiscrepanciaFacturaFisico: boolean
  /** Solo Caso A: cuántas unidades tiene que devolver el proveedor por NC. */
  unidadesPorNotaCredito: number
  /** Solo Caso B: cuántas unidades llegaron sin facturar. */
  excedenteSinFacturar: number
  /** Solo entrega parcial: cuánto de la OC queda por recibir. */
  saldoPorRecibir: number
  /** La base de esta línea: SIEMPRE lo facturado × precio. */
  baseLinea: number
}

export function clasificarTresColumnas(l: LineaTresColumnas): ClasificacionTresColumnas {
  const baseLinea = redondear(l.cantidadFactura * l.precioUnitario)
  const saldoPorRecibir = Math.max(0, l.cantidadPedida - l.cantidadFactura)

  // El orden importa: la discrepancia factura↔físico se evalúa PRIMERO y
  // gana, porque es la que tiene consecuencia económica. Una línea puede ser
  // entrega parcial Y tener faltante físico a la vez; en ese caso lo que
  // manda es el faltante.
  if (l.cantidadFisica < l.cantidadFactura) {
    return {
      caso: 'caso_a',
      hayDiscrepanciaFacturaFisico: true,
      unidadesPorNotaCredito: redondear(l.cantidadFactura - l.cantidadFisica),
      excedenteSinFacturar: 0,
      saldoPorRecibir,
      baseLinea,
    }
  }

  if (l.cantidadFisica > l.cantidadFactura) {
    return {
      caso: 'caso_b',
      hayDiscrepanciaFacturaFisico: true,
      unidadesPorNotaCredito: 0,
      excedenteSinFacturar: redondear(l.cantidadFisica - l.cantidadFactura),
      saldoPorRecibir,
      baseLinea,
    }
  }

  return {
    caso: saldoPorRecibir > 0 ? 'entrega_parcial' : 'conforme',
    hayDiscrepanciaFacturaFisico: false,
    unidadesPorNotaCredito: 0,
    excedenteSinFacturar: 0,
    saldoPorRecibir,
    baseLinea,
  }
}

export type TotalesRecepcion = {
  base: number
  igv: number
  total: number
  /** Cuántas líneas tienen diferencia factura↔físico. El número que la
   *  pantalla pone al lado del botón para que sea imposible no verlo. */
  lineasConDiscrepancia: number
  /** Cuántas líneas son entrega parcial (informativo, no bloquea). */
  lineasConEntregaParcial: number
  /** Caso A en alguna línea → la obligación nace bloqueada esperando NC. */
  esperaNotaCredito: boolean
  /** Caso B en alguna línea → hay excedente que el proveedor debe facturar. */
  tieneExcedenteSinFacturar: boolean
}

/**
 * Los totales de la recepción entera. El IGV es 18% automático y no hay
 * detracción: esto es mercadería, no servicio (la detracción vive en
 * domain/obligacion.ts y aplica a facturas de servicio).
 */
export function totalizarRecepcion(
  lineas: readonly LineaTresColumnas[]
): TotalesRecepcion {
  const clasificadas = lineas.map(clasificarTresColumnas)

  const base = redondear(clasificadas.reduce((a, c) => a + c.baseLinea, 0))
  const igv = redondear(base * TASA_IGV)

  return {
    base,
    igv,
    total: redondear(base + igv),
    lineasConDiscrepancia: clasificadas.filter((c) => c.hayDiscrepanciaFacturaFisico).length,
    lineasConEntregaParcial: clasificadas.filter((c) => c.caso === 'entrega_parcial').length,
    esperaNotaCredito: clasificadas.some((c) => c.caso === 'caso_a'),
    tieneExcedenteSinFacturar: clasificadas.some((c) => c.caso === 'caso_b'),
  }
}

export type ErrorValidacion = { campo: string; mensaje: string }

/**
 * Qué impide registrar la recepción.
 *
 * Observaciones es obligatoria SOLO en la línea que tiene discrepancia
 * factura↔físico. En una entrega parcial no se pide: que la factura cubra
 * menos que la OC no es un problema que haya que explicar.
 */
/**
 * Una guía de remisión: su número Y su archivo. Es un par indivisible — un
 * número sin archivo deja el legajo incompleto, y un archivo sin número no
 * se puede buscar. Por eso no son dos listas paralelas: alineadas por índice
 * se desincronizan y nada lo impide (ver migración 0064).
 */
export type GuiaRecibida = {
  numero: string
  storagePath: string | null
}

export function validarRecepcionTresColumnas(input: {
  fechaRecepcion: string
  guias: readonly GuiaRecibida[]
  numeroFactura: string
  storagePathFactura: string | null
  lineas: readonly LineaTresColumnas[]
}): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []

  if (!input.fechaRecepcion) {
    errores.push({ campo: 'fechaRecepcion', mensaje: 'Pon la fecha en que llegó la mercadería.' })
  }

  // Una guía cuenta solo si tiene las DOS cosas. Una fila a medio llenar no
  // se ignora en silencio: se reclama la parte que falta, porque el vendedor
  // ya escribió algo ahí y borrarlo sin avisar sería perderle el dato.
  const guias = input.guias.map((g) => ({ ...g, numero: g.numero.trim() }))
  const completas = guias.filter((g) => g.numero && g.storagePath)
  if (completas.length === 0) {
    errores.push({ campo: 'guias', mensaje: 'Registra al menos una guía de remisión, con su número y su archivo.' })
  }
  guias.forEach((g, i) => {
    if (g.numero && !g.storagePath) {
      errores.push({ campo: `guia-${i}-archivo`, mensaje: `Falta subir el archivo de la guía ${g.numero}.` })
    }
    if (!g.numero && g.storagePath) {
      errores.push({ campo: `guia-${i}-numero`, mensaje: 'Falta el número de una de las guías que subiste.' })
    }
  })
  const numeros = completas.map((g) => g.numero)
  if (new Set(numeros).size !== numeros.length) {
    errores.push({ campo: 'guias', mensaje: 'Hay dos guías con el mismo número — revisa si te repetiste.' })
  }

  if (!input.numeroFactura.trim()) {
    errores.push({ campo: 'numeroFactura', mensaje: 'Pon el número de la factura.' })
  }

  // La factura, siempre: la regla es que factura y guías llegan juntas. Sin
  // esto la obligación nacería sin respaldo y Contabilidad tendría que
  // volver a pedirlo — regla 6 de la Carta de Simplicidad, "una sola fuente
  // de verdad por dato". El archivo de cada guía se exige arriba, por fila.
  if (!input.storagePathFactura) {
    errores.push({ campo: 'archivoFactura', mensaje: 'Sube la foto o el PDF de la factura.' })
  }

  const conCantidad = input.lineas.filter((l) => l.cantidadFactura > 0 || l.cantidadFisica > 0)
  if (conCantidad.length === 0) {
    errores.push({ campo: 'lineas', mensaje: 'Ninguna línea tiene cantidades: no hay nada que recibir.' })
  }

  for (const l of input.lineas) {
    if (l.cantidadFactura < 0 || l.cantidadFisica < 0) {
      errores.push({ campo: `linea-${l.ocItemId}`, mensaje: 'Las cantidades no pueden ser negativas.' })
      continue
    }
    // Facturar MÁS de lo que la OC pidió no es una entrega parcial ni un
    // excedente físico: es una factura que no corresponde a esta orden, y
    // eso no se arregla en el almacén.
    if (l.cantidadFactura > l.cantidadPedida) {
      errores.push({
        campo: `linea-${l.ocItemId}`,
        mensaje: `La factura declara ${l.cantidadFactura} y la orden pidió ${l.cantidadPedida}. No se puede facturar más de lo pedido — avisá a Compras.`,
      })
      continue
    }
    const c = clasificarTresColumnas(l)
    if (c.hayDiscrepanciaFacturaFisico && !l.observaciones?.trim()) {
      errores.push({
        campo: `observaciones-${l.ocItemId}`,
        mensaje: 'Cuenta qué pasó en esta línea: lo facturado y lo que llegó no coinciden.',
      })
    }
  }

  return errores
}

/** El texto que la fila muestra apenas se detecta la diferencia. Dice la
 *  consecuencia, no solo el número — regla 7 de la Carta de Simplicidad. */
export function mensajeDeLinea(l: LineaTresColumnas): { tono: 'alerta' | 'info'; texto: string } | null {
  const c = clasificarTresColumnas(l)
  switch (c.caso) {
    case 'caso_a':
      return {
        tono: 'alerta',
        texto: `Faltan ${c.unidadesPorNotaCredito} respecto de la factura → se va a pedir nota de crédito.`,
      }
    case 'caso_b':
      return {
        tono: 'alerta',
        texto: `Llegaron ${c.excedenteSinFacturar} sin facturar → el proveedor tiene que facturar la diferencia.`,
      }
    case 'entrega_parcial':
      return {
        tono: 'info',
        texto: `Entrega parcial: quedan ${c.saldoPorRecibir} por recibir. No bloquea nada.`,
      }
    default:
      return null
  }
}

/**
 * Qué falta para poder cerrar la OC, DESPUÉS de registrar la mercadería.
 *
 * El cierre nunca va antes de recibir (decisión de Sebas, 2026-09-18): se
 * cierra cuando ya se sabe qué llegó, no como una decisión previa a ciegas.
 * Después de registrar, la OC puede quedar en uno de tres lugares.
 */
export type PendienteDeCierre =
  /** No queda nada: se recibió todo lo pedido y sin diferencias. */
  | { estado: 'cerrable_sin_saldo' }
  /**
   * Falta la nota de crédito de Contabilidad. Tiene PRECEDENCIA sobre el
   * saldo: cerrar la OC con una NC pendiente dejaría la obligación colgada
   * sin nadie mirándola, y la NC se registra contra esta misma OC.
   */
  | { estado: 'espera_nota_credito' }
  /** Quedó saldo sin recibir. Charlie puede cerrarla igual: el proveedor no
   *  siempre completa, y forzarlo a recibir lo que no va a llegar sería
   *  falsear el dato. Solo se le pregunta si está seguro. */
  | { estado: 'pendiente_de_cerrar'; unidadesPorRecibir: number; lineasConSaldo: number }

export function pendienteDeCierre(
  lineas: readonly LineaTresColumnas[]
): PendienteDeCierre {
  const clasificadas = lineas.map(clasificarTresColumnas)

  if (clasificadas.some((c) => c.caso === 'caso_a')) {
    return { estado: 'espera_nota_credito' }
  }

  const conSaldo = clasificadas.filter((c) => c.saldoPorRecibir > 0)
  if (conSaldo.length > 0) {
    return {
      estado: 'pendiente_de_cerrar',
      unidadesPorRecibir: redondear(conSaldo.reduce((a, c) => a + c.saldoPorRecibir, 0)),
      lineasConSaldo: conSaldo.length,
    }
  }

  return { estado: 'cerrable_sin_saldo' }
}

/** El texto que la pantalla muestra después de registrar. Dice qué falta y
 *  quién lo tiene que hacer — regla 7 de la Carta de Simplicidad. */
export function mensajePendienteDeCierre(p: PendienteDeCierre): string {
  switch (p.estado) {
    case 'espera_nota_credito':
      return 'Pendiente de cerrar: falta que Contabilidad suba la nota de crédito del proveedor en esta misma orden.'
    case 'pendiente_de_cerrar':
      return `Pendiente de cerrar: quedan ${p.unidadesPorRecibir} unidades sin recibir en ${p.lineasConSaldo} ${p.lineasConSaldo === 1 ? 'producto' : 'productos'}. Podés esperar la próxima guía o cerrar la orden.`
    case 'cerrable_sin_saldo':
      return 'Se recibió todo lo pedido. La orden se puede cerrar.'
  }
}

/** ¿Charlie puede cerrar la OC ahora mismo? Con una NC pendiente, no: eso
 *  lo tiene que resolver Contabilidad primero. */
export function puedeCerrarseAhora(p: PendienteDeCierre): boolean {
  return p.estado !== 'espera_nota_credito'
}
