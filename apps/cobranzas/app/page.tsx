import Link from 'next/link'
import { crearClienteServidor, perfilActual, usuarioActual } from '@logisalud/auth/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type Modulo = {
  id: string
  nombre: string
  descripcion: string
  ruta: string
  disponible: boolean
}

const EMOJI_MODULO: Record<string, string> = {
  cobranzas: '💰',
  pedidos: '📦',
  compras: '🛒',
}

/**
 * Frases de marca que rotan al azar en cada entrada — cercanas, en tuteo
 * peruano, nunca solemnes ni de cartel de oficina. Array simple a propósito
 * (sin tabla) para que agregar una nueva sea editar una línea, no una
 * migración.
 */
const FRASES_MARCA = [
  '¡Buen día! Aquí seguimos, conectando todo con confianza.',
  'Gracias por hacer que esto funcione tan bien.',
  'Todo fluye mejor cuando tú estás al mando.',
  'Un buen equipo se nota en los detalles — como este.',
  'Salud, confianza y buena logística: así se ve un buen día de trabajo.',
  'Esto funciona porque tú lo haces funcionar.',
  'Cada pedido bien hecho es un punto más de confianza.',
  'Hoy conectas salud con quien la necesita.',
  'Gracias por sostener todo esto, aunque no siempre se note.',
  'Un dato bien cargado hoy es una entrega tranquila mañana.',
  'Conectando puntos, como siempre.',
  'Qué bueno tenerte aquí — vamos con todo.',
  'Cada detalle que cuidas hoy, alguien lo agradece después.',
  'Tú haces que la cadena no se rompa.',
  'Otro día para que todo llegue bien — gracias por eso.',
]

function fraseDelDia() {
  return FRASES_MARCA[Math.floor(Math.random() * FRASES_MARCA.length)]
}

/**
 * Pantalla de módulos: lo primero que ve una persona después de entrar.
 *
 * Qué tarjetas aparecen sale de `public.modulo_areas_permitidas`, no del
 * código. Cambiar quién ve Cobranzas es un insert o un delete, no un deploy
 * — que es justo lo que hace falta mientras siga pendiente la autorización
 * de las rutas de Cobranzas.
 */
export default async function PantallaModulos() {
  const usuario = await usuarioActual()
  if (!usuario) redirect('/login')

  const perfil = await perfilActual()
  const supabase = crearClienteServidor()

  // Sin perfil no hay área, y sin área no hay módulo que mostrar. Pasa con
  // quien entra sin estar en public.usuarios_esperados: el trigger no le
  // crea perfil y RLS le niega todo. Se le dice, no se le muestra un
  // blanco.
  let modulos: Modulo[] = []
  let fallo = false

  if (perfil?.area) {
    const { data, error } = await supabase
      .from('modulos')
      .select('id, nombre, descripcion, ruta, disponible, modulo_areas_permitidas!inner(area)')
      .eq('modulo_areas_permitidas.area', perfil.area)
      .order('orden')

    if (error) {
      // Sin esto, un error de consulta se vería igual que "no tenés
      // permisos" — que es exactamente el bug que tuvimos con los admins.
      console.error('[modulos] falló la consulta:', error.message)
      fallo = true
    }
    modulos = (data ?? []) as unknown as Modulo[]
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="font-oswald text-3xl uppercase tracking-wide text-gray-900">
          ERP Logisalud
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {perfil?.nombre ? `Hola, ${perfil.nombre}.` : 'Hola.'} Elige a dónde entrar.
        </p>
        <p className="mt-1 text-xs italic text-gray-400">{fraseDelDia()}</p>
      </header>

      {modulos.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          {fallo ? (
            <>
              <p className="text-gray-900">No pudimos cargar tus módulos.</p>
              <p className="mt-2 text-sm text-gray-600">
                Es un problema nuestro, no de tus permisos. Recarga la página; si
                sigue igual, avísale a soporte.
              </p>
            </>
          ) : !perfil ? (
            <>
              <p className="text-gray-900">Tu cuenta todavía no tiene perfil.</p>
              <p className="mt-2 text-sm text-gray-600">
                Entraste bien, pero nadie te asignó un área. Escríbele a tu
                administrador para que te la cargue.
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-900">Todavía no tienes acceso a ningún módulo.</p>
              <p className="mt-2 text-sm text-gray-600">
                Tu área es <strong>{perfil.area}</strong>. Escríbele a tu
                administrador para que te habilite lo que necesites.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {modulos.map((m) => (
            <li
              key={m.id}
              className={`flex flex-col rounded-xl border bg-white p-5 ${
                m.disponible
                  ? 'border-gray-200 hover:border-gray-300 hover:shadow-sm transition'
                  : 'border-gray-200 opacity-60'
              }`}
            >
              <h2 className="font-oswald text-xl uppercase tracking-wide text-gray-900">
                <span aria-hidden>{EMOJI_MODULO[m.id] ?? ''}</span> {m.nombre}
              </h2>
              <p className="mt-1 grow text-sm text-gray-600">{m.descripcion}</p>

              {m.disponible ? (
                <Link
                  href={m.ruta}
                  className="mt-4 inline-flex min-h-12 items-center justify-center rounded-lg px-4 font-medium text-white"
                  style={{ backgroundColor: '#4BB168' }}
                >
                  Entrar
                </Link>
              ) : (
                <span className="mt-4 inline-flex min-h-12 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-500">
                  Próximamente
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
