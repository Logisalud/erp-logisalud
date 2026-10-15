import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { etiquetaBulto, type BultoVista } from '@/domain/embalaje'
import { mesAnio } from '@/domain/salidas'
import { LOGO_LOGISALUD } from '../pdf-logo'

// Etiquetas de bulto (100 × 150 mm, una por página): «Bulto 1 de 3», el QR con el código del bulto, pedido, cliente, ruta y contenido.
const MM = 2.8346
const s = StyleSheet.create({
  pagina: { padding: 10 * MM, fontSize: 9, color: '#111827', fontFamily: 'Helvetica' },
})

export interface DatosEtiquetas { salidaNumero: string; pedidoNumero?: string; cliente?: string; rutaNumero?: string; bultos: BultoVista[] }

export async function renderEtiquetasBultos(d: DatosEtiquetas): Promise<Buffer> {
  const qrs = await Promise.all(d.bultos.map((b) => QRCode.toDataURL(b.codigo, { margin: 1, width: 360, errorCorrectionLevel: 'M' })))
  return renderToBuffer(
    <Document title={`Etiquetas ${d.salidaNumero}`} author="WMS LOGISALUD" subject="Etiquetas de bulto">
      {d.bultos.map((b, i) => (
        <Page key={b.id} size={[100 * MM, 150 * MM]} style={s.pagina}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Image src={LOGO_LOGISALUD} style={{ height: 20, objectFit: 'contain' }} />
            <Text style={{ fontSize: 8 }}>{d.salidaNumero}</Text>
          </View>
          <Text style={{ marginTop: 8, fontSize: 22, fontFamily: 'Helvetica-Bold', textAlign: 'center' }}>BULTO {etiquetaBulto(b).toUpperCase()}</Text>
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <Image src={qrs[i]} style={{ width: 130, height: 130 }} />
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 2 }}>{b.codigo}</Text>
          </View>
          <View style={{ marginTop: 8, borderTop: '1pt solid #111827', paddingTop: 5 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Pedido {d.pedidoNumero ?? '—'}</Text>
            <Text>{d.cliente ?? 'Sin cliente'}</Text>
            {d.rutaNumero && <Text>Ruta {d.rutaNumero}</Text>}
          </View>
          <View style={{ marginTop: 6 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8 }}>CONTENIDO ({b.unidades} u)</Text>
            {b.contenido.map((c, k) => <Text key={k} style={{ fontSize: 8 }}>{c.cantidad} × {c.productoCodigo} {c.producto.slice(0, 28)} · lote {c.lote}{c.vence ? ` · vence ${mesAnio(c.vence)}` : ''}</Text>)}
          </View>
        </Page>
      ))}
    </Document>,
  )
}
