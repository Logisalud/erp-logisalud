import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import type { RutaDelDia } from '@/domain/ruta-del-dia'
import { LOGO_LOGISALUD } from '../pdf-logo'

// Ruta del día (A4 horizontal): la hoja que Roberto entrega al transportista. Una fila por parada, en el orden de la ruta, con las columnas del formato interno.
const VERDE = '#2F8F4E', VERDE_CLARO = '#E8F5EC', GRIS = '#4B5563', LINEA = '#D1D5DB'
const s = StyleSheet.create({
  pagina: { padding: 24, fontSize: 8.5, color: '#111827', fontFamily: 'Helvetica' },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, padding: 4, color: '#FFFFFF' },
  td: { padding: 4, borderBottom: `0.5pt solid ${LINEA}` },
})
const W = { n: '3%', cliente: '18%', cond: '8%', guia: '11%', dir: '20%', dest: '8%', trans: '10%', rep: '10%', pago: '6%', hor: '6%' }
const fecha = (iso: string) => iso.split('-').reverse().join('/')

function Hoja({ r }: { r: RutaDelDia }) {
  return (
    <Document title={`Ruta del ${fecha(r.fecha)}`} author="WMS LOGISALUD" subject="Ruta del día">
      <Page size="A4" orientation="landscape" style={s.pagina}>
        <View style={{ backgroundColor: VERDE, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 3, padding: 4 }}><Image src={LOGO_LOGISALUD} style={{ height: 20, objectFit: 'contain' }} /></View>
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontFamily: 'Helvetica-Bold' }}>RUTA DEL {fecha(r.fecha)}</Text>
          <View style={{ alignItems: 'flex-end' }}><Text style={{ color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>{r.numero}</Text><Text style={{ color: '#FFFFFF' }}>{r.filas.length} {r.filas.length === 1 ? 'parada' : 'paradas'}</Text></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 24, marginTop: 6, marginBottom: 8, color: GRIS }}>
          <Text>Vehículo: <Text style={{ fontFamily: 'Helvetica-Bold', color: '#111827' }}>{r.vehiculo ?? 'sin asignar'}</Text></Text>
          <Text>Conductor: <Text style={{ fontFamily: 'Helvetica-Bold', color: '#111827' }}>{r.conductor ?? 'sin asignar'}</Text></Text>
          <Text>Auxiliar: <Text style={{ fontFamily: 'Helvetica-Bold', color: '#111827' }}>{r.auxiliar ?? '—'}</Text></Text>
        </View>
        <View style={{ border: `0.75pt solid ${LINEA}`, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#111827' }} fixed>
            <Text style={[s.th, { width: W.n }]}>#</Text><Text style={[s.th, { width: W.cliente }]}>CLIENTE</Text><Text style={[s.th, { width: W.cond }]}>CONDICIÓN</Text><Text style={[s.th, { width: W.guia }]}>GUÍA</Text>
            <Text style={[s.th, { width: W.dir }]}>DIRECCIÓN</Text><Text style={[s.th, { width: W.dest }]}>DESTINO</Text><Text style={[s.th, { width: W.trans }]}>TRANSPORTISTA</Text>
            <Text style={[s.th, { width: W.rep }]}>REPRESENTANTE</Text><Text style={[s.th, { width: W.pago }]}>PAGO</Text><Text style={[s.th, { width: W.hor }]}>HORARIO</Text>
          </View>
          {r.filas.map((f) => (
            <View key={f.n} style={{ flexDirection: 'row', backgroundColor: f.n % 2 ? VERDE_CLARO : '#FFFFFF' }} wrap={false}>
              <Text style={[s.td, { width: W.n, fontFamily: 'Helvetica-Bold' }]}>{f.n}</Text><Text style={[s.td, { width: W.cliente, fontFamily: 'Helvetica-Bold' }]}>{f.cliente}</Text>
              <Text style={[s.td, { width: W.cond }]}>{f.condicion}</Text><Text style={[s.td, { width: W.guia }]}>{f.guia}</Text><Text style={[s.td, { width: W.dir }]}>{f.direccion}</Text>
              <Text style={[s.td, { width: W.dest }]}>{f.destino}</Text><Text style={[s.td, { width: W.trans }]}>{f.transportista}</Text><Text style={[s.td, { width: W.rep }]}>{f.representante}</Text>
              <Text style={[s.td, { width: W.pago }]}>{f.formaPago}</Text><Text style={[s.td, { width: W.hor }]}>{f.horario}</Text>
            </View>
          ))}
        </View>
        <Text fixed style={{ position: 'absolute', bottom: 12, left: 24, right: 24, fontSize: 7, color: GRIS, textAlign: 'center' }}>Hoja interna de la ruta del día. El teléfono del cliente no lo entrega Pedidos todavía: se consulta en el pedido.</Text>
      </Page>
    </Document>
  )
}

export async function renderRutaDelDia(r: RutaDelDia): Promise<Buffer> { return renderToBuffer(<Hoja r={r} />) }
