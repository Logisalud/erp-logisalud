import Link from 'next/link';

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto mt-20 px-4">
      <h1 className="text-3xl font-bold mb-2">ERP LOGISALUD</h1>
      <p className="text-gray-500 mb-8">Cuentas por Cobrar</p>
      <div className="grid gap-4">
        <Link
          href="/importar"
          className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-sm transition"
        >
          <h2 className="text-lg font-semibold mb-1">📥 Importar Nubefact</h2>
          <p className="text-gray-500 text-sm">Sube tu reporte Excel y carga los documentos.</p>
        </Link>
        <Link
          href="/importar-cartera"
          className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-sm transition"
        >
          <h2 className="text-lg font-semibold mb-1">👥 Importar Cartera 2026</h2>
          <p className="text-gray-500 text-sm">Carga vendedores, zonas y asigna clientes desde el Excel de cartera.</p>
        </Link>
      </div>
    </main>
  );
}
