import Link from 'next/link';
import { perfilActual } from '@logisalud/auth/server';
import { AREAS_ESCRITURA, AREAS_ASIGNACION } from '@/lib/autorizacion';
import {
  Upload, CreditCard, Landmark, AlertTriangle, Banknote, Clock,
  Target, Wallet, Layers, BarChart3, Tag, Repeat,
  Users, ClipboardList, ScrollText, CalendarClock, FileOutput, FileSpreadsheet,
  Link2, Eye, MessageCircle, FolderInput, HandCoins,
  type LucideIcon,
} from 'lucide-react';

type Tarjeta = {
  href: string;
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
  destacar?: boolean;
  visible?: boolean;
};

type Modulo = {
  nombre: string;
  tarjetas: Tarjeta[];
};

export default async function Home() {
  const perfil = await perfilActual();
  const area = perfil?.area ?? '';
  const puedeEditarContado = area === 'admin' || (AREAS_ESCRITURA as readonly string[]).includes(area);
  const puedeAsignar = area === 'admin' || (AREAS_ASIGNACION as readonly string[]).includes(area);

  // Mismos destinos y el mismo comportamiento de permisos que antes de
  // este rediseño: Contados Pendientes (AREAS_ESCRITURA) y Links de
  // vendedores (AREAS_ASIGNACION) siguen condicionales por área. El
  // resto se muestra a cualquier sesión válida, igual que siempre — cada
  // API route reaplica su propio exigirArea().
  const modulos: Modulo[] = [
    {
      nombre: 'Cobranza diaria',
      tarjetas: [
        { href: '/cobranzas/concentracion-cartera', icono: Target, titulo: 'Concentración de cartera vencida', descripcion: 'Qué clientes concentran la deuda vencida — por vendedor, con reincidentes.' },
        { href: '/cobranzas/pagos-sin-confirmar', icono: AlertTriangle, titulo: 'Pagos sin confirmar', descripcion: 'Pagos registrados por voucher que aún no se confirmaron contra el extracto bancario.' },
        { href: '/cobranzas/cobranza', icono: Wallet, titulo: 'Cobranza del período', descripcion: 'Cuánto se cobró (total y de lo vencido) por vendedor, en el rango que elijas.' },
        { href: '/cobranzas/fases-cobranza', icono: Layers, titulo: 'Fases de cobranza', descripcion: 'Agenda de gestión por cliente — fases 0 a 6, con Pareto 80% por fase.' },
        { href: '/cobranzas/indicadores-cobranza', icono: BarChart3, titulo: 'Indicadores de cobranza', descripcion: 'Los 6 indicadores de Finanzas: efectividad, DSO, morosidad y más.' },
      ],
    },
    {
      nombre: 'Pagos y bancos',
      tarjetas: [
        { href: '/cobranzas/registrar-pago', icono: CreditCard, titulo: 'Registrar pago', descripcion: 'Registra pagos de facturas o letras adjuntando el voucher del cliente.', destacar: true },
        { href: '/cobranzas/conciliacion', icono: Landmark, titulo: 'Conciliación bancaria', descripcion: 'Importa el extracto del banco y clasifica los movimientos (cobros vs. internos).' },
        { href: '/cobranzas/efectivo-por-depositar', icono: Banknote, titulo: 'Efectivo por depositar', descripcion: 'Pagos en efectivo cobrados y aún no llevados al banco.' },
        { href: '/cobranzas/letras', icono: Tag, titulo: 'Letras de Cambio', descripcion: 'Gira, gestiona y cambia el estado de letras vinculadas a facturas a crédito.' },
        { href: '/cobranzas/factoring', icono: Repeat, titulo: 'Factoring de facturas', descripcion: 'Canjea facturas a factoring, registra el ingreso al banco y consulta el reporte.' },
      ],
    },
    {
      nombre: 'Cartera y clientes',
      tarjetas: [
        { href: '/cobranzas/clientes', icono: Users, titulo: 'Clientes', descripcion: 'Busca clientes, asigna o reasigna vendedores manualmente.' },
        { href: '/cobranzas/estado-cuenta', icono: ClipboardList, titulo: 'Estado de Cuenta', descripcion: 'Cartera por vendedor, cliente y factura con aging de vencimientos.', destacar: true },
        { href: '/cobranzas/estado-cuenta-cliente', icono: ScrollText, titulo: 'Estado de Cuenta por Cliente', descripcion: 'Historial completo tipo extracto bancario: cada movimiento con su saldo acumulado.', destacar: true },
        { href: '/cobranzas/saldos-a-favor', icono: HandCoins, titulo: 'Saldos a favor del cliente', descripcion: 'A quién le debemos plata: notas de crédito y pagos aplicados de más, con el neto contra su deuda.' },
        { href: '/cobranzas/contados-pendientes', icono: Clock, titulo: 'Contados Pendientes', descripcion: 'Facturas CONTADO aún no cobradas. Márcalas como pendientes para incluirlas en la cartera.', destacar: true, visible: puedeEditarContado },
      ],
    },
    {
      nombre: 'Reportes y exportaciones',
      tarjetas: [
        { href: '/cobranzas/reporte-letras', icono: CalendarClock, titulo: 'Reporte de letras', descripcion: 'Agenda plana de todas las letras, filtrable por estado, cliente y vencimiento.' },
        { href: '/cobranzas/reporte-factoring', icono: FileSpreadsheet, titulo: 'Reporte de factoring', descripcion: 'Todas las facturas que pasaron por factoring, con su vencimiento, su retención y su estado.' },
        { href: '/cobranzas/exportar-nubecont', icono: FileOutput, titulo: 'Export a Nubecont', descripcion: 'Descarga los ingresos de cobranza en el formato de importación de Nubecont.' },
      ],
    },
    {
      nombre: 'Equipo comercial',
      tarjetas: [
        { href: '/cobranzas/vendedores-links', icono: Link2, titulo: 'Links de vendedores', descripcion: 'Links privados de cobranza para que cada vendedor vea su cartera pendiente.', visible: puedeAsignar },
        { href: '/cobranzas/accesos', icono: Eye, titulo: 'Accesos de vendedores', descripcion: 'Quién entra a ver su cobranza y quién no — para detectar a los que no lo usan.' },
        { href: '/cobranzas/whatsapp-ranking', icono: MessageCircle, titulo: 'Ranking de WhatsApp', descripcion: 'Recordatorios de pronto pago y de vencimiento enviados por cada vendedor.' },
      ],
    },
    {
      nombre: 'Importaciones y administración',
      tarjetas: [
        { href: '/cobranzas/importar', icono: Upload, titulo: 'Importar Nubefact', descripcion: 'Sube tu reporte Excel y carga los documentos.' },
        { href: '/cobranzas/importar-cartera', icono: FolderInput, titulo: 'Importar Cartera', descripcion: 'Carga vendedores, zonas y asigna clientes desde el Excel de cartera.' },
      ],
    },
  ];

  // Acceso directo: las pantallas de uso diario, repetidas acá como
  // atajo — siguen existiendo también dentro de su módulo de arriba.
  const accesoDirecto: Tarjeta[] = [
    { href: '/cobranzas/importar', icono: Upload, titulo: 'Importar Nubefact', descripcion: '' },
    { href: '/cobranzas/registrar-pago', icono: CreditCard, titulo: 'Registrar pago', descripcion: '' },
    { href: '/cobranzas/conciliacion', icono: Landmark, titulo: 'Conciliación bancaria', descripcion: '' },
    { href: '/cobranzas/pagos-sin-confirmar', icono: AlertTriangle, titulo: 'Pagos sin confirmar', descripcion: '' },
    { href: '/cobranzas/efectivo-por-depositar', icono: Banknote, titulo: 'Efectivo por depositar', descripcion: '' },
    { href: '/cobranzas/contados-pendientes', icono: Clock, titulo: 'Contados pendientes', descripcion: '', visible: puedeEditarContado },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="font-oswald text-3xl uppercase tracking-wide text-brand-green-600">LOGISALUD</h1>
        <p className="mt-1 text-sm text-ink-500 font-poppins">Cuentas por Cobrar</p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 font-oswald text-sm uppercase tracking-widest text-ink-400">Acceso directo</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {accesoDirecto.filter(t => t.visible !== false).map(t => (
            <Link
              key={t.href}
              href={t.href}
              className="flex flex-col items-center gap-1.5 rounded-ds-card border border-ink-200 bg-white px-3 py-4 text-center transition hover:border-brand-green-300 hover:shadow-ds-sm"
            >
              <t.icono size={20} className="text-brand-green-600" />
              <span className="text-xs font-medium text-ink-700 font-poppins">{t.titulo}</span>
            </Link>
          ))}
        </div>
      </section>

      {modulos.map(modulo => {
        const tarjetas = modulo.tarjetas.filter(t => t.visible !== false);
        if (tarjetas.length === 0) return null;
        return (
          <section key={modulo.nombre} className="mb-10">
            <h2 className="mb-3 font-oswald text-sm uppercase tracking-widest text-ink-400">{modulo.nombre}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tarjetas.map(t => (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`block rounded-ds-card border bg-white p-5 transition hover:shadow-ds-sm ${t.destacar ? 'border-brand-green-300' : 'border-ink-200'}`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <t.icono size={18} className="text-brand-green-600" />
                    <h3 className="font-semibold text-ink-900 font-poppins">{t.titulo}</h3>
                  </div>
                  <p className="text-sm text-ink-500 font-poppins">{t.descripcion}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
