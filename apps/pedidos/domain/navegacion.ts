/**
 * Las secciones del sistema y qué rol puede entrar a cada una.
 *
 * Esto vivía como una constante privada dentro de app/page.tsx, así que la
 * portada era el ÚNICO lugar que sabía qué podía ver cada rol. Los headers de
 * cada layout tenían su propia lista escrita a mano — el de /admin, cinco
 * enlaces fijos iguales para todos; el de /control-pedidos, ninguno — y
 * ninguna de esas listas incluía "Aprobaciones comerciales". Resultado real
 * en producción: un administrador entraba a Maestros y se quedaba sin forma
 * de llegar a las aprobaciones ni de volver al inicio.
 *
 * Con una sola lista, agregar una sección la hace aparecer a la vez en la
 * portada y en el header de todas las pantallas, para los roles que
 * corresponda. Es dominio puro: sin Next.js, sin Supabase, testeable sin
 * levantar nada.
 */

export type Seccion = {
  href: string;
  title: string;
  /** Se muestra en las tarjetas de la portada; el header sólo usa `title`. */
  description: string;
  roles: string[];
};

export const SECCIONES: Seccion[] = [
  {
    href: "/pedidos",
    title: "Pedidos",
    description: "Tomar un pedido nuevo o revisar tus borradores.",
    roles: ["administrador", "vendedor"],
  },
  {
    href: "/admin",
    title: "Maestros",
    description: "Productos, proveedores, canales, zonas y condiciones de pago.",
    roles: ["administrador"],
  },
  {
    href: "/admin/maestros/productos",
    title: "Productos",
    description: "Catálogo de productos, precios por canal y perfil tributario.",
    roles: ["administrador"],
  },
  {
    href: "/admin/maestros/listas-precios",
    title: "Listas de precios",
    description: "Importar y publicar listas de precios por proveedor.",
    roles: ["administrador"],
  },
  {
    // Todos los roles: el vendedor necesita saber cuánto hay antes de
    // ofrecerle un producto a un cliente, y hasta ahora el stock vivía
    // dentro de Maestros, que sólo ve el administrador. Es de sólo
    // lectura; cargarlo sigue siendo del administrador.
    href: "/stock",
    title: "Stock",
    description: "Consultar por producto y lote cuánto hay en almacén y cuándo vence.",
    roles: [
      "administrador",
      "vendedor",
      "operaciones",
      "control_pedidos",
      "aprobador_comercial",
    ],
  },
  {
    // Del vendedor, y del administrador que también registra clientes: la
    // pantalla muestra sólo lo que uno mismo cargó. Sin esto, registrar un
    // cliente era mandarlo a un buzón sin respuesta.
    href: "/mis-clientes",
    title: "Mis clientes",
    description: "Los clientes que registraste y si ya fueron aprobados.",
    roles: ["administrador", "vendedor"],
  },
  {
    // Del vendedor: su avance del mes y su detalle de venta. La RLS le
    // devuelve su fila y los totales de grupo y compañía, nunca el número
    // de un compañero. Operaciones y control de pedidos no tienen cuota,
    // así que para ellos la pantalla no diría nada.
    href: "/avance",
    title: "Mi avance",
    description: "Cuánto llevo vendido del mes contra mi cuota, y el detalle de lo facturado.",
    roles: ["administrador", "vendedor"],
  },
  {
    href: "/admin/avance",
    title: "Cargar avance de ventas",
    description: "Subir el Excel del día para que cada vendedor vea su avance.",
    roles: ["administrador"],
  },
  {
    href: "/operaciones",
    title: "Despachos",
    description: "Preparar y despachar los pedidos listos para operaciones.",
    roles: ["administrador", "operaciones"],
  },
  {
    href: "/aprobador-comercial",
    title: "Aprobaciones comerciales",
    description:
      "Descuentos y pedidos frenados por deuda del cliente, que no avanzan hasta resolverse.",
    roles: ["administrador", "aprobador_comercial"],
  },
  {
    href: "/admin/credito",
    title: "Crédito del cliente",
    description: "La deuda que llega de cobranzas y la regla que frena un pedido a crédito.",
    roles: ["administrador"],
  },
  {
    href: "/control-pedidos/documentos",
    title: "Documentación electrónica",
    description: "Borradores de factura/boleta y guía de remisión para revisar.",
    roles: ["administrador", "control_pedidos"],
  },
  {
    href: "/control-pedidos/validacion-clientes",
    title: "Validación de clientes",
    description: "Aprobar o rechazar clientes nuevos solicitados por vendedores.",
    roles: ["administrador", "control_pedidos"],
  },
];

/**
 * Las secciones que puede ver alguien con estos roles, en el orden de
 * SECCIONES (estable: el header no cambia de orden entre pantallas).
 */
export function seccionesParaRoles(roles: string[]): Seccion[] {
  return SECCIONES.filter((s) => s.roles.some((r) => roles.includes(r)));
}
