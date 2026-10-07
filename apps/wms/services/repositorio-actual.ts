import 'server-only'

import { modoDemoActivo } from '@/lib/demo'
import { RepositorioDemo } from './demo/repositorio-demo'
import { RepositorioSupabase } from './supabase/repositorio-supabase'
import type { Repositorio } from './repositorio'

/** Demo (datos de prueba, sin base real) solo en Preview/local; en cualquier otro caso, Supabase. */
export function repositorio(): Repositorio {
  return modoDemoActivo() ? new RepositorioDemo() : new RepositorioSupabase()
}
