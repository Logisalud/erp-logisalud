"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireUserId } from "@/lib/auth/session";
import {
  MENSAJE_UBIGEO_NO_RESUELTO,
  MENSAJE_UBIGEO_REQUERIDO,
} from "@/domain/customers";
import {
  addCustomerAddress,
  searchCustomersAnyState,
  updateCustomerAddress,
  updateCustomerBasics,
} from "@/services/customers";
import { listDistritos, listProvincias, resolverUbigeo } from "@/services/ubigeos";
import { logAudit } from "@/services/audit-log";
import {
  previewCustomerImport,
  publishCustomerImport,
  type CustomerImportInput,
  type CustomerImportPreview,
  type CustomerImportResult,
} from "@/services/customers-import";

async function readCsv(formData: FormData, field: string, required: boolean): Promise<string | null> {
  const file = formData.get(field);
  if (!(file instanceof File) || file.size === 0) {
    if (required) throw new Error(`Falta el archivo: ${field}.`);
    return null;
  }
  return file.text();
}

async function extractInput(formData: FormData): Promise<CustomerImportInput> {
  const [clientesCsv, vendedoresCsv, snapshotCsv] = await Promise.all([
    readCsv(formData, "clientes", true),
    readCsv(formData, "vendedores", true),
    readCsv(formData, "snapshot", false),
  ]);

  return {
    clientesCsv: clientesCsv as string,
    vendedoresCsv: vendedoresCsv as string,
    snapshotCsv,
  };
}

export async function previewImport(formData: FormData): Promise<CustomerImportPreview> {
  await requireUserId();
  return previewCustomerImport(await extractInput(formData));
}

export async function publishImport(formData: FormData): Promise<CustomerImportResult> {
  const userId = await requireUserId();
  const result = await publishCustomerImport(await extractInput(formData), userId);

  revalidatePath("/admin/maestros/clientes");
  revalidatePath("/control-pedidos/validacion-clientes");
  return result;
}

// ---------------------------------------------------------------------
// Ficha del cliente
// ---------------------------------------------------------------------

export async function buscarClientesCartera(query: string) {
  await requireUserId();
  return searchCustomersAnyState(query);
}

export async function buscarProvincias(departamento: string) {
  await requireUserId();
  return listProvincias(departamento);
}

export async function buscarDistritos(departamento: string, provincia: string) {
  await requireUserId();
  return listDistritos(departamento, provincia);
}

async function exigirAdministrador(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");
  if (!user.roles.includes("administrador")) {
    throw new Error("Solo un administrador puede editar los datos de un cliente.");
  }
  return user.userId;
}

export async function guardarDatosDelCliente(
  ruc: string,
  customerId: string,
  formData: FormData,
) {
  const userId = await exigirAdministrador();

  const razonSocial = String(formData.get("razonSocial") ?? "").trim();
  if (!razonSocial) throw new Error("La razón social es requerida.");

  const numeroONull = (campo: string) => {
    const valor = String(formData.get(campo) ?? "").trim();
    return valor === "" ? null : Number(valor);
  };

  const { antes, despues } = await updateCustomerBasics({
    customerId,
    razonSocial,
    nombreComercial: String(formData.get("nombreComercial") ?? "").trim() || null,
    tipoComprobantePermitido: String(formData.get("tipoComprobante") ?? "").trim(),
    canalId: numeroONull("canalId"),
    zonaId: numeroONull("zonaId"),
    condicionPagoHabitualId: numeroONull("condicionPagoHabitualId"),
    estado: String(formData.get("estado") ?? "").trim(),
  });

  await logAudit({
    actor: userId,
    accion: "editar_cliente",
    entidad: "customers",
    entidadId: customerId,
    datosAntes: antes,
    datosDespues: despues,
  });

  revalidatePath(`/admin/maestros/clientes/${ruc}`);
}

/**
 * Guarda una dirección —nueva o corregida— con su ubigeo resuelto.
 *
 * El ubigeo no es opcional: es el punto de llegada de la guía de remisión.
 * Esta pantalla existe justamente para cerrar las 13 direcciones que la
 * carga masiva dejó sin resolver, así que dejar guardar una sin ubigeo
 * sería volver a abrir el agujero.
 */
export async function guardarDireccion(
  ruc: string,
  customerId: string,
  addressId: string | null,
  formData: FormData,
) {
  const userId = await exigirAdministrador();

  const direccion = String(formData.get("direccion") ?? "").trim();
  const referencia = String(formData.get("referencia") ?? "").trim() || null;
  const departamento = String(formData.get("departamento") ?? "").trim();
  const provincia = String(formData.get("provincia") ?? "").trim();
  const distrito = String(formData.get("distrito") ?? "").trim();

  if (!direccion) throw new Error("La dirección es requerida.");
  if (!departamento || !provincia || !distrito) throw new Error(MENSAJE_UBIGEO_REQUERIDO);

  const ubigeo = await resolverUbigeo(departamento, provincia, distrito);
  if (!ubigeo) throw new Error(MENSAJE_UBIGEO_NO_RESUELTO);

  if (addressId) {
    const { antes } = await updateCustomerAddress({ addressId, direccion, referencia, ubigeo });
    await logAudit({
      actor: userId,
      accion: "editar_direccion_cliente",
      entidad: "customer_addresses",
      entidadId: addressId,
      datosAntes: antes,
      datosDespues: { direccion, referencia, ubigeo, departamento, provincia, distrito },
    });
  } else {
    const creada = await addCustomerAddress({
      customerId,
      direccion,
      ubigeo,
      referencia,
      solicitadoPor: userId,
    });
    await logAudit({
      actor: userId,
      accion: "agregar_direccion_cliente",
      entidad: "customer_addresses",
      entidadId: creada.id,
      datosDespues: {
        customer_id: customerId,
        direccion,
        referencia,
        ubigeo,
        departamento,
        provincia,
        distrito,
        es_principal: creada.es_principal,
      },
    });
  }

  revalidatePath(`/admin/maestros/clientes/${ruc}`);
}
