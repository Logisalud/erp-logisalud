"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { updateCompanySettings } from "@/services/company-settings";

export async function guardarDatosEmpresa(formData: FormData) {
  const userId = await requireUserId();

  const razonSocial = String(formData.get("razonSocial") ?? "").trim();
  const ruc = String(formData.get("ruc") ?? "").trim();
  const direccion = String(formData.get("direccion") ?? "").trim();

  if (!razonSocial) throw new Error("La razón social es requerida.");
  if (!ruc) throw new Error("El RUC es requerido.");
  if (!/^\d{11}$/.test(ruc)) throw new Error("El RUC debe tener 11 dígitos.");
  if (!direccion) throw new Error("La dirección es requerida.");

  const ubigeoCodigo = String(formData.get("ubigeoCodigo") ?? "").trim();
  if (ubigeoCodigo !== "" && !/^\d{6}$/.test(ubigeoCodigo)) {
    throw new Error("El ubigeo debe tener 6 dígitos.");
  }

  await updateCompanySettings(
    {
      razonSocial,
      ruc,
      direccion,
      ubigeoCodigo: ubigeoCodigo || null,
      telefono: String(formData.get("telefono") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
    },
    userId,
  );

  revalidatePath("/admin/configuracion/empresa");
}
