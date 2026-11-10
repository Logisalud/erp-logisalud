// Acta de Recepción de Productos — formato controlado LS-FR.03.05, calcado del .docx oficial.
// UNA sola definición del formato (tablas, celdas combinadas, textos y proporciones) que usan el PDF y el Excel: así no se desalinean.
// Las columnas y alturas están en twips, tal como vienen en la rejilla del .docx; cada salida las escala a su medio.
import type { ActaRecepcionVista } from './entradas-vistas'
import { formatoFecha, textoVencimiento } from './fechas'

export type RolFirmaActa = 'JEFE_ALMACEN' | 'DIRECCION_TECNICA' | 'TRANSPORTISTA' | 'RESPONSABLE_CONTEO'
export type ContenidoCelda = string | { logo: true } | { firma: RolFirmaActa; firmada: boolean }

export interface CeldaFormato {
  r: number
  c: number
  rs?: number
  cs?: number
  t: ContenidoCelda
  negrita?: boolean
  centro?: boolean
  verde?: boolean
  /** Tamaño de letra en pt (el formato usa 8 pt; el título, 16). */
  tam?: number
}
export interface TablaFormato {
  cols: number[]
  filas: number[]
  celdas: CeldaFormato[]
  /** Alturas mínimas (pt) de ciertas filas, para que el texto largo no se corte. */
  altos?: Record<number, number>
}
export interface ModeloActa {
  encabezado: TablaFormato
  datos: TablaFormato
  productos: TablaFormato[]
  verificacion: TablaFormato
  firmas: TablaFormato
  observaciones?: string
}

export const PIE_FORMATO = 'Este documento no puede ser reproducido ni fotocopiado sin autorización de LOGISSA S.A.C.'
export const COLS_PRODUCTOS = [521, 5291, 846, 1417, 851, 1134, 1062, 940, 838, 2420]
const FILAS_MINIMAS = 4
const FILAS_POR_TABLA = 12

const vacio = (v?: string | number | null) => (v === undefined || v === null ? '' : String(v))
/** Líneas que ocupa un texto en una celda (≈ 4,4 pt por letra a 8 pt) para que la fila crezca y no se corte. */
export const lineasDeTexto = (texto: string, anchoPt: number) => Math.max(1, Math.ceil((texto.length * 4.4) / Math.max(20, anchoPt - 8)))
export const horaLima = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '')

/** Ancho útil de referencia (pt) para estimar alturas de texto largo. */
const ANCHO_REF = 766

export function modeloActaRecepcion(acta: ActaRecepcionVista): ModeloActa {
  const c = acta.contenido
  const i = c.ingreso
  const v = i.verificaciones ?? {}
  const firma = (rol: RolFirmaActa) => acta.firmas.find((f) => f.rol === rol)
  const fechaDe = (iso?: string) => (iso ? formatoFecha(iso.slice(0, 10)) : '')
  const X = (b: boolean) => (b ? 'X' : '')
  const esCompra = i.tipo === 'COMPRA_LOCAL'
  const contraparte = [i.contraparteNombre, i.contraparteRuc ? `RUC ${i.contraparteRuc}` : ''].filter(Boolean).join(' · ')

  // ── Encabezado (4141 | 7150 | 1387 | 2582) ──
  const encabezado: TablaFormato = {
    cols: [4141, 7150, 1387, 2582], filas: [412, 404, 352],
    celdas: [
      { r: 0, c: 0, rs: 3, t: { logo: true }, centro: true },
      { r: 0, c: 1, rs: 2, t: 'ACTA DE RECEPCIÓN DE PRODUCTOS', negrita: true, centro: true, tam: 16 },
      { r: 0, c: 2, t: 'Cod. POE', negrita: true, verde: true, tam: 9 }, { r: 0, c: 3, t: 'LS-POE.03.05', negrita: true, tam: 9 },
      { r: 1, c: 2, t: 'Cod. Formato', negrita: true, verde: true, tam: 9 }, { r: 1, c: 3, t: 'LS-FR.03.05', negrita: true, tam: 9 },
      { r: 2, c: 1, cs: 3, t: 'Fecha de vigencia: Desde  01-09-2026  hasta  01-09-2028', negrita: true, centro: true, verde: true, tam: 9 },
    ],
  }

  // ── Tabla 1: datos generales (1129 | 3437 | 1808 | 1843 | 1701 | 1276 | 4073) ──
  const motivo = i.tipo === 'DEVOLUCION' ? vacio(i.motivo) : i.tipo === 'INGRESO_CLIENTE' ? 'Ingreso de cliente' : ''
  const datos: TablaFormato = {
    cols: [1129, 3437, 1808, 1843, 1701, 1276, 4073], filas: [330, 300, 330, 330, 330],
    celdas: [
      { r: 0, c: 0, cs: 2, t: 'DATOS GENERALES', negrita: true, centro: true },
      { r: 0, c: 2, cs: 2, t: 'CUMPLIMIENTO DOCUMENTARIO', negrita: true, centro: true },
      { r: 0, c: 4, cs: 2, t: 'TIPO DE INGRESO', negrita: true, centro: true },
      { r: 0, c: 6, t: 'N°  ACTA', negrita: true, centro: true },
      { r: 1, c: 0, t: 'CLIENTE', negrita: true, tam: 7 }, { r: 1, c: 1, t: esCompra ? '' : contraparte },
      { r: 1, c: 2, t: 'DUA', negrita: true, tam: 7 }, { r: 1, c: 3, t: '' },
      { r: 1, c: 4, t: 'IMPORTACIÓN', negrita: true, tam: 7 }, { r: 1, c: 5, t: '', centro: true, negrita: true },
      { r: 1, c: 6, t: acta.numero, negrita: true, centro: true },
      { r: 2, c: 0, t: 'PROVEEDOR', negrita: true, tam: 7 }, { r: 2, c: 1, t: esCompra ? contraparte : '' },
      { r: 2, c: 2, t: 'GUÍA REMISIÓN', negrita: true, tam: 7 }, { r: 2, c: 3, t: vacio(i.guiaNumero), tam: 7 },
      { r: 2, c: 4, t: 'COMPRA LOCAL', negrita: true, tam: 7 }, { r: 2, c: 5, t: X(esCompra), centro: true, negrita: true },
      { r: 2, c: 6, t: '' },
      { r: 3, c: 0, t: 'FECHA', negrita: true, tam: 7 }, { r: 3, c: 1, t: fechaDe(acta.firmadaEn ?? acta.generadaEn) },
      { r: 3, c: 2, t: i.tipo === 'DEVOLUCION' ? (i.docOriginalTipo === 'BOLETA' ? 'BOLETA' : 'FACTURA') : 'FACTURA', negrita: true, tam: 7 },
      { r: 3, c: 3, t: vacio(i.tipo === 'DEVOLUCION' ? i.docOriginalNumero : i.facturaNumero), tam: 7 },
      { r: 3, c: 4, t: 'DEVOLUCIÓN', negrita: true, tam: 7 }, { r: 3, c: 5, t: X(i.tipo === 'DEVOLUCION'), centro: true, negrita: true },
      { r: 3, c: 6, t: 'MOTIVO', negrita: true },
      { r: 4, c: 0, t: '' }, { r: 4, c: 1, t: '' }, { r: 4, c: 2, t: '' }, { r: 4, c: 3, t: '' },
      { r: 4, c: 4, t: 'OTROS', negrita: true, tam: 7 }, { r: 4, c: 5, t: X(i.tipo === 'INGRESO_CLIENTE'), centro: true, negrita: true },
      { r: 4, c: 6, t: motivo, tam: 7 },
    ],
  }

  // ── Tabla 2: productos, mínimo 4 filas (se parte en tablas de 12 filas si hay más) ──
  type Lote = ActaRecepcionVista['contenido']['lineas'][number]['lotes'][number]
  const filasProd = c.lineas.flatMap((l, n) => (l.lotes.length ? l.lotes.map((x, k) => ({ l, x: x as Lote | undefined, primera: k === 0, n })) : [{ l, x: undefined as Lote | undefined, primera: true, n }]))
  type FilaProd = string[]
  const datosProd: FilaProd[] = filasProd.map(({ l, x, primera, n }, k) => [
    primera ? String(n + 1) : '', primera ? l.descripcion : '', primera ? vacio(l.registroSanitario) : '',
    x?.lote ?? '', x ? (x.venceTexto ? textoVencimiento(x.vence, x.venceTexto) : formatoFecha(x.vence)) : '',
    primera ? String(l.cantidadEstablecida) : '', x ? String(x.cantidad) : '',
    k === 0 ? vacio(i.bultos) : '', k === 0 ? vacio(i.paletas) : '',
    [k === 0 && i.ocCodigo ? `O.C. ${i.ocCodigo}` : '', x?.posicion ? `Ubic. ${x.posicion}` : '', x && x.cantidadInicial != null && x.cantidadInicial !== x.cantidad ? `Solicitud inicial: ${x.cantidadInicial}` : ''].filter(Boolean).join(' · '),
  ])
  for (let k = 0; k < Math.max(0, FILAS_MINIMAS - filasProd.length); k++) datosProd.push([String(c.lineas.length + k + 1), '', '', '', '', '', '', '', '', ''])
  const encProd = ['N°', 'DESCRIPCIÓN DEL PRODUCTO', 'R.S.', 'LOTE', 'F. EXPIRA', 'CANTIDAD ESTABLECIDA', 'CANTIDAD RECIBIDA', 'N°  BULTOS', 'Nº PALETAS', 'OBSERVACIONES']
  const kProd = ANCHO_REF / COLS_PRODUCTOS.reduce((a, b) => a + b, 0)
  const productos: TablaFormato[] = []
  for (let k = 0; k < datosProd.length; k += FILAS_POR_TABLA) {
    const fs = datosProd.slice(k, k + FILAS_POR_TABLA)
    const altos: Record<number, number> = { 0: 22 }
    fs.forEach((f, r) => { altos[r + 1] = Math.max(lineasDeTexto(f[1], COLS_PRODUCTOS[1] * kProd), lineasDeTexto(f[9], COLS_PRODUCTOS[9] * kProd)) * 9.5 + 5 })
    const celdas: CeldaFormato[] = encProd.map((t, cc) => ({ r: 0, c: cc, t, negrita: true, centro: true, tam: 6.2 }))
    fs.forEach((f, r) => f.forEach((t, cc) => celdas.push({ r: r + 1, c: cc, t, negrita: cc === 0, centro: cc !== 1 && cc !== 9, tam: cc === 9 || cc === 2 || cc === 3 ? 7 : 8 })))
    productos.push({ cols: COLS_PRODUCTOS, filas: [362, ...fs.map((_, r) => [299, 275, 278, 255][r] ?? 270)], celdas, altos })
  }

  // ── Tabla 3: verificación del estado del producto (4796 | 774 | 776 | 2790 | 1085 | 1549 | 3754) ──
  const sn = (cond: boolean | undefined, r: number): CeldaFormato[] => [
    { r, c: 1, t: cond === undefined ? '' : X(cond === true), centro: true, negrita: true },
    { r, c: 2, t: cond === undefined ? '' : X(cond === false), centro: true, negrita: true },
  ]
  const conteo = i.tipoConteo
  const T_CANT = 'CANTIDAD RECIBIDA (CANTIDAD DE CAJAS Y CANTIDAD DE UNIDADES CORRESPONDE A INDICADO EN EL DOCUMENTO)'
  const T_EMB = 'EL MATERIAL DE EMBALAJE SE ENCUENTRA SUCIO, ARRUGADO, HUMEDAD, DETERIORADO'
  const anchoEtiqueta = (4796 * ANCHO_REF) / 15524
  const verificacion: TablaFormato = {
    cols: [4796, 774, 776, 2790, 1085, 1549, 3754], filas: [229, 106, 313, 499, 313],
    altos: { 2: lineasDeTexto(T_CANT, anchoEtiqueta) * 9 + 5, 3: lineasDeTexto(T_EMB, anchoEtiqueta) * 9 + 5 },
    celdas: [
      { r: 0, c: 0, rs: 2, t: 'VERIFICACIÓN DEL ESTADO DEL PRODUCTO', negrita: true },
      { r: 0, c: 1, cs: 2, t: 'CONFORME', negrita: true, centro: true },
      { r: 0, c: 3, cs: 2, rs: 2, t: 'TIPO DE CONTEO', negrita: true, centro: true },
      { r: 0, c: 5, cs: 2, rs: 2, t: 'VEHÍCULO DE TRANSPORTE', negrita: true, centro: true },
      { r: 1, c: 1, t: 'SÍ', negrita: true, centro: true }, { r: 1, c: 2, t: 'NO', negrita: true, centro: true },
      { r: 2, c: 0, t: T_CANT, negrita: true, tam: 7.5 }, ...sn(v.cantidadCorresponde, 2),
      { r: 2, c: 3, t: 'CONTEO POR MUESTREO' }, { r: 2, c: 4, t: X(conteo === 'MUESTREO'), centro: true, negrita: true },
      { r: 2, c: 5, t: 'PLACA:', negrita: true }, { r: 2, c: 6, t: vacio(i.placa) },
      // «El material de embalaje se encuentra sucio…»: SÍ = hay problema. El dato guardado es «embalaje limpio», así que se invierte.
      { r: 3, c: 0, t: T_EMB, negrita: true, tam: 7.5 }, ...sn(v.embalajeLimpio === undefined ? undefined : !v.embalajeLimpio, 3),
      { r: 3, c: 3, t: 'CONTEO AL 100%' }, { r: 3, c: 4, t: X(conteo === 'TOTAL'), centro: true, negrita: true },
      { r: 3, c: 5, t: 'MARCA:', negrita: true }, { r: 3, c: 6, t: vacio(i.marcaVehiculo) },
      { r: 4, c: 0, t: 'LAS CAJAS SE ENCUENTRAN DEBIDAMENTE SELLADAS', negrita: true, tam: 7.5 }, ...sn(v.cajasSelladas, 4),
      { r: 4, c: 3, t: 'OTROS' }, { r: 4, c: 4, t: X(conteo === 'OTROS'), centro: true, negrita: true },
      { r: 4, c: 5, t: 'T°', negrita: true }, { r: 4, c: 6, t: i.temperaturaC != null ? `${i.temperaturaC} °C` : '' },
    ],
  }

  // ── Tabla 4: firmas (3823 | 1168 | 3498 | 1493 | 3361 | 1633) ──
  const jefe = firma('JEFE_ALMACEN'); const dt = firma('DIRECCION_TECNICA'); const tr = firma('TRANSPORTISTA'); const cnt = firma('RESPONSABLE_CONTEO')
  const firmas: TablaFormato = {
    cols: [3823, 1168, 3498, 1493, 3361, 1633], filas: [302, 265, 283, 275, 302, 302],
    celdas: [
      { r: 0, c: 0, cs: 2, t: 'JEFE DE ALMACÉN', negrita: true, centro: true },
      { r: 0, c: 2, cs: 2, t: 'DIRECCIÓN TÉCNICA', negrita: true, centro: true },
      { r: 0, c: 4, cs: 2, t: 'TRANSPORTISTA', negrita: true, centro: true },
      { r: 1, c: 0, t: `NOMBRE: ${jefe?.nombre ?? ''}`, negrita: true }, { r: 1, c: 1, t: 'FIRMA', negrita: true, centro: true },
      { r: 1, c: 2, t: `NOMBRE: ${dt?.nombre ?? ''}`, negrita: true }, { r: 1, c: 3, t: 'FIRMA:', negrita: true, centro: true },
      { r: 1, c: 4, t: `NOMBRE: ${tr?.nombre ?? ''}${tr?.dni ? `  DNI: ${tr.dni}` : ''}`, negrita: true, tam: 7 }, { r: 1, c: 5, t: 'FIRMA:', negrita: true, centro: true },
      { r: 2, c: 0, t: `FECHA: ${fechaDe(jefe?.firmadoEn)}`, negrita: true }, { r: 2, c: 1, rs: 3, t: { firma: 'JEFE_ALMACEN', firmada: !!jefe } },
      { r: 2, c: 2, t: `FECHA: ${fechaDe(dt?.firmadoEn)}`, negrita: true }, { r: 2, c: 3, rs: 3, t: { firma: 'DIRECCION_TECNICA', firmada: !!dt } },
      { r: 2, c: 4, t: `FECHA: ${fechaDe(tr?.firmadoEn)}`, negrita: true }, { r: 2, c: 5, rs: 3, t: { firma: 'TRANSPORTISTA', firmada: !!tr } },
      { r: 3, c: 0, t: `HORA INICIO: ${horaLima(i.horaInicio)}`, negrita: true }, { r: 3, c: 2, rs: 2, t: `HORA: ${horaLima(dt?.firmadoEn)}`, negrita: true },
      { r: 3, c: 4, rs: 2, t: `HORA: ${horaLima(tr?.firmadoEn)}`, negrita: true },
      { r: 4, c: 0, t: `HORA FINAL: ${horaLima(i.horaFin)}`, negrita: true },
      { r: 5, c: 0, t: `RESPONSABLE DE CONTEO: ${cnt?.nombre ?? ''}`, negrita: true },
      { r: 5, c: 1, t: cnt ? { firma: 'RESPONSABLE_CONTEO', firmada: true } : 'FIRMA:', negrita: true, centro: true },
      { r: 5, c: 2, cs: 4, t: '' },
    ],
  }

  return { encabezado, datos, productos, verificacion, firmas, observaciones: i.observaciones || undefined }
}
