import { defineConfig } from '@playwright/test'

// Prueba de humo contra una URL YA DESPLEGADA (la Preview de Vercel), no contra `next start` local (D-177).
// Por qué existe: los PDF funcionaron siempre en local y en la CI y estaban rotos en Vercel (faltaban archivos de
// pdfkit en la función serverless). Solo se ve contra lo desplegado.
//
//   WMS_PREVIEW_URL                    obligatoria. Ej.: https://erp-logisalud-wms-git-feat-wms-os-int-logisalud.vercel.app
//   VERCEL_AUTOMATION_BYPASS_SECRET    opcional. Si la Preview tiene «Vercel Authentication» activa, es el secreto de
//                                      «Protection Bypass for Automation»; se manda en el header x-vercel-protection-bypass.
//                                      Va como secreto de GitHub, nunca en el repo. Sin protección, no hace falta.
const url = (process.env.WMS_PREVIEW_URL ?? '').replace(/\/+$/, '')
const secreto = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

export default defineConfig({
  testDir: './e2e-preview',
  workers: 1,
  fullyParallel: false,
  retries: 1, // una función en frío puede tardar; un error real falla dos veces igual
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: url || undefined,
    extraHTTPHeaders: {
      Cookie: 'wms_demo_rol=jefe_transporte',
      ...(secreto ? { 'x-vercel-protection-bypass': secreto } : {}),
    },
    locale: 'es-PE',
  },
})
