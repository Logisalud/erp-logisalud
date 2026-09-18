import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { perfilActual } from '@logisalud/auth/server'
import { listarMisFondos, listarTodosLosFondos } from '@/services/caja-chica'

export const dynamic = 'force-dynamic'

export default async function CajaChica() {
  const [fondos, perfil] = await Promise.all([listarMisFondos(), perfilActual()])
  const puedeAbrirFondo = perfil?.area === 'contabilidad' || perfil?.area === 'admin'
  // Contabilidad ABRE los fondos de otros (el de Roberto, por ejemplo) y
  // hasta ahora no veía ninguno: "Mis fondos" filtra por custodio, y Mariela
  // no es custodia de los que ella misma creó. Las dos listas van separadas a
  // propósito — son dos preguntas distintas: "qué manejo yo" y "qué hay".
  const todos = puedeAbrirFondo ? await listarTodosLosFondos() : []
  const deOtros = todos.filter((f) => !fondos.some((mio) => mio.id === f.id))

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Caja Chica" atras={{ href: '/', texto: 'Módulos' }} />

      <div className="mb-5 flex flex-wrap gap-3">
        <Link href="/caja-chica/reposiciones" className="btn-secondary w-full sm:w-auto">
          Ver reposiciones
        </Link>
        {puedeAbrirFondo ? (
          <>
            <a href="/caja-chica/descargar" className="btn-secondary w-full sm:w-auto">
              Descargar gastos (Excel)
            </a>
            <Link href="/caja-chica/nuevo-fondo" className="btn-primary w-full sm:w-auto">
              Abrir fondo nuevo
            </Link>
          </>
        ) : null}
      </div>

      <section>
        <h2 className="font-heading mb-2 text-lg">Mis fondos</h2>
        {fondos.length === 0 ? (
          <div className="card space-y-3 text-sm text-gray-600">
            <p>No administras ningún fondo de caja chica.</p>
            {puedeAbrirFondo ? (
              <Link href="/caja-chica/nuevo-fondo" className="btn-primary w-full sm:w-auto">
                Abrir un fondo
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-2">
            {fondos.map((f) => (
              <li key={f.id}>
                <Link href={`/caja-chica/fondos/${f.id}`} className="card block transition hover:shadow-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{f.descripcion ?? 'Fondo fijo'}</span>
                    <Money valor={f.monto_fijo} moneda={f.moneda} />
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">Área: {f.area}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Los de los demás, para Contabilidad. Aparte de "Mis fondos" y no
          mezclados: uno es lo que la persona maneja y responde, el otro es lo
          que supervisa. */}
      {puedeAbrirFondo && deOtros.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-heading mb-2 text-lg">Todos los fondos</h2>
          <p className="mb-2 text-sm text-gray-600">
            Los que abriste para otras personas. No eres custodio de estos.
          </p>
          <ul className="space-y-2">
            {deOtros.map((f) => (
              <li key={f.id}>
                <Link href={`/caja-chica/fondos/${f.id}`} className="card block transition hover:shadow-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{f.descripcion ?? 'Fondo fijo'}</span>
                    <Money valor={f.monto_fijo} moneda={f.moneda} />
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">
                    Custodio: {f.custodio ?? 'sin nombre'} · Área: {f.area}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
