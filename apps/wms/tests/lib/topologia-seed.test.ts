import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generarSqlTopologia } from '../../scripts/generar-seed-topologia'

describe('seed de topología', () => {
  it('el SQL versionado coincide con config/topologia.ts (una sola fuente)', () => {
    const versionado = readFileSync(resolve(__dirname, '../../supabase/seeds/0001_topologia.sql'), 'utf8')
    expect(versionado).toBe(generarSqlTopologia())
  })
})
