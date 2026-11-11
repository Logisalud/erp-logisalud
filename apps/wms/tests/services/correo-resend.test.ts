import { describe, expect, it, vi } from 'vitest'
import { correoConfigurado, enviarCorreo } from '@/services/correo/resend'

const correo = { para: ['a@x.com'], asunto: 'Asunto', texto: 'Texto', html: '<p>Texto</p>', clave: 'guia-lista-TTT1-1' }
const env = { RESEND_API_KEY: 're_clave_de_prueba', RESEND_FROM: 'WMS LOGISALUD <avisos@ejemplo.com>' }

describe('envío por Resend', () => {
  it('sin clave o sin remitente no envía nada ni llama a la red', async () => {
    const red = vi.fn()
    expect(correoConfigurado({})).toBe(false)
    expect(correoConfigurado(env)).toBe(true)
    expect(await enviarCorreo(correo, { RESEND_API_KEY: 'x' }, red as unknown as typeof fetch)).toMatchObject({ ok: false })
    expect(await enviarCorreo({ ...correo, para: [] }, env, red as unknown as typeof fetch)).toEqual({ ok: false, motivo: 'No hay a quién avisar' })
    expect(red).not.toHaveBeenCalled()
  })
  it('envía a la API de Resend con la clave, el remitente y la clave de idempotencia', async () => {
    const red = vi.fn(async () => new Response(JSON.stringify({ id: 'abc' }), { status: 200 }))
    expect(await enviarCorreo(correo, env, red as unknown as typeof fetch)).toEqual({ ok: true, id: 'abc' })
    const [url, init] = red.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_clave_de_prueba')
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('guia-lista-TTT1-1')
    expect(JSON.parse(String(init.body))).toMatchObject({ from: env.RESEND_FROM, to: ['a@x.com'], subject: 'Asunto' })
  })
  it('un error de Resend o de red se devuelve, no se lanza', async () => {
    expect(await enviarCorreo(correo, env, (async () => new Response('', { status: 422 })) as unknown as typeof fetch)).toEqual({ ok: false, motivo: 'Resend respondió 422' })
    expect(await enviarCorreo(correo, env, (async () => { throw new Error('sin red') }) as unknown as typeof fetch)).toEqual({ ok: false, motivo: 'sin red' })
  })
})
