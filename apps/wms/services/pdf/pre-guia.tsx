import 'server-only'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { mesAnio } from '@/domain/salidas'
import type { DatosGuia } from '@/domain/guia-electronica'
import { ETIQUETA_ESTADO_PRE_GUIA, faltaParaEnviar, mostrarConstanciaDeRecepcion, type PreGuiaVista } from '@/domain/pre-guia'
import { LOGO_LOGISALUD } from '../pdf-logo'

// Pre-guía de remisión para imprimir (A4 vertical). NO es un documento tributario: es el borrador del WMS que reserva el número de la guía; la guía se genera en Nubefact al enviarla.
// Diseño: banda de marca arriba, el número reservado grande, tres bloques claros (destinatario, traslado, partida), el detalle por lote y dos firmas. Solo tipografía estándar (Helvetica).
const VERDE = '#2F8F4E', VERDE_CLARO = '#E8F5EC', TEAL = '#1F8A90', GRIS = '#4B5563', LINEA = '#D1D5DB', TINTA = '#111827'
const s = StyleSheet.create({
  pagina: { paddingTop: 0, paddingBottom: 36, paddingHorizontal: 0, fontSize: 9.5, color: TINTA, fontFamily: 'Helvetica' },
  cuerpo: { paddingHorizontal: 34 },
  etiqueta: { fontSize: 7.5, color: GRIS, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6, marginBottom: 2 },
  bloque: { border: `0.75pt solid ${LINEA}`, borderRadius: 4, padding: 9, flexGrow: 1, flexBasis: 0 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8, padding: 5, color: '#FFFFFF' },
  td: { padding: 5, borderBottom: `0.5pt solid ${LINEA}` },
})
const fecha = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '—')

export interface DatosPreGuia {
  pre: PreGuiaVista; guia: DatosGuia; piloto: boolean; generadaEn: string
  /** Quién hizo el picking (el sistema lo sabe): sale impreso en «Responsable de alistar pedido». Lo demás de la constancia se llena a mano. */
  alistadoPor?: string
}

function Campo({ nombre, valor, fuerte = false }: { nombre: string; valor?: string; fuerte?: boolean }) {
  return <View style={{ marginBottom: 5 }}><Text style={s.etiqueta}>{nombre.toUpperCase()}</Text><Text style={fuerte ? { fontFamily: 'Helvetica-Bold', fontSize: 11 } : {}}>{valor || '—'}</Text></View>
}

/** Un renglón para llenar a mano: «Etiqueta: ______». */
function Renglon({ etiqueta, ancho, valor }: { etiqueta: string; ancho: number; valor?: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}><Text>{etiqueta}</Text><View style={{ width: ancho, borderBottom: `0.75pt solid ${TINTA}`, marginLeft: 4, minHeight: 11 }}>{valor ? <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5 }}>{valor}</Text> : null}</View></View>
}

/** La constancia de recepción (formato de la empresa): todo en blanco para llenarlo y firmarlo a mano. */
function ConstanciaDeRecepcion({ alistadoPor }: { alistadoPor?: string }) {
  return (
    <View style={{ marginTop: 22 }} wrap={false} data-testid="constancia-recepcion">
      <Renglon etiqueta="T° de salida:" ancho={90} />
      <View style={{ flexDirection: 'row', marginTop: 14 }}><Renglon etiqueta="Responsable de alistar pedido:" ancho={130} valor={alistadoPor} /><View style={{ width: 14 }} /><Renglon etiqueta="Firma:" ancho={100} /></View>
      <View style={{ flexDirection: 'row', marginTop: 14 }}><Renglon etiqueta="Responsable de Atención:" ancho={115} /><View style={{ width: 14 }} /><Renglon etiqueta="Firma:" ancho={90} /></View>
      <View style={{ width: 150, borderBottom: `0.75pt solid ${TINTA}`, marginTop: 40 }} />
      <Text style={{ marginTop: 3 }}>TRANSPORTISTA FIRMA EN CONFORMIDAD QUE RECIBIÓ PRODUCTOS EN ÓPTIMAS CONDICIONES DE EMBALAJE, CON SU RESPECTIVA ETIQUETA DE IDENTIFICACIÓN.</Text>
      <View style={{ marginTop: 18 }}><Renglon etiqueta="DNI:" ancho={90} /></View>
      <Text style={{ marginTop: 14, fontFamily: 'Helvetica-Bold' }}>RECIBÍ CONFORME</Text>
    </View>
  )
}

function Hoja({ d }: { d: DatosPreGuia }) {
  const { pre, guia: g } = d
  const unidades = g.lineas.reduce((t, l) => t + l.cantidad, 0)
  const falta = faltaParaEnviar(pre)
  return (
    <Document title={`Pre-guía ${pre.numeroCompleto}`} author="WMS LOGISALUD" subject="Pre-guía de remisión">
      <Page size="A4" style={s.pagina}>
        <View style={{ backgroundColor: VERDE, paddingVertical: 14, paddingHorizontal: 34, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 4, padding: 5 }}><Image src={LOGO_LOGISALUD} style={{ height: 26, objectFit: 'contain' }} /></View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 8, letterSpacing: 1.2, fontFamily: 'Helvetica-Bold' }}>PRE-GUÍA DE REMISIÓN</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 22, fontFamily: 'Helvetica-Bold' }}>{pre.numeroCompleto}</Text>
          </View>
        </View>
        <View style={{ backgroundColor: VERDE_CLARO, paddingVertical: 6, paddingHorizontal: 34, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'Helvetica-Bold', color: VERDE }}>{ETIQUETA_ESTADO_PRE_GUIA[pre.estado].toUpperCase()}</Text>
          <Text style={{ color: GRIS }}>{d.piloto ? 'PRUEBA, NO FACTURAR · ' : ''}Borrador, no es un documento tributario</Text>
        </View>

        <View style={[s.cuerpo, { marginTop: 14 }]}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={s.bloque}>
              <Text style={{ fontFamily: 'Helvetica-Bold', color: TEAL, marginBottom: 6 }}>DESTINATARIO</Text>
              <Campo nombre="Cliente" valor={g.destinatario.nombre} fuerte />
              <Campo nombre={g.destinatario.tipoDocumento === 'DNI' ? 'DNI' : 'RUC'} valor={g.destinatario.ruc} />
              <Campo nombre="Dirección de entrega" valor={[g.destinatario.direccion, g.destinatario.distrito].filter(Boolean).join(' · ')} />
            </View>
            <View style={s.bloque}>
              <Text style={{ fontFamily: 'Helvetica-Bold', color: TEAL, marginBottom: 6 }}>TRASLADO</Text>
              <Campo nombre="Pedido · Orden" valor={`${g.pedidoNumero ?? '—'} · ${g.salidaNumero}`} fuerte />
              <Campo nombre="Motivo · Modalidad" valor={`${g.motivoTraslado} · ${g.modalidad}`} />
              <Campo nombre="Ruta" valor={pre.rutaNumero ? `${pre.rutaNumero}${g.ruta?.fecha ? ` · ${fecha(g.ruta.fecha)}` : ''}` : 'Por asignar'} />
              <Campo nombre="Vehículo · Conductor" valor={pre.placa || pre.conductor ? `${pre.placa ?? 'sin vehículo'} · ${pre.conductor ?? 'sin conductor'}` : 'Por asignar con la ruta'} />
            </View>
          </View>
          <View style={{ border: `0.75pt solid ${LINEA}`, borderRadius: 4, padding: 9, marginTop: 10 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: TEAL, marginBottom: 4 }}>PUNTO DE PARTIDA</Text>
            <Text>{g.partida.direccion || '—'} · ubigeo {g.partida.ubigeo}</Text>
          </View>

          <Text style={{ fontFamily: 'Helvetica-Bold', color: TEAL, marginTop: 14, marginBottom: 5 }}>DETALLE POR LOTE</Text>
          <View style={{ border: `0.75pt solid ${LINEA}`, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', backgroundColor: TEAL }}>
              <Text style={[s.th, { width: '14%' }]}>CÓDIGO</Text><Text style={[s.th, { width: '42%' }]}>PRODUCTO</Text><Text style={[s.th, { width: '18%' }]}>LOTE</Text>
              <Text style={[s.th, { width: '14%' }]}>VENCE</Text><Text style={[s.th, { width: '12%', textAlign: 'right' }]}>CANT.</Text>
            </View>
            {g.lineas.map((l, i) => (
              <View key={i} style={{ flexDirection: 'row', backgroundColor: i % 2 ? '#F9FAFB' : '#FFFFFF' }} wrap={false}>
                <Text style={[s.td, { width: '14%', fontFamily: 'Helvetica-Bold' }]}>{l.productoCodigo}</Text>
                <Text style={[s.td, { width: '42%' }]}>{l.producto}</Text>
                <Text style={[s.td, { width: '18%' }]}>{l.lote}</Text>
                <Text style={[s.td, { width: '14%' }]}>{l.vence ? mesAnio(l.vence) : '—'}</Text>
                <Text style={[s.td, { width: '12%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{l.cantidad.toLocaleString('es-PE')}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 6, backgroundColor: VERDE_CLARO }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{g.bultos} {g.bultos === 1 ? 'bulto' : 'bultos'} · {unidades.toLocaleString('es-PE')} unidades · {g.lineas.length} {g.lineas.length === 1 ? 'línea' : 'líneas'}</Text>
            </View>
          </View>

          {falta && pre.estado !== 'ENVIADA' && <Text style={{ marginTop: 10, color: '#92400E', backgroundColor: '#FEF3C7', padding: 7, borderRadius: 4 }}>Pendiente para enviar: {falta}</Text>}

          {mostrarConstanciaDeRecepcion(pre) ? <ConstanciaDeRecepcion alistadoPor={d.alistadoPor} /> : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 44 }} wrap={false}>
            {['Responsable de almacén', 'Transportista'].map((t) => <View key={t} style={{ width: '42%' }}><View style={{ borderTop: `0.75pt solid ${TINTA}` }} /><Text style={{ textAlign: 'center', marginTop: 3, color: GRIS }}>{t}</Text></View>)}
          </View>
          )}
        </View>
        <Text fixed style={{ position: 'absolute', bottom: 14, left: 34, right: 34, fontSize: 7.5, color: GRIS, textAlign: 'center' }}>
          Este borrador reserva el número {pre.numeroCompleto}. La guía de remisión se genera en Nubefact cuando se envía con ruta, vehículo y conductor. Impreso el {d.generadaEn}.
        </Text>
      </Page>
    </Document>
  )
}

export async function renderPreGuia(d: DatosPreGuia): Promise<Buffer> {
  return renderToBuffer(<Hoja d={d} />)
}
