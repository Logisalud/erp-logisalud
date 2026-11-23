import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit, ultimaCorrida } from "./audit-log";
import { claveDeCobranzas } from "@/domain/documentos";
import {
  resolveEstadoInicialImportacion,
  resolveTipoComprobantePermitido,
} from "@/domain/customers";
import { leerTodo } from "@/lib/paginar";
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
 * 2. LOS CLIENTES QUE FALTAN SE CREAN, pero solo cuando se los puede
 *    ubicar. La cartera es a quién se le PUEDE vender, no a quién ya
 *    compró: un cliente registrado hace dos años que no compra desde
 *    entonces sigue siendo visitable, y si no está en pedidos el vendedor
 *    no le puede tomar el pedido.
 *
 *    Durante un tiempo esto no se hacía porque parecía que zona y vendedor
 *    no se podían deducir. Sí se puede: cobranzas tiene los dos para sus
 *    6.621 clientes, y los códigos coinciden con los de pedidos (las 20
 *    zonas, 23 de los 24 vendedores; el que falta no tiene clientes). Lo
 *    que NO tiene cobranzas es el canal, y sin canal no se puede vender
 *    —`orders.ts` rechaza el pedido con NO_CHANNEL porque el precio vive
 *    por canal—, así que entran con el canal por defecto, el mismo que usa
 *    el importador de la cartera: Horizontal. La clasificación real se
 *    corrige después, cliente por cliente.
 *
 *    Si la zona o el vendedor no se pueden mapear, el cliente NO se crea:
 *    se cuenta y se informa. Un cliente sin dueño en la cartera es un
 *    cliente que nadie visita.
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
  razon_social: string;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  codigo_zona: string | null;
  vendedor_actual_id: string | null;
};

type VendedorDeCobranzas = { id: string; codigo: string | null };

/**
 * El canal con el que entra un cliente que viene de cobranzas.
 *
 * Es el mismo que usa `services/customers-import.ts` para la carga de la
 * cartera real, y por el mismo motivo: sin canal no se puede calcular el
 * precio y el cliente queda inoperativo. La clasificación real
 * (Mayorista/Horizontal/Minicadenas/Tops/Clínicas/Subdistribuidores) se
 * corrige cliente por cliente cuando el negocio la entrega.
 */
const CANAL_POR_DEFECTO = "Horizontal";

type ClienteDePedidos = {
  id: string;
  ruc_o_documento: string | null;
  direccion_fiscal: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
};

export type ResultadoCartera = {
  /** Clientes que estaban en cobranzas y ahora también están en pedidos. */
  creados: number;
  /** Los que no se crearon porque no se pudo ubicar su zona o su vendedor. */
  sinUbicar: number;
  /** Clientes de pedidos que ahora tienen dirección fiscal y antes no. */
  direcciones: number;
  /** Clientes a los que se les completó departamento/provincia/distrito. */
  ubicaciones: number;
  /** Tríos que cobranzas tiene pero que no existen en el catálogo de ubigeos. */
  ubigeosDesconocidos: number;
  /** Clientes de cobranzas que no existen en pedidos, antes de crearlos. */
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

/**
 * Los tríos válidos, tal como los conoce la guía de remisión.
 *
 * Se pagina, y no es una precaución teórica: la tabla tiene 1.884 filas y
 * PostgREST corta en 1.000. Ordenado por código INEI, lo que entraba en esas
 * 1.000 iba de Amazonas a Ica, así que **Lima quedaba entera afuera** —sus
 * 171 distritos empiezan recién en la fila 1.001—. Como el trío se valida
 * contra este catálogo, a todo cliente de Lima, Junín y La Libertad se le
 * descartaba el ubigeo y se guardaba vacío: 2.022 clientes sin
 * departamento/provincia/distrito en la carga del 2026-11-20, aunque
 * cobranzas sí los tenía. Un catálogo incompleto acá no falla: miente en
 * silencio y borra datos buenos.
 */
async function catalogoDeUbigeos(): Promise<Set<string>> {
  const admin = createAdminClient();
  const filas = await leerTodo<{
    departamento: string;
    provincia: string;
    distrito: string;
  }>((from, to) =>
    admin
      .from("ubigeos")
      // `codigo_inei` es la clave de la tabla: orden único y estable, que es
      // lo que `.range()` necesita para no repetir ni saltear filas.
      .select("departamento, provincia, distrito")
      .order("codigo_inei")
      .range(from, to),
  );

  const validos = new Set<string>();
  for (const u of filas) validos.add(clave(u.departamento, u.provincia, u.distrito));
  return validos;
}

/** Las tablas de pedidos que hacen falta para ubicar a un cliente nuevo. */
async function catalogosDePedidos(): Promise<{
  zonaPorCodigo: Map<string, number>;
  vendedorPorCodigo: Map<string, string>;
  canalPorDefectoId: number;
}> {
  const admin = createAdminClient();

  const [zonas, vendedores, canal] = await Promise.all([
    admin.from("zones").select("id, codigo_zona"),
    admin.from("sellers").select("id, codigo_representante").eq("estado", "activo"),
    admin.from("sales_channels").select("id").eq("nombre", CANAL_POR_DEFECTO).maybeSingle(),
  ]);

  if (zonas.error) throw new Error(zonas.error.message);
  if (vendedores.error) throw new Error(vendedores.error.message);
  if (canal.error) throw new Error(canal.error.message);
  if (!canal.data) {
    // Sin canal no hay precio, y sin precio el cliente creado no sirve.
    // Mejor no crear ninguno que crear 3.000 que nadie puede atender.
    throw new Error(
      `No existe el canal "${CANAL_POR_DEFECTO}" en el catálogo de pedidos: no se crea ningún cliente.`,
    );
  }

  const zonaPorCodigo = new Map<string, number>();
  for (const z of (zonas.data ?? []) as Array<{ id: number; codigo_zona: string | null }>) {
    if (z.codigo_zona) zonaPorCodigo.set(z.codigo_zona.trim().toUpperCase(), z.id);
  }

  const vendedorPorCodigo = new Map<string, string>();
  for (const v of (vendedores.data ?? []) as Array<{
    id: string;
    codigo_representante: string | null;
  }>) {
    if (v.codigo_representante) {
      vendedorPorCodigo.set(v.codigo_representante.trim().toUpperCase(), v.id);
    }
  }

  return { zonaPorCodigo, vendedorPorCodigo, canalPorDefectoId: (canal.data as { id: number }).id };
}

/**
 * Completa en pedidos la dirección y el ubigeo que faltan, y da de alta a
 * los clientes que están en cobranzas y no en pedidos.
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

  const [cartera, vendedoresCobranzas, ubigeos, propios, catalogos] = await Promise.all([
    leerCobranzas<ClienteDeCobranzas>(
      acceso,
      "clientes?select=ruc,razon_social,direccion,distrito,provincia,departamento,codigo_zona,vendedor_actual_id&order=ruc",
    ),
    leerCobranzas<VendedorDeCobranzas>(acceso, "vendedores?select=id,codigo&order=id"),
    catalogoDeUbigeos(),
    // Paginado y ordenado por `id`: son 3.568 clientes y PostgREST corta
    // en 1.000. Sin esto se comparaban los primeros mil contra toda la
    // cartera de cobranzas, y los otros 2.568 nunca se completaban.
    leerTodo<ClienteDePedidos>((desde, hasta) =>
      admin
        .from("customers")
        .select("id, ruc_o_documento, direccion_fiscal, distrito, provincia, departamento")
        .order("id")
        .range(desde, hasta),
    ),
    catalogosDePedidos(),
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

  // ─── Los que faltan en pedidos ───────────────────────────────────────
  const faltantes: ClienteDeCobranzas[] = [];
  deCobranzas.forEach((c, k) => {
    if (!enPedidos.has(k)) faltantes.push(c);
  });
  const soloEnCobranzas = faltantes.length;

  const codigoDeVendedor = new Map<string, string>();
  for (const v of vendedoresCobranzas) {
    if (v.codigo) codigoDeVendedor.set(v.id, v.codigo.trim().toUpperCase());
  }

  const nuevos: Array<Record<string, unknown>> = [];
  let sinUbicar = 0;

  for (const c of faltantes) {
    const zonaId = c.codigo_zona
      ? catalogos.zonaPorCodigo.get(c.codigo_zona.trim().toUpperCase())
      : undefined;
    const codigo = c.vendedor_actual_id ? codigoDeVendedor.get(c.vendedor_actual_id) : undefined;
    const vendedorId = codigo ? catalogos.vendedorPorCodigo.get(codigo) : undefined;

    // Sin zona o sin vendedor no entra: un cliente que no le cuelga a
    // nadie es un cliente que nadie visita.
    if (!zonaId || !vendedorId) {
      sinUbicar += 1;
      continue;
    }

    const ruc = c.ruc.trim();
    const departamento = (c.departamento ?? "").trim();
    const provincia = (c.provincia ?? "").trim();
    const distrito = (c.distrito ?? "").trim();
    const ubigeoValido =
      departamento !== "" &&
      provincia !== "" &&
      distrito !== "" &&
      ubigeos.has(clave(departamento, provincia, distrito));

    nuevos.push({
      ruc_o_documento: ruc,
      razon_social: (c.razon_social ?? "").trim() || ruc,
      direccion_fiscal: limpiarDireccion(c.direccion),
      departamento: ubigeoValido ? departamento : null,
      provincia: ubigeoValido ? provincia : null,
      distrito: ubigeoValido ? distrito : null,
      canal_id: catalogos.canalPorDefectoId,
      zona_id: zonaId,
      vendedor_id: vendedorId,
      // Las dos reglas del repo para la cartera que ya opera: el RUC
      // válido entra ACTIVO y el DNI cargado en el campo de RUC queda a
      // validar; el comprobante se deriva del documento, nunca del
      // default de la tabla, porque el CHECK rechaza FACTURA sin RUC.
      estado: resolveEstadoInicialImportacion(ruc),
      tipo_comprobante_permitido: resolveTipoComprobantePermitido(ruc),
    });
  }

  let creados = 0;
  // De a 200: un insert por cliente serían miles de viajes, y uno solo con
  // 3.000 filas es un payload que el REST corta.
  const LOTE = 200;
  for (let i = 0; i < nuevos.length; i += LOTE) {
    const { error } = await admin.from("customers").insert(nuevos.slice(i, i + LOTE));
    if (error) {
      ultimoError = `pedidos rechazó un lote de clientes nuevos: ${error.message}`;
      break;
    }
    creados += Math.min(LOTE, nuevos.length - i);
  }

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
      creados,
      sinUbicar,
      origen: actor ? "persona" : "cron",
    },
  });

  if (ultimoError) {
    throw new Error(
      `${ultimoError}. Se completaron ${direcciones + ubicaciones} datos y se crearon ${creados} clientes antes de fallar.`,
    );
  }

  return { creados, sinUbicar, direcciones, ubicaciones, ubigeosDesconocidos, soloEnCobranzas, cuando };
}

export type UltimaCorridaDeCartera = {
  cuando: string;
  porElCron: boolean;
  creados: number;
  sinUbicar: number;
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
    creados: n("creados"),
    sinUbicar: n("sinUbicar"),
    direcciones: n("direcciones"),
    ubicaciones: n("ubicaciones"),
    ubigeosDesconocidos: n("ubigeosDesconocidos"),
  };
}
