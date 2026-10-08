import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { CHECKLIST_ORGANOLEPTICO, ETIQUETA_DECISION, ETIQUETA_RESPUESTA } from '@/domain/entradas'
import type { OrganolepticaVista } from '@/domain/entradas-vistas'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { LOGO_LOGISALUD } from '../pdf-logo'

// Acta de Análisis Organoléptico — formato LS-FR.55.02 (A4 vertical). La numeración O-AAAAMM-NNNN es
// interna (D-13: el formato no la trae; por confirmar con Katia).

const GRIS = '#374151'
const LINEA = '#9CA3AF'
const s = StyleSheet.create({
  pagina: { padding: 28, fontSize: 8.5, color: GRIS, fontFamily: 'Helvetica' },
  cab: { flexDirection: 'row', border: `1pt solid ${LINEA}`, marginBottom: 6 },
  caja: { border: `1pt solid ${LINEA}`, marginBottom: 6 },
  tit: { backgroundColor: '#F3F4F6', fontFamily: 'Helvetica-Bold', padding: 3, borderBottom: `1pt solid ${LINEA}` },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5, paddingHorizontal: 4, borderBottom: `0.5pt solid #E5E7EB` },
})

const D = ({ k, v }: { k: string; v?: string | number | null }) => (
  <View style={{ flexDirection: 'row', padding: 3, width: '50%' }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>{k} </Text><Text>{v === undefined || v === null || v === '' ? '—' : String(v)}</Text></View>
)

function ActaPdf({ a }: { a: OrganolepticaVista }) {
  const c = a.datos.checklist
  const grupos = CHECKLIST_ORGANOLEPTICO.filter((g) => !g.opcional || g.items.some((i) => c[i.id]))
  return (
    <Document title={`Acta organoléptica ${a.numero}`} author="WMS LOGISALUD">
      <Page size="A4" style={s.pagina}>
        <View style={s.cab}>
          <View style={{ width: 120, padding: 6, justifyContent: 'center', borderRight: `1pt solid ${LINEA}` }}><Image src={LOGO_LOGISALUD} style={{ height: 24, objectFit: 'contain' }} /></View>
          <View style={{ flex: 1, padding: 6, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111827' }}>ACTA DE ANÁLISIS ORGANOLÉPTICO</Text></View>
          <View style={{ width: 140, padding: 6, justifyContent: 'center', borderLeft: `1pt solid ${LINEA}` }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Cód. Formato: LS-FR.55.02</Text><Text>N°: {a.numero}</Text></View>
        </View>
        {a.estado !== 'FIRMADA' && <Text style={{ color: '#B45309', fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>{a.estado === 'PENDIENTE_DT' ? 'PENDIENTE de la decisión de Dirección Técnica.' : 'BORRADOR sin enviar.'} Este documento todavía no tiene validez.</Text>}

        <View style={s.caja}>
          <Text style={s.tit}>I. MOTIVO Y PRODUCTO</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <D k="Motivo:" v={a.ingresoTipo === 'COMPRA_LOCAL' ? 'Compra' : a.ingresoTipo === 'DEVOLUCION' ? 'Devolución' : 'Otros (ingreso de cliente)'} /><D k="Ref.:" v={a.referencia} />
            <D k="Nombre del producto:" v={a.producto} /><D k="Lote:" v={a.lote} />
            <D k="Nombre genérico:" v={a.principioActivo} /><D k="Fecha venc.:" v={a.vence ? formatoFecha(a.vence) : undefined} />
            <D k="Cantidad recibida:" v={a.cantidadLote} /><D k="Cantidad de muestra:" v={a.cantidadMuestra} />
            <D k="Registro sanitario:" v={a.registroSanitario} /><D k="F. venc. R.S.:" v={a.rsVence ? formatoFecha(a.rsVence) : undefined} />
            <D k="Fabricante/Proveedor:" v={a.fabricante} /><D k="Forma presentación:" v={a.formaPresentacion} />
            <D k="Cert. análisis / protocolo:" v={a.datos.certAnalisis == null ? undefined : a.datos.certAnalisis ? 'SÍ' : 'NO'} /><D k="Propietario:" v={a.propietario} />
          </View>
        </View>

        <Text style={{ marginBottom: 3, color: '#6B7280' }}>Leyenda: Conforme = SÍ · No conforme = NO · No aplica = N.A.</Text>
        {grupos.map((g) => (
          <View key={g.id} style={s.caja} wrap={false}>
            <Text style={s.tit}>{g.titulo.toUpperCase()}</Text>
            {g.items.map((i) => <View key={i.id} style={s.fila}><Text>{i.texto}</Text><Text style={{ fontFamily: 'Helvetica-Bold' }}>{c[i.id] ? (c[i.id] === 'C' ? 'SÍ' : c[i.id] === 'NC' ? 'NO' : 'N.A.') : '—'}</Text></View>)}
          </View>
        ))}

        <View style={s.caja} wrap={false}>
          <Text style={s.tit}>OBSERVACIÓN, DESTINO Y CONCLUSIÓN</Text>
          <View style={{ padding: 4, gap: 3 }}>
            <Text>OBSERVACIÓN: {a.datos.observacion ?? '—'}</Text>
            <Text>DESTINO SUGERIDO: {a.datos.destinoSugerido === 'APROBADO' ? 'APROBADO' : a.datos.destinoSugerido === 'DEVOLUCION' ? 'DEVOLUCIÓN' : a.datos.destinoSugerido === 'BAJA' ? 'BAJA' : '—'}</Text>
            <Text>CONCLUSIÓN: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{a.datos.conclusion === 'CONFORME' ? 'CONFORME' : a.datos.conclusion === 'NO_CONFORME' ? 'NO CONFORME' : '—'}</Text></Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }} wrap={false}>
          <View style={[s.caja, { flex: 1, minHeight: 60, padding: 4 }]}><Text style={{ fontFamily: 'Helvetica-Bold' }}>REVISADO POR</Text><Text>Asistente de Dirección Técnica</Text></View>
          <View style={[s.caja, { flex: 1, minHeight: 60, padding: 4 }]}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Vº Bº DIRECTOR TÉCNICO</Text>
            {a.decision ? <><Text>DECISIÓN: {ETIQUETA_DECISION[a.decision].toUpperCase()}</Text><Text>{a.decididoPor} · {formatoFechaHora(a.decididoEn)}</Text>{a.observacionDt && <Text>Obs.: {a.observacionDt}</Text>}</> : <Text>pendiente</Text>}
          </View>
        </View>
        <View style={{ position: 'absolute', bottom: 16, left: 28, right: 28, fontSize: 6.5, color: '#6B7280' }} fixed>
          <Text>Acta {a.numero} · {a.estado === 'FIRMADA' ? `firmada electrónicamente · huella SHA-256 ${a.hash}` : 'sin firma'} · {ETIQUETA_RESPUESTA.C}/{ETIQUETA_RESPUESTA.NC}/{ETIQUETA_RESPUESTA.NA}</Text>
        </View>
      </Page>
    </Document>
  )
}

export const renderActaOrganoleptica = (a: OrganolepticaVista) => renderToBuffer(<ActaPdf a={a} />)
