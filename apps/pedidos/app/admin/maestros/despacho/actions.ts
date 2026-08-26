"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { createCatalogItem, toggleCatalogItemEstado, type CatalogTable } from "@/services/catalog";
import { createInventorySource, toggleInventorySourceEstado } from "@/services/inventory";

const RUTA = "/admin/maestros/despacho";

async function crearEn(table: CatalogTable, formData: FormData) {
  const userId = await requireUserId();
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) throw new Error("Nombre requerido");
  await createCatalogItem(table, { nombre }, userId);
  revalidatePath(RUTA);
}

export async function crearAlmacen(formData: FormData) {
  await crearEn("warehouses", formData);
}
export async function cambiarEstadoAlmacen(id: number, estado: "activo" | "inactivo") {
  const userId = await requireUserId();
  await toggleCatalogItemEstado("warehouses", id, estado, userId);
  revalidatePath(RUTA);
}

export async function crearVehiculo(formData: FormData) {
  await crearEn("vehicles", formData);
}
export async function cambiarEstadoVehiculo(id: number, estado: "activo" | "inactivo") {
  const userId = await requireUserId();
  await toggleCatalogItemEstado("vehicles", id, estado, userId);
  revalidatePath(RUTA);
}

export async function crearChofer(formData: FormData) {
  await crearEn("drivers", formData);
}
export async function cambiarEstadoChofer(id: number, estado: "activo" | "inactivo") {
  const userId = await requireUserId();
  await toggleCatalogItemEstado("drivers", id, estado, userId);
  revalidatePath(RUTA);
}

export async function crearTransportista(formData: FormData) {
  await crearEn("transporters", formData);
}
export async function cambiarEstadoTransportista(id: number, estado: "activo" | "inactivo") {
  const userId = await requireUserId();
  await toggleCatalogItemEstado("transporters", id, estado, userId);
  revalidatePath(RUTA);
}

export async function crearFuenteStock(formData: FormData) {
  const userId = await requireUserId();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  if (!nombre) throw new Error("Nombre requerido");
  if (tipo !== "central" && tipo !== "regional") throw new Error("Elige el tipo de fuente.");
  await createInventorySource({ nombre, tipo }, userId);
  revalidatePath(RUTA);
}

export async function cambiarEstadoFuenteStock(id: number, estado: "activo" | "inactivo") {
  const userId = await requireUserId();
  await toggleInventorySourceEstado(id, estado, userId);
  revalidatePath(RUTA);
}
