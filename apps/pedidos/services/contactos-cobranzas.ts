import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanEnv } from "@/lib/env";
import { logAudit } from "./audit-log";

/**
 * El viaje de vuelta del puente: el contacto del cliente, que lo tiene
 * pedidos, copiado a la cartera de cobranzas.
 *
 * Cobranzas sabe el nombre y el RUC de cada cliente porque le facturó;
 * quien conoce el celular y la dirección de la puerta es el vendedor, y
 * eso vive en pedidos (`customers.whatsapp`, `customer_addresses`). La
 * cartera que el vendedor abre desde su link de cobranzas necesita las dos
 * mitades, así que acá se juntan.
 *
 * Dos reglas que no se negocian:
 *
 * 1. SOLO SE LLENAN VACÍOS. Nunca se pisa un dato que ya está en
 *    cobranzas. Si el vendedor corrigió a mano una dirección allá, esa
 *    corrección gana — la de pedidos puede ser la vieja.
 * 2. NO SE CREAN CLIENTES. Un cliente que está en pedidos y no en
 *    cobranzas se cuenta y se informa, pero no se inserta: en cobranzas
 *    cada cliente cuelga de un vendedor (`vendedor_actual_id`) y los
 *    vendedores de pedidos son otras filas, de otro proyecto Supabase, sin
 *    código en común. Inventar esa correspondencia acá sería adivinar a
 *    quién le toca el cliente, y el dueño de una cartera no se adivina.
 *
 * Son dos proyectos Supabase distintos: a cobranzas se entra por REST con
 * las credenciales del puente, las mismas de `services/credito.ts`.
 */

/** Las dos variables que hacen falta para escribir en la cartera de cobranzas. */
function accesoACobranzas(): { url: string; key: string } | null {
  const url = cleanEnv(process.env.COBRANZAS_SUPABASE_URL ?? "");
  const key = cleanEnv(process.env.COBRANZAS_SERVICE_ROLE_KEY ?? "");
  return url && key ? { url, key } : null;
}

type ClienteCobranzas = {
  ruc: string;
  celular: string | null;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
};

type ContactoPedidos = {
  celular: string | null;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
};

export type ResultadoContactos = {
  /** Clientes de cobranzas que ahora tienen celular y antes no. */
  celulares: number;
  /** Clientes de cobranzas que ahora tienen dirección y antes no. */
  direcciones: number;
  /** Clientes a los que se les completó departamento/provincia/distrito. */
  ubicaciones: number;
  /** Clientes de pedidos que no existen en cobranzas (no se crean: ver arriba). */
  soloEnPedidos: number;
  cuando: string;
};

/** Vacío de verdad: null, cadena vacía o solo espacios. */
function vacio(v: string | null | undefined): boolean {
  return (v ?? "").trim() === "";
}

/**
 * Basura que en los archivos viejos ocupa el lugar de una dirección.
 *
 * Copiar "SIN DIRECCION" a cobranzas es peor que dejar la celda vacía: la
 * vacía le dice al vendedor que hay algo que llenar, y la otra le dice que
 * ya está hecho.
 */
const DIRECCION_BASURA = /^(\.|-|\*|#?n\/?d|s\/?n|sin\s*direcc?ion|no\s*tiene|ninguna?|0+)$/i;

function limpiarDireccion(v: string | null): string | null {
  const t = (v ?? "").trim();
  if (t === "" || DIRECCION_BASURA.test(t)) return null;
  return t;
}

/** Lee todas las páginas de una tabla de cobranzas por REST. */
async function leerCobranzas(
  acceso: { url: string; key: string },
  recurso: string,
): Promise<ClienteCobranzas[]> {
  const filas: ClienteCobranzas[] = [];
  const pagina = 1000;
  for (let offset = 0; ; offset += pagina) {
    const r = await fetch(`${acceso.url}/rest/v1/${recurso}&limit=${pagina}&offset=${offset}`, {
      headers: { apikey: acceso.key, Authorization: `Bearer ${acceso.key}` },
      cache: "no-store",
    });
    if (!r.ok) {
      throw new Error(`El ERP de cobranzas respondió ${r.status} al leer la cartera. No se escribió nada.`);
    }
    const lote = (await r.json()) as ClienteCobranzas[];
    if (!Array.isArray(lote)) {
      throw new Error("El ERP de cobranzas devolvió algo inesperado. No se escribió nada.");
    }
    filas.push(...lote);
    if (lote.length < pagina) break;
  }
  return filas;
}

/** El contacto de cada cliente de pedidos, indexado por RUC. */
async function contactosDePedidos(): Promise<Map<string, ContactoPedidos>> {
  const admin = createAdminClient();

  const { data: clientes, error } = await admin
    .from("customers")
    .select("id, ruc_o_documento, whatsapp, direccion_fiscal, distrito, provincia, departamento");
  if (error) throw new Error(error.message);

  const filas = (clientes ?? []) as Array<{
    id: string;
    ruc_o_documento: string | null;
    whatsapp: string | null;
    direccion_fiscal: string | null;
    distrito: string | null;
    provincia: string | null;
    departamento: string | null;
  }>;

  // La dirección de entrega manda sobre la fiscal: es a donde va el
  // camión, que es lo que el vendedor necesita para ir a visitar.
  const { data: direcciones, error: errorDir } = await admin
    .from("customer_addresses")
    .select("customer_id, direccion, es_principal, created_at")
    .order("es_principal", { ascending: false })
    .order("created_at", { ascending: true });
  if (errorDir) throw new Error(errorDir.message);

  const entrega = new Map<string, string>();
  for (const d of (direcciones ?? []) as Array<{ customer_id: string; direccion: string | null }>) {
    if (!entrega.has(d.customer_id) && !vacio(d.direccion)) {
      entrega.set(d.customer_id, (d.direccion ?? "").trim());
    }
  }

  const porRuc = new Map<string, ContactoPedidos>();
  for (const c of filas) {
    const ruc = (c.ruc_o_documento ?? "").trim();
    if (ruc === "") continue;
    porRuc.set(ruc, {
      celular: vacio(c.whatsapp) ? null : (c.whatsapp ?? "").trim(),
      direccion: limpiarDireccion(entrega.get(c.id) ?? c.direccion_fiscal),
      distrito: vacio(c.distrito) ? null : (c.distrito ?? "").trim(),
      provincia: vacio(c.provincia) ? null : (c.provincia ?? "").trim(),
      departamento: vacio(c.departamento) ? null : (c.departamento ?? "").trim(),
    });
  }
  return porRuc;
}

/**
 * Completa en cobranzas los contactos que faltan, con lo que sabe pedidos.
 *
 * Si la lectura de cobranzas falla no se escribe nada. Si falla la
 * escritura de un cliente, se sigue con los demás y recién al final se
 * levanta el error: a medio camino es mejor haber llenado 400 fichas que
 * ninguna, y la próxima corrida retoma lo que quedó.
 */
export async function sincronizarContactosACobranzas(actor: string): Promise<ResultadoContactos> {
  const acceso = accesoACobranzas();
  if (!acceso) {
    throw new Error(
      "Falta configurar el acceso al ERP de cobranzas (COBRANZAS_SUPABASE_URL y COBRANZAS_SERVICE_ROLE_KEY).",
    );
  }

  const [cartera, contactos] = await Promise.all([
    leerCobranzas(
      acceso,
      "clientes?select=ruc,celular,direccion,distrito,provincia,departamento&order=ruc",
    ),
    contactosDePedidos(),
  ]);

  const enCobranzas = new Set(cartera.map((c) => c.ruc));
  const pendientes: Array<{ ruc: string; parche: Record<string, string> }> = [];

  for (const c of cartera) {
    const p = contactos.get(c.ruc);
    if (!p) continue;

    const parche: Record<string, string> = {};
    if (vacio(c.celular) && p.celular) parche.celular = p.celular;
    if (vacio(c.direccion) && p.direccion) parche.direccion = p.direccion;
    if (vacio(c.distrito) && p.distrito) parche.distrito = p.distrito;
    if (vacio(c.provincia) && p.provincia) parche.provincia = p.provincia;
    if (vacio(c.departamento) && p.departamento) parche.departamento = p.departamento;

    if (Object.keys(parche).length > 0) pendientes.push({ ruc: c.ruc, parche });
  }

  let celulares = 0;
  let direcciones = 0;
  let ubicaciones = 0;
  let ultimoError: string | null = null;

  // De a ocho: cada cliente lleva su propio valor, así que no hay un UPDATE
  // masivo posible. Ocho a la vez alcanza para que la corrida dure segundos
  // sin acercarse a los límites del REST de cobranzas.
  const TANDA = 8;
  for (let i = 0; i < pendientes.length; i += TANDA) {
    await Promise.all(
      pendientes.slice(i, i + TANDA).map(async ({ ruc, parche }) => {
        const r = await fetch(
          `${acceso.url}/rest/v1/clientes?ruc=eq.${encodeURIComponent(ruc)}`,
          {
            method: "PATCH",
            headers: {
              apikey: acceso.key,
              Authorization: `Bearer ${acceso.key}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify(parche),
          },
        );
        if (!r.ok) {
          ultimoError = `cobranzas respondió ${r.status} al completar ${ruc}`;
          return;
        }
        if (parche.celular) celulares += 1;
        if (parche.direccion) direcciones += 1;
        if (parche.distrito || parche.provincia || parche.departamento) ubicaciones += 1;
      }),
    );
  }

  let soloEnPedidos = 0;
  contactos.forEach((_, ruc) => {
    if (!enCobranzas.has(ruc)) soloEnPedidos += 1;
  });
  const cuando = new Date().toISOString();

  await logAudit({
    actor,
    accion: "sincronizar_contactos_cobranzas",
    entidad: "clientes_cobranzas",
    entidadId: "cartera",
    datosDespues: { celulares, direcciones, ubicaciones, soloEnPedidos },
  });

  if (ultimoError) throw new Error(`${ultimoError}. Se completaron ${celulares + direcciones} datos antes de fallar.`);

  return { celulares, direcciones, ubicaciones, soloEnPedidos, cuando };
}
