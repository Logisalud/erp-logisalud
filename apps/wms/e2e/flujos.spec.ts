// Flujos del Batch 1 en los 4 viewports, con una captura por pantalla y viewport en
// docs/wms/screenshots/. Corre en modo demostración (datos de prueba, sin base real).
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, esperarMapa, esTelefono, sinDesborde } from './ayudas'

test.describe('acceso y modo demostración', () => {
  test('el login muestra el aviso DEMO y los roles de prueba', async ({ page }, info) => {
    await page.goto('/wms/login')
    await expect(page.getByTestId('banner-demo')).toContainText('DEMO')
    await expect(page.getByTestId('banner-demo')).toContainText('sin conexión a ninguna base real')
    await expect(page.getByTestId('entrar-direccion_tecnica')).toBeVisible()
    await expect(page.getByTestId('entrar-auxiliar')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'login', { completa: true })
  })

  test('sin sesión, cualquier pantalla manda al login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/wms/almacen')
    await expect(page).toHaveURL(/\/wms\/login/)
    await page.goto('/wms/productos')
    await expect(page).toHaveURL(/\/wms\/login/)
  })

  test('el aviso DEMO acompaña todas las pantallas', async ({ page }) => {
    await entrarComo(page, 'jefe_almacen')
    for (const ruta of ['/wms', '/wms/almacen', '/wms/productos']) {
      await page.goto(ruta)
      await expect(page.getByTestId('banner-demo')).toBeVisible()
    }
  })

  test('cerrar sesión devuelve al login y se pierde el acceso', async ({ page }, info) => {
    await entrarComo(page, 'auxiliar')
    if (esTelefono(info)) {
      await page.getByRole('button', { name: 'Más' }).click()
      await page.getByRole('dialog', { name: 'Más opciones' }).getByRole('button', { name: 'Cerrar sesión' }).click()
    } else {
      await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    }
    await expect(page).toHaveURL(/\/wms\/login/)
    await page.goto('/wms/almacen')
    await expect(page).toHaveURL(/\/wms\/login/)
  })
})

test.describe('inicio por rol', () => {
  test('Dirección Técnica ve lo que le toca decidir', async ({ page }, info) => {
    await entrarComo(page, 'direccion_tecnica')
    const atencion = page.getByTestId('atencion')
    await expect(atencion).toContainText('Registros sanitarios esperando tu validación')
    await expect(atencion).toContainText('Registros sanitarios vencidos')
    await expect(atencion).toContainText('Aprobados esperando su traslado')
    await sinDesborde(page)
    await capturar(page, info, 'inicio-direccion-tecnica', { completa: true })
  })

  test('Sandra ve sus productos devueltos y puede dar de alta', async ({ page }, info) => {
    await entrarComo(page, 'asistente_dt')
    await expect(page.getByTestId('atencion')).toContainText('Productos devueltos con observación')
    await expect(page.getByRole('link', { name: /Dar de alta un producto/ }).first()).toBeVisible()
    await capturar(page, info, 'inicio-asistente-dt', { completa: true })
  })

  test('el Jefe de Almacén ve ubicaciones por verificar y aprobados por trasladar', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await expect(page.getByTestId('atencion')).toContainText('Ubicaciones por verificar en sitio')
    await expect(page.getByTestId('atencion')).toContainText('Aprobados esperando su traslado a un rack')
    await expect(page.getByRole('link', { name: /Dar de alta/ })).toHaveCount(0)
    await sinDesborde(page)
    await capturar(page, info, 'inicio-jefe-almacen', { completa: true })
  })

  test('el auxiliar no ve Propietarios ni Auditoría, ni entra por URL', async ({ page }, info) => {
    await entrarComo(page, 'auxiliar')
    if (!esTelefono(info)) {
      await expect(page.getByRole('link', { name: 'Propietarios' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Auditoría' })).toHaveCount(0)
    }
    await page.goto('/wms/propietarios')
    await expect(page).toHaveURL(/\/wms\/?$/)
    await page.goto('/wms/auditoria')
    await expect(page).toHaveURL(/\/wms\/?$/)
    await page.goto('/wms/productos/nuevo')
    await expect(page).toHaveURL(/\/wms\/productos\/?$/)
    await capturar(page, info, 'inicio-auxiliar', { completa: true })
  })

  test('Administración ve los documentos por confirmar y la auditoría muestra lo último', async ({ page }) => {
    await entrarComo(page, 'admin_wms')
    await expect(page.getByTestId('atencion')).toContainText('Documentos de sustento por confirmar')
    await expect(page.getByTestId('atencion')).toContainText('3ra adenda — AJR Labs')
  })
})

test.describe('búsqueda universal (Ctrl/Cmd+K)', () => {
  test('encuentra un producto, dice dónde está y navega con el teclado', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    if (esTelefono(info)) await page.getByTestId('abrir-busqueda').click()
    else await page.keyboard.press('Control+k')
    const caja = page.getByRole('combobox', { name: /Buscar producto/ })
    await expect(caja).toBeFocused()
    await caja.fill('dapaglifozina') // con un error de tipeo no encuentra…
    await expect(page.getByTestId('busqueda-vacia')).toBeVisible()
    await caja.fill('dapagliflozina')
    const primero = page.getByRole('dialog', { name: 'Búsqueda' }).getByRole('option').first()
    await expect(primero).toContainText('Dapagliflozina')
    await expect(primero).toContainText(/unidades en \d+ ubicaciones/)
    await capturar(page, info, 'busqueda-universal')
    if (!esTelefono(info)) {
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/wms\/productos\//)
    }
  })

  test('el estado vacío explica qué se puede buscar y la búsqueda sin resultados orienta', async ({ page }, info) => {
    await entrarComo(page, 'auxiliar')
    if (esTelefono(info)) await page.getByTestId('abrir-busqueda').click()
    else await page.keyboard.press('Control+k')
    await expect(page.getByText('Escribe lo que buscas')).toBeVisible()
    await capturar(page, info, 'busqueda-universal-vacia')
    await page.getByRole('dialog', { name: 'Búsqueda' }).getByRole('combobox').fill('zzzqq')
    await expect(page.getByTestId('busqueda-vacia')).toContainText('No encontramos')
    await capturar(page, info, 'busqueda-universal-sin-resultados')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Búsqueda' })).toHaveCount(0)
  })

  test('buscar una ubicación por código', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    if (esTelefono(info)) await page.getByTestId('abrir-busqueda').click()
    else await page.keyboard.press('Control+k')
    await page.getByRole('dialog', { name: 'Búsqueda' }).getByRole('combobox').fill('A-21.1')
    await expect(page.getByRole('dialog', { name: 'Búsqueda' }).getByRole('option').first()).toContainText('Ubicación A-21.1')
  })
})

test.describe('mapa del almacén', () => {
  test('PC y tablet: el mapa completo, con capas y leyenda con números', async ({ page }, info) => {
    test.skip(esTelefono(info), 'En teléfono van la búsqueda y la ubicación en texto')
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/almacen')
    await esperarMapa(page)
    expect(await page.locator('[data-celda]').count()).toBeGreaterThan(100)
    await expect(page.getByText('¿De quién es cada ubicación?')).toBeVisible()
    await capturar(page, info, 'almacen-mapa-propietario')
    await page.getByTestId('capa-estado').click()
    await expect(page.getByText('¿En qué estado está lo que hay?')).toBeVisible()
    await capturar(page, info, 'almacen-mapa-estado')
    await page.getByTestId('capa-ocupacion').click()
    await expect(page.getByText('¿Qué tan llena está?')).toBeVisible()
    await capturar(page, info, 'almacen-mapa-ocupacion')
  })

  test('buscar un lote atenúa el almacén e ilumina sus ubicaciones', async ({ page }, info) => {
    test.skip(esTelefono(info), 'En teléfono va la lista en texto')
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/almacen')
    await esperarMapa(page)
    await page.getByTestId('buscar-mapa').fill('ABC')
    await expect(page.getByTestId('resumen-busqueda')).toContainText('Encontramos 168 unidades en 2 ubicaciones')
    await expect(page.locator('[data-celda][data-coincide="1"]')).toHaveCount(2)
    await expect(page.locator('[data-celda][data-coincide="0"]').first()).toHaveAttribute('opacity', '0.2')
    await capturar(page, info, 'almacen-busqueda-resaltada')
  })

  test('el drawer muestra el rack de frente: el lote ABC tiene unidades Aprobadas y otras en Cuarentena', async ({ page }, info) => {
    test.skip(esTelefono(info), 'En teléfono el drawer se prueba desde la lista')
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/almacen?buscar=ABC')
    await esperarMapa(page)
    await page.locator('[data-celda="A-21"]').click()
    const drawer = page.getByTestId('drawer-posicion')
    await expect(drawer).toContainText('A-21')
    await expect(drawer).toContainText(/vista frontal/i)
    await expect(drawer.getByTestId('nivel')).toHaveCount(4)
    await expect(drawer.getByText('Aprobado', { exact: true }).first()).toBeVisible()
    await capturar(page, info, 'almacen-drawer-rack')
    await page.getByTestId('cerrar-drawer').click()
    await page.locator('[data-celda="A-8"]').click()
    await expect(page.getByTestId('drawer-posicion')).toContainText('Cuarentena')
    await expect(page.getByTestId('drawer-posicion')).toContainText('Lote ABC')
    await capturar(page, info, 'almacen-drawer-cuarentena')
  })

  test('los subracks y las posiciones por verificar se explican en el drawer', async ({ page }, info) => {
    test.skip(esTelefono(info))
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/almacen?ver=E-8')
    await expect(page.getByTestId('drawer-posicion')).toContainText('Nivel 1 · subracks')
    await expect(page.getByTestId('drawer-posicion')).toContainText('Subrack 4')
    await capturar(page, info, 'almacen-drawer-subracks')
    await page.goto('/wms/almacen?ver=I-8')
    await expect(page.getByTestId('drawer-posicion')).toContainText('Por verificar en sitio')
    await expect(page.getByTestId('drawer-posicion')).toContainText('sin propietario')
  })

  test('el zoom y el ajuste mueven el mapa', async ({ page }, info) => {
    test.skip(esTelefono(info))
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/almacen')
    await esperarMapa(page)
    const t0 = await page.locator('[data-testid="mapa"] svg > g').getAttribute('transform')
    await page.getByRole('button', { name: 'Acercar' }).click()
    const t1 = await page.locator('[data-testid="mapa"] svg > g').getAttribute('transform')
    expect(t1).not.toBe(t0)
    await page.getByTestId('ajustar-mapa').click()
    expect(await page.locator('[data-testid="mapa"] svg > g').getAttribute('transform')).toBe(t0)
  })

  test('la capa "por verificar" muestra solo esas ubicaciones', async ({ page }, info) => {
    test.skip(esTelefono(info))
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/almacen?capa=verificar')
    await expect(page.getByTestId('resumen-busqueda')).toContainText('por verificar en sitio')
    expect(await page.locator('[data-celda][data-coincide="1"]').count()).toBeGreaterThanOrEqual(3)
  })

  test('teléfono: búsqueda y ubicación en texto, sin mapa', async ({ page }, info) => {
    test.skip(!esTelefono(info), 'Solo teléfono')
    await entrarComo(page, 'auxiliar')
    await page.goto('/wms/almacen')
    await expect(page.getByTestId('mapa')).toBeHidden()
    await expect(page.getByTestId('lista-ubicaciones')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'almacen-lista-racks')
    await page.getByTestId('buscar-mapa').fill('dapagliflozina')
    await expect(page.getByTestId('lista-ubicaciones').getByRole('button').first()).toContainText('Dapagliflozina')
    await sinDesborde(page)
    await capturar(page, info, 'almacen-busqueda-texto')
    await page.getByTestId('lista-ubicaciones').getByRole('button').first().click()
    await expect(page.getByTestId('drawer-posicion')).toBeVisible()
    await capturar(page, info, 'almacen-drawer-telefono')
    await page.getByTestId('cerrar-drawer').click()
    await page.getByTestId('buscar-mapa').fill('zzzqq')
    await expect(page.getByTestId('sin-resultados')).toBeVisible()
    await capturar(page, info, 'almacen-sin-resultados-telefono')
  })

  test('el mapa y la lista nunca dependen solo del color: llevan letra o texto', async ({ page }, info) => {
    test.skip(esTelefono(info))
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/almacen')
    await esperarMapa(page)
    const celda = page.locator('[data-celda="J-5"]')
    await expect(celda).toContainText('J-5')
    await expect(celda).toContainText('D') // letra del propietario (Diphasac)
    await expect(celda).toHaveAttribute('aria-label', /Diphasac/)
  })
})

test.describe('productos y registro sanitario', () => {
  test('la lista muestra registro, vencimiento y validación', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/productos')
    await expect(page.getByTestId('conteo-productos')).toContainText('productos')
    await expect(page.locator('span:visible:has-text("Registro vencido")').first()).toBeVisible()
    await expect(page.locator('span:visible:has-text("Por vencer")').first()).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'productos-lista', { completa: true })
  })

  test('filtrar por "Por validar" y por texto; sin resultados se explica', async ({ page }, info) => {
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/productos?validacion=PENDIENTE')
    await expect(page.getByTestId('conteo-productos')).toContainText(/de \d+ productos/)
    await page.goto('/wms/productos?q=zzzqq')
    await expect(page.getByTestId('productos-vacio')).toContainText('Ningún producto coincide')
    await sinDesborde(page)
    await capturar(page, info, 'productos-sin-resultados')
  })

  test('el detalle muestra dónde está el producto y su estado por unidad', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/productos?q=dapagliflozina')
    await page.getByRole('link', { name: /Dapagliflozina 10 mg/ }).first().click()
    await expect(page.getByRole('heading', { name: /Dapagliflozina 10 mg/ })).toBeVisible()
    await expect(page.getByText(/unidades en \d+ ubicaciones/).first()).toBeVisible()
    await expect(page.getByText('Aprobado', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Cuarentena', { exact: true }).first()).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'producto-detalle', { completa: true })
  })

  test('un registro vencido avisa y explica qué implica', async ({ page }, info) => {
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/productos?rs=VENCIDO')
    await page.getByRole('link', { name: /Azitromicina/ }).first().click()
    await expect(page.getByRole('alert').filter({ hasText: 'venció hace' })).toContainText('no se pueden aprobar')
    await capturar(page, info, 'producto-rs-vencido', { completa: true })
  })

  test('Sandra da de alta un producto: queda por validar; un código repetido se explica', async ({ page }, info) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/productos/nuevo')
    await capturar(page, info, 'producto-alta-vacio', { completa: true })
    await page.getByTestId('guardar-producto').click()
    await expect(page.locator('#campo-codigo-error')).toContainText('Escribe el código')
    await expect(page.locator('#campo-descripcion-error')).toContainText('Escribe el nombre')
    await capturar(page, info, 'producto-alta-errores', { completa: true })

    const codigo = `PRB-${info.project.name.slice(0, 5)}-${Date.now().toString(36)}`
    await page.fill('#campo-codigo', codigo)
    await page.fill('#campo-descripcion', 'Producto de prueba E2E 5 mg')
    await page.fill('#campo-registroSanitario', 'EG-99001')
    await page.fill('#campo-rsVence', '06/2031') // solo mes y año → último día del mes
    await page.getByTestId('guardar-producto').click()
    await expect(page.getByTestId('producto-creado')).toContainText('Listo')
    await expect(page.getByText('Por validar').first()).toBeVisible()
    await expect(page.getByText('30 jun 2031')).toBeVisible()
    await capturar(page, info, 'producto-alta-exito', { completa: true })

    await page.goto('/wms/productos/nuevo')
    await page.fill('#campo-codigo', codigo)
    await page.fill('#campo-descripcion', 'Repetido')
    await page.getByTestId('guardar-producto').click()
    await expect(page.getByTestId('error-formulario')).toContainText(`Ya existe un producto con el código ${codigo}`)
  })

  test('una fecha imposible se rechaza con un mensaje humano', async ({ page }) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/productos/nuevo')
    await page.fill('#campo-codigo', 'PRB-FECHA')
    await page.fill('#campo-descripcion', 'Fecha mala')
    await page.fill('#campo-registroSanitario', 'EG-1')
    await page.fill('#campo-rsVence', '31/02/2030')
    await page.getByTestId('guardar-producto').click()
    await expect(page.locator('#campo-rsVence-error')).toContainText('No entiendo esa fecha')
  })

  test('Katia valida (queda registrado) y observar exige decir qué pasa', async ({ page }, info) => {
    await entrarComo(page, 'direccion_tecnica')
    await page.goto('/wms/productos?validacion=PENDIENTE')
    await page.locator('main a[href*="/productos/prod"]:visible').first().click()
    await expect(page.getByTestId('panel-validacion')).toBeVisible()
    await capturar(page, info, 'producto-validar', { completa: true })
    await page.getByTestId('observar-producto').click()
    await expect(page.getByTestId('mensaje-error')).toContainText('decir qué falta')
    await page.fill('#observacion', 'El vencimiento no coincide con el certificado.')
    await page.getByTestId('observar-producto').click()
    await expect(page.getByTestId('mensaje-ok')).toContainText('Devolvimos el producto')
  })

  test('Sandra no ve el panel de validación', async ({ page }) => {
    await entrarComo(page, 'asistente_dt')
    await page.goto('/wms/productos?validacion=PENDIENTE')
    await page.locator('main a[href*="/productos/prod"]:visible').first().click()
    await expect(page.getByTestId('panel-validacion')).toHaveCount(0)
  })

  test('un producto inexistente muestra una pantalla amable', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/productos/no-existe')
    await expect(page.getByRole('heading', { name: 'No encontramos eso' })).toBeVisible()
    await capturar(page, info, 'no-encontrado')
  })
})

test.describe('propietarios y auditoría', () => {
  test('Propietarios: asignaciones con vigencia y documento; la adenda de AJR queda por confirmar', async ({ page }, info) => {
    await entrarComo(page, 'admin_wms')
    await page.goto('/wms/propietarios')
    await expect(page.getByTestId('propietario-AJR_LABS')).toContainText('Firma por confirmar')
    await expect(page.getByTestId('propietario-AJR_LABS')).toContainText('19')
    await expect(page.getByTestId('propietario-LOGISSA')).toContainText('Dueño del almacén')
    await expect(page.getByText('I-8.1').first()).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'propietarios', { completa: true })
  })

  test('Auditoría: quién, qué, cuándo y por qué', async ({ page }, info) => {
    await entrarComo(page, 'auditoria_lectura')
    await page.goto('/wms/auditoria')
    await expect(page.getByTestId('lista-auditoria')).toContainText('Administración (demo)')
    await sinDesborde(page)
    await capturar(page, info, 'auditoria', { completa: true })
  })
})
