import 'server-only'
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { LOGO_LOGISALUD_BASE64 } from '@/services/logo-base64'
import { crearClienteServidor } from '@logisalud/auth/server'
import { obtenerOC } from '@/services/ordenes-compra'
import { obtenerProveedor } from '@/services/proveedores'
import { obtenerOS } from '@/services/servicios'
import { calcularTotales } from '@/domain/orden-compra'
import { igvDeBase, redondear, TASA_IGV } from '@/domain/obligacion'

/**
 * PDF adjunto al aviso por correo de OC (mercadería/bien) y OS — Pieza
 * "adjunto" de la sesión 2026-09-09. Comparte una sola plantilla
 * parametrizada por tipo de documento en vez de una por flujo, igual
 * criterio que domain/aviso-email.ts para el cuerpo del correo.
 *
 * No reemplaza la vista `window.print()` de OC (app/ordenes-compra/[id]/
 * imprimir) — esa sigue igual, para que alguien la reabra en el navegador.
 * Este PDF es una pieza aparte, generada server-side, solo para viajar
 * adjunta en el correo. OS no tiene (todavía) una vista de impresión
 * humana — este PDF es lo único que existe para OS por ahora.
 *
 * @react-pdf/renderer en vez de Puppeteer/Chromium: no hay proceso de
 * navegador que levantar en una función serverless, más liviano y estable
 * en Vercel.
 */

const VERDE = '#4BB168'
const TEAL = '#4ABCC2'
const GRIS_TEXTO = '#374151'
const GRIS_CLARO = '#6B7280'

export type FilaPdfOrden = {
  codigo: string | null
  descripcion: string
  unidadMedida: string | null
  cantidad: number
  precioUnitario: number
  importe: number
}

export type DatosPdfOrden = {
  tipoDocumento: 'Orden de Compra' | 'Orden de Servicio'
  codigo: string
  fechaEmision: string | null
  fechaEntregaEstimada: string | null
  proveedor: {
    razonSocial: string
    ruc: string | null
    contactoNombre: string | null
    contactoEmail: string | null
  }
  moneda: string
  condicionPagoDias: number | null
  cuenta: { banco: string; moneda: string; cci: string } | null
  filas: FilaPdfOrden[]
  subtotal: number
  igv: number
  total: number
  notas: string | null
}

/** Ruta del logo en `public/` — mismo archivo para el header de la vista
 * `window.print()` de OC y de este PDF (sesión 2026-09-09, ver PR #50 para
 * el bug de basePath que ya se resolvió del lado de next/image). */
function bufferLogo(): Buffer {
  return Buffer.from(LOGO_LOGISALUD_BASE64, 'base64')
}

/** Reusa obtenerOC/obtenerProveedor — no duplica la lectura de la orden. */
export async function obtenerDatosPdfOC(ocId: string): Promise<DatosPdfOrden | null> {
  const oc = await obtenerOC(ocId)
  if (!oc) return null

  const datosProveedor = await obtenerProveedor(oc.proveedor_id)
  const proveedor = datosProveedor?.proveedor
  const cuenta =
    datosProveedor?.cuentas.find((c) => c.id === oc.cuenta_bancaria_id) ??
    datosProveedor?.cuentas.find((c) => c.es_principal) ??
    null

  const totales = calcularTotales(
    oc.items.map((i) => ({
      cantidadPedida: Number(i.cantidad_pedida),
      precioUnitario: Number(i.precio_unitario),
    }))
  )

  return {
    tipoDocumento: 'Orden de Compra',
    codigo: oc.codigo,
    fechaEmision: oc.fecha_emision,
    fechaEntregaEstimada: oc.fecha_entrega_estimada,
    proveedor: {
      razonSocial: proveedor?.razon_social ?? '—',
      ruc: proveedor?.ruc ?? null,
      contactoNombre: proveedor?.contacto_nombre ?? null,
      contactoEmail: proveedor?.contacto_email ?? null,
    },
    moneda: oc.moneda,
    condicionPagoDias: oc.condiciones_pago_dias,
    cuenta: cuenta ? { banco: cuenta.banco, moneda: cuenta.moneda, cci: cuenta.cci } : null,
    filas: oc.items.map((i) => ({
      codigo: i.producto?.codigo ?? null,
      descripcion: i.producto?.descripcion ?? i.descripcion_libre ?? '—',
      unidadMedida: i.producto?.unidad_medida ?? null,
      cantidad: Number(i.cantidad_pedida),
      precioUnitario: Number(i.precio_unitario),
      importe: redondear(Number(i.cantidad_pedida) * Number(i.precio_unitario)),
    })),
    subtotal: totales.subtotal,
    igv: totales.igv,
    total: totales.total,
    notas: oc.notas,
  }
}

/**
 * Reusa obtenerOS para los datos de la orden — RUC/contacto del proveedor
 * de servicio se traen acá aparte porque obtenerOS solo necesita
 * razón social para lo que ya usa (no vale la pena ensanchar ese select
 * para todos sus llamadores por este PDF).
 */
export async function obtenerDatosPdfOS(osId: string): Promise<DatosPdfOrden | null> {
  const os = await obtenerOS(osId)
  if (!os) return null

  const supabase = crearClienteServidor()
  const { data: proveedor } = await supabase
    .schema('servicios')
    .from('proveedores_servicio')
    .select('razon_social, ruc, contacto_nombre, contacto_email')
    .eq('id', os.proveedor?.id ?? '')
    .maybeSingle()

  // Una OS no tiene líneas — es un monto estimado por el servicio completo.
  // Misma fórmula que domain/obligacion.ts::TASA_IGV usa en Pago Directo/OS
  // (Pieza B1) para el desglose en vivo del formulario.
  const monto = Number(os.monto_estimado)
  const base = os.monto_incluye_igv ? redondear(monto / (1 + TASA_IGV)) : monto
  const igv = os.monto_incluye_igv ? redondear(monto - base) : igvDeBase(base)
  const total = redondear(base + igv)

  return {
    tipoDocumento: 'Orden de Servicio',
    codigo: os.codigo,
    fechaEmision: os.created_at ? String(os.created_at).slice(0, 10) : null,
    fechaEntregaEstimada: os.fecha_entrega_estimada,
    proveedor: {
      razonSocial: proveedor?.razon_social ?? '—',
      ruc: proveedor?.ruc ?? null,
      contactoNombre: proveedor?.contacto_nombre ?? null,
      contactoEmail: proveedor?.contacto_email ?? null,
    },
    moneda: os.moneda,
    condicionPagoDias: os.condiciones_pago_dias,
    cuenta: null,
    filas: [
      {
        codigo: null,
        descripcion: os.descripcion_servicio || '—',
        unidadMedida: null,
        cantidad: 1,
        precioUnitario: base,
        importe: base,
      },
    ],
    subtotal: base,
    igv,
    total,
    notas: null,
  }
}

const estilos = StyleSheet.create({
  pagina: { padding: 32, fontSize: 10, color: GRIS_TEXTO, fontFamily: 'Helvetica' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: VERDE,
    paddingBottom: 12,
    marginBottom: 16,
  },
  logo: { width: 160, height: 34 },
  tipoDocumento: { fontSize: 9, color: GRIS_CLARO, marginTop: 4 },
  codigo: { fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  fecha: { fontSize: 9, color: GRIS_CLARO, textAlign: 'right', marginTop: 2 },
  seccionDatos: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  columna: { width: '48%' },
  etiqueta: { fontSize: 8, color: GRIS_CLARO, textTransform: 'uppercase', marginBottom: 2 },
  valor: { fontSize: 10, marginBottom: 2 },
  tablaHeader: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 4,
  },
  tablaFila: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#E5E7EB', paddingVertical: 4 },
  colCodigo: { width: '15%', fontSize: 8, fontFamily: 'Courier' },
  colDescripcion: { width: '45%' },
  colCantidad: { width: '13%', textAlign: 'right' },
  colPrecio: { width: '13%', textAlign: 'right' },
  colImporte: { width: '14%', textAlign: 'right' },
  headerCelda: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  totales: { alignSelf: 'flex-end', width: 200, marginTop: 12 },
  filaTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  filaTotalFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
    marginTop: 2,
    borderTopWidth: 1,
    borderColor: '#D1D5DB',
    fontFamily: 'Helvetica-Bold',
  },
  notas: { marginTop: 16 },
  footer: { marginTop: 32, paddingTop: 8, borderTopWidth: 0.5, borderColor: '#E5E7EB', fontSize: 8, color: GRIS_CLARO },
})

function etiquetaCondicion(dias: number | null): string {
  if (dias == null) return '—'
  return dias === 0 ? 'contado' : `${dias} días`
}

function DocumentoOrdenPdf({ datos, logo }: { datos: DatosPdfOrden; logo: Buffer }) {
  const simbolo = datos.moneda === 'USD' ? '$' : 'S/'
  const importe = (n: number) => `${simbolo} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <Document>
      <Page size="A4" style={estilos.pagina}>
        <View style={estilos.header}>
          <View>
            <Image src={logo} style={estilos.logo} />
            <Text style={estilos.tipoDocumento}>{datos.tipoDocumento}</Text>
          </View>
          <View>
            <Text style={estilos.codigo}>{datos.codigo}</Text>
            {datos.fechaEmision ? <Text style={estilos.fecha}>Emisión: {datos.fechaEmision}</Text> : null}
            {datos.fechaEntregaEstimada ? <Text style={estilos.fecha}>Entrega: {datos.fechaEntregaEstimada}</Text> : null}
          </View>
        </View>

        <View style={estilos.seccionDatos}>
          <View style={estilos.columna}>
            <Text style={estilos.etiqueta}>Proveedor</Text>
            <Text style={estilos.valor}>{datos.proveedor.razonSocial}</Text>
            <Text style={estilos.valor}>RUC {datos.proveedor.ruc ?? '—'}</Text>
            {datos.proveedor.contactoNombre ? <Text style={estilos.valor}>{datos.proveedor.contactoNombre}</Text> : null}
            {datos.proveedor.contactoEmail ? <Text style={estilos.valor}>{datos.proveedor.contactoEmail}</Text> : null}
          </View>
          <View style={estilos.columna}>
            <Text style={estilos.etiqueta}>Condiciones</Text>
            <Text style={estilos.valor}>Moneda: {datos.moneda}</Text>
            <Text style={estilos.valor}>Pago: {etiquetaCondicion(datos.condicionPagoDias)}</Text>
            {datos.cuenta ? (
              <>
                <Text style={[estilos.etiqueta, { marginTop: 6 }]}>Abono</Text>
                <Text style={estilos.valor}>{datos.cuenta.banco} · {datos.cuenta.moneda}</Text>
                <Text style={[estilos.valor, { fontFamily: 'Courier', fontSize: 9 }]}>CCI {datos.cuenta.cci}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={estilos.tablaHeader}>
          <Text style={[estilos.colCodigo, estilos.headerCelda]}>Código</Text>
          <Text style={[estilos.colDescripcion, estilos.headerCelda]}>Descripción</Text>
          <Text style={[estilos.colCantidad, estilos.headerCelda]}>Cant.</Text>
          <Text style={[estilos.colPrecio, estilos.headerCelda]}>P. unit.</Text>
          <Text style={[estilos.colImporte, estilos.headerCelda]}>Importe</Text>
        </View>
        {datos.filas.map((f, i) => (
          <View key={i} style={estilos.tablaFila}>
            <Text style={estilos.colCodigo}>{f.codigo ?? '—'}</Text>
            <Text style={estilos.colDescripcion}>{f.descripcion}{f.unidadMedida ? ` (${f.unidadMedida})` : ''}</Text>
            <Text style={estilos.colCantidad}>{f.cantidad}</Text>
            <Text style={estilos.colPrecio}>{f.precioUnitario.toFixed(4)}</Text>
            <Text style={estilos.colImporte}>{importe(f.importe)}</Text>
          </View>
        ))}

        <View style={estilos.totales}>
          <View style={estilos.filaTotal}>
            <Text>Subtotal</Text>
            <Text>{importe(datos.subtotal)}</Text>
          </View>
          <View style={estilos.filaTotal}>
            <Text>IGV 18%</Text>
            <Text>{importe(datos.igv)}</Text>
          </View>
          <View style={estilos.filaTotalFinal}>
            <Text>Total</Text>
            <Text>{importe(datos.total)}</Text>
          </View>
        </View>

        {datos.notas ? (
          <View style={estilos.notas}>
            <Text style={estilos.etiqueta}>Notas</Text>
            <Text style={estilos.valor}>{datos.notas}</Text>
          </View>
        ) : null}

        <Text style={estilos.footer}>Documento generado por el ERP de Logisalud. {datos.codigo}.</Text>
      </Page>
    </Document>
  )
}

export async function generarPdfOrden(datos: DatosPdfOrden): Promise<Buffer> {
  const logo = bufferLogo()
  return renderToBuffer(<DocumentoOrdenPdf datos={datos} logo={logo} />)
}
