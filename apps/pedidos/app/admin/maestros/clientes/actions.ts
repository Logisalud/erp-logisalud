"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
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
