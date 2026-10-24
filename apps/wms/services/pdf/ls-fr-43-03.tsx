import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { formatoFecha } from '@/domain/fechas'
import { cierreVigente, paginarFilas, textoTemperatura, type RegistroLsFrVista } from '@/domain/ls-fr-43-03'
import { LOGO_LOGISALUD } from '../pdf-logo'

// LS-FR.43.03 «Planificación de ruta» (A4 horizontal). Respeta el formato real: encabezado (logo, título, Cód. POE, Cód. Formato, vigencia), datos de la ruta
// (USUARIO, placa, hora de salida / fecha, conductor, llegada / N.° de página, auxiliar), tabla de 10 filas por página y, solo en la última página, las
// firmas de Conductor y Director Técnico. Pie: «Este documento no puede ser reproducido ni fotocopiado sin autorización de LOGISSA S.A.C.» (decidido por Sebas, 2026-10-14).

const VERDE = '#4BB168'
const NEGRO = '#111827'
const s = StyleSheet.create({
  pagina: { padding: 22, paddingBottom: 38, fontSize: 9, color: NEGRO, fontFamily: 'Helvetica' },
  cab: { flexDirection: 'row', border: '1pt solid #000', height: 58 },
  etiquetaVerde: { backgroundColor: VERDE, fontFamily: 'Helvetica-Bold', fontSize: 8.5, padding: 2, paddingLeft: 4, justifyContent: 'center' },
  celda: { padding: 3, borderRight: '0.75pt solid #000', justifyContent: 'center' },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, textAlign: 'center', padding: 3 },
  pie: { position: 'absolute', bottom: 18, left: 24, right: 24, textAlign: 'center', fontSize: 8, fontFamily: 'Helvetica-BoldOblique' },
})

// Anchos (suman 100 %): N°, CLIENTE, N° GUÍA, N° CAJAS, DETALLE (entrega | recojo), TEMPERATURA, HORA DE ENTREGA, OBSERVACIONES
const W = { n: '5%', cliente: '27%', guia: '13%', cajas: '8%', entrega: '7%', recojo: '7%', temp: '10%', hora: '10%', obs: '13%' }

const diaMesAnio = (iso: string) => iso.slice(0, 10).split('-').reverse().join('-')
const hora = (iso?: string) => (iso ? new Date(Date.parse(iso) - 5 * 3_600_000).toISOString().slice(11, 16) : '')
const Dato = ({ k, v, w }: { k: string; v?: string; w: string }) => (
  <View style={{ flexDirection: 'row', width: w, borderRight: '0.75pt solid #000', borderBottom: '0.75pt solid #000', minHeight: 18 }}>
    <Text style={{ fontFamily: 'Helvetica-Bold', padding: 3, width: 98, fontSize: 8.5 }}>{k}</Text><Text style={{ padding: 3, flex: 1 }}>{v ?? ''}</Text>
  </View>
)

function LsFrPdf({ r }: { r: RegistroLsFrVista }) {
  const paginas = paginarFilas(r.filas, r.filasPorPagina)
  const cierre = cierreVigente(r)
  return (
    <Document title={`${r.codigo} ${r.rutaNumero}`} author="WMS LOGISALUD" subject="Planificación de ruta">
      {paginas.map((filas, pi) => (
        <Page key={pi} size="A4" orientation="landscape" style={s.pagina}>
          <View style={s.cab}>
            <View style={[s.celda, { width: 150, alignItems: 'center' }]}><Image src={LOGO_LOGISALUD} style={{ height: 28, objectFit: 'contain' }} /></View>
            <View style={[s.celda, { flex: 1, alignItems: 'center' }]}><Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold' }}>PLANIFICACIÓN DE RUTA</Text></View>
            <View style={{ width: 250 }}>
              <View style={{ flexDirection: 'row', flex: 1, borderBottom: '0.75pt solid #000' }}><Text style={[s.etiquetaVerde, { width: 82, height: '100%' }]}>Cód. POE</Text><Text style={{ padding: 2, paddingLeft: 6, fontFamily: 'Helvetica-Bold', alignSelf: 'center' }}>{r.poe}</Text></View>
              <View style={{ flexDirection: 'row', flex: 1, borderBottom: '0.75pt solid #000' }}><Text style={[s.etiquetaVerde, { width: 82, height: '100%' }]}>Cód. Formato</Text><Text style={{ padding: 2, paddingLeft: 6, fontFamily: 'Helvetica-Bold', alignSelf: 'center' }}>{r.codigo}</Text></View>
              <View style={{ flex: 1 }}><Text style={[s.etiquetaVerde, { flex: 1, textAlign: 'center', fontSize: 7.5 }]}>Fecha de vigencia: Desde {diaMesAnio(r.vigenteDesde)} hasta {diaMesAnio(r.vigenteHasta)}</Text></View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, borderLeft: '0.75pt solid #000', borderTop: '0.75pt solid #000' }}>
            <Dato k="USUARIO:" v={r.usuario} w="38%" /><Dato k="HORA SALIDA:" v={hora(r.horaSalida)} w="31%" /><Dato k="FECHA:" v={formatoFecha(r.fecha)} w="31%" />
            <Dato k="PLACA VEHÍCULO:" v={r.placa} w="38%" /><Dato k="LLEGADA:" v={hora(r.horaLlegada)} w="31%" /><Dato k="N° PAG.:" v={`${pi + 1} de ${paginas.length}`} w="31%" />
            <Dato k="CONDUCTOR:" v={r.conductor} w="38%" /><Dato k="AUX. TRANSPORTE:" v={r.auxiliar} w="62%" />
            <Dato k="TEMP. REGISTRADA:" v={cierre ? `${textoTemperatura(cierre.tempMin, cierre.tempMax)} (data logger Elitech RC-61)${cierre.fueraDeRango ? ' · fuera del rango del formato' : ''}` : ''} w="100%" />
          </View>

          <View style={{ border: '1pt solid #000', marginTop: 6 }}>
            <View style={{ flexDirection: 'row', backgroundColor: '#E5E7EB', borderBottom: '0.75pt solid #000' }}>
              <Text style={[s.th, { width: W.n }]}>N°</Text><Text style={[s.th, { width: W.cliente }]}>CLIENTE</Text><Text style={[s.th, { width: W.guia }]}>N° GUÍA</Text><Text style={[s.th, { width: W.cajas }]}>N° CAJAS</Text>
              <View style={{ width: '14%' }}><Text style={s.th}>DETALLE</Text><View style={{ flexDirection: 'row' }}><Text style={[s.th, { width: '50%', fontSize: 7.5 }]}>ENTREGA</Text><Text style={[s.th, { width: '50%', fontSize: 7.5 }]}>RECOJO</Text></View></View>
              <View style={{ width: W.temp }}><Text style={s.th}>TEMPERATURA</Text><Text style={[s.th, { fontSize: 7.5 }]}>15 °C - 25 °C</Text></View>
              <Text style={[s.th, { width: W.hora }]}>HORA DE ENTREGA</Text><Text style={[s.th, { width: W.obs }]}>OBSERVACIONES</Text>
            </View>
            {filas.map((f) => {
              const llena = 'cliente' in f ? f : null
              return (
                <View key={f.n} style={{ flexDirection: 'row', minHeight: 25, borderBottom: '0.5pt solid #6B7280' }} wrap={false}>
                  <Text style={{ width: W.n, padding: 4, textAlign: 'center' }}>{f.n}</Text>
                  <Text style={{ width: W.cliente, padding: 4, fontSize: 8.5 }}>{llena?.cliente ?? ''}</Text>
                  <Text style={{ width: W.guia, padding: 4, textAlign: 'center' }}>{llena?.guia ?? ''}</Text>
                  <Text style={{ width: W.cajas, padding: 4, textAlign: 'center' }}>{llena?.cajas ?? ''}</Text>
                  <Text style={{ width: W.entrega, padding: 4, textAlign: 'center' }}>{llena?.detalle === 'ENTREGA' ? 'X' : ''}</Text>
                  <Text style={{ width: W.recojo, padding: 4, textAlign: 'center' }}>{llena?.detalle === 'RECOJO' ? 'X' : ''}</Text>
                  <Text style={{ width: W.temp, padding: 4, textAlign: 'center' }}>{llena?.temperatura ?? ''}</Text>
                  <Text style={{ width: W.hora, padding: 4, textAlign: 'center' }}>{hora(llena?.horaEntrega)}</Text>
                  <Text style={{ width: W.obs, padding: 4, fontSize: 8 }}>{llena?.observaciones ?? ''}</Text>
                </View>
              )
            })}
          </View>

          {pi === paginas.length - 1 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 26 }} wrap={false}>
              <View style={{ width: 220, alignItems: 'center' }}><View style={{ borderTop: '1pt solid #000', width: '100%' }} /><Text style={{ fontFamily: 'Helvetica-Bold', marginTop: 3 }}>CONDUCTOR</Text></View>
              <View style={{ width: 220, alignItems: 'center' }}><View style={{ borderTop: '1pt solid #000', width: '100%' }} /><Text style={{ fontFamily: 'Helvetica-Bold', marginTop: 3 }}>DIRECTOR TÉCNICO</Text></View>
            </View>
          )}
          <Text style={s.pie} fixed>Este documento no puede ser reproducido ni fotocopiado sin autorización de LOGISSA S.A.C.</Text>
        </Page>
      ))}
    </Document>
  )
}

export const renderLsFr4303 = (r: RegistroLsFrVista) => renderToBuffer(<LsFrPdf r={r} />)
