import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('el navegador arranca a 390x844', async ({ page }) => {
  await page.setContent('<h1>WMS</h1>')
  expect(await page.evaluate(() => innerWidth)).toBe(390)
})
