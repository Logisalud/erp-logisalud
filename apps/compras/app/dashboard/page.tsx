import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerLoopsAbiertos } from '@/services/dashboard'

export const dynamic = 'force-dynamic'

/**
 * Carta de Simplicidad UX, regla 5: este es el único lugar del sistema
 * pensado para ver de un vistazo qué necesita atención — prioriza
 * visualmente los "loops abiertos" por encima de cualquier métrica. No
 * hay un botón primario acá: es una pantalla de vistazo, cada loop lleva
 * a la pantalla donde se resuelve.
 */
export default async function Dashboard() {
  const loops = await obtenerLoopsAbiertos()
  const totalAbiertos =
    loops.fraccionamientosVencidos.length +
    loops.obligacionesObservadas.length +
    loops.discrepancias.length +
    loops.anticiposSinRendir.length +
    loops.serviciosSinConformidad.length

  const hoy = new Date().toISOString().slice(0, 10)
  const diasVencida = (fecha: string) => Math.max(1, Math.round((Date.parse(hoy) - Date.parse(fecha)) / 86400000))

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Dashboard" atras={{ href: '/', texto: 'Módulos' }} />

      {totalAbiertos === 0 ? (
        <p className="card border-logisalud-green text-sm text-gray-700">
          Todo al día — no hay ningún loop abierto ahora mismo.
        </p>
      ) : (
        <div className="space-y-6">
          {loops.fraccionamientosVencidos.length > 0 ? (
            <Seccion titulo="Cuotas de fraccionamiento SUNAT vencidas" urgente>
              {loops.fraccionamientosVencidos.map((c) => (
                <Item key={c.cuotaId} href="/financiamiento/vencimientos">
                  <Fila
                    titulo={`${c.numeroExpediente} — cuota ${c.numeroCuota}`}
                    monto={<Money valor={c.monto} />}
                  />
                  <p className="mt-0.5 text-sm text-red-700">
                    Venció hace {diasVencida(c.fechaVencimiento)} día(s) — generá su obligación en
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
                    Resolvé la acción de cada línea antes de que Contabilidad registre la obligación.
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
                    {a.solicitanteNombre ?? 'Empleado'} todavía no subió sus comprobantes — pedile que rinda el anticipo.
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
        </div>
      )}
    </main>
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
