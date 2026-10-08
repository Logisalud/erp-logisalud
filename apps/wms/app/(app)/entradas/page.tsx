import Link from 'next/link'
import { ArrowRight, FilePlus2, Inbox } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puede } from '@/domain/permisos'
import { ETIQUETA_TIPO_INGRESO, type PasoIngreso } from '@/domain/entradas'
import { formatoFechaHora } from '@/domain/fechas'
import { ChipPaso, ChipTipoIngreso } from '@/components/entradas/chips-entradas'

export const metadata = { title: 'Entradas — WMS LOGISALUD' }

const FILTROS: { clave: string; etiqueta: string; pasos: PasoIngreso[] | null }[] = [
  { clave: 'todas', etiqueta: 'Todas', pasos: null },
  { clave: 'proceso', etiqueta: 'En proceso', pasos: ['DATOS_Y_LOTES', 'ACTA'] },
  { clave: 'firmas', etiqueta: 'Para firmar o confirmar', pasos: ['FIRMAS', 'CONFIRMAR'] },
  { clave: 'confirmadas', etiqueta: 'En Cuarentena', pasos: ['CONFIRMADO'] },
]

export default async function Entradas({ searchParams }: { searchParams: { f?: string } }) {
  const ctx = await exigirContexto()
  const ingresos = await repositorio().listarIngresos()
  const filtro = FILTROS.find((f) => f.clave === searchParams.f) ?? FILTROS[0]
  const lista = filtro.pasos ? ingresos.filter((i) => filtro.pasos!.includes(i.paso)) : ingresos
  const puedeCrear = puede(ctx.roles, 'ejecutar')
  const num = (n: number) => n.toLocaleString('es-PE')

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Entradas</h1>
          <p className="mt-1 text-gray-700">Lo que llega al almacén: se cuenta, se firma y nace en Cuarentena.</p>
        </div>
        {puedeCrear && <Link href="/entradas/nuevo" className="btn-primary" data-testid="nuevo-ingreso"><FilePlus2 className="h-5 w-5" aria-hidden />Nuevo ingreso</Link>}
      </header>

      <nav aria-label="Filtrar entradas" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const on = f.clave === filtro.clave
          const n = f.pasos ? ingresos.filter((i) => f.pasos!.includes(i.paso)).length : ingresos.length
          return (
            <Link key={f.clave} href={f.clave === 'todas' ? '/entradas' : `/entradas?f=${f.clave}`} aria-current={on ? 'true' : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition duration-fast ${on ? 'border-green-300 bg-green-50 text-green-900' : 'border-gray-300 bg-white text-gray-800 hover:border-gray-400'}`}>
              {f.etiqueta}<span className="tabular text-xs text-gray-600">{n}</span>
            </Link>
          )
        })}
      </nav>

      {lista.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-12 text-center" data-testid="entradas-vacio">
          <Inbox className="h-10 w-10 text-gray-400" aria-hidden />
          <p className="font-heading text-xl uppercase tracking-wide text-gray-800">{ingresos.length === 0 ? 'Todavía no hay entradas' : 'Nada en esta lista'}</p>
          <p className="max-w-md text-sm text-gray-600">{ingresos.length === 0 ? 'Cuando llegue mercadería, el ingreso empieza aquí: compra local, devolución o ingreso de cliente.' : 'Prueba con otro filtro.'}</p>
          {puedeCrear && ingresos.length === 0 && <Link href="/entradas/nuevo" className="btn-primary">Registrar el primer ingreso</Link>}
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden" data-testid="entradas-tarjetas">
            {lista.map((i) => (
              <li key={i.id}>
                <Link href={`/entradas/${i.id}`} className="card block transition duration-fast hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{i.referencia ?? ETIQUETA_TIPO_INGRESO[i.tipo]}</p>
                      <p className="truncate text-sm text-gray-600">{i.contraparte ?? i.propietario}</p>
                    </div>
                    <p className="tabular shrink-0 text-right"><span className="block font-heading text-xl font-semibold">{num(i.unidades)}</span><span className="block text-[11px] text-gray-600">unidades</span></p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5"><ChipTipoIngreso tipo={i.tipo} /><ChipPaso paso={i.paso} />{i.alertasAbiertas > 0 && <span className="text-xs font-medium text-amber-900">{i.alertasAbiertas} {i.alertasAbiertas === 1 ? 'alerta' : 'alertas'}</span>}</div>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block" data-testid="entradas-tabla">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr><th className="px-4 py-3 font-medium">Referencia</th><th className="px-4 py-3 font-medium">Tipo</th><th className="px-4 py-3 font-medium">Propietario</th><th className="px-4 py-3 text-right font-medium">Unidades</th><th className="px-4 py-3 font-medium">Paso</th><th className="px-4 py-3 font-medium">Acta</th><th className="px-4 py-3 font-medium">Registrado</th><th className="w-8" /></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lista.map((i) => (
                  <tr key={i.id} className="transition duration-fast hover:bg-gray-50">
                    <td className="px-4 py-3"><Link href={`/entradas/${i.id}`} className="font-medium text-gray-900 hover:underline">{i.referencia ?? '—'}</Link><span className="block text-xs text-gray-600">{i.contraparte}</span></td>
                    <td className="px-4 py-3"><ChipTipoIngreso tipo={i.tipo} /></td>
                    <td className="px-4 py-3 text-gray-800">{i.propietario}</td>
                    <td className="tabular px-4 py-3 text-right text-gray-900">{num(i.unidades)}<span className="block text-xs text-gray-600">{i.productos} {i.productos === 1 ? 'producto' : 'productos'}</span></td>
                    <td className="px-4 py-3"><ChipPaso paso={i.paso} />{i.alertasAbiertas > 0 && <span className="mt-1 block text-xs font-medium text-amber-900">{i.alertasAbiertas} {i.alertasAbiertas === 1 ? 'alerta abierta' : 'alertas abiertas'}</span>}</td>
                    <td className="tabular px-4 py-3 text-gray-700">{i.actaNumero ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatoFechaHora(i.creadoEn)}</td>
                    <td className="px-2"><ArrowRight className="h-4 w-4 text-gray-400" aria-hidden /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
