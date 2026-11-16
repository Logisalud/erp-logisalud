import Link from 'next/link'
import { perfilActual } from '@logisalud/auth/server'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { hoyLima } from '@/domain/fecha'
import {
  filtrarNotasPendientes, leerFiltroNotasPendientes, puedeRegistrarDocumentoExcedente,
  puedeVerNotasPendientes, resumenPorProveedor,
} from '@/domain/notas-pendientes-proveedor'
import { listarNotasPendientes } from '@/services/notas-pendientes-proveedor'
import { TablaNotasPendientes } from './tabla'

export const dynamic = 'force-dynamic'

/**
 * Notas pendientes de proveedores (Contabilidad, 2026-11-16): lo que cada
 * proveedor debe regularizar por diferencias de la recepción — una nota de
 * crédito si llegó menos, una factura o nota de débito si llegó más. La
 * diferencia la registra Almacén al recibir; acá Contabilidad, Gerencia y
 * Tesorería le hacen el seguimiento.
 */
export default async function NotasPendientes({
  searchParams,
}: { searchParams: { estado?: string; tipo?: string; q?: string } }) {
  const perfil = await perfilActual()
  if (!puedeVerNotasPendientes(perfil?.area)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Encabezado titulo="Notas pendientes de proveedores" atras={{ href: '/reportes', texto: 'Ver reportes' }} />
        <p className="card text-sm text-gray-600">Este reporte es para Contabilidad, Gerencia y Tesorería.</p>
      </main>
    )
  }

  const hoy = hoyLima()
  const filtro = leerFiltroNotasPendientes(searchParams)
  const todas = await listarNotasPendientes(hoy)
  const filas = filtrarNotasPendientes(todas, filtro)
  // El resumen mira lo pendiente de TODO, no solo del filtro: es la foto de
  // cuánto se le está reclamando a cada proveedor.
  const resumen = resumenPorProveedor(filtrarNotasPendientes(todas, { ...filtro, estado: 'pendiente' }))

  const href = (cambios: Partial<Record<'estado' | 'tipo' | 'q', string>>) => {
    const p = new URLSearchParams()
    const v = { estado: filtro.estado, tipo: filtro.tipo, q: filtro.busqueda, ...cambios }
    if (v.estado !== 'pendiente') p.set('estado', v.estado)
    if (v.tipo !== 'todos') p.set('tipo', v.tipo)
    if (v.q) p.set('q', v.q)
    const qs = p.toString()
    return `/reportes/notas-pendientes${qs ? `?${qs}` : ''}`
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <Encabezado titulo="Notas pendientes de proveedores" atras={{ href: '/reportes', texto: 'Ver reportes' }} />

      <p className="mb-4 max-w-3xl text-sm text-gray-600">
        Cada fila es un producto donde lo que llegó no coincide con la factura. Si llegó menos, el
        proveedor debe una <strong>nota de crédito</strong> (se registra en la ficha de la deuda, que
        queda frenada hasta entonces). Si llegó más, debe una <strong>factura o nota de débito</strong>{' '}
        por la diferencia (se registra acá).
      </p>

      {resumen.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-heading mb-2 text-lg">Por proveedor — lo pendiente</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Proveedor</th>
                  <th className="px-3 py-2 text-right font-medium">Casos</th>
                  <th className="px-3 py-2 text-right font-medium">Monto estimado</th>
                  <th className="px-3 py-2 text-right font-medium">El más antiguo</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={r.proveedorId} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2">
                      <Link href={href({ q: r.proveedor })} className="text-logisalud-teal underline decoration-dotted hover:decoration-solid">
                        {r.proveedor}
                      </Link>
                      {r.ruc ? <span className="block text-xs text-gray-500">RUC {r.ruc}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.casos}</td>
                    <td className="px-3 py-2 text-right">
                      {r.montoPorMoneda.map((m) => (
                        <span key={m.moneda} className="block"><Money valor={m.monto} moneda={m.moneda} /></span>
                      ))}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.masAntiguo > 30 ? 'font-medium text-amber-800' : ''}`}>
                      {r.masAntiguo} días
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <form className="card mb-4 flex flex-wrap items-end gap-3" method="get">
        <label className="block min-w-[200px] flex-1 text-sm">
          <span className="text-gray-600">Buscar</span>
          <input
            type="search" name="q" defaultValue={filtro.busqueda}
            placeholder="Proveedor, RUC, OC, factura, deuda o producto"
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Estado</span>
          <select name="estado" defaultValue={filtro.estado} className="mt-1 min-h-12 rounded-md border border-gray-300 bg-white px-3">
            <option value="pendiente">Pendientes</option>
            <option value="recibida">Ya recibidas</option>
            <option value="todas">Todas</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Qué se debe</span>
          <select name="tipo" defaultValue={filtro.tipo} className="mt-1 min-h-12 rounded-md border border-gray-300 bg-white px-3">
            <option value="todos">Todo</option>
            <option value="nota_credito">Nota de crédito (llegó menos)</option>
            <option value="factura_o_debito">Factura o nota de débito (llegó más)</option>
          </select>
        </label>
        <button type="submit" className="btn-secondary">Filtrar</button>
        {filtro.busqueda || filtro.estado !== 'pendiente' || filtro.tipo !== 'todos' ? (
          <Link href="/reportes/notas-pendientes" className="text-sm text-gray-500 underline">Quitar filtros</Link>
        ) : null}
      </form>

      {filas.length === 0 ? (
        <p className="card text-sm text-gray-600">
          {filtro.estado === 'pendiente' && !filtro.busqueda && filtro.tipo === 'todos'
            ? 'Ningún proveedor debe notas: todo lo que llegó coincide con su factura, o ya se regularizó.'
            : 'Nada coincide con este filtro.'}
        </p>
      ) : (
        <TablaNotasPendientes
          filas={filas}
          puedeRegistrar={puedeRegistrarDocumentoExcedente(perfil?.area)}
        />
      )}
      <p className="mt-3 text-xs text-gray-500">
        El monto es una estimación: diferencia × precio de la OC, más IGV si el producto no es
        exonerado. Los días se cuentan desde que llegó la mercadería hasta hoy, o hasta que llegó el
        documento.
      </p>
    </main>
  )
}
