// El formato mensual (LS-FR.49.03 o LS-FR.52.03) en Word: una hoja apaisada con los puntos en filas y los días del mes en columnas, lo hecho por día, quién lo realizó y quién lo supervisó,
// las observaciones y las líneas de firma (Conductor y Director Técnico, a mano). Sin dependencias: un .docx es un zip con XML.
import { armarZip } from './zip'
import { FORMATOS, armarMes, diasDelMes, marcaImpresa, mesLargo, type InspeccionVista, type TipoInspeccion } from '@/domain/inspecciones'

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const run = (t: string, o: { negrita?: boolean; tam?: number } = {}) => `<w:r><w:rPr>${o.negrita ? '<w:b/>' : ''}<w:sz w:val="${o.tam ?? 16}"/><w:szCs w:val="${o.tam ?? 16}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`
const par = (t: string, o: { negrita?: boolean; tam?: number; centro?: boolean } = {}) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${o.centro ? '<w:jc w:val="center"/>' : ''}</w:pPr>${t ? run(t, o) : ''}</w:p>`
const celda = (t: string, ancho: number, o: { negrita?: boolean; tam?: number; centro?: boolean; span?: number; sombra?: boolean } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ''}${o.sombra ? '<w:shd w:val="clear" w:color="auto" w:fill="E5E7EB"/>' : ''}<w:vAlign w:val="center"/></w:tcPr>${par(t, { negrita: o.negrita, tam: o.tam, centro: o.centro })}</w:tc>`
const fila = (celdas: string[]) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${celdas.join('')}</w:tr>`
const BORDES = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="444444"/>`).join('')
const tabla = (cuadricula: number[], filas: string[]) => `<w:tbl><w:tblPr><w:tblW w:w="${cuadricula.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${BORDES}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="40" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${cuadricula.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${filas.join('')}</w:tbl>`

const iniciales = (nombre: string) => nombre.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase()).slice(0, 3).join('')

export interface EntradaWord { tipo: TipoInspeccion; placa: string; mes: string; inspecciones: readonly InspeccionVista[] }

export function documentoWord(e: EntradaWord): Uint8Array {
  const f = FORMATOS[e.tipo]
  const dias = armarMes(e.mes, e.inspecciones)
  const n = diasDelMes(e.mes)
  const A_ETIQUETA = 4300; const A_DIA = 330
  const cuadricula = [A_ETIQUETA, ...Array.from({ length: 31 }, () => A_DIA)]
  const total = 1 + 31
  const vacias = (desde: number) => Array.from({ length: 31 - desde }, () => celda('', A_DIA))

  const cuerpo: string[] = []
  // Encabezado: código, título, POE y vigencia
  cuerpo.push(tabla([2200, 9000, 4200], [fila([
    celda(f.codigo, 2200, { negrita: true, centro: true, tam: 20 }),
    celda(f.titulo.toUpperCase(), 9000, { negrita: true, centro: true, tam: 22 }),
    celda([f.poe ? `Cód. POE ${f.poe}` : '', f.vigencia ?? ''].filter(Boolean).join(' · ') || 'Mensual', 4200, { centro: true, tam: 16 }),
  ])]))
  cuerpo.push(par(''))
  cuerpo.push(par(`MES Y AÑO: ${mesLargo(e.mes)}        Nº PLACA: ${e.placa}`, { negrita: true, tam: 20 }))
  cuerpo.push(par(''))

  const filas: string[] = []
  filas.push(fila([celda('DETALLE', A_ETIQUETA, { negrita: true, sombra: true }), ...Array.from({ length: 31 }, (_, i) => celda(String(i + 1).padStart(2, '0'), A_DIA, { negrita: true, centro: true, sombra: true, tam: 12 }))]))
  let grupo = ''
  for (const p of f.puntos) {
    if (p.grupo !== grupo) { grupo = p.grupo; filas.push(fila([celda(grupo.toUpperCase(), A_ETIQUETA + 31 * A_DIA, { negrita: true, span: total, sombra: true, tam: 14 })])) }
    filas.push(fila([
      celda(p.etiqueta, A_ETIQUETA, { tam: 13 }),
      ...Array.from({ length: 31 }, (_, i) => celda(i < n ? marcaImpresa(e.tipo, p.clave, dias[i].inspeccion?.items[p.clave], dias[i].fecha) : '', A_DIA, { centro: true, tam: 13 })),
    ]))
  }
  filas.push(fila([celda('RESULTADOS', A_ETIQUETA + 31 * A_DIA, { negrita: true, span: total, sombra: true, tam: 14 })]))
  for (const [etiqueta, conforme] of [['CONFORME', true], ['NO CONFORME', false]] as const) {
    filas.push(fila([celda(etiqueta, A_ETIQUETA, { negrita: true, tam: 13 }), ...Array.from({ length: 31 }, (_, i) => { const x = i < n ? dias[i].inspeccion : undefined; return celda(x && x.conforme === conforme ? '✓' : '', A_DIA, { centro: true, tam: 13 }) })]))
  }
  filas.push(fila([celda('REALIZADO POR (iniciales)', A_ETIQUETA, { negrita: true, tam: 13 }), ...Array.from({ length: 31 }, (_, i) => celda(i < n && dias[i].inspeccion ? iniciales(dias[i].inspeccion!.realizadaNombre) : '', A_DIA, { centro: true, tam: 9 }))]))
  filas.push(fila([celda('SUPERVISADO POR (iniciales)', A_ETIQUETA, { negrita: true, tam: 13 }), ...Array.from({ length: 31 }, (_, i) => celda(i < n && dias[i].inspeccion?.supervisadaNombre ? iniciales(dias[i].inspeccion!.supervisadaNombre!) : '', A_DIA, { centro: true, tam: 9 }))]))
  void vacias
  cuerpo.push(tabla(cuadricula, filas))
  cuerpo.push(par(''))

  if (f.leyenda) { cuerpo.push(par(`LEYENDA: ${f.leyenda}`, { tam: 14 })); cuerpo.push(par('')) }
  const obs = dias.filter((d) => d.inspeccion?.observaciones).map((d) => `${String(d.dia).padStart(2, '0')}: ${d.inspeccion!.observaciones}`)
  cuerpo.push(par('OBSERVACIONES:', { negrita: true, tam: 16 }))
  if (obs.length) for (const o of obs) cuerpo.push(par(o, { tam: 15 })); else cuerpo.push(par('Sin observaciones.', { tam: 15 }))
  cuerpo.push(par(''))
  cuerpo.push(par(''))
  cuerpo.push(tabla([7000, 1400, 7000], [
    fila([celda('______________________________', 7000, { centro: true }), celda('', 1400), celda('______________________________', 7000, { centro: true })]),
    fila([celda('CONDUCTOR', 7000, { centro: true, negrita: true, tam: 16 }), celda('', 1400), celda('DIRECTOR TÉCNICO', 7000, { centro: true, negrita: true, tam: 16 })]),
  ]))

  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo.join('')}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567" w:header="283" w:footer="283" w:gutter="0"/></w:sectPr></w:body></w:document>`
  return armarZip([
    { nombre: '[Content_Types].xml', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { nombre: '_rels/.rels', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { nombre: 'word/document.xml', contenido: documento },
  ])
}

export const nombreArchivoWord = (tipo: TipoInspeccion, placa: string, mes: string) => `${FORMATOS[tipo].codigo}_${placa.replace(/[^A-Za-z0-9-]/g, '')}_${mes}.docx`
