'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { Boxes, History, Home, Map, MoreHorizontal, Search, Users, X } from 'lucide-react'
import { Marca, MarcaIcono } from './marca'
import { PaletaBusqueda } from './paleta-busqueda'

export interface ItemNav {
  href: string
  etiqueta: string
  icono: 'inicio' | 'almacen' | 'productos' | 'propietarios' | 'auditoria'
}

const ICONOS = { inicio: Home, almacen: Map, productos: Boxes, propietarios: Users, auditoria: History }

const activo = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

export function Shell({
  items, nombre, rol, salir, children,
}: {
  items: ItemNav[]
  nombre: string
  rol: string
  salir: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const [buscando, setBuscando] = useState(false)
  const [mas, setMas] = useState(false)

  // Ctrl/Cmd+K abre la búsqueda universal desde cualquier pantalla.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setBuscando(true)
      }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])

  useEffect(() => setMas(false), [pathname])

  const principales = items.filter((i) => ['inicio', 'almacen', 'productos'].includes(i.icono))
  const secundarios = items.filter((i) => !['inicio', 'almacen', 'productos'].includes(i.icono))

  return (
    <div className="flex min-h-screen">
      {/* Barra lateral (PC y tablet) */}
      <aside className="sticky top-[var(--alto-banner)] hidden h-[calc(100vh-var(--alto-banner))] w-16 shrink-0 flex-col border-r border-gray-200 bg-white md:flex xl:w-60">
        <div className="flex justify-center px-2 pb-4 pt-5 xl:block xl:px-5">
          <span className="xl:hidden"><MarcaIcono alto={28} /></span>
          <span className="hidden xl:block">
            <Marca alto={26} />
            <span className="mt-1 block font-heading text-sm uppercase tracking-widest text-gray-500">Almacén</span>
          </span>
        </div>
        <nav aria-label="Principal" className="flex-1 space-y-1 px-2 xl:px-3">
          {items.map((i) => {
            const Icono = ICONOS[i.icono]
            const on = activo(pathname, i.href)
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? 'page' : undefined}
                title={i.etiqueta}
                className={`flex min-h-11 items-center justify-center gap-3 rounded-md px-3 text-sm font-medium transition duration-fast xl:justify-start ${
                  on ? 'bg-green-50 text-green-800' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icono className="h-5 w-5 shrink-0" aria-hidden />
                <span className="hidden xl:inline">{i.etiqueta}</span>
                <span className="sr-only xl:hidden">{i.etiqueta}</span>
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-gray-200 p-2 xl:p-4">
          <div className="hidden xl:block">
            <p className="text-sm font-medium text-gray-900">{nombre}</p>
            <p className="text-xs text-gray-600">{rol}</p>
          </div>
          <div className="flex justify-center text-sm text-gray-700 xl:mt-3 xl:block [&_.txt]:hidden xl:[&_.txt]:inline [&_button]:inline-flex [&_button]:min-h-10 [&_button]:items-center [&_button]:gap-2 [&_button]:rounded-md [&_button]:px-2 [&_button]:hover:bg-gray-100">
            {salir}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        {/* Barra superior */}
        <header className="sticky top-[var(--alto-banner)] z-30 flex min-h-14 items-center gap-3 border-b border-gray-200 bg-white/95 px-4 backdrop-blur md:px-6">
          <div className="md:hidden">
            <MarcaIcono alto={28} />
          </div>
          <button
            type="button"
            onClick={() => setBuscando(true)}
            data-testid="abrir-busqueda"
            className="flex min-h-11 flex-1 items-center gap-2 rounded-full border border-gray-300 bg-gray-50 px-4 text-left text-sm text-gray-600 transition duration-fast hover:border-gray-400 md:max-w-xl"
            aria-label="Buscar producto, lote o ubicación"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">Buscar producto, lote o ubicación</span>
            <kbd className="ml-auto hidden rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] text-gray-600 md:inline">Ctrl K</kbd>
          </button>
        </header>

        <main id="contenido" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 md:px-6 md:py-6">
          {children}
        </main>
      </div>

      {/* Navegación inferior (teléfono) */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {principales.map((i) => {
          const Icono = ICONOS[i.icono]
          const on = activo(pathname, i.href)
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={on ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${on ? 'text-green-700' : 'text-gray-600'}`}
            >
              <Icono className="h-5 w-5" aria-hidden />
              {i.etiqueta}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setBuscando(true)}
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-gray-600"
        >
          <Search className="h-5 w-5" aria-hidden />
          Buscar
        </button>
        <button
          type="button"
          onClick={() => setMas(true)}
          aria-expanded={mas}
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-gray-600"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
          Más
        </button>
      </nav>

      {mas && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Más opciones">
          <button type="button" className="absolute inset-0 bg-gray-900/40" aria-label="Cerrar" onClick={() => setMas(false)} />
          <div className="hoja-entra absolute inset-x-0 bottom-0 rounded-t-xl bg-white p-4 pb-8 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{nombre}</p>
                <p className="text-xs text-gray-600">{rol}</p>
              </div>
              <button type="button" onClick={() => setMas(false)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-100" aria-label="Cerrar">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {secundarios.map((i) => {
                const Icono = ICONOS[i.icono]
                return (
                  <li key={i.href}>
                    <Link href={i.href} className="flex min-h-14 items-center gap-3 text-gray-900">
                      <Icono className="h-5 w-5 text-gray-600" aria-hidden />
                      {i.etiqueta}
                    </Link>
                  </li>
                )
              })}
              <li className="[&_button]:flex [&_button]:min-h-14 [&_button]:w-full [&_button]:items-center [&_button]:gap-3 [&_button]:text-left [&_button]:text-gray-900">
                {salir}
              </li>
            </ul>
          </div>
        </div>
      )}

      {buscando && <PaletaBusqueda onCerrar={() => setBuscando(false)} />}
    </div>
  )
}

