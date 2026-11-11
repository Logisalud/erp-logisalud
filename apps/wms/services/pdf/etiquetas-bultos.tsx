import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { destinoDeEtiqueta, type BultoVista } from '@/domain/embalaje'
import { ICONOS_MANIPULACION, LOGO_ETIQUETA } from '../pdf-etiqueta-iconos'

// Etiqueta de bulto de provincia: la hoja LOGISALUD del formato de etiquetas, para la etiquetera TSC TE200 (etiquetas troqueladas de 104,6 × 75,0 mm (anchuras expuestas 1,3 mm), una por página).
// Lleva: ORIGEN y DESTINO, el destinatario, la entrega a domicilio, el n.º de guía, «bulto k de N», el QR del bulto (lo que se escanea al cargar), los íconos de manipulación y el logo.
export const ETIQUETA_ANCHO_MM = 104.6
export const ETIQUETA_ALTO_MM = 75
const MM = 2.8346
const borde = '0.8pt solid #111827'
const s = StyleSheet.create({
  pagina: { padding: 2.5 * MM, fontFamily: 'Helvetica', color: '#111827' },
  fila: { flexDirection: 'row' },
  etiqueta: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#374151' },
})

export interface DatosEtiquetas {
  salidaNumero: string; pedidoNumero?: string; cliente?: string; rutaNumero?: string
  /** Dirección de entrega, distrito y ubigeo del destinatario (de la guía). */
  direccion?: string; distrito?: string; ubigeo?: string
  /** Serie-número de la guía (o de la pre-guía reservada). */
  guiaNumero?: string
  bultos: BultoVista[]
}

export async function renderEtiquetasBultos(d: DatosEtiquetas): Promise<Buffer> {
  const qrs = await Promise.all(d.bultos.map((b) => QRCode.toDataURL(b.codigo, { margin: 0, width: 240, errorCorrectionLevel: 'M' })))
  const destino = destinoDeEtiqueta(d.ubigeo, d.direccion, d.distrito)
  return renderToBuffer(
    <Document title={`Etiquetas ${d.salidaNumero}`} author="WMS LOGISALUD" subject="Etiquetas de bulto (provincia)">
      {d.bultos.map((b, i) => (
        <Page key={b.id} size={[ETIQUETA_ANCHO_MM * MM, ETIQUETA_ALTO_MM * MM]} style={s.pagina}>
          <View style={{ border: borde, flexGrow: 1 }}>
            <View style={[s.fila, { borderBottom: borde, height: 8.5 * MM }]}>
              <View style={{ width: '40%', justifyContent: 'center', paddingLeft: 3, borderRight: borde }}><Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold' }}>ORIGEN: LIMA</Text></View>
              <View style={{ width: '60%', justifyContent: 'center', paddingLeft: 3 }}><Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold' }}>DESTINO: {destino.departamento ?? 'SIN UBIGEO'}</Text></View>
            </View>
            <View style={{ borderBottom: borde, paddingHorizontal: 3, paddingVertical: 2 }}>
              <Text style={s.etiqueta}>DESTINATARIO</Text>
              <Text style={{ fontSize: 10.5, fontFamily: 'Helvetica-Bold', maxLines: 2 }}>{(d.cliente ?? 'SIN CLIENTE').toUpperCase()}</Text>
            </View>
            <View style={{ borderBottom: borde, paddingHorizontal: 3, paddingVertical: 2, height: 14.5 * MM }}>
              <Text style={s.etiqueta}>ENTREGA A DOMICILIO</Text>
              <Text style={{ fontSize: 8.5, maxLines: 3 }}>{destino.entrega.toUpperCase()}</Text>
            </View>
            <View style={[s.fila, { borderBottom: borde, height: 16.5 * MM }]}>
              <View style={{ width: '58%', paddingHorizontal: 3, paddingVertical: 2, borderRight: borde }}>
                <Text style={s.etiqueta}>Nº DE GUÍA</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 1 }}>{d.guiaNumero ?? 'SIN GUÍA AÚN'}</Text>
                <Text style={{ fontSize: 7, marginTop: 1 }}>Pedido {d.pedidoNumero ?? '—'}{d.rutaNumero ? ` · ${d.rutaNumero}` : ''}</Text>
              </View>
              <View style={{ width: '42%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 }}>
                <View>
                  <Text style={s.etiqueta}>BULTO</Text>
                  <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold' }}>{b.secuencia} de {b.total}</Text>
                </View>
                <Image src={qrs[i]} style={{ width: 13 * MM, height: 13 * MM }} />
              </View>
            </View>
            <View style={[s.fila, { flexGrow: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 }]}>
              <Image src={ICONOS_MANIPULACION} style={{ height: 11 * MM, objectFit: 'contain' }} />
              <Image src={LOGO_ETIQUETA} style={{ height: 9.5 * MM, objectFit: 'contain' }} />
            </View>
          </View>
        </Page>
      ))}
    </Document>,
  )
}
