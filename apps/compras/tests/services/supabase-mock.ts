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
 *
 * `llamadas` registra además el payload de cada `insert`/`update`, para poder
 * afirmar QUÉ se escribió y no solo que se escribió — un pago que se registra
 * por el monto equivocado pasaría un test que solo mira que se registró.
 */
export type ResultadoMock = { data: any; error: any }
export type LlamadaMock = { schema?: string; from?: string; payload?: any }

export function crearSupabaseMock(cola: ResultadoMock[]) {
  const llamadas: LlamadaMock[] = []
  let i = 0

  function siguienteResultado(): ResultadoMock {
    if (i >= cola.length) {
      throw new Error(`El mock de supabase se quedó sin resultados en la llamada #${i + 1} (cola de ${cola.length}).`)
    }
    return cola[i++]
  }

  function builder(ctx: LlamadaMock) {
    const resultado = () => siguienteResultado()
    const thenable: any = {
      select: () => thenable,
      eq: () => thenable,
      in: () => thenable,
      order: () => thenable,
      limit: () => thenable,
      like: () => thenable,
      insert: (payload: any) => {
        ctx.payload = payload
        return thenable
      },
      update: (payload: any) => {
        ctx.payload = payload
        return thenable
      },
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
        const ctx: LlamadaMock = { schema, from }
        llamadas.push(ctx)
        return builder(ctx)
      },
    }),
    from: (from: string) => {
      const ctx: LlamadaMock = { from }
      llamadas.push(ctx)
      return builder(ctx)
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
