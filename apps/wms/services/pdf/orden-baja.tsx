import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { fechaCorta, motivoParaFormato, partesDeFecha, type ContenidoOrdenBaja } from '@/domain/bajas'
import { LOGO_LOGISALUD } from '../pdf-logo'

// Orden de Baja de Productos — formato LS-FR.56.01 (A4 vertical), tal como el .docx de referencia (docs/wms/referencias): encabezado (logo, título,
// Cód. POE, Cód. Formato, vigencia), «N.º Doc.» y fecha en tres casillas (Día, Mes, Año), «Información del solicitante» (nombre y cargo), la tabla N.º,
// Nombre del Producto, Presentación, N.º Registro Sanitario, N.º Lote, Fecha Expira, Cantidad y Motivo*, la nota «*Motivo de traslado al área de baja»
// y el V°/B° con su línea de firma. Pie: «Este documento no podrá ser reproducido ni fotocopiado sin autorización de LOGISSA S.A.C.»

const VERDE = '#4BB168'
const NEGRO = '#111827'
export const FILAS_POR_PAGINA_BAJA = 14
const s = StyleSheet.create({
  pagina: { padding: 36, paddingBottom: 46, fontSize: 9, color: NEGRO, fontFamily: 'Helvetica' },
  cab: { flexDirection: 'row', border: '1pt solid #000', height: 58 },
  etiquetaVerde: { backgroundColor: VERDE, fontFamily: 'Helvetica-Bold', fontSize: 8.5, padding: 2, paddingLeft: 4, justifyContent: 'center' },
  celda: { padding: 3, borderRight: '0.75pt solid #000', justifyContent: 'center' },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8, textAlign: 'center', padding: 3, borderRight: '0.75pt solid #000' },
  td: { padding: 3, fontSize: 8, borderRight: '0.75pt solid #000' },
  pie: { position: 'absolute', bottom: 20, left: 36, right: 36, textAlign: 'center', fontSize: 7.5, fontFamily: 'Helvetica-BoldOblique' },
})

// Anchos (suman 100 %): N.º, Producto, Presentación, Registro sanitario, Lote, Fecha expira, Cantidad, Motivo
const W = { n: '5%', producto: '21%', pres: '16%', rs: '13%', lote: '10%', vence: '10%', cant: '8%', motivo: '17%' }

const Casilla = ({ k, v, w }: { k: string; v?: string; w: number }) => (
  <View style={{ width: w, border: '0.75pt solid #000', marginLeft: -0.75 }}>
    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8, textAlign: 'center', padding: 2, borderBottom: '0.75pt solid #000', backgroundColor: '#F3F4F6' }}>{k}</Text>
    <Text style={{ fontSize: 10, textAlign: 'center', padding: 3, minHeight: 18 }}>{v ?? ''}</Text>
  </View>
)

const paginar = <T,>(filas: readonly T[], por: number): (T | null)[][] => {
  const paginas = Math.max(1, Math.ceil(filas.length / por))
  return Array.from({ length: paginas }, (_, p) => Array.from({ length: por }, (_, i) => filas[p * por + i] ?? null))
}

function OrdenBajaPdf({ c, borrador, estado, hash }: { c: ContenidoOrdenBaja; borrador: boolean; estado: string; hash?: string }) {
  const paginas = paginar(c.lineas, FILAS_POR_PAGINA_BAJA)
  const f = partesDeFecha(c.fecha)
  return (
    <Document title={`Orden de baja ${c.numero}`} author="WMS LOGISALUD" subject={`${c.formato} Orden de baja de productos`}>
      {paginas.map((filas, pi) => (
        <Page key={pi} size="A4" style={s.pagina}>
          <View style={s.cab}>
            <View style={[s.celda, { width: 118, alignItems: 'center' }]}><Image src={LOGO_LOGISALUD} style={{ height: 26, objectFit: 'contain' }} /></View>
            <View style={[s.celda, { flex: 1, alignItems: 'center' }]}><Text style={{ fontSize: 11.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' }}>ORDEN DE BAJA DE PRODUCTOS</Text></View>
            <View style={{ width: 190 }}>
              <View style={{ flexDirection: 'row', flex: 1, borderBottom: '0.75pt solid #000' }}><Text style={[s.etiquetaVerde, { width: 70, height: '100%' }]}>Cód. POE</Text><Text style={{ padding: 2, paddingLeft: 6, fontFamily: 'Helvetica-Bold', alignSelf: 'center' }}>{c.poe}</Text></View>
              <View style={{ flexDirection: 'row', flex: 1, borderBottom: '0.75pt solid #000' }}><Text style={[s.etiquetaVerde, { width: 70, height: '100%' }]}>Cód. Formato</Text><Text style={{ padding: 2, paddingLeft: 6, fontFamily: 'Helvetica-Bold', alignSelf: 'center' }}>{c.formato}</Text></View>
              <View style={{ flex: 1 }}><Text style={[s.etiquetaVerde, { flex: 1, textAlign: 'center', fontSize: 6.5 }]}>{c.vigencia.startsWith('Desde') ? `Fecha de vigencia: ${c.vigencia}` : c.vigencia}</Text></View>
            </View>
          </View>

          {(borrador || estado === 'ANULADA') && (
            <Text style={{ color: '#B45309', fontFamily: 'Helvetica-Bold', marginTop: 6 }}>
              {estado === 'ANULADA' ? 'ORDEN ANULADA: este documento ya no es válido.' : 'BORRADOR: esta Orden todavía no está autorizada por Dirección Técnica y no tiene validez.'}
            </Text>
          )}

          <View style={{ flexDirection: 'row', marginTop: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', marginRight: 6 }}>Nº Doc.</Text>
              <Text style={{ border: '0.75pt solid #000', padding: 4, minWidth: 120, fontSize: 10, fontFamily: 'Helvetica-Bold' }}>{c.numero}</Text>
            </View>
            <View style={{ flexDirection: 'row', paddingLeft: 0.75 }}>
              <Casilla k="Día" v={f.dia} w={44} /><Casilla k="Mes" v={f.mes} w={44} /><Casilla k="Año" v={f.anio} w={56} />
            </View>
          </View>

          <View style={{ border: '0.75pt solid #000', marginTop: 8 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', padding: 3, backgroundColor: '#F3F4F6', borderBottom: '0.75pt solid #000' }}>Información del solicitante:</Text>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, flexDirection: 'row', padding: 4, borderRight: '0.75pt solid #000' }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Nombre: </Text><Text>{c.solicitante.nombre}</Text></View>
              <View style={{ flex: 1, flexDirection: 'row', padding: 4 }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Cargo: </Text><Text>{c.solicitante.cargo}</Text></View>
            </View>
          </View>

          <View style={{ border: '1pt solid #000', marginTop: 8 }}>
            <View style={{ flexDirection: 'row', backgroundColor: '#E5E7EB', borderBottom: '0.75pt solid #000' }}>
              <Text style={[s.th, { width: W.n }]}>Nº</Text><Text style={[s.th, { width: W.producto }]}>Nombre del Producto</Text><Text style={[s.th, { width: W.pres }]}>Presentación</Text>
              <Text style={[s.th, { width: W.rs }]}>Nº Registro Sanitario</Text><Text style={[s.th, { width: W.lote }]}>Nº Lote</Text><Text style={[s.th, { width: W.vence }]}>{'Fecha\nExpira'}</Text>
              <Text style={[s.th, { width: W.cant }]}>Cantidad</Text><Text style={[s.th, { width: W.motivo, borderRight: 0 }]}>Motivo*</Text>
            </View>
            {filas.map((l, i) => {
              const n = pi * FILAS_POR_PAGINA_BAJA + i + 1
              return (
                <View key={n} style={{ flexDirection: 'row', minHeight: 30, borderBottom: i === filas.length - 1 ? 0 : '0.5pt solid #6B7280' }} wrap={false}>
                  <Text style={[s.td, { width: W.n, textAlign: 'center' }]}>{n}</Text>
                  <Text style={[s.td, { width: W.producto }]}>{l?.producto ?? ''}</Text>
                  <Text style={[s.td, { width: W.pres }]}>{l?.presentacion ?? ''}</Text>
                  <Text style={[s.td, { width: W.rs, textAlign: 'center' }]}>{l?.registroSanitario ?? ''}</Text>
                  <Text style={[s.td, { width: W.lote, textAlign: 'center' }]}>{l?.lote ?? ''}</Text>
                  <Text style={[s.td, { width: W.vence, textAlign: 'center' }]}>{l?.vence ? fechaCorta(l.vence) : ''}</Text>
                  <Text style={[s.td, { width: W.cant, textAlign: 'center' }]}>{l ? l.cantidad.toLocaleString('es-PE') : ''}</Text>
                  <Text style={[s.td, { width: W.motivo, borderRight: 0, fontSize: 7.5 }]}>{l ? motivoParaFormato(l) : ''}</Text>
                </View>
              )
            })}
          </View>

          <Text style={{ marginTop: 6, fontFamily: 'Helvetica-Bold' }}>*{c.motivoTraslado}</Text>

          {pi === paginas.length - 1 && (
            <View style={{ marginTop: 52, alignItems: 'center' }} wrap={false}>
              <View style={{ width: 200, alignItems: 'center' }}><Text>………………………………..</Text><Text style={{ fontFamily: 'Helvetica-Bold', marginTop: 2 }}>V°/B°</Text></View>
            </View>
          )}

          <View style={{ position: 'absolute', bottom: 34, left: 36, right: 36, fontSize: 6.5, color: '#6B7280' }} fixed>
            <Text>{c.numero}{c.reemite ? ` (reemite ${c.reemite})` : ''} · {c.propietario.razonSocial} · {borrador ? 'borrador' : estado === 'ANULADA' ? 'anulada' : 'emitida'}{hash ? ` · huella SHA-256 ${hash}` : ''} · página {pi + 1} de {paginas.length}</Text>
          </View>
          <Text style={s.pie} fixed>Este documento no podrá ser reproducido ni fotocopiado sin autorización de LOGISSA S.A.C.</Text>
        </Page>
      ))}
    </Document>
  )
}

export const renderOrdenBaja = (c: ContenidoOrdenBaja, borrador: boolean, estado: string, hash?: string) => renderToBuffer(<OrdenBajaPdf c={c} borrador={borrador} estado={estado} hash={hash} />)
