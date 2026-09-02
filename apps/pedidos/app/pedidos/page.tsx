import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { listOrdersForSeller, PAGE_SIZE } from "@/services/orders";
import {
  PESTANAS,
  estadoEstilo,
  estadoLabelCorto,
  estadosDePestana,
  parsePestana,
  type PestanaPedidos,
} from "@/domain/order-status";
import { displayRazonSocial } from "@/domain/customer-search";

/**
 * "Mis pedidos".
 *
 * Antes esta pantalla listaba SOLO borradores, así que un pedido enviado
 * desaparecía de la vista del vendedor para siempre: no había forma de
 * volver a abrirlo, ni de bajar su Excel, salvo escribiendo la URL a mano.
 *
 * La pestaña y la página viajan en el querystring, no en estado de React:
 * la pantalla sigue siendo un Server Component (los pedidos no se filtran en
 * el navegador, se filtran en la consulta), cada pestaña tiene su propia URL
 * compartible, y el botón "atrás" del celular hace lo que se espera.
 */

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima" });
}

function hrefDe(pestana: PestanaPedidos, page: number): string {
  const params = new URLSearchParams({ estado: pestana });
  if (page > 1) params.set("page", String(page));
  return `/pedidos?${params.toString()}`;
}

const VACIO: Record<PestanaPedidos, string> = {
  borradores: "No tienes pedidos en borrador.",
  enviados: "Todavía no has enviado ningún pedido.",
  todos: "Todavía no tienes pedidos.",
};

export default async function PedidosHomePage({
  searchParams,
}: {
  searchParams: { estado?: string; page?: string };
}) {
  const user = await getCurrentUser();
  const isAdmin = user?.roles.includes("administrador") ?? false;

  const pestana = parsePestana(searchParams.estado);
  // Una página fuera de rango (escrita a mano, o al volver atrás después de
  // que los pedidos cambiaron) cae a la primera en vez de mostrar el vacío.
  const pageParsed = Number.parseInt(searchParams.page ?? "1", 10);
  const page = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : 1;

  const { orders, hayMas } = user?.sellerId
    ? await listOrdersForSeller(user.sellerId, { estados: estadosDePestana(pestana), page })
    : { orders: [], hayMas: false };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Pedidos</h2>
        <p className="mt-1 text-sm text-gray-600">
          {isAdmin
            ? "Toma un pedido a nombre de un vendedor, o revisa tus propios pedidos si tienes uno vinculado."
            : "Tus pedidos, en cualquier estado, y el acceso para tomar uno nuevo."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Link href="/pedidos/nuevo" className="card p-5 hover:shadow-md">
          <h3 className="font-semibold text-logisalud-green">Nuevo pedido</h3>
          <p className="mt-1 text-sm text-gray-600">
            {isAdmin
              ? "Elige a nombre de qué vendedor se registra."
              : "Arma un pedido para uno de tus clientes."}
          </p>
        </Link>
      </div>

      {user?.sellerId && (
        <section aria-labelledby="mis-pedidos-titulo">
          <h3 id="mis-pedidos-titulo" className="text-lg font-semibold">
            Mis pedidos
          </h3>

          {/*
            Pestañas como links, no como botones con JS: sin JavaScript
            siguen funcionando, y `aria-current` le dice a un lector de
            pantalla cuál está activa —el color por sí solo no lo dice.
          */}
          <nav aria-label="Filtrar pedidos por estado" className="mt-3 flex gap-2 overflow-x-auto">
            {PESTANAS.map((p) => {
              const activa = p.id === pestana;
              return (
                <Link
                  key={p.id}
                  href={hrefDe(p.id, 1)}
                  aria-current={activa ? "page" : undefined}
                  className={`min-h-11 shrink-0 rounded-full border px-4 py-2.5 text-sm font-medium ${
                    activa
                      ? "border-logisalud-green bg-logisalud-green/10 text-[#276b3b]"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900"
                  }`}
                >
                  {p.label}
                </Link>
              );
            })}
          </nav>

          {orders.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">
              {page > 1 ? (
                <>
                  No hay más pedidos en esta página.{" "}
                  <Link href={hrefDe(pestana, 1)} className="text-logisalud-green hover:underline">
                    Volver al principio
                  </Link>
                  .
                </>
              ) : (
                VACIO[pestana]
              )}
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {orders.map((order) => (
                <li key={order.id}>
                  {/*
                    Va al detalle que ya existe, el mismo que tiene el botón
                    de Excel y el enlace a los borradores de comprobante y
                    guía. No hay una pantalla nueva de "pedido enviado".
                  */}
                  {/*
                    El nombre del cliente se lleva el ancho completo y el
                    badge baja a la segunda línea. Compartiendo la primera
                    línea, un estado largo ("Excepción comercial") dejaba al
                    cliente en cuatro letras y partía la fecha en dos
                    renglones, así que las filas ni siquiera medían igual.
                  */}
                  <Link href={`/pedidos/${order.id}`} className="card block p-4 hover:shadow-md">
                    <p className="truncate font-medium text-gray-900">
                      {displayRazonSocial(order.customer?.razon_social ?? "Cliente sin nombre")}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      {/*
                        "#1096" y no "Pedido #1096": el prefijo se lleva
                        siete caracteres que en un celular le hacen falta a
                        la fecha, y arriba ya dice que esto es un pedido.
                      */}
                      <p className="cifra truncate text-sm text-gray-500">
                        #{order.numero} · {fecha(order.fecha_creacion)}
                      </p>
                      <span
                        className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${estadoEstilo(
                          order.estado,
                        )}`}
                      >
                        {estadoLabelCorto(order.estado)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/*
            Anterior/Siguiente, no una barra numerada: no se sabe cuántas
            páginas hay —a propósito, para no pagar un `count` en cada carga—
            y en un celular dos targets grandes se aciertan mejor que diez
            chicos.
          */}
          {orders.length > 0 && (page > 1 || hayMas) && (
            <nav
              aria-label="Paginación de pedidos"
              className="mt-4 grid grid-cols-3 items-center gap-3"
            >
              {/*
                Grilla de tres, no `justify-between`: con una sola flecha
                presente, el "Página N" del medio se corría a un costado.
              */}
              <div className="justify-self-start">
                {page > 1 && (
                  <Link href={hrefDe(pestana, page - 1)} className="btn-secondary whitespace-nowrap text-sm">
                    ← Anteriores
                  </Link>
                )}
              </div>
              <span className="cifra justify-self-center text-sm text-gray-500">Página {page}</span>
              <div className="justify-self-end">
                {hayMas && (
                  <Link href={hrefDe(pestana, page + 1)} className="btn-secondary whitespace-nowrap text-sm">
                    Siguientes →
                  </Link>
                )}
              </div>
            </nav>
          )}

          {orders.length === PAGE_SIZE && hayMas && (
            <p className="mt-2 text-xs text-gray-500">
              Se muestran {PAGE_SIZE} pedidos por página, del más reciente al más antiguo.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
