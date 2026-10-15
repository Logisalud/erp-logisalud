import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'
import { documentosDelPaquete, ETIQUETA_REQUISITO_CORTA, type PaqueteSalida } from '@/domain/documentacion'
import { ETIQUETA_TIPO_DOCUMENTO } from '@/domain/documentos'
import { mesAnio } from '@/domain/salidas'
import { leerArchivo } from '../archivos'
import { LOGO_LOGISALUD } from '../pdf-logo'

// Paquete documental en UN solo PDF ordenado: carátula (pedido, guía, lotes y estado de cada documento) y, a continuación, los documentos de los lotes EXACTOS
// que salen (registro sanitario y BPM del producto, COA del lote), sin repetir. Lo que no se puede leer se reemplaza por una hoja que lo dice: nunca se omite en silencio.

const s = StyleSheet.create({
  pagina: { padding: 32, fontSize: 10, color: '#111827', fontFamily: 'Helvetica' },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 9, padding: 4, backgroundColor: '#E5E7EB' },
  td: { padding: 4, borderTop: '0.5pt solid #9CA3AF' },
})

const dm = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')

function Caratula({ p, incompleto }: { p: PaqueteSalida; incompleto: boolean }) {
  return (
    <Document title={`Paquete documental ${p.salidaNumero}`} author="WMS LOGISALUD" subject="Paquete documental">
      <Page size="A4" style={s.pagina}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Image src={LOGO_LOGISALUD} style={{ height: 28, objectFit: 'contain' }} />
          <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold' }}>PAQUETE DOCUMENTAL</Text>
        </View>
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Pedido {p.pedidoNumero ?? '—'} · Salida {p.salidaNumero}</Text>
          <Text>{p.cliente ?? 'Sin cliente'}{p.ruc ? ` · RUC ${p.ruc}` : ''}</Text>
          <Text style={{ marginTop: 4 }}>Guía de remisión: {p.guia ? `${p.guia.numero}${p.guia.placa ? ` · placa ${p.guia.placa}` : ''}` : 'todavía sin registrar'}</Text>
        </View>
        {incompleto && <Text style={{ marginTop: 10, padding: 6, border: '1pt solid #B45309', color: '#92400E', fontFamily: 'Helvetica-Bold' }}>PAQUETE INCOMPLETO: {p.faltantes.join('; ')}.</Text>}
        <View style={{ marginTop: 14, border: '1pt solid #000' }}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={[s.th, { width: '28%' }]}>PRODUCTO</Text><Text style={[s.th, { width: '22%' }]}>LOTE</Text><Text style={[s.th, { width: '9%' }]}>CANT.</Text>
            <Text style={[s.th, { width: '41%' }]}>DOCUMENTOS</Text>
          </View>
          {p.items.map((i) => (
            <View key={`${i.lineaId}-${i.loteId}`} style={{ flexDirection: 'row' }} wrap={false}>
              <Text style={[s.td, { width: '28%' }]}>{i.productoCodigo} {i.producto}</Text>
              <Text style={[s.td, { width: '22%' }]}>{i.lote}</Text>
              <Text style={[s.td, { width: '9%' }]}>{i.cantidad}</Text>
              <View style={[s.td, { width: '41%' }]}>
                {i.requisitos.filter((r) => r.exigido).map((r) => (
                  <Text key={r.tipo}>{ETIQUETA_TIPO_DOCUMENTO[r.tipo]}: {ETIQUETA_REQUISITO_CORTA[r.estado]}{r.vigenteHasta ? ` (vigente hasta ${dm(r.vigenteHasta)})` : ''}</Text>
                ))}
              </View>
            </View>
          ))}
        </View>
        {p.guia && (
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Lo que dice la guía {p.guia.numero} (tomado de la conformidad)</Text>
            {p.guia.lineas.map((l, k) => <Text key={k}>{l.productoCodigo} · lote {l.lote}{l.vence ? ` · vence ${mesAnio(l.vence)}` : ''} · {l.cantidad} u</Text>)}
          </View>
        )}
      </Page>
    </Document>
  )
}

function HojaNota({ titulo, nota }: { titulo: string; nota: string }) {
  return <Document><Page size="A4" style={s.pagina}><Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>{titulo}</Text><Text style={{ marginTop: 10 }}>{nota}</Text></Page></Document>
}

/** Une los PDF de varios pedidos (una ruta) o de uno solo en un único archivo. */
export async function armarPaquetePdf(paquetes: readonly PaqueteSalida[], refDe: (documentoId: string) => string | undefined): Promise<Buffer> {
  const final = await PDFDocument.create()
  const anexar = async (bytes: Uint8Array) => {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    for (const pg of await final.copyPages(src, src.getPageIndices())) final.addPage(pg)
  }
  for (const p of paquetes) {
    await anexar(await renderToBuffer(<Caratula p={p} incompleto={!p.completo} />))
    for (let copia = 0; copia < Math.max(1, p.copias); copia++) {
      for (const d of documentosDelPaquete(p.items)) {
        let hecho = false
        const ref = refDe(d.documentoId)
        const bytes = ref ? await leerArchivo(ref) : null
        if (bytes) { try { await anexar(bytes); hecho = true } catch { /* se avisa abajo */ } }
        if (!hecho) await anexar(await renderToBuffer(<HojaNota titulo={d.titulo} nota={`No se pudo incluir el archivo «${d.nombreArchivo}» en este paquete. Descárgalo desde Documentos y agrégalo a mano antes de entregar.`} />))
      }
    }
  }
  return Buffer.from(await final.save())
}
