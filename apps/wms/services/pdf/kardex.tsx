import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { totalesKardex, type FilaKardex, type FiltroKardex } from '@/domain/inventario'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { LOGO_LOGISALUD } from '../pdf-logo'

// Tarjeta de Control de Existencias (Kardex): solo entradas y salidas, una fila por partida con saldo corrido.
// El código del formato es un parámetro configurable; mientras no haya uno controlado se muestra como PROVISIONAL (D-29).

const GRIS = '#374151'
const LINEA = '#9CA3AF'
const s = StyleSheet.create({
  pagina: { padding: 20, paddingBottom: 34, fontSize: 7, color: GRIS, fontFamily: 'Helvetica' },
  cab: { flexDirection: 'row', border: `1pt solid ${LINEA}`, marginBottom: 6 },
  fila: { flexDirection: 'row' },
  celda: { padding: 2.5, borderRight: `0.5pt solid ${LINEA}`, borderBottom: `0.5pt solid ${LINEA}` },
  th: { fontFamily: 'Helvetica-Bold', backgroundColor: '#F3F4F6' },
  pie: { position: 'absolute', bottom: 12, left: 20, right: 20, fontSize: 6.5, color: '#6B7280', flexDirection: 'row', justifyContent: 'space-between' },
})

const COLS: { t: string; w: number; a?: 'right' }[] = [
  { t: 'TIPO DOCUMENTO', w: 70 }, { t: 'N° ACTA', w: 52 }, { t: 'F. ACTA', w: 44 }, { t: 'LOTE', w: 52 }, { t: 'PROVEEDOR / CLIENTE', w: 104 }, { t: 'RUC', w: 52 },
  { t: 'DOCUMENTO', w: 66 }, { t: 'N° DOC.', w: 50 }, { t: 'UBIC.', w: 36 }, { t: 'ENTRADA', w: 36, a: 'right' }, { t: 'SALIDA', w: 34, a: 'right' }, { t: 'SALDO', w: 38, a: 'right' },
  { t: 'TIPO INGRESO', w: 54 }, { t: 'PROPIETARIO', w: 56 },
]

function KardexPdf({ filas, filtro, producto, formato, generado }: { filas: FilaKardex[]; filtro: FiltroKardex; producto: string; formato: string; generado: string }) {
  const t = totalesKardex(filas)
  const valores = (f: FilaKardex): (string | number)[] => [
    f.tipoDocumento, f.numeroActa ?? '', f.fechaActa ? formatoFecha(f.fechaActa.slice(0, 10)) : '', f.lote ?? '', f.contraparte ?? '', f.ruc ?? '', f.tipoDocRef ?? '', f.numeroDocRef ?? '',
    f.posicion ?? '', f.entrada ?? '', f.salida ?? '', f.saldo, f.tipoIngreso ?? '', f.propietario ?? '',
  ]
  return (
    <Document title={`Kardex ${producto}`} author="WMS LOGISALUD">
      <Page size="A4" orientation="landscape" style={s.pagina}>
        <View style={s.cab}>
          <View style={{ width: 110, padding: 6, justifyContent: 'center', borderRight: `1pt solid ${LINEA}` }}><Image src={LOGO_LOGISALUD} style={{ height: 22, objectFit: 'contain' }} /></View>
          <View style={{ flex: 1, padding: 6, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111827' }}>TARJETA DE CONTROL DE EXISTENCIAS (KARDEX)</Text></View>
          <View style={{ width: 170, padding: 6, justifyContent: 'center', borderLeft: `1pt solid ${LINEA}` }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Cód. Formato: {formato}</Text></View>
        </View>
        <Text style={{ marginBottom: 2 }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>PRODUCTO: </Text>{producto}</Text>
        <Text style={{ marginBottom: 4 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>RANGO: </Text>{filtro.desde ? formatoFecha(filtro.desde) : 'desde el inicio'} — {filtro.hasta ? formatoFecha(filtro.hasta) : 'hoy'}
          {'   '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>SALDO INICIAL: </Text>{t.saldoInicial}{'   '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>ENTRADAS: </Text>{t.entradas}
          {'   '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>SALIDAS: </Text>{t.salidas}{'   '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>SALDO FINAL: </Text>{t.saldoFinal}
        </Text>
        <View fixed style={s.fila}>{COLS.map((c) => <Text key={c.t} style={[s.celda, s.th, { width: c.w, textAlign: c.a }]}>{c.t}</Text>)}</View>
        {filas.map((f, i) => (
          <View key={i} style={[s.fila, f.esSaldoInicial ? { backgroundColor: '#F9FAFB' } : {}]} wrap={false}>
            {valores(f).map((v, k) => <Text key={k} style={[s.celda, { width: COLS[k].w, textAlign: COLS[k].a }, f.esReversa ? { color: '#B91C1C' } : {}]}>{String(v)}</Text>)}
          </View>
        ))}
        {filas.length === 0 && <Text style={{ marginTop: 8 }}>No hay entradas ni salidas en este rango.</Text>}
        <View style={s.pie} fixed>
          <Text>Generado el {formatoFechaHora(generado)} · solo entradas y salidas del libro mayor (no incluye movimientos internos ni cambios de estado){formato.includes('provisional') ? ' · formato provisional, pendiente de código controlado' : ''}</Text>
          <Text render={({ pageNumber, totalPages }) => `Pág. ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export const renderKardex = (filas: FilaKardex[], filtro: FiltroKardex, producto: string, formato: string) =>
  renderToBuffer(<KardexPdf filas={filas} filtro={filtro} producto={producto} formato={formato} generado={new Date().toISOString()} />)
