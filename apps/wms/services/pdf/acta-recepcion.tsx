import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { ETIQUETA_ROL_FIRMA } from '@/domain/entradas'
import type { ActaRecepcionVista } from '@/domain/entradas-vistas'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { LOGO_LOGISALUD } from '../pdf-logo'

// Acta de Recepción de Productos — formato controlado LS-FR.03.05 (A4 horizontal).
// Respeta los campos del formato. Cambios acordados con control documental (D-12, por confirmar con Katia):
// el DNI del transportista va como línea adicional y "Ingreso de cliente" (que el formato no tiene) se marca en OTROS con texto.

const VERDE = '#4BB168'
const GRIS = '#374151'
const TENUE = '#6B7280'
const LINEA = '#9CA3AF'

const s = StyleSheet.create({
  pagina: { padding: 24, fontSize: 8, color: GRIS, fontFamily: 'Helvetica' },
  cab: { flexDirection: 'row', border: `1pt solid ${LINEA}`, marginBottom: 6 },
  cabLogo: { width: 130, padding: 6, justifyContent: 'center', borderRight: `1pt solid ${LINEA}` },
  cabTitulo: { flex: 1, padding: 6, justifyContent: 'center', alignItems: 'center' },
  cabCod: { width: 150, padding: 6, justifyContent: 'center', borderLeft: `1pt solid ${LINEA}` },
  titulo: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#111827' },
  caja: { border: `1pt solid ${LINEA}`, marginBottom: 6 },
  cajaTitulo: { backgroundColor: '#F3F4F6', fontFamily: 'Helvetica-Bold', padding: 3, borderBottom: `1pt solid ${LINEA}` },
  fila: { flexDirection: 'row' },
  celda: { padding: 3, borderRight: `1pt solid ${LINEA}`, borderBottom: `1pt solid ${LINEA}` },
  th: { fontFamily: 'Helvetica-Bold', backgroundColor: '#F3F4F6' },
  marca: { width: 8, height: 8, border: `1pt solid ${GRIS}`, marginRight: 3, alignItems: 'center', justifyContent: 'center' },
  firma: { flex: 1, border: `1pt solid ${LINEA}`, padding: 4, minHeight: 78 },
  pie: { position: 'absolute', bottom: 14, left: 24, right: 24, fontSize: 6.5, color: TENUE, flexDirection: 'row', justifyContent: 'space-between' },
})

const Casilla = ({ on, t }: { on: boolean; t: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10, marginBottom: 2 }}>
    <View style={s.marca}>{on ? <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }}>X</Text> : null}</View>
    <Text>{t}</Text>
  </View>
)

const Dato = ({ k, v, w }: { k: string; v?: string | number | null; w?: number | string }) => (
  <View style={{ flexDirection: 'row', padding: 3, width: w as number | undefined, flexGrow: w ? 0 : 1 }}>
    <Text style={{ fontFamily: 'Helvetica-Bold' }}>{k} </Text><Text>{v === undefined || v === null || v === '' ? '—' : String(v)}</Text>
  </View>
)

function ActaPdf({ acta }: { acta: ActaRecepcionVista }) {
  const c = acta.contenido
  const i = c.ingreso
  const firma = (rol: ActaRecepcionVista['firmas'][number]['rol']) => acta.firmas.find((f) => f.rol === rol)
  const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '—')
  type Lote = ActaRecepcionVista['contenido']['lineas'][number]['lotes'][number]
  const filas = c.lineas.flatMap((l) => (l.lotes.length ? l.lotes.map((x, k) => ({ l, x: x as Lote | undefined, primera: k === 0 })) : [{ l, x: undefined as Lote | undefined, primera: true }]))
  const v = i.verificaciones ?? {}
  const sino = (b?: boolean) => (b ? 'SÍ' : 'NO')
  return (
    <Document title={`Acta de Recepción ${acta.numero}`} author="WMS LOGISALUD">
      <Page size="A4" orientation="landscape" style={s.pagina}>
        <View style={s.cab}>
          <View style={s.cabLogo}><Image src={LOGO_LOGISALUD} style={{ height: 26, objectFit: 'contain' }} /></View>
          <View style={s.cabTitulo}><Text style={s.titulo}>ACTA DE RECEPCIÓN DE PRODUCTOS</Text><Text style={{ color: TENUE, marginTop: 2 }}>LOGISALUD · Almacén Lurín</Text></View>
          <View style={s.cabCod}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Cód. Formato: LS-FR.03.05</Text><Text>N° ACTA: <Text style={{ fontFamily: 'Helvetica-Bold', color: VERDE }}>{acta.numero}</Text></Text>{c.solicitud && <Text>SOLICITUD: {c.solicitud.numero} (v{c.solicitud.version})</Text>}</View>
        </View>

        {acta.estado === 'BORRADOR' && <Text style={{ color: '#B45309', fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>BORRADOR — faltan firmas: {acta.faltan.map((r) => ETIQUETA_ROL_FIRMA[r]).join(', ') || 'ninguna'}. Este documento todavía no tiene validez.</Text>}
        {acta.estado === 'ANULADA' && <Text style={{ color: '#B91C1C', fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>ACTA ANULADA el {formatoFechaHora(acta.anuladaEn)}. Motivo: {acta.motivoAnulacion}.{acta.reemplazadaPorNumero ? ` Reemplazada por ${acta.reemplazadaPorNumero}.` : ''}</Text>}
        {acta.reemplazaANumero && <Text style={{ color: TENUE, marginBottom: 4 }}>Reemplaza al acta {acta.reemplazaANumero}.</Text>}

        <View style={s.caja}>
          <Text style={s.cajaTitulo}>DATOS GENERALES</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <View style={{ width: '50%', padding: 3 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>TIPO DE INGRESO</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Casilla on={false} t="IMPORTACIÓN" /><Casilla on={i.tipo === 'COMPRA_LOCAL'} t="COMPRA LOCAL" /><Casilla on={i.tipo === 'DEVOLUCION'} t="DEVOLUCIÓN" /><Casilla on={i.tipo === 'INGRESO_CLIENTE'} t="OTROS: Ingreso de cliente" />
              </View>
              {i.tipo === 'DEVOLUCION' && <Text>MOTIVO: {i.motivo ?? '—'}</Text>}
            </View>
            <View style={{ width: '50%' }}>
              <Dato k={i.tipo === 'COMPRA_LOCAL' ? 'PROVEEDOR:' : 'CLIENTE:'} v={i.contraparteNombre} />
              <Dato k="RUC:" v={i.contraparteRuc} />
              <Dato k="PROPIETARIO DEL STOCK:" v={i.propietario} />
            </View>
            <Dato k="FECHA:" v={formatoFecha((acta.firmadaEn ?? acta.generadaEn).slice(0, 10))} w="25%" />
            <Dato k="GUÍA REMISIÓN:" v={i.guiaNumero} w="25%" />
            <Dato k={i.tipo === 'DEVOLUCION' ? `${i.docOriginalTipo === 'BOLETA' ? 'BOLETA' : 'FACTURA'} ORIGINAL:` : 'FACTURA:'} v={i.tipo === 'DEVOLUCION' ? i.docOriginalNumero : i.facturaNumero} w="25%" />
            <Dato k="O.C.:" v={i.ocCodigo} w="25%" />
          </View>
        </View>

        <View style={s.caja}>
          <View style={s.fila}>
            {[['N°', 18], ['DESCRIPCIÓN DEL PRODUCTO', 190], ['R.S.', 60], ['LOTE', 60], ['F. EXPIRA', 55], ['CANT. SOLICITUD', 55], ['CANT. RECIBIDA', 55], ['POSICIÓN', 45]].map(([t, w]) => <Text key={String(t)} style={[s.celda, s.th, { width: w as number }]}>{t}</Text>)}
            <Text style={[s.celda, s.th, { flexGrow: 1, borderRight: 0 }]}>OBSERVACIONES</Text>
          </View>
          {filas.map(({ l, x, primera }, k) => (
            <View key={k} style={s.fila} wrap={false}>
              <Text style={[s.celda, { width: 18 }]}>{primera ? c.lineas.indexOf(l) + 1 : ''}</Text>
              <Text style={[s.celda, { width: 190 }]}>{primera ? l.descripcion : ''}</Text>
              <Text style={[s.celda, { width: 60 }]}>{primera ? l.registroSanitario ?? '—' : ''}</Text>
              <Text style={[s.celda, { width: 60 }]}>{x?.lote ?? '—'}</Text>
              <Text style={[s.celda, { width: 55 }]}>{x ? formatoFecha(x.vence) : '—'}</Text>
              <Text style={[s.celda, { width: 55, textAlign: 'right' }]}>{primera ? l.cantidadEstablecida : ''}</Text>
              <Text style={[s.celda, { width: 55, textAlign: 'right' }]}>{x?.cantidad ?? ''}</Text>
              <Text style={[s.celda, { width: 45 }]}>{x?.posicion ?? ''}</Text>
              <Text style={[s.celda, { flexGrow: 1, borderRight: 0 }]}>{[primera && k === 0 ? `Bultos: ${i.bultos ?? '—'} · Paletas: ${i.paletas ?? '—'}` : '', x && x.cantidadInicial != null && x.cantidadInicial !== x.cantidad ? `Solicitud inicial: ${x.cantidadInicial}` : ''].filter(Boolean).join(' · ')}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
          <View style={[s.caja, { flex: 2, marginBottom: 0 }]}>
            <Text style={s.cajaTitulo}>VERIFICACIÓN DEL ESTADO DEL PRODUCTO</Text>
            <View style={{ padding: 4, gap: 2 }}>
              <Text>Cantidad recibida (cajas y unidades) corresponde a lo indicado en el documento: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{sino(v.cantidadCorresponde)}</Text></Text>
              <Text>Las cajas se encuentran debidamente selladas: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{sino(v.cajasSelladas)}</Text></Text>
              <Text>El embalaje no está sucio, arrugado, húmedo ni deteriorado: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{sino(v.embalajeLimpio)}</Text></Text>
            </View>
          </View>
          <View style={[s.caja, { flex: 1, marginBottom: 0 }]}>
            <Text style={s.cajaTitulo}>TIPO DE CONTEO</Text>
            <View style={{ padding: 4 }}><Casilla on={i.tipoConteo === 'MUESTREO'} t="Conteo por muestreo" /><Casilla on={i.tipoConteo === 'TOTAL'} t="Conteo al 100 %" /><Casilla on={i.tipoConteo === 'OTROS'} t="Otros" /></View>
          </View>
          <View style={[s.caja, { flex: 1, marginBottom: 0 }]}>
            <Text style={s.cajaTitulo}>VEHÍCULO DE TRANSPORTE</Text>
            <View style={{ padding: 4, gap: 2 }}><Text>PLACA: {i.placa ?? '—'}</Text><Text>MARCA: {i.marcaVehiculo ?? '—'}</Text><Text>T°: {i.temperaturaC != null ? `${i.temperaturaC} °C` : '—'}</Text></View>
          </View>
        </View>
        {i.observaciones && <Text style={{ marginBottom: 4 }}>OBSERVACIONES: {i.observaciones}</Text>}

        <View style={{ flexDirection: 'row', gap: 6 }} wrap={false}>
          {(['JEFE_ALMACEN', 'DIRECCION_TECNICA'] as const).map((r) => {
            const f = firma(r)
            return (
              <View key={r} style={s.firma}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{ETIQUETA_ROL_FIRMA[r].toUpperCase()}</Text>
                <Text>NOMBRE: {f?.nombre ?? '—'}</Text>
                <Text>FIRMA: {f ? 'Firmado electrónicamente con usuario' : 'pendiente'}</Text>
                <Text>FECHA: {f ? formatoFecha(f.firmadoEn.slice(0, 10)) : '—'}  HORA: {f ? hora(f.firmadoEn) : '—'}</Text>
                {r === 'JEFE_ALMACEN' && <Text>HORA INICIO: {hora(i.horaInicio)}  HORA FINAL: {hora(i.horaFin)}</Text>}
                {r === 'JEFE_ALMACEN' && <Text style={{ marginTop: 2 }}>RESPONSABLE DE CONTEO: {firma('RESPONSABLE_CONTEO')?.nombre ?? '—'} (firma electrónica)</Text>}
              </View>
            )
          })}
          <View style={s.firma}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>TRANSPORTISTA</Text>
            <Text>NOMBRE: {firma('TRANSPORTISTA')?.nombre ?? '—'}</Text>
            <Text>DNI: {firma('TRANSPORTISTA')?.dni ?? '—'}  PLACA: {firma('TRANSPORTISTA')?.placa ?? '—'}</Text>
            {firma('TRANSPORTISTA')?.imagen ? <Image src={firma('TRANSPORTISTA')!.imagen!} style={{ height: 30, objectFit: 'contain', marginTop: 2 }} /> : <Text>FIRMA: pendiente</Text>}
            <Text>FECHA: {firma('TRANSPORTISTA') ? formatoFecha(firma('TRANSPORTISTA')!.firmadoEn.slice(0, 10)) : '—'}  HORA: {hora(firma('TRANSPORTISTA')?.firmadoEn)}</Text>
          </View>
        </View>

        <View style={s.pie} fixed>
          <Text>Acta {acta.numero} · {acta.estado === 'FIRMADA' ? `firmada electrónicamente el ${formatoFechaHora(acta.firmadaEn)}` : acta.estado.toLowerCase()} · huella SHA-256 {acta.hash}</Text>
          <Text render={({ pageNumber, totalPages }) => `Pág. ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export const renderActaRecepcion = (acta: ActaRecepcionVista) => renderToBuffer(<ActaPdf acta={acta} />)
