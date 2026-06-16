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
      </div>
    </main>
  );
}
