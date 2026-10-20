'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeftRight, BadgeCheck, ChevronDown, ClipboardList, Package, PackageOpen, PackagePlus, PackageX, ScanLine, Bell, Truck, BarChart3, Boxes, CalendarClock, ClipboardCheck, FileSpreadsheet, FileText, FolderOpen, History, Home, Inbox, ListChecks, Map, MoreHorizontal, Route, Search, ShieldCheck, Undo2, Upload, Users, X } from 'lucide-react'
import { Marca, MarcaIcono } from './marca'
import { PaletaBusqueda } from './paleta-busqueda'
import { NAV_ACTIVO, NAV_INACTIVO } from '@/components/estilos-opcion'

import { hrefActivo, type IconoNav, type ItemMenu, type SeccionMenu } from '@/domain/menu'

export type ItemNav = ItemMenu

const ICONOS: Record<IconoNav, typeof Home> = { nuevasalida: PackagePlus, inicio: Home, almacen: Map, entradas: Inbox, productos: Boxes, calidad: ShieldCheck, alertas: Bell, expedientes: FolderOpen, propietarios: Users, auditoria: History, movimientos: ArrowLeftRight, conteos: ClipboardCheck, kardex: FileSpreadsheet, vencimientos: CalendarClock, carga: Upload, revision: ListChecks, reportes: BarChart3, pedidos: ClipboardList, rutas: Route, documentos: FileText, salidas: PackageOpen, picking: ScanLine, conformidad: BadgeCheck, embalaje: Package, cargaunidad: Truck, bajas: PackageX, retornos: Undo2 }

/** Punto de aviso sobre el ícono (la cantidad exacta va en texto en la barra ancha y en el menú «Más»). */
function Punto({ n }: { n?: number }) {
  if (!n) return null
  return <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500" />
}

const CLAVE_COLAPSADAS = 'wms.menu.colapsadas'

export function Shell({
  secciones, principales: hrefsPrincipales, cerradas: cerradasInicio, nombre, rol, salir, children,
}: {
  secciones: SeccionMenu[]
  /** Enlaces de la barra inferior del teléfono (lo principal de cada rol). */
  principales: string[]
  /** Secciones que arrancan cerradas para este rol (D-132). */
  cerradas: string[]
  nombre: string
  rol: string
  salir: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const [buscando, setBuscando] = useState(false)
  const [mas, setMas] = useState(false)
  // null = nadie ha tocado los encabezados: valen los cerrados por defecto del rol.
  const [elegidas, setElegidas] = useState<string[] | null>(null)
  const colapsadas = elegidas ?? cerradasInicio

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

  // Las secciones que el usuario cerró en la barra ancha se recuerdan en este navegador (si no se puede guardar, todo queda abierto).
  useEffect(() => {
    try { const g = localStorage.getItem(CLAVE_COLAPSADAS); if (g) setElegidas(JSON.parse(g)) } catch { /* sin almacenamiento: valen los de por defecto */ }
  }, [])
  const alternar = (id: string) => {
    const n = colapsadas.includes(id) ? colapsadas.filter((x) => x !== id) : [...colapsadas, id]
    setElegidas(n)
    try { localStorage.setItem(CLAVE_COLAPSADAS, JSON.stringify(n)) } catch { /* idem */ }
  }
  const estaCerrada = (sec: SeccionMenu) => colapsadas.includes(sec.id) && !sec.items.some((i) => i.href === actual)

  const todos = secciones.flatMap((s) => s.items)
  const actual = hrefActivo(pathname, todos.map((i) => i.href))
  const principales = hrefsPrincipales.map((h) => todos.find((i) => i.href === h)).filter((i): i is ItemMenu => !!i)
  const alertasAbiertas = todos.reduce((n, i) => n + (i.insignia ?? 0), 0)

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
        <nav aria-label="Principal" className="min-h-0 flex-1 overflow-y-auto px-2">
          {secciones.map((sec, n) => {
            // La sección donde estás nunca se oculta, aunque la hayas cerrado.
            const cerrada = estaCerrada(sec)
            const pendientes = sec.items.reduce((t, i) => t + (i.insignia ?? 0), 0)
            return (
              <div key={sec.id} data-seccion={sec.id} className={n > 0 ? 'mt-2 border-t border-gray-200 pt-2 xl:mt-3 xl:border-t-0 xl:pt-0' : ''}>
                {sec.titulo && (
                  <button
                    type="button"
                    onClick={() => alternar(sec.id)}
                    aria-expanded={!cerrada}
                    aria-controls={`menu-${sec.id}`}
                    data-testid={`seccion-${sec.id}`}
                    className="hidden min-h-8 w-full items-center gap-2 rounded-md px-2.5 text-left font-heading text-xs font-medium uppercase tracking-widest text-gray-600 hover:bg-gray-100 xl:flex"
                  >
                    <span className="flex-1">{sec.titulo}</span>
                    {cerrada && pendientes > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold normal-case tracking-normal text-amber-900">{pendientes}</span> : null}
                    <ChevronDown className={`h-4 w-4 transition-transform duration-fast ${cerrada ? '-rotate-90' : ''}`} aria-hidden />
                  </button>
                )}
                <ul id={`menu-${sec.id}`} className={`space-y-0.5 ${cerrada ? 'xl:hidden' : ''}`}>
                  {sec.items.map((i) => {
                    const Icono = ICONOS[i.icono]
                    const on = i.href === actual
                    return (
                      <li key={i.href}>
                        <Link
                          href={i.href}
                          aria-current={on ? 'page' : undefined}
                          title={i.etiqueta}
                          data-testid={`nav-${i.href === '/' ? 'inicio' : i.href.slice(1).replace(/\//g, '-')}`}
                          className={`flex min-h-10 items-center justify-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition duration-fast xl:justify-start ${
                            i.destacado ? (on ? 'bg-green-800 text-white' : 'bg-green-700 text-white hover:bg-green-800') : on ? NAV_ACTIVO : NAV_INACTIVO
                          }`}
                        >
                          <span className="relative shrink-0"><Icono className="h-5 w-5" aria-hidden /><Punto n={i.insignia} /></span>
                          <span className="hidden xl:inline">{i.etiqueta}</span>
                          <span className="sr-only xl:hidden">{i.etiqueta}</span>
                          {i.insignia ? <span className="ml-auto hidden rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 xl:inline">{i.insignia}</span> : null}
                          {i.insignia ? <span className="sr-only">, {i.insignia} abiertas</span> : null}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </nav>
        <div className="border-t border-gray-200 p-2 xl:p-4">
          <div className="hidden xl:block">
            <p className="text-sm font-medium text-gray-900">{nombre}</p>
            <p className="text-xs text-gray-600">{rol}</p>
          </div>
          <div className="flex justify-center text-sm text-gray-700 xl:mt-3 xl:block [&_.txt]:sr-only xl:[&_.txt]:not-sr-only [&_button]:inline-flex [&_button]:min-h-10 [&_button]:items-center [&_button]:gap-2 [&_button]:rounded-md [&_button]:px-2 [&_button]:hover:bg-gray-100">
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
          const on = i.href === actual
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={on ? 'page' : undefined}
              data-testid={`inferior-${i.href === '/' ? 'inicio' : i.href.slice(1).replace(/\//g, '-')}`}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${on ? 'text-green-700' : 'text-gray-600'}`}
            >
              <Icono className="h-5 w-5" aria-hidden />
              {i.corta ?? i.etiqueta}
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
          <span className="relative"><MoreHorizontal className="h-5 w-5" aria-hidden /><Punto n={alertasAbiertas} /></span>
          Más
          {alertasAbiertas ? <span className="sr-only">, {alertasAbiertas} alertas abiertas</span> : null}
        </button>
      </nav>

      {mas && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Más opciones">
          <button type="button" className="absolute inset-0 bg-gray-900/40" aria-label="Cerrar" onClick={() => setMas(false)} />
          <div className="hoja-entra absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-xl bg-white p-4 pb-8 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{nombre}</p>
                <p className="text-xs text-gray-600">{rol}</p>
              </div>
              <button type="button" onClick={() => setMas(false)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-100" aria-label="Cerrar">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {secciones.map((sec) => {
                const cerrada = estaCerrada(sec)
                const pendientes = sec.items.reduce((t, i) => t + (i.insignia ?? 0), 0)
                return (
                  <section key={sec.id} aria-label={sec.titulo ?? 'Inicio'} data-seccion={sec.id} className="mt-1">
                    {sec.titulo && (
                      <h2>
                        <button type="button" onClick={() => alternar(sec.id)} aria-expanded={!cerrada} data-testid={`seccion-mas-${sec.id}`} className="flex min-h-11 w-full items-center gap-2 px-1 text-left font-heading text-xs font-medium uppercase tracking-widest text-gray-600">
                          <span className="flex-1">{sec.titulo}</span>
                          {cerrada && pendientes > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold normal-case tracking-normal text-amber-900">{pendientes}</span> : null}
                          <ChevronDown className={`h-4 w-4 transition-transform duration-fast ${cerrada ? '-rotate-90' : ''}`} aria-hidden />
                        </button>
                      </h2>
                    )}
                    <ul className={`divide-y divide-gray-100 ${cerrada ? 'hidden' : ''}`}>
                      {sec.items.map((i) => {
                        const Icono = ICONOS[i.icono]
                        return (
                          <li key={i.href}>
                            <Link href={i.href} aria-current={i.href === actual ? 'page' : undefined} className={`flex min-h-12 items-center gap-3 ${i.destacado ? 'font-medium text-green-800' : 'text-gray-900'}`}>
                              <span className="relative"><Icono className={`h-5 w-5 ${i.destacado ? 'text-green-700' : 'text-gray-600'}`} aria-hidden /></span>
                              {i.etiqueta}
                              {i.insignia ? <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{i.insignia} {i.insignia === 1 ? 'abierta' : 'abiertas'}</span> : null}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
              <div className="mt-2 border-t border-gray-100 [&_button]:flex [&_button]:min-h-14 [&_button]:w-full [&_button]:items-center [&_button]:gap-3 [&_button]:text-left [&_button]:text-gray-900">
                {salir}
              </div>
            </div>
          </div>
        </div>
      )}

      {buscando && <PaletaBusqueda onCerrar={() => setBuscando(false)} />}
    </div>
  )
}

