import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { ROTULO_ALMACENAMIENTO, ROTULO_CODIGO, ROTULO_SUBTITULO, ROTULO_TITULO, ROTULOS_POR_HOJA, type DatosRotulo } from '@/domain/rotulos'
import { LOGO_LOGISALUD } from '../pdf-logo'

// «STATUS DEL PRODUCTO (Cajas Saldo)», formato LS.ET.07: dos rótulos por hoja A4. Lleno: usuario, producto, R.S., lote, vencimiento y status. En blanco, para hacerlo a mano: la cantidad y la firma
// de cada conteo. La primera casilla de «F.CONT.» trae la fecha del conteo (hoy).
const borde = '1pt solid #111827'
const fino = '0.7pt solid #111827'
const s = StyleSheet.create({
  pagina: { padding: 18, fontFamily: 'Helvetica', color: '#111827', fontSize: 10 },
  rotulo: { border: borde, height: 396, marginBottom: 4 },
  fila: { flexDirection: 'row', borderTop: fino },
  etiqueta: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, padding: 3 },
})

const COLUMNAS = 6
const BloqueConteo = ({ primero, fecha }: { primero: boolean; fecha: string }) => (
  <View style={{ borderLeft: fino, borderTop: fino, marginBottom: 10, width: 268 }}>
    {['CANT.', 'F.CONT.', 'FIRMA'].map((nombre) => (
      <View key={nombre} style={{ flexDirection: 'row', height: 22 }}>
        <Text style={{ width: 52, fontFamily: 'Helvetica-Bold', fontSize: 9.5, padding: 3, borderRight: fino, borderBottom: fino }}>{nombre}</Text>
        {Array.from({ length: COLUMNAS }, (_, i) => (
          <View key={i} style={{ width: 36, borderRight: fino, borderBottom: fino, justifyContent: 'center', alignItems: 'center' }}>
            {nombre === 'F.CONT.' && primero && i === 0 ? <Text style={{ fontSize: 6.5 }}>{fecha}</Text> : null}
          </View>
        ))}
      </View>
    ))}
  </View>
)

const Rotulo = ({ d }: { d: DatosRotulo }) => (
  <View style={s.rotulo} wrap={false}>
    <View style={{ height: 42, justifyContent: 'center', paddingLeft: 6 }}><Image src={LOGO_LOGISALUD} style={{ height: 28, objectFit: 'contain', alignSelf: 'flex-start' }} /></View>
    <View style={{ borderTop: fino, alignItems: 'center', paddingVertical: 2 }}>
      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 11 }}>{ROTULO_TITULO}</Text>
      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10.5 }}>{ROTULO_SUBTITULO}</Text>
    </View>
    <View style={s.fila}><Text style={s.etiqueta}>USUARIO: <Text style={{ fontFamily: 'Helvetica' }}>{d.usuario}</Text></Text></View>
    <View style={[s.fila, { height: 28 }]}>
      <Text style={[s.etiqueta, { width: 108, borderRight: fino }]}>PRODUCTO:</Text>
      <Text style={{ flexGrow: 1, flexShrink: 1, padding: 3, fontSize: 9.5, maxLines: 2 }}>{d.producto}</Text>
    </View>
    <View style={[s.fila, { height: 27 }]}>
      <Text style={[s.etiqueta, { width: 108, borderRight: fino }]}>R.S. N°:</Text>
      <Text style={{ flexGrow: 1, padding: 3 }}>{d.registroSanitario ?? ''}</Text>
    </View>
    <View style={[s.fila, { height: 27 }]}>
      <Text style={[s.etiqueta, { width: 108, borderRight: fino }]}>LOTE/SERIE:</Text>
      <Text style={{ flexGrow: 1, padding: 3, fontFamily: 'Helvetica-Bold', fontSize: 11 }}>{d.lote}</Text>
    </View>
    <View style={[s.fila, { height: 27 }]}>
      <Text style={[s.etiqueta, { width: 108, borderRight: fino }]}>VENCIMIENTO:</Text>
      <Text style={{ width: 120, padding: 3, fontFamily: 'Helvetica-Bold', fontSize: 11, borderRight: fino }}>{d.vencimiento}</Text>
      <Text style={{ flexGrow: 1, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 10.5, padding: 3 }}>STATUS</Text>
    </View>
    <View style={[s.fila, { flexGrow: 1 }]}>
      <View style={{ width: 290, paddingLeft: 8, paddingTop: 8 }}>
        <BloqueConteo primero fecha={d.fechaConteo} />
        <BloqueConteo primero={false} fecha="" />
      </View>
      <View style={{ flexGrow: 1, backgroundColor: d.status.color, border: borde, margin: 0, padding: 5, justifyContent: 'space-between' }}>
        <Image src={LOGO_LOGISALUD} style={{ height: 26, objectFit: 'contain', alignSelf: 'flex-start', backgroundColor: '#ffffff' }} />
        <Text style={{ textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 21, color: d.status.textoColor }}>{d.status.texto}</Text>
        <Text style={{ textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8, color: d.status.textoColor }}>{ROTULO_CODIGO}</Text>
      </View>
    </View>
    <View style={{ borderTop: fino, paddingVertical: 2 }}><Text style={{ textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 9.5 }}>Almacenamiento: <Text style={{ fontFamily: 'Helvetica-Oblique' }}>{ROTULO_ALMACENAMIENTO}</Text></Text></View>
  </View>
)

export async function renderRotulosSaldo(rotulos: DatosRotulo[]): Promise<Buffer> {
  const hojas: DatosRotulo[][] = []
  for (let i = 0; i < rotulos.length; i += ROTULOS_POR_HOJA) hojas.push(rotulos.slice(i, i + ROTULOS_POR_HOJA))
  return renderToBuffer(
    <Document title={`Rótulos de caja saldo ${ROTULO_CODIGO}`} author="WMS LOGISALUD" subject="Status del producto (cajas saldo)">
      {hojas.map((h, i) => <Page key={i} size="A4" style={s.pagina}>{h.map((d, k) => <Rotulo key={k} d={d} />)}</Page>)}
    </Document>,
  )
}
