import 'server-only'
import { Document, Font, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import type { OrganolepticaVista } from '@/domain/entradas-vistas'
import type { ExtraActaOrganoleptica } from '@/domain/acta-organoleptica-formato'
import { organolepticaEsBorrador } from '@/domain/borrador-documento'
import { hojaActaOrganoleptica } from '../formatos/acta-organoleptica-hoja'
import { modeloHoja } from '../formatos/hoja'
import { HojaPdf } from './hoja-pdf'
import { MarcaBorrador } from './marca-borrador'

// Acta de Evaluación Organoléptica — formato controlado LS-FR.55.02 (A4 horizontal). El PDF dibuja la MISMA hoja oficial que el Excel (su plantilla .xlsx ya llena):
// mismas celdas, combinaciones, bordes y textos, escalados a una página. Lo único que se agrega son los estados de control que el formato no tiene
// (cinta de BORRADOR) y, en letra mínima al pie, el número del acta y su huella. La numeración O-AAAAMM-NNNN es interna (el formato no la trae).

Font.registerHyphenationCallback((palabra) => [palabra])

export async function renderActaOrganoleptica(a: OrganolepticaVista, extra: ExtraActaOrganoleptica = {}) {
  const modelo = modeloHoja(await hojaActaOrganoleptica(a, extra))
  const borrador = organolepticaEsBorrador(a)
  const k = Math.min(802 / modelo.ancho, (borrador ? 490 : 524) / modelo.alto)
  return renderToBuffer(
    <Document title={`Acta organoléptica ${a.numero}`} author="WMS LOGISALUD">
      <Page size="A4" orientation="landscape" style={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: 26, fontFamily: 'Helvetica' }}>
        {borrador && <MarcaBorrador detalle={a.estado === 'PENDIENTE_DT' ? 'Falta la decisión y la firma de Dirección Técnica. Este documento todavía no tiene validez.' : 'Falta llenarla y que la firme Dirección Técnica. Este documento todavía no tiene validez.'} />}
        <HojaPdf modelo={modelo} k={k} />
        <View style={{ position: 'absolute', bottom: 10, left: 20, right: 20 }} fixed>
          <Text style={{ fontSize: 5.5 }}>Acta {a.numero} · {a.estado === 'FIRMADA' ? `firmada electrónicamente · huella SHA-256 ${a.hash}` : 'borrador, pendiente de firmas'}</Text>
        </View>
      </Page>
    </Document>,
  )
}
