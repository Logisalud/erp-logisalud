/**
 * Mock mínimo y a propósito "tonto" del cliente de Supabase para testear
 * services/* server-side sin red ni base de datos real.
 *
 * Uso: armar una cola de resultados en el ORDEN EXACTO en que el service
 * bajo prueba hace sus llamadas a `.schema().from()...`. Cada resultado se
 * consume una sola vez. Soporta encadenar cualquier método builder
 * (select/eq/in/order/limit/insert/update/delete) — todos devuelven el
 * mismo builder — y resuelve al awaitear, ya sea directo o a través de
 * `.maybeSingle()` / `.single()`.
 */
export type ResultadoMock = { data: any; error: any }

export function crearSupabaseMock(cola: ResultadoMock[]) {
  const llamadas: { schema?: string; from?: string }[] = []
  let i = 0

  function siguienteResultado(): ResultadoMock {
    if (i >= cola.length) {
      throw new Error(`El mock de supabase se quedó sin resultados en la llamada #${i + 1} (cola de ${cola.length}).`)
    }
    return cola[i++]
  }

  function builder(ctx: { schema?: string; from?: string }) {
    const resultado = () => siguienteResultado()
    const thenable: any = {
      select: () => thenable,
      eq: () => thenable,
      in: () => thenable,
      order: () => thenable,
      limit: () => thenable,
      like: () => thenable,
      insert: () => thenable,
      update: () => thenable,
      delete: () => thenable,
      maybeSingle: () => Promise.resolve(resultado()),
      single: () => Promise.resolve(resultado()),
      // awaitear el builder directo (ej. `await supabase.schema(...).from(...).update(...).eq(...)`)
      then: (resolve: any, reject: any) => Promise.resolve(resultado()).then(resolve, reject),
    }
    return thenable
  }

  const cliente: any = {
    schema: (schema: string) => ({
      from: (from: string) => {
        llamadas.push({ schema, from })
        return builder({ schema, from })
      },
    }),
    from: (from: string) => {
      llamadas.push({ from })
      return builder({ from })
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: 'https://x/y' }, error: null }),
      }),
    },
  }

  return { cliente, llamadas }
}
