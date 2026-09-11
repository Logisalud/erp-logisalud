import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerLoopsAbiertos, obtenerKPIsDashboard } from '@/services/dashboard'

export const dynamic = 'force-dynamic'

/**
 * Frases de marca que rotan al azar en cada entrada — cercanas, en tuteo
 * peruano, nunca solemnes ni de cartel de oficina. Mismo array que
 * apps/cobranzas/app/page.tsx (duplicado a propósito: nada de código
 * compartido entre apps más allá de packages/auth).
 */
const FRASES_MARCA = [
  '¡Buen día! Aquí seguimos, conectando todo con confianza.',
  'Gracias por hacer que esto funcione tan bien.',
  'Todo fluye mejor cuando tú estás al mando.',
  'Un buen equipo se nota en los detalles — como este.',
  'Salud, confianza y buena logística: así se ve un buen día de trabajo.',
  'Esto funciona porque tú lo haces funcionar.',
  'Cada pedido bien hecho es un punto más de confianza.',
  'Hoy conectas salud con quien la necesita.',
  'Gracias por sostener todo esto, aunque no siempre se note.',
  'Un dato bien cargado hoy es una entrega tranquila mañana.',
  'Conectando puntos, como siempre.',
  'Qué bueno tenerte aquí — vamos con todo.',
  'Cada detalle que cuidas hoy, alguien lo agradece después.',
  'Tú haces que la cadena no se rompa.',
  'Otro día para que todo llegue bien — gracias por eso.',
]

function fraseDelDia() {
  return FRASES_MARCA[Math.floor(Math.random() * FRASES_MARCA.length)]
}

/**
 * Carta de Simplicidad UX, regla 5: este es el único lugar del sistema
 * pensado para ver de un vistazo QUÉ NECESITA ATENCIÓN — prioriza las cosas
 * trabadas por encima de cualquier métrica. No hay un botón primario acá:
 * es una pantalla de vistazo, y cada fila lleva a donde se resuelve.
 *
 * Desde 2026-09-11 absorbió la pantalla "Reportes — Cuentas por Pagar", que
 * respondía la MISMA pregunta con otro corte y obligaba a abrir las dos. Lo
 * único que esa pantalla tenía y esta no eran las listas de vencidas y por
 * vencer; los totales ya estaban acá como tiles. Se eliminó, y de paso
 * `/reportes` quedó con nueve reportes de verdad en vez de ocho más un
 * tablero infiltrado.
 *
 * El término "loops abiertos" se retiró de la UI: era jerga interna. En
 * pantalla se dice "Qué necesita atención", de forma consistente.
 */
export default async function Dashboard() {
  const loops = await obtenerLoopsAbiertos()
  const kpis = await obtenerKPIsDashboard(loops.obligacionesObservadas)
  const totalAbiertos =
    kpis.listaVencidas.length +
    kpis.listaVenceProximos7Dias.length +
    loops.fraccionamientosVencidos.length +
    loops.obligacionesObservadas.length +
    loops.discrepancias.length +
    loops.anticiposSinRendir.length +
    loops.serviciosSinConformidad.length +
    loops.ocsParcialesSobreUmbral.length

  const hoy = new Date().toISOString().slice(0, 10)
  const diasVencida = (fecha: string) => Math.max(1, Math.round((Date.parse(hoy) - Date.parse(fecha)) / 86400000))

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Dashboard" atras={{ href: '/', texto: 'Módulos' }} />
      <p className="-mt-4 mb-4 text-xs italic text-gray-400">{fraseDelDia()}</p>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <TileKPI titulo="Pendiente de pago" filas={kpis.totalPendiente} href="/cuentas-por-pagar" />
        <TileKPI titulo="Vencido" filas={kpis.totalVencido} href="/reportes/cuentas-por-pagar/antiguedad" urgente />
        <TileKPI titulo="Vence en 7 días" filas={kpis.venceProximos7Dias} href="/reportes/cuentas-por-pagar/antiguedad" />
        <TileKPI titulo="Pendientes de revisión" filas={kpis.facturasPendientesRevision} href="/cuentas-por-pagar?estado=registrada" />
        <TileKPI
          titulo="Aprobadas sin factura"
          filas={[{ moneda: '', monto: 0, cantidad: kpis.ordenesAprobadasSinFactura.cantidad }]}
          href="/facturas/nueva"
          soloCantidad
        />
        <TileKPI titulo="Pagado este mes" filas={kpis.pagadoEsteMes} href="/reportes/cuentas-por-pagar/historial-pagos" />
        <TileKPI titulo="Observadas" filas={kpis.obligacionesObservadas} href="/cuentas-por-pagar?estado=observada" urgente />
      </div>

      {totalAbiertos === 0 ? (
        <p className="card border-logisalud-green text-sm text-gray-700">
          Todo al día — no hay nada esperando atención ahora mismo.
        </p>
      ) : (
        <div className="space-y-6">
          {/* Vencidas y por vencer: lo que traía la pantalla fusionada. Van
              primero porque son las que cuestan dinero si se pasan. */}
          {kpis.listaVencidas.length > 0 ? (
            <Seccion titulo="Obligaciones vencidas" urgente>
              {kpis.listaVencidas.map((o) => (
                <Item key={o.id} href={`/cuentas-por-pagar/${o.id}`}>
                  <Fila
                    titulo={`${o.codigo}${o.numeroFactura ? ` · ${o.numeroFactura}` : ''}`}
                    monto={<Money valor={o.netoAPagar} moneda={o.moneda} />}
                  />
                  <p className="mt-0.5 text-sm text-red-700">
                    {o.quien} · venció hace {o.diasVencido} día(s)
                  </p>
                </Item>
              ))}
            </Seccion>
          ) : null}

          {kpis.listaVenceProximos7Dias.length > 0 ? (
            <Seccion titulo="Vencen en los próximos 7 días">
              {kpis.listaVenceProximos7Dias.map((o) => (
                <Item key={o.id} href={`/cuentas-por-pagar/${o.id}`}>
                  <Fila
                    titulo={`${o.codigo}${o.numeroFactura ? ` · ${o.numeroFactura}` : ''}`}
                    monto={<Money valor={o.netoAPagar} moneda={o.moneda} />}
                  />
                  <p className="mt-0.5 text-sm text-gray-600">
                    {o.quien}
                    {o.fechaVencimiento ? ` · vence ${o.fechaVencimiento}` : ''}
                  </p>
                </Item>
              ))}
            </Seccion>
          ) : null}

          {loops.fraccionamientosVencidos.length > 0 ? (
            <Seccion titulo="Cuotas de fraccionamiento SUNAT vencidas" urgente>
              {loops.fraccionamientosVencidos.map((c) => (
                <Item key={c.cuotaId} href="/financiamiento/vencimientos">
                  <Fila
                    titulo={`${c.numeroExpediente} — cuota ${c.numeroCuota}`}
                    monto={<Money valor={c.monto} />}
                  />
                  <p className="mt-0.5 text-sm text-red-700">
                    Venció hace {diasVencida(c.fechaVencimiento)} día(s) — genera su obligación en
                    Vencimientos próximos antes de perder el beneficio del fraccionamiento.
                  </p>
                </Item>
              ))}
            </Seccion>
          ) : null}

          {loops.obligacionesObservadas.length > 0 ? (
            <Seccion titulo="Obligaciones observadas">
              {loops.obligacionesObservadas.map((o) => (
                <Item key={o.id} href={`/cuentas-por-pagar/${o.id}`}>
                  <Fila
                    titulo={`${o.codigo}${o.numero_factura ? ` · ${o.numero_factura}` : ''}`}
                    monto={<Money valor={o.neto_a_pagar} moneda={o.moneda} />}
                  />
                  <p className="mt-0.5 text-sm text-gray-600">
                    {o.proveedor?.razon_social ?? o.beneficiario?.nombre ?? o.observaciones ?? 'sin proveedor ni beneficiario'} ·
                    la conciliación de 3 vías no cuadró — revisala antes de darle conformidad.
                  </p>
                </Item>
              ))}
            </Seccion>
          ) : null}

          {loops.discrepancias.length > 0 ? (
            <Seccion titulo="Discrepancias de Almacén sin resolver">
              {loops.discrepancias.map((d) => (
                <Item key={d.recepcionId} href={`/almacen/recepciones/${d.recepcionId}`}>
                  <Fila titulo={d.ocCodigo} monto={`${d.cantidadLineas} línea(s)`} />
                  <p className="mt-0.5 text-sm text-gray-600">
                    Resuelve la acción de cada línea antes de que Contabilidad registre la obligación.
                  </p>
                </Item>
              ))}
            </Seccion>
          ) : null}

          {loops.anticiposSinRendir.length > 0 ? (
            <Seccion titulo="Anticipos sin rendir">
              {loops.anticiposSinRendir.map((a) => (
                <Item key={a.id} href={`/gastos/${a.id}`}>
                  <Fila titulo={a.codigo} monto={<Money valor={a.monto} moneda={a.moneda} />} />
                  <p className="mt-0.5 text-sm text-gray-600">
                    {a.solicitanteNombre ?? 'Empleado'} todavía no subió sus comprobantes — pídele que rinda el anticipo.
                  </p>
                </Item>
              ))}
            </Seccion>
          ) : null}

          {loops.serviciosSinConformidad.length > 0 ? (
            <Seccion titulo="Facturas de servicio sin conformidad">
              {loops.serviciosSinConformidad.map((s) => (
                <Item key={s.id} href={`/servicios/${s.id}`}>
                  <Fila titulo={s.codigo} monto={<Money valor={s.monto} moneda={s.moneda} />} />
                  <p className="mt-0.5 text-sm text-gray-600">
                    El área usuaria todavía no dio conformidad — Contabilidad no puede avanzar sin eso.
                  </p>
                </Item>
              ))}
            </Seccion>
          ) : null}

          {loops.ocsParcialesSobreUmbral.length > 0 ? (
            <Seccion titulo="Órdenes de compra recibidas en parte hace demasiado">
              {loops.ocsParcialesSobreUmbral.map((o) => (
                <Item key={o.id} href={`/ordenes-compra/${o.id}`}>
                  <Fila titulo={o.codigo} monto={`${o.diasEnParcial} día(s)`} />
                  <p className="mt-0.5 text-sm text-gray-600">
                    {o.proveedorNombre ?? 'Proveedor'} — contactalo para saber si falta entregar el resto, o cerrala con
                    saldo pendiente si ya no va a llegar.
                  </p>
                </Item>
              ))}
            </Seccion>
          ) : null}
        </div>
      )}
    </main>
  )
}

/**
 * Un KPI de arriba del dashboard — siempre clickeable hacia la pantalla
 * real donde ese número se resuelve (Carta de Simplicidad regla 5: nunca
 * una métrica muerta). Separa por moneda (nunca mezcla PEN con USD); si no
 * hay filas, muestra "S/ 0.00" en vez de esconder el tile — que el usuario
 * vea "está en cero" es información, no ruido.
 */
function TileKPI({
  titulo,
  filas,
  href,
  urgente,
  soloCantidad,
}: {
  titulo: string
  filas: { moneda: string; monto: number; cantidad: number }[]
  href: string
  urgente?: boolean
  soloCantidad?: boolean
}) {
  return (
    <Link
      href={href}
      className={`card block transition hover:shadow-sm ${urgente && filas.some((f) => f.monto > 0) ? 'border-amber-300' : ''}`}
    >
      <p className="text-xs text-gray-500">{titulo}</p>
      {soloCantidad ? (
        <p className="font-heading text-xl">{filas[0]?.cantidad ?? 0}</p>
      ) : filas.length === 0 ? (
        <p className="font-heading text-xl text-gray-400">
          <Money valor={0} />
        </p>
      ) : (
        <div className="space-y-0.5">
          {filas.map((f) => (
            <p key={f.moneda} className="font-heading text-xl">
              <Money valor={f.monto} moneda={f.moneda} />{' '}
              <span className="text-xs font-normal text-gray-400">({f.cantidad})</span>
            </p>
          ))}
        </div>
      )}
    </Link>
  )
}

function Seccion({ titulo, urgente, children }: { titulo: string; urgente?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={`font-heading mb-2 text-lg ${urgente ? 'text-red-700' : ''}`}>{titulo}</h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}

function Item({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="card block border-amber-200 transition hover:shadow-sm">
        {children}
      </Link>
    </li>
  )
}

function Fila({ titulo, monto }: { titulo: string; monto: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-medium">{titulo}</span>
      <span>{monto}</span>
    </div>
  )
}
