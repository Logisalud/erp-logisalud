"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, requireUserId } from "@/lib/auth/session";
import { resolveOrderSellerId } from "@/domain/orders";
import {
  MENSAJE_SIN_DIRECCION,
  MENSAJE_UBIGEO_NO_RESUELTO,
  MENSAJE_UBIGEO_REQUERIDO,
} from "@/domain/customers";
import { createDraftOrder } from "@/services/orders";
import { listPaymentTerms } from "@/services/catalog";
import { validarCondicionDePago } from "@/domain/payment-terms";
import { listDistritos, listProvincias, resolverUbigeo } from "@/services/ubigeos";
import {
  ClienteDuplicadoError,
  type ActiveCustomerOption,
  MENSAJE_SIN_ZONA_ASIGNADA,
  MENSAJE_ZONA_AJENA,
  addCustomerAddress,
  listCustomerAddresses,
  listZonasSeleccionables,
  requestNewCustomer,
  searchActiveCustomers,
} from "@/services/customers";

export async function getAddressesForCustomer(customerId: string) {
  return listCustomerAddresses(customerId);
}

/**
 * Búsqueda de clientes para el selector del pedido. Va al servidor a
 * propósito: son 3.4k clientes y no se pueden precargar en el navegador
 * (PostgREST tope en 1.000 filas). `requireUserId` asegura que haya
 * sesión; el filtrado por zona lo hace la RLS, no esta capa.
 */
export async function buscarClientes(query: string) {
  await requireUserId();
  return searchActiveCustomers(query);
}

/**
 * Las dos acciones del selector de ubigeo en cascada. Van al servidor a
 * propósito: el catálogo son 1.884 distritos y el vendedor sólo necesita
 * las provincias del departamento que eligió.
 */
export async function buscarProvincias(departamento: string) {
  await requireUserId();
  return listProvincias(departamento);
}

export async function buscarDistritos(departamento: string, provincia: string) {
  await requireUserId();
  return listDistritos(departamento, provincia);
}

/**
 * Alta de dirección desde el propio flujo de pedido, para desbloquear a
 * un cliente de la cartera migrada que entró sin dirección de entrega.
 */
export async function agregarDireccionCliente(input: {
  customerId: string;
  direccion: string;
  referencia?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
}): Promise<ResultadoAccion<{ direccion: Awaited<ReturnType<typeof addCustomerAddress>> }>> {
  try {
    return { ok: true, direccion: await altaDeDireccion(input) };
  } catch (err) {
    return comoFallo(err, "No se pudo guardar la dirección.");
  }
}

async function altaDeDireccion(input: {
  customerId: string;
  direccion: string;
  referencia?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
}) {
  const userId = await requireUserId();

  const direccion = input.direccion.trim();
  if (!input.customerId) throw new Error("Falta el cliente.");
  if (!direccion) throw new Error("La dirección es requerida.");
  if (!input.departamento?.trim() || !input.provincia?.trim() || !input.distrito?.trim()) {
    throw new Error(MENSAJE_UBIGEO_REQUERIDO);
  }

  // El código lo resuelve el servidor con el catálogo oficial; la pantalla
  // sólo manda los nombres que el vendedor eligió de las listas.
  const ubigeo = await resolverUbigeo(input.departamento, input.provincia, input.distrito);
  if (!ubigeo) throw new Error(MENSAJE_UBIGEO_NO_RESUELTO);

  return addCustomerAddress({
    customerId: input.customerId,
    direccion,
    ubigeo,
    referencia: input.referencia?.trim() || null,
    solicitadoPor: userId,
  });
}

/**
 * Por qué estas acciones DEVUELVEN el error en vez de lanzarlo.
 *
 * Next reemplaza el mensaje de cualquier excepción de una Server Action por
 * "An error occurred in the Server Components render…" en producción, para
 * no filtrar detalles del servidor. Eso es correcto para un error inesperado
 * y pésimo para uno previsto: el 2026-09-11 una vendedora chocó 11 veces
 * contra "ese RUC ya está en la cartera" y en pantalla leyó siempre el aviso
 * genérico, sin manera de saber que el cliente ya existía. Un mensaje que
 * está escrito para que lo lea el usuario tiene que viajar como valor de
 * retorno, no como excepción.
 */
export type ResultadoAccion<T> =
  | ({ ok: true } & T)
  | { ok: false; mensaje: string; clienteExistente?: ClienteExistente };

export type ClienteExistente = {
  id: string;
  razonSocial: string;
  nombreComercial: string | null;
  rucODocumento: string;
  estado: string;
};

function comoFallo(err: unknown, porDefecto: string): { ok: false; mensaje: string; clienteExistente?: ClienteExistente } {
  if (err instanceof ClienteDuplicadoError) {
    const c = err.existente;
    return {
      ok: false,
      mensaje: err.message,
      clienteExistente: c
        ? {
            id: c.id,
            razonSocial: c.razon_social,
            nombreComercial: c.nombre_comercial,
            rucODocumento: c.ruc_o_documento,
            estado: c.estado,
          }
        : undefined,
    };
  }
  return { ok: false, mensaje: err instanceof Error ? err.message : porDefecto };
}

export async function crearClienteNuevo(input: {
  razonSocial: string;
  rucODocumento: string;
  canalId: number;
  zonaId: number;
  condicionPagoHabitualId: number;
  direccion: string;
  departamento: string;
  provincia: string;
  distrito: string;
  /** Los dos opcionales: no frenan el alta de un cliente desde la calle. */
  celular?: string;
  direccionFiscal?: string;
}): Promise<ResultadoAccion<{ customer: ActiveCustomerOption; addressId: string }>> {
  try {
    return { ok: true, ...(await altaDeCliente(input)) };
  } catch (err) {
    return comoFallo(err, "No se pudo registrar el cliente.");
  }
}

async function altaDeCliente(input: {
  razonSocial: string;
  rucODocumento: string;
  canalId: number;
  zonaId: number;
  condicionPagoHabitualId: number;
  direccion: string;
  departamento: string;
  provincia: string;
  distrito: string;
  celular?: string;
  direccionFiscal?: string;
}): Promise<{ customer: ActiveCustomerOption; addressId: string }> {
  const userId = await requireUserId();

  const razonSocial = input.razonSocial.trim();
  const rucODocumento = input.rucODocumento.trim();
  const direccion = input.direccion.trim();

  if (!razonSocial) throw new Error("La razón social es requerida.");
  if (!rucODocumento) throw new Error("El RUC/documento es requerido.");
  if (!input.canalId) throw new Error("Selecciona un canal.");
  if (!input.zonaId) throw new Error("Selecciona una zona.");
  if (!input.condicionPagoHabitualId) throw new Error("Selecciona una condición de pago habitual.");
  if (!direccion) throw new Error("La dirección es requerida.");
  if (!input.departamento.trim() || !input.provincia.trim() || !input.distrito.trim()) {
    throw new Error(MENSAJE_UBIGEO_REQUERIDO);
  }

  const ubigeo = await resolverUbigeo(input.departamento, input.provincia, input.distrito);
  if (!ubigeo) throw new Error(MENSAJE_UBIGEO_NO_RESUELTO);

  // La zona se revalida contra las que el usuario puede usar: la pantalla
  // ya las filtra, pero si llega otra (petición armada a mano, o pestaña
  // vieja) la base la rechaza por RLS y eso se veía como un error de
  // servidor en pantalla.
  const user = await getCurrentUser();
  const esAdmin = user?.roles.includes("administrador") ?? false;
  const zonas = await listZonasSeleccionables(esAdmin);
  if (!zonas.some((z) => z.id === input.zonaId)) {
    throw new Error(zonas.length === 0 ? MENSAJE_SIN_ZONA_ASIGNADA : MENSAJE_ZONA_AJENA);
  }

  const { customer, addressId } = await requestNewCustomer({
    rucODocumento,
    razonSocial,
    celular: input.celular?.trim() || null,
    direccionFiscal: input.direccionFiscal?.trim() || null,
    canalId: input.canalId,
    zonaId: input.zonaId,
    condicionPagoHabitualId: input.condicionPagoHabitualId,
    direccion,
    ubigeo,
    departamento: input.departamento.trim(),
    provincia: input.provincia.trim(),
    distrito: input.distrito.trim(),
    solicitadoPor: userId,
  });

  return { customer, addressId };
}

export async function crearBorrador(
  formData: FormData,
): Promise<{ ok: false; mensaje: string } | never> {
  let destino: string;
  try {
    destino = await armarBorrador(formData);
  } catch (err) {
    return comoFallo(err, "No se pudo crear el pedido.");
  }
  // Fuera del try: `redirect()` corta lanzando, y atraparlo lo convertiría
  // en un mensaje de error con el pedido ya creado.
  redirect(`/pedidos/${destino}`);
}

/** Arma el borrador y devuelve su id. Lanza con mensajes ya legibles. */
async function armarBorrador(formData: FormData): Promise<string> {
  const user = await getCurrentUser();
  const userId = await requireUserId();
  if (!user) throw new Error("No autenticado.");

  const isAdmin = user.roles.includes("administrador");
  const rol = isAdmin ? "administrador" : "vendedor";
  const selectedSellerId = String(formData.get("sellerId") ?? "") || null;

  const sellerId = resolveOrderSellerId({
    rol,
    callerSellerId: user.sellerId,
    selectedSellerId,
  });

  const customerId = String(formData.get("customerId") ?? "");
  const customerAddressId = String(formData.get("customerAddressId") ?? "");
  const paymentTermsId = Number(formData.get("paymentTermsId"));

  if (!customerId) throw new Error("Selecciona un cliente.");
  if (!customerAddressId) {
    // Se distingue "no eligió" de "no hay ninguna": la cartera migrada
    // entró sin direcciones, y el segundo caso necesita un mensaje que
    // diga qué hacer, no solo que falta un campo.
    const direcciones = await listCustomerAddresses(customerId);
    throw new Error(direcciones.length === 0 ? MENSAJE_SIN_DIRECCION : "Selecciona una dirección.");
  }
  // La condición y los días se validan de nuevo acá contra el catálogo
  // real: la pantalla puede mentir, y un pedido con "Contado" más 15 días
  // colgados (o la opción de días libres sin número) no debería existir.
  const condicion = validarCondicionDePago(await listPaymentTerms(), {
    paymentTermsId: paymentTermsId || "",
    diasCredito: String(formData.get("diasCredito") ?? ""),
  });
  if (!condicion.ok) throw new Error(condicion.mensaje);

  const draft = await createDraftOrder({
    sellerId,
    creadoPor: userId,
    customerId,
    customerAddressId,
    paymentTermsId: condicion.paymentTermsId,
    diasCreditoSolicitados: condicion.diasCreditoSolicitados,
  });

  return draft.id;
}
