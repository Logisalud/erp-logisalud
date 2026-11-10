import 'server-only'
import type { ReactNode } from 'react'
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { ETIQUETA_ROL_FIRMA } from '@/domain/entradas'
import type { ActaRecepcionVista } from '@/domain/entradas-vistas'
import { textoVencimiento, formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { actaRecepcionEsBorrador } from '@/domain/borrador-documento'
import { LOGO_FORMATO } from '../pdf-logo-formato'
import { MarcaBorrador } from './marca-borrador'

// Acta de Recepción de Productos — formato controlado LS-FR.03.05 (A4 horizontal), calcado del .docx oficial:
// mismo encabezado (logo, título, Cod. POE, Cod. Formato, vigencia), mismas cuatro tablas con sus celdas, textos, orden y proporciones, y el mismo pie.
// Los anchos y alturas salen de la rejilla del .docx (en twips) y se escalan al ancho útil de la página. Lo único que se agrega son los estados de control
// que el formato no tiene (cinta de BORRADOR / ACTA ANULADA) y, en letra mínima al pie, la huella del acta.

// El formato no parte palabras con guion: una palabra va entera (las celdas están dimensionadas para que quepan).
Font.registerHyphenationCallback((palabra) => [palabra])

const VERDE = '#4BB168'
const NEGRO = '#000000'
const ANCHO = 766   // pt útiles (A4 horizontal 841,9 pt con 38 pt de margen a cada lado)

const s = StyleSheet.create({
  pagina: { paddingTop: 28, paddingBottom: 44, paddingHorizontal: 38, fontSize: 8, color: NEGRO, fontFamily: 'Helvetica' },
  pie: { position: 'absolute', bottom: 14, left: 38, right: 38, alignItems: 'center' },
})

type Celda = { r: number; c: number; rs?: number; cs?: number; contenido?: ReactNode; negrita?: boolean; centro?: boolean; fondo?: string; tam?: number; vcentro?: boolean }

/** Una tabla del formato: columnas y alturas de fila en twips (como en el .docx), celdas con combinación de filas y columnas, bordes negros simples. */
function Rejilla({ cols, filas, celdas, altos }: { cols: number[]; filas: number[]; celdas: Celda[]; altos?: Record<number, number> }) {
  const k = ANCHO / cols.reduce((a, b) => a + b, 0)
  const x = (c: number) => cols.slice(0, c).reduce((a, b) => a + b, 0) * k
  const w = (c: number, cs = 1) => cols.slice(c, c + cs).reduce((a, b) => a + b, 0) * k
  const hFila = filas.map((t, i) => Math.max(t / 20, 13, altos?.[i] ?? 0))
  const y = (r: number) => hFila.slice(0, r).reduce((a, b) => a + b, 0)
  const h = (r: number, rs = 1) => hFila.slice(r, r + rs).reduce((a, b) => a + b, 0)
  const total = hFila.reduce((a, b) => a + b, 0)
  return (
    <View wrap={false} style={{ width: ANCHO, height: total, position: 'relative', borderTop: `0.75pt solid ${NEGRO}`, borderLeft: `0.75pt solid ${NEGRO}` }}>
      {celdas.map((c, i) => (
        <View key={i} style={{ position: 'absolute', left: x(c.c), top: y(c.r), width: w(c.c, c.cs), height: h(c.r, c.rs), borderRight: `0.75pt solid ${NEGRO}`, borderBottom: `0.75pt solid ${NEGRO}`, backgroundColor: c.fondo, justifyContent: c.vcentro === false ? 'flex-start' : 'center', paddingHorizontal: 2 }}>
          {typeof c.contenido === 'string' || typeof c.contenido === 'number'
            ? <Text style={{ fontFamily: c.negrita ? 'Helvetica-Bold' : 'Helvetica', fontSize: c.tam ?? 8, textAlign: c.centro ? 'center' : 'left' }}>{c.contenido}</Text>
            : c.contenido}
        </View>
      ))}
    </View>
  )
}

const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '')
const vacio = (v?: string | number | null) => (v === undefined || v === null ? '' : String(v))
/** Líneas que ocupa un texto en una celda (Helvetica 8 pt ≈ 4,4 pt por letra) para que la fila crezca y no se corte. */
const lineas = (texto: string, anchoPt: number) => Math.max(1, Math.ceil((texto.length * 4.4) / Math.max(20, anchoPt - 8)))

function ActaPdf({ acta, imagenes = {} }: { acta: ActaRecepcionVista; imagenes?: Record<string, string> }) {
  const c = acta.contenido
  const i = c.ingreso
  const v = i.verificaciones ?? {}
  const firma = (rol: ActaRecepcionVista['firmas'][number]['rol']) => acta.firmas.find((f) => f.rol === rol)
  const imagenFirma = (f?: ActaRecepcionVista['firmas'][number]) => (f ? f.imagen ?? (f.imagenRef ? imagenes[f.imagenRef] : undefined) : undefined)
  const fechaDe = (iso?: string) => (iso ? formatoFecha(iso.slice(0, 10)) : '')
  const X = (b: boolean) => (b ? 'X' : '')
  const esCompra = i.tipo === 'COMPRA_LOCAL'
  const contraparte = [i.contraparteNombre, i.contraparteRuc ? `RUC ${i.contraparteRuc}` : ''].filter(Boolean).join(' · ')
  const fechaActa = fechaDe(acta.firmadaEn ?? acta.generadaEn)

  // ── Encabezado (tabla del header del .docx: 4141 | 7150 | 1387 | 2582) ──
  const encabezado: Celda[] = [
    { r: 0, c: 0, rs: 3, contenido: <Image src={LOGO_FORMATO} style={{ height: 40, objectFit: 'contain' }} />, centro: true },
    { r: 0, c: 1, rs: 2, contenido: 'ACTA DE RECEPCIÓN DE PRODUCTOS', negrita: true, centro: true, tam: 16 },
    { r: 0, c: 2, contenido: 'Cod. POE', negrita: true, fondo: VERDE, tam: 9 },
    { r: 0, c: 3, contenido: 'LS-POE.03.05', negrita: true, tam: 9 },
    { r: 1, c: 2, contenido: 'Cod. Formato', negrita: true, fondo: VERDE, tam: 9 },
    { r: 1, c: 3, contenido: 'LS-FR.03.05', negrita: true, tam: 9 },
    { r: 2, c: 1, cs: 3, contenido: 'Fecha de vigencia: Desde  01-09-2026  hasta  01-09-2028', negrita: true, centro: true, fondo: VERDE, tam: 9 },
  ]

  // ── Tabla 1: datos generales (1129 | 3437 | 1808 | 1843 | 1701 | 1276 | 4073) ──
  const motivo = i.tipo === 'DEVOLUCION' ? vacio(i.motivo) : i.tipo === 'INGRESO_CLIENTE' ? 'Ingreso de cliente' : ''
  const datos: Celda[] = [
    { r: 0, c: 0, cs: 2, contenido: 'DATOS GENERALES', negrita: true, centro: true },
    { r: 0, c: 2, cs: 2, contenido: 'CUMPLIMIENTO DOCUMENTARIO', negrita: true, centro: true },
    { r: 0, c: 4, cs: 2, contenido: 'TIPO DE INGRESO', negrita: true, centro: true },
    { r: 0, c: 6, contenido: 'N°  ACTA', negrita: true, centro: true },
    { r: 1, c: 0, contenido: 'CLIENTE', negrita: true, tam: 7 }, { r: 1, c: 1, contenido: esCompra ? '' : contraparte },
    { r: 1, c: 2, contenido: 'DUA', negrita: true, tam: 7 }, { r: 1, c: 3, contenido: '' },
    { r: 1, c: 4, contenido: 'IMPORTACIÓN', negrita: true, tam: 7 }, { r: 1, c: 5, contenido: '', centro: true, negrita: true },
    { r: 1, c: 6, contenido: acta.numero, negrita: true, centro: true },
    { r: 2, c: 0, contenido: 'PROVEEDOR', negrita: true, tam: 7 }, { r: 2, c: 1, contenido: esCompra ? contraparte : '' },
    { r: 2, c: 2, contenido: 'GUÍA REMISIÓN', negrita: true, tam: 7 }, { r: 2, c: 3, contenido: vacio(i.guiaNumero), tam: 7 },
    { r: 2, c: 4, contenido: 'COMPRA LOCAL', negrita: true, tam: 7 }, { r: 2, c: 5, contenido: X(esCompra), centro: true, negrita: true },
    { r: 2, c: 6, contenido: '' },
    { r: 3, c: 0, contenido: 'FECHA', negrita: true, tam: 7 }, { r: 3, c: 1, contenido: fechaActa },
    { r: 3, c: 2, contenido: i.tipo === 'DEVOLUCION' ? (i.docOriginalTipo === 'BOLETA' ? 'BOLETA' : 'FACTURA') : 'FACTURA', negrita: true },
    { r: 3, c: 3, contenido: vacio(i.tipo === 'DEVOLUCION' ? i.docOriginalNumero : i.facturaNumero), tam: 7 },
    { r: 3, c: 4, contenido: 'DEVOLUCIÓN', negrita: true, tam: 7 }, { r: 3, c: 5, contenido: X(i.tipo === 'DEVOLUCION'), centro: true, negrita: true },
    { r: 3, c: 6, contenido: 'MOTIVO', negrita: true },
    { r: 4, c: 0, contenido: '' }, { r: 4, c: 1, contenido: '' }, { r: 4, c: 2, contenido: '' }, { r: 4, c: 3, contenido: '' },
    { r: 4, c: 4, contenido: 'OTROS', negrita: true, tam: 7 }, { r: 4, c: 5, contenido: X(i.tipo === 'INGRESO_CLIENTE'), centro: true, negrita: true },
    { r: 4, c: 6, contenido: motivo, tam: 7 },
  ]

  // ── Tabla 2: productos (521 | 5291 | 846 | 1417 | 851 | 1134 | 1062 | 940 | 838 | 2420), mínimo 4 filas ──
  const colsProd = [521, 5291, 846, 1417, 851, 1134, 1062, 940, 838, 2420]
  const kProd = ANCHO / colsProd.reduce((a, b) => a + b, 0)
  type Lote = ActaRecepcionVista['contenido']['lineas'][number]['lotes'][number]
  const filasProd = c.lineas.flatMap((l, n) => (l.lotes.length ? l.lotes.map((x, k) => ({ l, x: x as Lote | undefined, primera: k === 0, n })) : [{ l, x: undefined as Lote | undefined, primera: true, n }]))
  const relleno = Math.max(0, 4 - filasProd.length)
  type FilaProd = { n: string; desc: string; rs: string; lote: string; vence: string; est: string; rec: string; bultos: string; paletas: string; obs: string }
  const datosProd: FilaProd[] = filasProd.map(({ l, x, primera, n }, k) => ({
    n: primera ? String(n + 1) : '', desc: primera ? l.descripcion : '', rs: primera ? vacio(l.registroSanitario) : '',
    lote: x?.lote ?? '', vence: x ? (x.venceTexto ? textoVencimiento(x.vence, x.venceTexto) : formatoFecha(x.vence)) : '',
    est: primera ? String(l.cantidadEstablecida) : '', rec: x ? String(x.cantidad) : '',
    bultos: k === 0 ? vacio(i.bultos) : '', paletas: k === 0 ? vacio(i.paletas) : '',
    obs: [k === 0 && i.ocCodigo ? `O.C. ${i.ocCodigo}` : '', x?.posicion ? `Ubic. ${x.posicion}` : '', x && x.cantidadInicial != null && x.cantidadInicial !== x.cantidad ? `Solicitud inicial: ${x.cantidadInicial}` : ''].filter(Boolean).join(' · '),
  }))
  for (let k = 0; k < relleno; k++) datosProd.push({ n: String(c.lineas.length + k + 1), desc: '', rs: '', lote: '', vence: '', est: '', rec: '', bultos: '', paletas: '', obs: '' })
  const TROZO = 12
  const trozos: FilaProd[][] = []
  for (let k = 0; k < datosProd.length; k += TROZO) trozos.push(datosProd.slice(k, k + TROZO))
  const encProd = ['N°', 'DESCRIPCIÓN DEL PRODUCTO', 'R.S.', 'LOTE', 'F. EXPIRA', 'CANTIDAD ESTABLECIDA', 'CANTIDAD RECIBIDA', 'N°  BULTOS', 'Nº PALETAS', 'OBSERVACIONES']
  const tablaProductos = (fs: FilaProd[]) => {
    const altos: Record<number, number> = { 0: 22 }
    fs.forEach((f, r) => { altos[r + 1] = Math.max(lineas(f.desc, colsProd[1] * kProd), lineas(f.obs, colsProd[9] * kProd)) * 9.5 + 5 })
    const celdas: Celda[] = encProd.map((t, c) => ({ r: 0, c, contenido: t, negrita: true, centro: true, tam: 6.2 }))
    fs.forEach((f, r) => {
      const vals = [f.n, f.desc, f.rs, f.lote, f.vence, f.est, f.rec, f.bultos, f.paletas, f.obs]
      vals.forEach((t, c) => celdas.push({ r: r + 1, c, contenido: t, negrita: c === 0, centro: c !== 1 && c !== 9, tam: c === 9 || c === 2 || c === 3 ? 7 : 8 }))
    })
    return <Rejilla cols={colsProd} filas={[362, ...fs.map((_, r) => [299, 275, 278, 255][r] ?? 270)]} celdas={celdas} altos={altos} />
  }

  // ── Tabla 3: verificación del estado del producto (4796 | 774 | 776 | 2790 | 1085 | 1549 | 3754) ──
  const sn = (cond: boolean | undefined, r: number): Celda[] => [
    { r, c: 1, contenido: cond === undefined ? '' : X(cond === true), centro: true, negrita: true },
    { r, c: 2, contenido: cond === undefined ? '' : X(cond === false), centro: true, negrita: true },
  ]
  const conteo = i.tipoConteo
  const verificacion: Celda[] = [
    { r: 0, c: 0, rs: 2, contenido: 'VERIFICACIÓN DEL ESTADO DEL PRODUCTO', negrita: true },
    { r: 0, c: 1, cs: 2, contenido: 'CONFORME', negrita: true, centro: true },
    { r: 0, c: 3, cs: 2, rs: 2, contenido: 'TIPO DE CONTEO', negrita: true, centro: true },
    { r: 0, c: 5, cs: 2, rs: 2, contenido: 'VEHÍCULO DE TRANSPORTE', negrita: true, centro: true },
    { r: 1, c: 1, contenido: 'SÍ', negrita: true, centro: true }, { r: 1, c: 2, contenido: 'NO', negrita: true, centro: true },
    { r: 2, c: 0, contenido: 'CANTIDAD RECIBIDA (CANTIDAD DE CAJAS Y CANTIDAD DE UNIDADES CORRESPONDE A INDICADO EN EL DOCUMENTO)', negrita: true, tam: 7.5 },
    ...sn(v.cantidadCorresponde, 2),
    { r: 2, c: 3, contenido: 'CONTEO POR MUESTREO' }, { r: 2, c: 4, contenido: X(conteo === 'MUESTREO'), centro: true, negrita: true },
    { r: 2, c: 5, contenido: 'PLACA:', negrita: true }, { r: 2, c: 6, contenido: vacio(i.placa) },
    // «El material de embalaje se encuentra sucio…»: SÍ = hay problema. El dato guardado es «embalaje limpio», así que se invierte.
    { r: 3, c: 0, contenido: 'EL MATERIAL DE EMBALAJE SE ENCUENTRA SUCIO, ARRUGADO, HUMEDAD, DETERIORADO', negrita: true, tam: 7.5 },
    ...sn(v.embalajeLimpio === undefined ? undefined : !v.embalajeLimpio, 3),
    { r: 3, c: 3, contenido: 'CONTEO AL 100%' }, { r: 3, c: 4, contenido: X(conteo === 'TOTAL'), centro: true, negrita: true },
    { r: 3, c: 5, contenido: 'MARCA:', negrita: true }, { r: 3, c: 6, contenido: vacio(i.marcaVehiculo) },
    { r: 4, c: 0, contenido: 'LAS CAJAS SE ENCUENTRAN DEBIDAMENTE SELLADAS', negrita: true, tam: 7.5 },
    ...sn(v.cajasSelladas, 4),
    { r: 4, c: 3, contenido: 'OTROS' }, { r: 4, c: 4, contenido: X(conteo === 'OTROS'), centro: true, negrita: true },
    { r: 4, c: 5, contenido: 'T°', negrita: true }, { r: 4, c: 6, contenido: i.temperaturaC != null ? `${i.temperaturaC} °C` : '' },
  ]

  const anchoEtiqueta = (4796 * ANCHO) / 15524
  const altosVerificacion: Record<number, number> = {
    2: lineas('CANTIDAD RECIBIDA (CANTIDAD DE CAJAS Y CANTIDAD DE UNIDADES CORRESPONDE A INDICADO EN EL DOCUMENTO)', anchoEtiqueta) * 9 + 5,
    3: lineas('EL MATERIAL DE EMBALAJE SE ENCUENTRA SUCIO, ARRUGADO, HUMEDAD, DETERIORADO', anchoEtiqueta) * 9 + 5,
  }

  // ── Tabla 4: firmas (3823 | 1168 | 3498 | 1493 | 3361 | 1633) ──
  const jefe = firma('JEFE_ALMACEN'); const dt = firma('DIRECCION_TECNICA'); const tr = firma('TRANSPORTISTA'); const conteoF = firma('RESPONSABLE_CONTEO')
  const firmaElectronica = (f?: ActaRecepcionVista['firmas'][number]) => (f ? <Text style={{ fontSize: 6.5, textAlign: 'center' }}>Firma electrónica</Text> : null)
  const imgTr = imagenFirma(tr)
  const firmas: Celda[] = [
    { r: 0, c: 0, cs: 2, contenido: 'JEFE DE ALMACÉN', negrita: true, centro: true },
    { r: 0, c: 2, cs: 2, contenido: 'DIRECCIÓN TÉCNICA', negrita: true, centro: true },
    { r: 0, c: 4, cs: 2, contenido: 'TRANSPORTISTA', negrita: true, centro: true },
    { r: 1, c: 0, contenido: `NOMBRE: ${jefe?.nombre ?? ''}`, negrita: true }, { r: 1, c: 1, contenido: 'FIRMA', negrita: true, centro: true },
    { r: 1, c: 2, contenido: `NOMBRE: ${dt?.nombre ?? ''}`, negrita: true }, { r: 1, c: 3, contenido: 'FIRMA:', negrita: true, centro: true },
    { r: 1, c: 4, contenido: `NOMBRE: ${tr?.nombre ?? ''}${tr?.dni ? `  DNI: ${tr.dni}` : ''}`, negrita: true, tam: 7 }, { r: 1, c: 5, contenido: 'FIRMA:', negrita: true, centro: true },
    { r: 2, c: 0, contenido: `FECHA: ${fechaDe(jefe?.firmadoEn)}`, negrita: true }, { r: 2, c: 1, rs: 3, contenido: firmaElectronica(jefe) },
    { r: 2, c: 2, contenido: `FECHA: ${fechaDe(dt?.firmadoEn)}`, negrita: true }, { r: 2, c: 3, rs: 3, contenido: firmaElectronica(dt) },
    { r: 2, c: 4, contenido: `FECHA: ${fechaDe(tr?.firmadoEn)}`, negrita: true },
    { r: 2, c: 5, rs: 3, contenido: imgTr ? <Image src={imgTr} style={{ height: 38, objectFit: 'contain' }} /> : tr ? <Text style={{ fontSize: 6.5, textAlign: 'center' }}>Firma registrada</Text> : null },
    { r: 3, c: 0, contenido: `HORA INICIO: ${hora(i.horaInicio)}`, negrita: true }, { r: 3, c: 2, rs: 2, contenido: `HORA: ${hora(dt?.firmadoEn)}`, negrita: true },
    { r: 3, c: 4, rs: 2, contenido: `HORA: ${hora(tr?.firmadoEn)}`, negrita: true },
    { r: 4, c: 0, contenido: `HORA FINAL: ${hora(i.horaFin)}`, negrita: true },
    { r: 5, c: 0, contenido: `RESPONSABLE DE CONTEO: ${conteoF?.nombre ?? ''}`, negrita: true },
    { r: 5, c: 1, contenido: conteoF ? firmaElectronica(conteoF) : 'FIRMA:', negrita: true, centro: true },
    { r: 5, c: 2, cs: 4, contenido: '' },
  ]

  return (
    <Document title={`Acta de Recepción ${acta.numero}`} author="WMS LOGISALUD">
      <Page size="A4" orientation="landscape" style={s.pagina}>
        <Rejilla cols={[4141, 7150, 1387, 2582]} filas={[412, 404, 352]} celdas={encabezado} />
        <View style={{ height: 5 }} />

        {actaRecepcionEsBorrador(acta) && <MarcaBorrador detalle={`Faltan las firmas de: ${acta.faltan.map((r) => ETIQUETA_ROL_FIRMA[r]).join(', ') || 'ninguna'}. Este documento todavía no tiene validez.`} />}
        {acta.estado === 'ANULADA' && <Text style={{ color: '#B91C1C', fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>ACTA ANULADA el {formatoFechaHora(acta.anuladaEn)}. Motivo: {acta.motivoAnulacion}.{acta.reemplazadaPorNumero ? ` Reemplazada por ${acta.reemplazadaPorNumero}.` : ''}</Text>}
        {acta.reemplazaANumero && <Text style={{ marginBottom: 4 }}>Reemplaza al acta {acta.reemplazaANumero}.</Text>}

        <Rejilla cols={[1129, 3437, 1808, 1843, 1701, 1276, 4073]} filas={[330, 300, 330, 330, 330]} celdas={datos} />
        <View style={{ height: 5 }} />
        {trozos.map((fs, k) => (<View key={k}>{tablaProductos(fs)}{k < trozos.length - 1 ? <View style={{ height: 3 }} /> : null}</View>))}
        <View style={{ height: 5 }} />
        <Rejilla cols={[4796, 774, 776, 2790, 1085, 1549, 3754]} filas={[229, 106, 313, 499, 313]} celdas={verificacion} altos={altosVerificacion} />
        <View style={{ height: 5 }} />
        {i.observaciones ? <Text style={{ marginBottom: 4 }}>OBSERVACIONES: {i.observaciones}</Text> : null}
        <Rejilla cols={[3823, 1168, 3498, 1493, 3361, 1633]} filas={[302, 265, 283, 275, 302, 302]} celdas={firmas} />

        <View style={s.pie} fixed>
          <Text style={{ fontFamily: 'Helvetica-BoldOblique', fontSize: 9 }}>Este documento no puede ser reproducido ni fotocopiado sin autorización de LOGISSA S.A.C.</Text>
          <Text style={{ fontSize: 5.5, marginTop: 2 }}>Acta {acta.numero} · {acta.estado === 'FIRMADA' ? `firmada electrónicamente el ${formatoFechaHora(acta.firmadaEn)}` : acta.estado === 'BORRADOR' ? 'borrador, pendiente de firmas' : acta.estado.toLowerCase()} · huella SHA-256 {acta.hash}</Text>
        </View>
      </Page>
    </Document>
  )
}

/** `imagenes`: las firmas dibujadas ya leídas del Storage (referencia → data URL), con su huella verificada. */
export const renderActaRecepcion = (acta: ActaRecepcionVista, imagenes: Record<string, string> = {}) => renderToBuffer(<ActaPdf acta={acta} imagenes={imagenes} />)
