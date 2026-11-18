import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit, ultimaCorrida } from "./audit-log";
import { claveDeCobranzas } from "@/domain/documentos";
import {
  accesoACobranzas,
  leerCobranzas,
  limpiarDireccion,
  vacio,
} from "./contactos-cobranzas";

/**
 * El viaje de ida del puente: la dirección fiscal y el ubigeo del cliente,
 * que los tiene cobranzas, copiados a la cartera de pedidos.
 *
 * `services/contactos-cobranzas.ts` hace el viaje de vuelta — el celular y
 * la dirección de entrega, que nacen en pedidos, van hacia cobranzas. Falta
 * esta mitad: la dirección fiscal y el distrito vienen del padrón, llegan
 * con la factura y por eso viven en cobranzas (6.000 fichas contra las 80
 * que tenía pedidos antes de la carga del 18/11/2026).
 *
 * Las mismas dos reglas que el viaje de vuelta, por los mismos motivos:
 *
 * 1. SOLO SE LLENAN VACÍOS. Nunca se pisa un dato que ya está en pedidos.
 *    Si el vendedor corrigió la dirección desde la ficha, esa corrección
 *    gana: él estuvo en la puerta, el padrón no.
 * 2. NO SE CREAN CLIENTES. Un cliente que está en cobranzas y no en
 *    pedidos se cuenta y se informa, pero no se inserta: en pedidos un
 *    cliente nace validado, con canal, zona y vendedor, y nada de eso se
 *    puede deducir de la cartera de cobranzas sin adivinar.
 *
 * Y una tercera que este lado sí necesita: EL UBIGEO SE VALIDA CONTRA EL
 * CATÁLOGO. Pedidos usa departamento/provincia/distrito para la guía de
 * remisión, así que un trío que no existe en `pedidos.ubigeos` no entra —
 * se cuenta aparte para poder corregirlo en el origen. En la carga a mano
 * del 18/11 aparecieron varios así, por ejemplo "JUNIN / HUANCAYO /
 * PUERTO INCA", que mezcla un distrito de Huánuco con una provincia de
 * Junín.
 */

type ClienteDeCobranzas = {
  ruc: string;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
};

type ClienteDePedidos = {
  id: string;
  ruc_o_documento: string | null;
  direccion_fiscal: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
};

export type ResultadoCartera = {
  /** Clientes de pedidos que ahora tienen dirección fiscal y antes no. */
  direcciones: number;
  /** Clientes a los que se les completó departamento/provincia/distrito. */
  ubicaciones: number;
  /** Tríos que cobranzas tiene pero que no existen en el catálogo de ubigeos. */
  ubigeosDesconocidos: number;
  /** Clientes de cobranzas que no existen en pedidos (no se crean: ver arriba). */
  soloEnCobranzas: number;
  cuando: string;
};

/** Normaliza un nombre de ubigeo para comparar: sin tildes, en mayúsculas. */
function normalizar(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

function clave(departamento: string, provincia: string, distrito: string): string {
  return `${normalizar(departamento)}|${normalizar(provincia)}|${normalizar(distrito)}`;
}

/** Los tríos válidos, tal como los conoce la guía de remisión. */
async function catalogoDeUbigeos(): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ubigeos")
    .select("departamento, provincia, distrito");
  if (error) throw new Error(error.message);

  const validos = new Set<string>();
  for (const u of (data ?? []) as Array<{
    departamento: string;
    provincia: string;
    distrito: string;
  }>) {
    validos.add(clave(u.departamento, u.provincia, u.distrito));
  }
  return validos;
}

/**
 * Completa en pedidos la dirección y el ubigeo que faltan, con lo que sabe
 * cobranzas.
 *
 * Si la lectura de cobranzas falla no se escribe nada. Si falla la escritura
 * de un cliente se sigue con los demás y el error se levanta al final: a
 * medio camino es mejor haber llenado 400 fichas que ninguna, y la próxima
 * corrida retoma lo que quedó.
 */
export async function sincronizarCarteraDesdeCobranzas(
  actor: string | null,
): Promise<ResultadoCartera> {
  const acceso = accesoACobranzas();
  if (!acceso) {
    throw new Error(
      "Falta configurar el acceso al ERP de cobranzas (COBRANZAS_SUPABASE_URL y COBRANZAS_SERVICE_ROLE_KEY).",
    );
  }

  const admin = createAdminClient();

  const [cartera, ubigeos, propios] = await Promise.all([
    leerCobranzas<ClienteDeCobranzas>(
      acceso,
      "clientes?select=ruc,direccion,distrito,provincia,departamento&order=ruc",
    ),
    catalogoDeUbigeos(),
    (async () => {
      const { data, error } = await admin
        .from("customers")
        .select("id, ruc_o_documento, direccion_fiscal, distrito, provincia, departamento");
      if (error) throw new Error(error.message);
      return (data ?? []) as ClienteDePedidos[];
    })(),
  ]);

  // Indexada por la llave que usa cobranzas, no por el documento pelado:
  // allá el DNI va relleno con ceros y si no se normaliza acá, ningún
  // cliente con DNI cruza nunca.
  const deCobranzas = new Map<string, ClienteDeCobranzas>();
  for (const c of cartera) {
    const k = claveDeCobranzas(c.ruc);
    if (k !== null) deCobranzas.set(k, c);
  }

  const pendientes: Array<{ id: string; parche: Record<string, string> }> = [];
  const enPedidos = new Set<string>();
  let ubigeosDesconocidos = 0;

  for (const p of propios) {
    const k = claveDeCobranzas(p.ruc_o_documento);
    if (k === null) continue;
    enPedidos.add(k);

    const c = deCobranzas.get(k);
    if (!c) continue;

    const parche: Record<string, string> = {};

    const direccion = limpiarDireccion(c.direccion);
    if (vacio(p.direccion_fiscal) && direccion) parche.direccion_fiscal = direccion;

    // El trío se arma con lo que ya tiene pedidos y, donde esté vacío, con
    // lo de cobranzas. Se valida el resultado completo: validar campo por
    // campo dejaría pasar una provincia que no va con ese distrito.
    const departamento = vacio(p.departamento) ? (c.departamento ?? "").trim() : p.departamento!.trim();
    const provincia = vacio(p.provincia) ? (c.provincia ?? "").trim() : p.provincia!.trim();
    const distrito = vacio(p.distrito) ? (c.distrito ?? "").trim() : p.distrito!.trim();
    const faltaAlguno = vacio(p.departamento) || vacio(p.provincia) || vacio(p.distrito);

    if (faltaAlguno && departamento && provincia && distrito) {
      if (ubigeos.has(clave(departamento, provincia, distrito))) {
        if (vacio(p.departamento)) parche.departamento = departamento;
        if (vacio(p.provincia)) parche.provincia = provincia;
        if (vacio(p.distrito)) parche.distrito = distrito;
      } else {
        ubigeosDesconocidos += 1;
      }
    }

    if (Object.keys(parche).length > 0) pendientes.push({ id: p.id, parche });
  }

  let direcciones = 0;
  let ubicaciones = 0;
  let ultimoError: string | null = null;

  // De a ocho: cada cliente lleva su propio valor, así que no hay un UPDATE
  // masivo posible.
  const TANDA = 8;
  for (let i = 0; i < pendientes.length; i += TANDA) {
    await Promise.all(
      pendientes.slice(i, i + TANDA).map(async ({ id, parche }) => {
        const { error } = await admin.from("customers").update(parche).eq("id", id);
        if (error) {
          ultimoError = `pedidos rechazó la ficha ${id}: ${error.message}`;
          return;
        }
        if (parche.direccion_fiscal) direcciones += 1;
        if (parche.distrito || parche.provincia || parche.departamento) ubicaciones += 1;
      }),
    );
  }

  let soloEnCobranzas = 0;
  deCobranzas.forEach((_, k) => {
    if (!enPedidos.has(k)) soloEnCobranzas += 1;
  });
  const cuando = new Date().toISOString();

  await logAudit({
    actor,
    accion: "sincronizar_cartera_desde_cobranzas",
    entidad: "customers",
    entidadId: "cartera",
    datosDespues: {
      direcciones,
      ubicaciones,
      ubigeosDesconocidos,
      soloEnCobranzas,
      origen: actor ? "persona" : "cron",
    },
  });

  if (ultimoError) {
    throw new Error(`${ultimoError}. Se completaron ${direcciones + ubicaciones} datos antes de fallar.`);
  }

  return { direcciones, ubicaciones, ubigeosDesconocidos, soloEnCobranzas, cuando };
}

export type UltimaCorridaDeCartera = {
  cuando: string;
  porElCron: boolean;
  direcciones: number;
  ubicaciones: number;
  ubigeosDesconocidos: number;
} | null;

/** Cuándo se completó la cartera por última vez, y con qué resultado. */
export async function ultimaCorridaDeCartera(): Promise<UltimaCorridaDeCartera> {
  const c = await ultimaCorrida("sincronizar_cartera_desde_cobranzas");
  if (!c) return null;
  const n = (k: string) => Number(c.datos[k] ?? 0);
  return {
    cuando: c.cuando,
    porElCron: c.porElCron,
    direcciones: n("direcciones"),
    ubicaciones: n("ubicaciones"),
    ubigeosDesconocidos: n("ubigeosDesconocidos"),
  };
}
