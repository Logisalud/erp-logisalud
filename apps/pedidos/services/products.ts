import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";

export type ProductWithTaxProfile = {
  id: string;
  codigo_interno: string;
  codigo_proveedor: string | null;
  codigo_bonificacion: string | null;
  descripcion: string;
  presentacion: string | null;
  principio_activo: string | null;
  marca: string | null;
  unidad_medida: string;
  estado: string;
  /** Por qué está en ese estado. Se muestra solo en el catálogo administrativo. */
  nota_estado: string | null;
  controla_lote: boolean;
  controla_vencimiento: boolean;
  supplier: { nombre: string } | null;
  product_tax_profiles: Array<{
    afectacion_tributaria: string;
    tasa_aplicable: number;
    vigente_desde: string;
    vigente_hasta: string | null;
    vvf_sin_igv?: number | null;
    vvd_sin_igv?: number | null;
    costo_referencial_distribuidora?: number | null;
    fecha_vigencia_proveedor?: string | null;
  }>;
  hasCurrentPrice: boolean;
};

export async function listProducts(): Promise<ProductWithTaxProfile[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "*, supplier:suppliers(nombre), product_tax_profiles(afectacion_tributaria, tasa_aplicable, vigente_desde, vigente_hasta), price_list_items(vigente_hasta)",
    )
    .order("descripcion");

  if (error) throw new Error(error.message);

  return (data as unknown as Array<ProductWithTaxProfile & { price_list_items: Array<{ vigente_hasta: string | null }> }>).map(
    ({ price_list_items, ...product }) => ({
      ...product,
      hasCurrentPrice: price_list_items.some((item) => item.vigente_hasta === null),
    }),
  );
}

export async function listActiveSuppliers() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, nombre")
    .eq("estado", "activo")
    .order("nombre");
  if (error) throw new Error(error.message);
  return data;
}

export type NewProductInput = {
  codigoInterno: string;
  codigoProveedor?: string;
  descripcion: string;
  presentacion?: string;
  supplierId?: number;
  marca?: string;
  unidadMedida: string;
  controlaLote: boolean;
  controlaVencimiento: boolean;
  afectacionTributaria: "GRAVADO" | "INAFECTO";
  tasaAplicable: number;
};

export async function createProductWithTaxProfile(input: NewProductInput, actor: string) {
  const supabase = createClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      codigo_interno: input.codigoInterno,
      codigo_proveedor: input.codigoProveedor || null,
      descripcion: input.descripcion,
      presentacion: input.presentacion || null,
      supplier_id: input.supplierId ?? null,
      marca: input.marca || null,
      unidad_medida: input.unidadMedida,
      controla_lote: input.controlaLote,
      controla_vencimiento: input.controlaVencimiento,
    })
    .select()
    .single();

  if (productError) throw new Error(productError.message);

  const { error: taxError } = await supabase.from("product_tax_profiles").insert({
    product_id: product.id,
    afectacion_tributaria: input.afectacionTributaria,
    tasa_aplicable: input.tasaAplicable,
  });

  if (taxError) throw new Error(taxError.message);

  // El perfil tributario se audita vía trigger (product_tax_profiles_audit);
  // el producto en sí se audita explícitamente acá.
  await logAudit({
    actor,
    accion: "crear",
    entidad: "products",
    entidadId: product.id,
    datosDespues: product,
  });

  return product;
}

export async function toggleProductEstado(
  id: string,
  estado: "activo" | "inactivo",
  actor: string,
) {
  const supabase = createClient();

  const { data: before } = await supabase.from("products").select("*").eq("id", id).single();

  const { data, error } = await supabase
    .from("products")
    .update({ estado })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "cambiar_estado",
    entidad: "products",
    entidadId: id,
    datosAntes: before,
    datosDespues: data,
  });

  return data;
}

export type PriceHistoryItem = {
  id: number;
  precio: number;
  vigente_desde: string;
  vigente_hasta: string | null;
  price_list_id: string | null;
  sales_channel: { id: number; nombre: string };
};

export type ProductDetail = ProductWithTaxProfile & {
  priceHistory: PriceHistoryItem[];
};

export async function getProductDetail(id: string): Promise<ProductDetail | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `*, supplier:suppliers(nombre),
      product_tax_profiles(afectacion_tributaria, tasa_aplicable, vvf_sin_igv, vvd_sin_igv, costo_referencial_distribuidora, fecha_vigencia_proveedor, vigente_desde, vigente_hasta),
      price_list_items(id, precio, vigente_desde, vigente_hasta, price_list_id, sales_channel:sales_channels(id, nombre))`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const { price_list_items, ...product } = data as unknown as ProductWithTaxProfile & {
    price_list_items: PriceHistoryItem[];
  };

  return {
    ...product,
    hasCurrentPrice: price_list_items.some((item) => item.vigente_hasta === null),
    priceHistory: price_list_items.sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde)),
  };
}

export type ProductDetailUpdate = {
  descripcion: string;
  presentacion: string | null;
  controlaLote: boolean;
  controlaVencimiento: boolean;
};

export async function updateProductDetail(
  id: string,
  update: ProductDetailUpdate,
  actor: string,
) {
  const supabase = createClient();

  const { data: before } = await supabase.from("products").select("*").eq("id", id).single();

  const { data, error } = await supabase
    .from("products")
    .update({
      descripcion: update.descripcion,
      presentacion: update.presentacion,
      controla_lote: update.controlaLote,
      controla_vencimiento: update.controlaVencimiento,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "editar",
    entidad: "products",
    entidadId: id,
    datosAntes: before,
    datosDespues: data,
  });

  return data;
}

/**
 * Corrección puntual de precio: inserta una price_list_items nueva
 * (price_list_id null — no viene de una reimportación) para un
 * producto+canal específico. El trigger de versionado cierra
 * automáticamente la fila vigente anterior para ese mismo canal —
 * nunca sobrescribe, igual que hace el importador. Pensado para
 * corregir un error puntual, no para el flujo normal de actualización
 * de precios (que es reimportar el Excel del proveedor).
 */
export async function correctChannelPrice(
  productId: string,
  salesChannelId: number,
  precio: number,
  actor: string,
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("price_list_items")
    .insert({
      product_id: productId,
      sales_channel_id: salesChannelId,
      precio,
      price_list_id: null,
    })
    .select("*, sales_channel:sales_channels(nombre)")
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "corregir_precio_canal",
    entidad: "price_list_items",
    entidadId: String(data.id),
    datosDespues: data,
  });

  return data;
}
