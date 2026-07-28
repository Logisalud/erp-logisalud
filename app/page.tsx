import Link from 'next/link';

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto mt-20 px-4">
      <h1 className="text-3xl font-oswald tracking-wide mb-1" style={{ color: '#4BB168' }}>LOGISALUD</h1>
      <p className="text-gray-500 mb-8 font-poppins">Cuentas por Cobrar</p>
      <div className="grid gap-4">
        <Link href="/estado-cuenta" className="block p-6 bg-white rounded-xl border-2 hover:shadow-md transition" style={{ borderColor: '#4BB168' }}>
          <h2 className="text-lg font-semibold mb-1" style={{ color: '#4BB168' }}>📊 Estado de Cuenta</h2>
          <p className="text-gray-500 text-sm">Cartera por vendedor, cliente y factura con aging de vencimientos.</p>
        </Link>
        <Link href="/registrar-pago" className="block p-6 bg-white rounded-xl border-2 hover:shadow-md transition" style={{ borderColor: '#4BB168' }}>
          <h2 className="text-lg font-semibold mb-1" style={{ color: '#4BB168' }}>💳 Registrar Pago</h2>
          <p className="text-gray-500 text-sm">Registra pagos de facturas o letras adjuntando el voucher del cliente.</p>
        </Link>
        <Link href="/contados-pendientes" className="block p-6 bg-white rounded-xl border-2 hover:shadow-md transition" style={{ borderColor: '#4ABCC2' }}>
          <h2 className="text-lg font-semibold mb-1" style={{ color: '#4ABCC2' }}>⏳ Contados Pendientes</h2>
          <p className="text-gray-500 text-sm">Facturas CONTADO aún no cobradas. Márcalas como pendientes para incluirlas en la cartera.</p>
        </Link>
        <Link href="/letras" className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition">
          <h2 className="text-lg font-semibold mb-1">🏷️ Letras de Cambio</h2>
          <p className="text-gray-500 text-sm">Gira, gestiona y cambia el estado de letras vinculadas a facturas a crédito.</p>
        </Link>
        <Link href="/clientes" className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition">
          <h2 className="text-lg font-semibold mb-1">🔍 Clientes</h2>
          <p className="text-gray-500 text-sm">Busca clientes, asigna o reasigna vendedores manualmente.</p>
        </Link>
        <Link href="/importar" className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition">
          <h2 className="text-lg font-semibold mb-1">📥 Importar Nubefact</h2>
          <p className="text-gray-500 text-sm">Sube tu reporte Excel y carga los documentos.</p>
        </Link>
        <Link href="/importar-cartera" className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition">
          <h2 className="text-lg font-semibold mb-1">👥 Importar Cartera</h2>
          <p className="text-gray-500 text-sm">Carga vendedores, zonas y asigna clientes desde el Excel de cartera.</p>
        </Link>
        <Link href="/vendedores-links" className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition">
          <h2 className="text-lg font-semibold mb-1">🔗 Links de vendedores</h2>
          <p className="text-gray-500 text-sm">Links privados de cobranza para que cada vendedor vea su cartera pendiente.</p>
        </Link>
        <Link href="/accesos" className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition">
          <h2 className="text-lg font-semibold mb-1">📊 Accesos de vendedores</h2>
          <p className="text-gray-500 text-sm">Quién entra a ver su cobranza y quién no — para detectar a los que no lo usan.</p>
        </Link>
        <Link href="/cobranza" className="block p-6 bg-white rounded-xl border-2 hover:shadow-md transition" style={{ borderColor: '#4ABCC2' }}>
          <h2 className="text-lg font-semibold mb-1">💰 Cobranza del período</h2>
          <p className="text-gray-500 text-sm">Cuánto se cobró (total y de lo vencido) por vendedor, en el rango que elijas.</p>
        </Link>
        <Link href="/conciliacion" className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition">
          <h2 className="text-lg font-semibold mb-1">🏦 Conciliación bancaria</h2>
          <p className="text-gray-500 text-sm">Importa el extracto del banco y clasifica los movimientos (cobros vs. internos).</p>
        </Link>
      </div>
    </main>
  );
}
