import Link from "next/link";

const SECTIONS = [
  {
    href: "/admin/maestros/productos",
    title: "Productos",
    description: "Catálogo de productos y su perfil tributario.",
  },
  {
    href: "/admin/maestros/listas-precios",
    title: "Listas de precios",
    description: "Importar y publicar listas de precios por proveedor.",
  },
  {
    href: "/admin/maestros/clientes",
    title: "Clientes",
    description: "Cartera de clientes y carga masiva desde CSV.",
  },
  {
    href: "/admin/maestros/proveedores",
    title: "Proveedores",
    description: "Diphasac, Biosana, Prades y demás.",
  },
  {
    href: "/admin/maestros/canales",
    title: "Canales de venta",
    description: "Mayorista, Horizontal, Minicadenas, Tops, Clínicas, Subdistribuidores.",
  },
  {
    href: "/admin/maestros/zonas",
    title: "Zonas",
    description: "Catálogo de zonas de venta.",
  },
  {
    href: "/admin/maestros/condiciones-pago",
    title: "Condiciones de pago",
    description: "Catálogo de condiciones de pago.",
  },
  {
    href: "/control-pedidos/validacion-clientes",
    title: "Validación de clientes",
    description: "Aprobar o rechazar clientes nuevos solicitados por vendedores.",
  },
  {
    href: "/admin/maestros/stock",
    title: "Cargar stock",
    description: "Carga masiva del stock disponible por producto y fuente, desde CSV o Excel.",
  },
  {
    href: "/admin/maestros/promociones",
    title: "Promociones",
    description:
      "Escalas y bonificaciones por producto y canal, desde el archivo de Diphasac. Se aplican solas al pedido.",
  },
  {
    href: "/admin/maestros/despacho",
    title: "Despacho",
    description: "Fuentes de stock, almacenes, vehículos, choferes y transportistas.",
  },
  {
    href: "/operaciones",
    title: "Despachos por preparar",
    description: "Bandeja de Operaciones: preparar y despachar pedidos listos.",
  },
  {
    href: "/aprobador-comercial",
    title: "Aprobaciones comerciales",
    description: "Solicitudes de descuento pendientes: el pedido no avanza hasta resolverlas.",
  },
  {
    href: "/control-pedidos/documentos",
    title: "Documentación electrónica",
    description: "Borradores de factura/boleta y guía de remisión generados al despachar.",
  },
  {
    href: "/admin/configuracion/empresa",
    title: "Datos de la empresa",
    description: "Razón social, RUC y domicilio fiscal del emisor de comprobantes y guías.",
  },
  {
    href: "/admin/configuracion/notificaciones",
    title: "Notificaciones de pedidos",
    description: "A qué correos se avisa cuando un vendedor envía un pedido.",
  },
];

export default function AdminHomePage() {
  return (
    <div>
      <h2 className="text-xl font-semibold">Maestros — Administración</h2>
      <p className="mt-1 text-sm text-gray-600">Elige una sección para gestionar.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="card p-5 hover:shadow-md">
            <h3 className="font-semibold text-logisalud-green">{s.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
