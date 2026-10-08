import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { ETIQUETA_TIPO_INGRESO } from '@/domain/entradas'
import type { SolicitudDetalle } from '@/domain/entradas-vistas'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { LOGO_LOGISALUD } from '../pdf-logo'

// Solicitud de Ingreso (SI-AAAA-NNNNN): documento interno que antecede al Acta de Recepción.
// No tiene código de formato controlado; se muestra como documento interno hasta que Control Documental le asigne uno.

const VERDE = '#4BB168'
const GRIS = '#374151'
const TENUE = '#6B7280'
const LINEA = '#9CA3AF'

const s = StyleSheet.create({
  pagina: { padding: 28, paddingBottom: 40, fontSize: 8.5, color: GRIS, fontFamily: 'Helvetica' },
  cab: { flexDirection: 'row', border: `1pt solid ${LINEA}`, marginBottom: 8 },
  cabLogo: { width: 110, padding: 6, justifyContent: 'center', borderRight: `1pt solid ${LINEA}` },
  cabTitulo: { flex: 1, padding: 6, justifyContent: 'center', alignItems: 'center' },
  cabNum: { width: 140, padding: 6, justifyContent: 'center', borderLeft: `1pt solid ${LINEA}` },
  titulo: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#111827' },
  caja: { border: `1pt solid ${LINEA}`, marginBottom: 8 },
  cajaTitulo: { backgroundColor: '#F3F4F6', fontFamily: 'Helvetica-Bold', padding: 3, borderBottom: `1pt solid ${LINEA}` },
  fila: { flexDirection: 'row' },
  celda: { padding: 3, borderRight: `1pt solid ${LINEA}`, borderBottom: `1pt solid ${LINEA}` },
  th: { fontFamily: 'Helvetica-Bold', backgroundColor: '#F3F4F6' },
  pie: { position: 'absolute', bottom: 16, left: 28, right: 28, fontSize: 6.5, color: TENUE, flexDirection: 'row', justifyContent: 'space-between' },
})

const Dato = ({ k, v, w }: { k: string; v?: string | number | null; w?: string }) => (
  <View style={{ flexDirection: 'row', padding: 3, width: w ?? '50%' }}>
    <Text style={{ fontFamily: 'Helvetica-Bold' }}>{k} </Text><Text>{v === undefined || v === null || v === '' ? '—' : String(v)}</Text>
  </View>
)

function SolicitudPdf({ sol }: { sol: SolicitudDetalle }) {
  const referencia = sol.tipo === 'COMPRA_LOCAL' ? ['O.C.:', sol.ocCodigo] : sol.tipo === 'DEVOLUCION' ? [`${sol.docOriginalTipo === 'BOLETA' ? 'BOLETA' : 'FACTURA'} ORIGINAL:`, sol.docOriginalNumero] : ['GUÍA:', sol.guiaNumero]
  const destino = sol.estadoInicial === 'DEVOLUCIONES' ? 'Devoluciones (no pasa por Cuarentena)' : 'Cuarentena'
  const final = sol.versiones.length > 0 || sol.version > 1
  return (
    <Document title={`Solicitud de Ingreso ${sol.numero}`} author="WMS LOGISALUD">
      <Page size="A4" style={s.pagina}>
        <View style={s.cab}>
          <View style={s.cabLogo}><Image src={LOGO_LOGISALUD} style={{ height: 24, objectFit: 'contain' }} /></View>
          <View style={s.cabTitulo}><Text style={s.titulo}>SOLICITUD DE INGRESO</Text><Text style={{ color: TENUE, marginTop: 2 }}>LOGISALUD · Almacén Lurín · documento interno</Text></View>
          <View style={s.cabNum}><Text>N° SOLICITUD:</Text><Text style={{ fontFamily: 'Helvetica-Bold', color: VERDE, fontSize: 11 }}>{sol.numero}</Text><Text>Versión {sol.version}{final ? ' (final vigente)' : ''}</Text></View>
        </View>

        {sol.estado === 'ANULADA' && <Text style={{ color: '#B91C1C', fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>SOLICITUD ANULADA. Este documento no autoriza ningún ingreso.</Text>}
        {sol.estado !== 'ANULADA' && !sol.autorizadoEn && <Text style={{ color: '#B45309', fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>BORRADOR — todavía no está autorizada.</Text>}

        <View style={s.caja}>
          <Text style={s.cajaTitulo}>DATOS GENERALES</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Dato k="TIPO DE INGRESO:" v={ETIQUETA_TIPO_INGRESO[sol.tipo]} />
            <Dato k="PROPIETARIO DEL STOCK:" v={sol.propietario} />
            <Dato k={sol.tipo === 'COMPRA_LOCAL' ? 'PROVEEDOR:' : 'CLIENTE:'} v={sol.contraparteNombre} />
            <Dato k="RUC:" v={sol.contraparteRuc} />
            <Dato k={referencia[0] as string} v={referencia[1]} />
            <Dato k="GUÍA DE REMISIÓN:" v={sol.guiaNumero} />
            <Dato k="LLEGADA PREVISTA:" v={sol.fechaPrevista ? formatoFecha(sol.fechaPrevista) : undefined} />
            <Dato k="NACE EN:" v={destino} />
            {sol.tipo === 'DEVOLUCION' && <Dato k="MOTIVO:" v={sol.motivo} w="100%" />}
            {sol.observaciones && <Dato k="OBSERVACIONES:" v={sol.observaciones} w="100%" />}
          </View>
        </View>

        <View style={s.caja}>
          <Text style={s.cajaTitulo}>PRODUCTOS QUE SE ESPERAN</Text>
          <View style={s.fila}>
            {[['N°', 18], ['DESCRIPCIÓN DEL PRODUCTO', 170], ['R.S.', 52], ['LOTE', 52], ['F. EXPIRA', 50], ['INICIAL', 34], ['FINAL', 34]].map(([t, w]) => <Text key={String(t)} style={[s.celda, s.th, { width: w as number }]}>{t}</Text>)}
            <Text style={[s.celda, s.th, { flexGrow: 1, borderRight: 0 }]}>ESTADO</Text>
          </View>
          {sol.lineas.map((l, k) => (
            <View key={l.id} style={s.fila} wrap={false}>
              <Text style={[s.celda, { width: 18 }]}>{k + 1}</Text>
              <Text style={[s.celda, { width: 170 }]}>{l.descripcion}</Text>
              <Text style={[s.celda, { width: 52 }]}>{l.registroSanitario ?? '—'}</Text>
              <Text style={[s.celda, { width: 52 }]}>{l.lote}</Text>
              <Text style={[s.celda, { width: 50 }]}>{l.venceTexto ?? (l.vence ? formatoFecha(l.vence) : '—')}</Text>
              <Text style={[s.celda, { width: 34, textAlign: 'right' }]}>{l.inicial ?? l.cantidad}</Text>
              <Text style={[s.celda, { width: 34, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{l.cantidad}</Text>
              <Text style={[s.celda, { flexGrow: 1, borderRight: 0 }]}>{l.cantidad === 0 ? 'Ya no llega' : l.cantidad !== (l.inicial ?? l.cantidad) ? 'Ajustada' : 'Sin cambios'}</Text>
            </View>
          ))}
        </View>

        {sol.cambios.length > 0 && (
          <View style={s.caja} wrap={false}>
            <Text style={s.cajaTitulo}>CAMBIOS A LA SOLICITUD (de lo más reciente a lo más antiguo)</Text>
            {sol.cambios.map((c) => (
              <Text key={c.id} style={{ padding: 3, borderBottom: `1pt solid ${LINEA}` }}>
                {formatoFechaHora(c.ts)} · {c.usuario} · {c.campo}: {c.antes ?? '—'} → {c.despues ?? '—'}{c.motivo ? ` · motivo: ${c.motivo}` : ''}
              </Text>
            ))}
          </View>
        )}

        <View style={s.caja} wrap={false}>
          <Text style={s.cajaTitulo}>TRAZABILIDAD</Text>
          <Dato k="PREPARADA POR:" v={`${sol.creadoPor ?? '—'}${sol.creadoEn ? ` el ${formatoFechaHora(sol.creadoEn)}` : ''}`} w="100%" />
          <Dato k="AUTORIZADA POR:" v={sol.autorizadoPor ? `${sol.autorizadoPor} el ${formatoFechaHora(sol.autorizadoEn)}` : 'pendiente'} w="100%" />
        </View>

        <View style={s.pie} fixed>
          <Text>Solicitud {sol.numero} · versión {sol.version} · generada el {formatoFechaHora(new Date().toISOString())}</Text>
          <Text render={({ pageNumber, totalPages }) => `Pág. ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export const renderSolicitudIngreso = (sol: SolicitudDetalle) => renderToBuffer(<SolicitudPdf sol={sol} />)
