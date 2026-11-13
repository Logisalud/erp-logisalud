// Stock del cliente en la demo (espejo de tests/db/stock-cliente.test.ts): solo su stock, sin ubicaciones, enlaces con token que solo guardan su hash, límite de intentos y permisos.
import { beforeEach, describe, expect, it } from 'vitest'
import { tokenDemoStock } from '@/services/demo/stock-cliente-demo'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const ADMIN = actor('admin', 'admin_wms'); const JEFE = actor('jefe', 'jefe_almacen')
let repo: RepositorioDemo
const TOKEN_AJR = tokenDemoStock('AJR_LABS')
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; process.env.WMS_DEMO_LOCAL = '1'
  repo = new RepositorioDemo()
})
const idDe = async (codigo: string) => (await repo.panorama()).propietarios.find((p) => p.codigo === codigo)!.id

describe('el enlace de prueba de cada cliente', () => {
  it('muestra SOLO su stock, por producto y lote, con el código del cliente y sin ubicaciones', async () => {
    const r = await repo.consultarStockCliente(TOKEN_AJR, '1.1.1.1')
    if (r.estado !== 'OK') throw new Error(r.estado)
    expect(r.cliente.codigo).toBe('AJR_LABS')
    expect(r.productos.length).toBeGreaterThan(0)
    expect(r.productos.every((p) => p.lotes.length > 0 && p.stock === p.lotes.reduce((t, l) => t + l.stock, 0))).toBe(true)
    expect(r.productos.every((p) => p.codigoCliente && /^AJR/.test(p.codigoCliente))).toBe(true)
    const p = await repo.panorama()
    const lotesAjenos = new Set(p.lotes.filter((l) => l.propietarioId !== (p.propietarios.find((x) => x.codigo === 'AJR_LABS')!.id)).map((l) => l.id))
    expect(r.productos.flatMap((x) => x.lotes).some((l) => lotesAjenos.has(l.loteId))).toBe(false)
    const texto = JSON.stringify(r)
    for (const pos of p.posiciones.slice(0, 40)) expect(texto).not.toContain(`"${pos.codigo}"`)
    expect(texto).not.toMatch(/posicion|ubicaci/i)
  })

  it('cada cliente ve lo suyo; el dueño del almacén (Logissa) no tiene enlace', async () => {
    const a = await repo.consultarStockCliente(tokenDemoStock('AJR_LABS'), '1.1.1.1'); const m = await repo.consultarStockCliente(tokenDemoStock('MEDIC_PHARMA_LAB'), '1.1.1.1')
    if (a.estado !== 'OK' || m.estado !== 'OK') throw new Error('no ok')
    expect(a.cliente.codigo).not.toBe(m.cliente.codigo)
    expect(new Set(a.productos.flatMap((x) => x.lotes.map((l) => l.loteId))).size).toBeGreaterThan(0)
    const solapan = a.productos.flatMap((x) => x.lotes.map((l) => l.loteId)).filter((id) => m.productos.some((y) => y.lotes.some((l) => l.loteId === id)))
    expect(solapan).toEqual([])
    const e = await repo.crearEnlaceStockCliente(await idDe('LOGISSA'), 30, undefined, ADMIN)
    expect(e).toMatchObject({ ok: false, mensaje: expect.stringMatching(/no para el stock propio/) })
  })

  it('los lotes salen por vencimiento y marcan cuántos días faltan', async () => {
    const r = await repo.consultarStockCliente(TOKEN_AJR, '1.1.1.1')
    if (r.estado !== 'OK') throw new Error(r.estado)
    for (const p of r.productos) {
      const fechas = p.lotes.map((l) => l.vence ?? '9999')
      expect(fechas).toEqual([...fechas].sort())
      for (const l of p.lotes) if (l.vence) expect(l.vencido).toBe((l.dias ?? 0) < 0)
    }
  })
})

describe('el Kardex del cliente', () => {
  it('trae el Kardex de sus productos sin ubicación ni datos internos; uno solo o todos', async () => {
    const todos = await repo.consultarKardexCliente(TOKEN_AJR, {}, '1.1.1.1')
    if (todos.estado !== 'OK') throw new Error(todos.estado)
    expect(todos.cliente.codigo).toBe('AJR_LABS'); expect(todos.formato).toBeTruthy()
    expect(todos.productos.length).toBeGreaterThan(1)
    expect(todos.productos.every((p) => p.filas.length > 0)).toBe(true)
    const texto = JSON.stringify(todos)
    for (const campo of ['posicion', 'partidaId', 'movimientoId', 'motivo']) expect(texto).not.toContain(`"${campo}"`)
    const uno = await repo.consultarKardexCliente(TOKEN_AJR, { productoId: todos.productos[0].productoId }, '1.1.1.1')
    if (uno.estado !== 'OK') throw new Error(uno.estado)
    expect(uno.productos).toHaveLength(1)
    const ajeno = await repo.consultarKardexCliente(TOKEN_AJR, { productoId: '00000000-0000-4000-8000-000000000000' }, '1.1.1.1')
    expect(ajeno).toMatchObject({ estado: 'OK', productos: [] })
  })
  it('con fechas lleva el saldo inicial', async () => {
    const r = await repo.consultarKardexCliente(TOKEN_AJR, { desde: '2999-01-01' }, '1.1.1.1')
    if (r.estado !== 'OK') throw new Error(r.estado)
    expect(r.productos.every((p) => p.filas.length === 1 && p.filas[0].esSaldoInicial)).toBe(true)
  })
})

describe('los enlaces y sus límites', () => {
  it('el personal con permiso genera un enlace nuevo: el token se devuelve una vez y en la demo solo queda su hash', async () => {
    const id = await idDe('DIPHASAC')
    const r = await repo.crearEnlaceStockCliente(id, 30, 'Compras', ADMIN)
    if (!r.ok) throw new Error(r.mensaje)
    expect(r.token).toMatch(/^[0-9a-f]{128}$/)
    expect(JSON.stringify(repo.enlacesStockGuardados())).not.toContain(r.token)
    const v = await repo.consultarStockCliente(r.token, '1.1.1.1')
    expect(v).toMatchObject({ estado: 'OK', cliente: { codigo: 'DIPHASAC' } })
    const lista = (await repo.listarEnlacesStockCliente()).filter((e) => e.propietarioId === id)
    expect(lista.find((e) => e.etiqueta === 'Compras')).toMatchObject({ estado: 'VIGENTE' })
    expect(lista.find((e) => e.etiqueta === 'Compras')?.ultimaVistaEn).toBeTruthy()
  })
  it('solo el Administrador genera y revoca; la vigencia va de 1 a 365 días', async () => {
    const id = await idDe('AJR_LABS')
    expect(await repo.crearEnlaceStockCliente(id, 30, undefined, JEFE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/No tienes permiso/) })
    for (const d of [0, 366]) expect(await repo.crearEnlaceStockCliente(id, d, undefined, ADMIN)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/entre 1 y 365/) })
    const e = (await repo.listarEnlacesStockCliente())[0]
    expect(await repo.revocarEnlaceStockCliente(e.id, JEFE)).toMatchObject({ ok: false })
  })
  it('un enlace revocado, vencido o inexistente responde lo mismo, y a los 5 fallos de una IP hay espera', async () => {
    const id = await idDe('AJR_LABS')
    const r = await repo.crearEnlaceStockCliente(id, 30, 'Para revocar', ADMIN); if (!r.ok) throw new Error(r.mensaje)
    const enlace = (await repo.listarEnlacesStockCliente()).find((e) => e.etiqueta === 'Para revocar')!
    expect(await repo.revocarEnlaceStockCliente(enlace.id, ADMIN)).toEqual({ ok: true, revocado: true })
    expect(await repo.revocarEnlaceStockCliente(enlace.id, ADMIN)).toEqual({ ok: true, revocado: false })
    expect(await repo.consultarStockCliente(r.token, '2.2.2.2')).toEqual({ estado: 'NO_ENCONTRADO' })
    expect(await repo.consultarStockCliente('x'.repeat(128), '2.2.2.2')).toEqual({ estado: 'NO_ENCONTRADO' })
    repo.vencerEnlacesStockCliente()
    expect(await repo.consultarStockCliente(TOKEN_AJR, '2.2.2.2')).toEqual({ estado: 'NO_ENCONTRADO' })
    for (let i = 0; i < 5; i += 1) await repo.consultarStockCliente(`basura-${i}`, '9.9.9.9')
    expect(await repo.consultarStockCliente('otra', '9.9.9.9')).toMatchObject({ estado: 'ESPERA' })
    expect(await repo.consultarKardexCliente('otra', {}, '9.9.9.9')).toMatchObject({ estado: 'ESPERA' })
  })
  it('apagado: responde «no disponible» y no genera enlaces', async () => {
    await repo.panorama()
    repo.fijarStockClienteHabilitado(false)
    expect(await repo.consultarStockCliente(TOKEN_AJR, '1.1.1.1')).toEqual({ estado: 'NO_DISPONIBLE' })
    expect(await repo.consultarKardexCliente(TOKEN_AJR, {}, '1.1.1.1')).toEqual({ estado: 'NO_DISPONIBLE' })
    expect(await repo.crearEnlaceStockCliente(await idDe('AJR_LABS'), 30, undefined, ADMIN)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/aún no está disponible/) })
  })
})
