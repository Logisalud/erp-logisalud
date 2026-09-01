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
    href: "/operaciones",
    title: "Despachos",
    description: "Preparar y despachar los pedidos listos para operaciones.",
    roles: ["administrador", "operaciones"],
  },
  {
    href: "/aprobador-comercial",
    title: "Aprobaciones comerciales",
    description: "Solicitudes de descuento que frenan el pedido hasta resolverse.",
    roles: ["administrador", "aprobador_comercial"],
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
