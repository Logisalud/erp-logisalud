/**
 * Provisionamiento de usuarios del ERP Logisalud.
 *
 * Script de administración — NO es parte de ninguna app. Corre localmente
 * con la service role key, que nunca se expone al cliente.
 *
 * QUÉ HACE
 *   1. Lee scripts/usuarios-erp.csv (nombre, correo, telefono, area, rol) y
 *      descarta las áreas de AREAS_EXCLUIDAS (hoy vacía: se provisiona el
 *      organigrama completo, vendedores incluidos).
 *   2. Crea cada usuario restante en auth.users: por correo vía invitación
 *      (le llega un mail para que ponga su propia contraseña), o por
 *      teléfono si la fila trae telefono en vez de correo.
 *   3. Inserta/actualiza su fila en public.perfiles.
 *   4. Inserta/actualiza las filas fijas de public.area_responsables.
 *
 * CÓMO VOLVER A CORRERLO CUANDO ENTRA GENTE NUEVA
 *   - Agregá la fila al final de scripts/usuarios-erp.csv (con correo, o con
 *     telefono si esa persona no tiene mail corporativo) y corré:
 *
 *       SUPABASE_URL=https://<ref>.supabase.co \
 *       SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
 *       npx tsx scripts/seed-usuarios.ts
 *
 *   - Es idempotente: a quien ya existe no lo duplica ni lo re-invita, solo
 *     re-sincroniza su perfil. Podés correrlo las veces que quieras.
 *   - Agregá --dry-run para ver qué haría sin escribir nada.
 *
 * PENDIENTES CONOCIDOS
 *   - Jose Carlos y Christian: falta apellido y teléfono. Cuando los tengas,
 *     se agregan al CSV y se vuelve a correr esto — no hay que tocar código.
 */

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const URL_BASE = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')
/**
 * Crea cada cuenta con contraseña generada en vez de mandar invitación por
 * correo. Las contraseñas se imprimen SOLO en la terminal — nunca se
 * escriben a un archivo ni se commitean.
 */
const SET_PASSWORD = process.argv.includes('--set-password')

if (!URL_BASE || !SERVICE_KEY) {
  console.error(
    'Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Ver el encabezado de este archivo para el comando completo.'
  )
  process.exit(1)
}

/**
 * Áreas que NO se provisionan. Hoy: ninguna — se provisiona el organigrama
 * completo, los 31.
 *
 * Los vendedores de campo (área `ventas`) SÍ necesitan cuenta: piden y
 * rinden viáticos en Compras y Gastos, y registran sus propios pedidos.
 *
 * Ojo con la confusión que ya nos costó una vuelta: el link con token de
 * `/v/[token]` en apps/cobranzas **no se reemplaza** por esto. Son dos cosas
 * distintas que comparten a las mismas personas — el link sigue siendo la
 * vista de cobranzas sin login, igual que siempre, y la cuenta es para
 * pedidos y viáticos. Tener cuenta no le quita el link a nadie.
 */
const AREAS_EXCLUIDAS: string[] = []

/**
 * Responsables de área. NO se derivan del CSV de personas: el responsable de
 * un área no siempre trabaja en esa área (Juan es de gerencia y aprueba los
 * gastos de Marketing, que caen en el área "otro").
 *
 * 'compras' no tiene responsable a propósito: Sebas la cubre directo como
 * admin y las órdenes de compra se emiten sin aprobación previa.
 */
const AREA_RESPONSABLES: { area: string; correo: string; nota: string }[] = [
  { area: 'almacen', correo: 'sgonzales@logisalud.com', nota: 'Sebastian Gonzales — temporal' },
  { area: 'contabilidad', correo: 'mcasiano@logisalud.com', nota: 'Mariela Casiano' },
  { area: 'tesoreria', correo: 'mminaya@logisalud.com', nota: 'Milagritos Minaya' },
  { area: 'otro', correo: 'jgonzales@logisalud.com', nota: 'Juan Gonzales — Gerente Comercial, aprueba gastos de Marketing' },
  { area: 'ventas', correo: 'jgonzales@logisalud.com', nota: 'Juan Gonzales — Gerente Comercial' },
  { area: 'legal', correo: 'ataboada@logisalud.com', nota: 'Ana Lucia Taboada' },
  { area: 'direccion_tecnica', correo: 'kzapata@logisalud.com', nota: 'Katia Zapata' },
]

type Fila = { nombre: string; correo: string; telefono: string; area: string; rol: string }

function leerCsv(ruta: string): Fila[] {
  const lineas = readFileSync(ruta, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const encabezado = lineas[0].split(',').map((c) => c.trim())
  const esperado = ['nombre', 'correo', 'telefono', 'area', 'rol']
  if (esperado.some((c, i) => encabezado[i] !== c)) {
    throw new Error(`Encabezado inesperado en el CSV: ${lineas[0]}`)
  }

  return lineas.slice(1).map((linea) => {
    const [nombre, correo, telefono, area, rol] = linea.split(',').map((c) => c.trim())
    return { nombre, correo, telefono, area, rol }
  })
}

async function api(ruta: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_BASE}${ruta}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const texto = await res.text()
  const cuerpo = texto ? JSON.parse(texto) : null
  if (!res.ok) {
    throw new Error(cuerpo?.msg ?? cuerpo?.message ?? `HTTP ${res.status}: ${texto}`)
  }
  return cuerpo
}

/** Usuarios que ya existen en auth.users, indexados por correo y por teléfono. */
async function usuariosExistentes(): Promise<Map<string, string>> {
  const indice = new Map<string, string>()
  for (let pagina = 1; ; pagina++) {
    const r = await api(`/auth/v1/admin/users?page=${pagina}&per_page=200`)
    const usuarios = r?.users ?? []
    for (const u of usuarios) {
      if (u.email) indice.set(u.email.toLowerCase(), u.id)
      if (u.phone) indice.set(u.phone, u.id)
    }
    if (usuarios.length < 200) break
  }
  return indice
}

/**
 * Contraseña temporal: 16 caracteres con al menos una minúscula, una
 * mayúscula, un dígito y un símbolo. Se arma desde randomBytes (CSPRNG), no
 * desde Math.random.
 *
 * Se excluyeron los caracteres que se confunden al dictarlos por teléfono o
 * WhatsApp: O/0, l/I/1. Estas contraseñas se transcriben a mano.
 */
function generarPassword(): string {
  const minus = 'abcdefghijkmnopqrstuvwxyz'
  const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const nums = '23456789'
  const simbolos = '!@#$%&*+-?'
  const todos = minus + mayus + nums + simbolos

  const elegir = (alfabeto: string, n = 1) =>
    Array.from(randomBytes(n)).map((b) => alfabeto[b % alfabeto.length])

  // Uno de cada clase, garantizado; el resto libre.
  const chars = [
    ...elegir(minus),
    ...elegir(mayus),
    ...elegir(nums),
    ...elegir(simbolos),
    ...elegir(todos, 12),
  ]

  // Fisher-Yates con bytes aleatorios, para que las 4 clases garantizadas no
  // queden siempre en las primeras posiciones.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

/**
 * Crea el usuario y devuelve su id, más la contraseña si se generó una.
 *
 * Con --set-password la cuenta queda lista para entrar: correo confirmado y
 * contraseña asignada, sin depender de que llegue el mail de invitación.
 * Sin el flag, se manda la invitación como antes.
 */
async function crearUsuario(fila: Fila): Promise<{ id: string; password?: string }> {
  if (fila.correo) {
    if (SET_PASSWORD) {
      const password = generarPassword()
      const u = await api('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: fila.correo,
          password,
          email_confirm: true,
          user_metadata: { nombre: fila.nombre },
        }),
      })
      return { id: u.id, password }
    }
    const u = await api('/auth/v1/invite', {
      method: 'POST',
      body: JSON.stringify({ email: fila.correo, data: { nombre: fila.nombre } }),
    })
    return { id: u.id }
  }

  // Camino teléfono: para quien no tiene mail corporativo (Jose Carlos,
  // Christian). Entra confirmado; con --set-password también con contraseña,
  // así puede entrar sin depender del SMS.
  const password = SET_PASSWORD ? generarPassword() : undefined
  const u = await api('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      phone: fila.telefono,
      phone_confirm: true,
      ...(password ? { password } : {}),
      user_metadata: { nombre: fila.nombre },
    }),
  })
  return { id: u.id, password }
}

async function upsert(tabla: string, filas: unknown[]) {
  if (!filas.length) return
  await api(`/rest/v1/${tabla}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(filas),
  })
}

async function main() {
  const filas = leerCsv(join(import.meta.dirname, 'usuarios-erp.csv'))
  console.log(`CSV: ${filas.length} usuarios${DRY_RUN ? '  (DRY RUN — no escribe nada)' : ''}\n`)

  const aProvisionar = filas.filter((f) => !AREAS_EXCLUIDAS.includes(f.area))
  const excluidas = filas.length - aProvisionar.length
  if (excluidas) {
    console.log(
      `Excluidos por área (${AREAS_EXCLUIDAS.join(', ')}): ${excluidas}. ` +
        `Se provisionan ${aProvisionar.length}.\n`
    )
  }

  const existentes = await usuariosExistentes()
  const perfiles: { id: string; nombre: string; area: string; rol: string }[] = []
  const idPorCorreo = new Map<string, string>()
  const creados: string[] = []
  const yaExistian: string[] = []
  const fallidos: { quien: string; motivo: string }[] = []
  const credenciales: { nombre: string; acceso: string; password: string }[] = []

  for (const fila of aProvisionar) {
    const clave = fila.correo ? fila.correo.toLowerCase() : fila.telefono
    if (!clave) {
      fallidos.push({ quien: fila.nombre, motivo: 'la fila no tiene ni correo ni telefono' })
      continue
    }

    try {
      let id = existentes.get(clave)
      if (id) {
        yaExistian.push(fila.nombre)
      } else if (DRY_RUN) {
        console.log(`  [dry-run] crearía ${fila.nombre} <${clave}>`)
        continue
      } else {
        const creado = await crearUsuario(fila)
        id = creado.id
        creados.push(fila.nombre)
        if (creado.password) {
          credenciales.push({
            nombre: fila.nombre,
            acceso: fila.correo || fila.telefono,
            password: creado.password,
          })
        }
      }
      if (fila.correo) idPorCorreo.set(fila.correo.toLowerCase(), id)
      perfiles.push({ id, nombre: fila.nombre, area: fila.area, rol: fila.rol })
    } catch (e) {
      fallidos.push({ quien: fila.nombre, motivo: (e as Error).message })
    }
  }

  if (!DRY_RUN) {
    await upsert('perfiles', perfiles)
  }

  // area_responsables: resuelve cada correo al user_id ya creado.
  const responsables: { area: string; responsable_id: string }[] = []
  for (const r of AREA_RESPONSABLES) {
    const id = idPorCorreo.get(r.correo.toLowerCase())
    if (!id) {
      fallidos.push({
        quien: `area_responsables[${r.area}]`,
        motivo: `no se pudo resolver ${r.correo} a un user_id — ¿está en el CSV?`,
      })
      continue
    }
    responsables.push({ area: r.area, responsable_id: id })
  }
  if (!DRY_RUN) {
    await upsert('area_responsables', responsables)
  }

  console.log('\n=========== RESUMEN ===========')
  console.log(`Creados (invitación enviada): ${creados.length}`)
  creados.forEach((n) => console.log(`  + ${n}`))
  console.log(`Ya existían (perfil re-sincronizado): ${yaExistian.length}`)
  yaExistian.forEach((n) => console.log(`  = ${n}`))
  console.log(`Perfiles escritos en public.perfiles: ${perfiles.length}`)
  console.log(`Responsables de área escritos: ${responsables.length} de ${AREA_RESPONSABLES.length}`)
  responsables.forEach((r) => {
    const nota = AREA_RESPONSABLES.find((a) => a.area === r.area)!.nota
    console.log(`  = ${r.area} -> ${nota}`)
  })

  if (credenciales.length) {
    console.log('\n=========== CONTRASEÑAS TEMPORALES ===========')
    console.log('Solo se muestran acá. No se guardan en ningún archivo.')
    console.log('Copialas AHORA: si cerrás la terminal, no hay forma de recuperarlas')
    console.log('(quedan hasheadas en Supabase). Si se pierden, se resetean desde')
    console.log('el dashboard de Supabase Auth.\n')
    console.log('| Nombre | Correo | Contraseña temporal |')
    console.log('|---|---|---|')
    for (const c of credenciales) {
      console.log(`| ${c.nombre} | ${c.acceso} | ${c.password} |`)
    }
    console.log('\nCada persona la cambia desde /cambiar-password apenas entre.')
  }

  if (fallidos.length) {
    console.log(`\nFallidos: ${fallidos.length}`)
    fallidos.forEach((f) => console.log(`  ! ${f.quien}: ${f.motivo}`))
    process.exitCode = 1
  } else {
    console.log('\nSin errores.')
  }
}

main().catch((e) => {
  console.error(`\nError fatal: ${(e as Error).message}`)
  process.exit(1)
})
