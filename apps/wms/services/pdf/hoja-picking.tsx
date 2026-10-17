import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { mesAnio } from '@/domain/salidas'
import type { OrdenPickingVista } from '@/domain/despacho'
import { LOGO_LOGISALUD } from '../pdf-logo'

// Hoja de picking para imprimir (A4 vertical): las líneas en el orden del recorrido del almacén, con casilla para tildar y espacio para firmar.
// No es un formato regulado: es la ayuda impresa de la pantalla de picking.
const s = StyleSheet.create({
  pagina: { padding: 28, fontSize: 10, color: '#111827', fontFamily: 'Helvetica' },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 9, padding: 4 },
  td: { padding: 4, borderTop: '0.5pt solid #9CA3AF' },
})
const W = { ok: '7%', ub: '16%', prod: '36%', lote: '17%', cant: '10%', nota: '14%' }

function Hoja({ o }: { o: OrdenPickingVista }) {
  const lineas = [...o.lineasDetalle].sort((a, b) => a.ordenRecorrido - b.ordenRecorrido)
  return (
    <Document title={`Hoja de picking ${o.numero}`} author="WMS LOGISALUD" subject="Hoja de picking">
      <Page size="A4" style={s.pagina}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Image src={LOGO_LOGISALUD} style={{ height: 28, objectFit: 'contain' }} />
          <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold' }}>HOJA DE PICKING</Text>
        </View>
        <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
          <View><Text style={{ fontFamily: 'Helvetica-Bold' }}>Pedido {o.pedidoNumero ?? o.salidaNumero}</Text><Text>{o.cliente ?? 'Sin cliente'}</Text></View>
          <View style={{ alignItems: 'flex-end' }}><Text>Orden {o.numero}</Text><Text>Salida {o.salidaNumero}{o.rutaNumero ? ` · Ruta ${o.rutaNumero}` : ''}</Text></View>
        </View>
        <View style={{ marginTop: 10, border: '1pt solid #000' }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#E5E7EB' }}>
            <Text style={[s.th, { width: W.ok }]}>OK</Text><Text style={[s.th, { width: W.ub }]}>UBICACIÓN</Text><Text style={[s.th, { width: W.prod }]}>PRODUCTO</Text>
            <Text style={[s.th, { width: W.lote }]}>LOTE / VENCE</Text><Text style={[s.th, { width: W.cant, textAlign: 'right' }]}>CANT.</Text><Text style={[s.th, { width: W.nota }]}>NOTA</Text>
          </View>
          {lineas.map((l) => (
            <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center' }} wrap={false}>
              <View style={[s.td, { width: W.ok }]}><View style={{ width: 12, height: 12, border: '1pt solid #000' }} /></View>
              <Text style={[s.td, { width: W.ub, fontFamily: 'Helvetica-Bold' }]}>{l.ubicacion}</Text>
              <Text style={[s.td, { width: W.prod }]}>{l.producto}</Text>
              <Text style={[s.td, { width: W.lote }]}>{l.lote}{'\n'}{l.vence ? mesAnio(l.vence) : '—'}</Text>
              <Text style={[s.td, { width: W.cant, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{l.cantidad}</Text>
              <Text style={[s.td, { width: W.nota }]}> </Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 36, flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ width: 200, borderTop: '0.75pt solid #000', paddingTop: 3 }}><Text style={{ fontSize: 9, textAlign: 'center' }}>Pickeó</Text></View>
          <View style={{ width: 200, borderTop: '0.75pt solid #000', paddingTop: 3 }}><Text style={{ fontSize: 9, textAlign: 'center' }}>Conformidad (otra persona)</Text></View>
        </View>
      </Page>
    </Document>
  )
}

export const renderHojaPicking = (o: OrdenPickingVista) => renderToBuffer(<Hoja o={o} />)
