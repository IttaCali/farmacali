import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startQa, Client } from './qa-server.mjs';
import { totpFor } from '../server/models/authentication.js';
import { navigate } from './ui-navigation.mjs';
const qa = await startQa(),
  browser = await chromium.launch({ channel: 'chrome', headless: true });
const dir = 'evidencia/rediseno';
mkdirSync(dir, { recursive: true });
const errors = [],
  results = [];
const noOverflow = async (p) =>
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
const shot = async (p, name) =>
  p.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: 'disabled' });
try {
  const login = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login.goto(qa.base);
  await login.getByRole('heading', { name: 'Bienvenido a FarmaCali', exact: true }).waitFor();
  assert.equal(await login.locator('.demo-roles button').count(), 4);
  assert.equal(await login.locator('.optional-access').getAttribute('open'), null);
  await shot(login, '01-acceso-escritorio');
  await login.setViewportSize({ width: 390, height: 844 });
  await noOverflow(login);
  await shot(login, '02-acceso-movil');
  for (const [role, email, password] of [
    ['admin', 'admin@farmacia.gt', 'Farmacia2026!'],
    ['callcenter', 'callcenter@farmacia.gt', 'Operador2026!'],
    ['branch', 'sucursal@farmacia.gt', 'Sucursal2026!'],
    ['auditor', 'auditor@farmacia.gt', 'Auditor2026!'],
  ]) {
    const client = new Client(qa.base);
    let r = await client.request('/auth/login', { email, password });
    if (r.data.step === 'enroll')
      r = await client.request('/auth/complete', {
        challenge: r.data.challenge,
        code: totpFor(r.data.secret).generate(),
      });
    assert.equal(r.status, 200);
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await c.addCookies(client.browserCookies());
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(qa.base);
    await p.getByRole('heading', { name: /^Bienvenido,/ }).waitFor();
    const nav = p.getByRole('navigation', { name: 'Módulos del sistema', exact: true });
    await nav.waitFor();
    assert.equal(await p.locator('aside.sidebar').count(), 0, 'El diseño no tiene barra lateral');
    const buttons = nav.getByRole('button');
    const menu = await buttons.evaluateAll((items) =>
      items.map((item) => item.getAttribute('aria-label') || item.textContent.trim()),
    );
    assert.equal(new Set(menu).size, menu.length);
    for (const button of await buttons.all()) {
      const bounds = await button.boundingBox();
      assert.ok(bounds && bounds.height >= 48, 'Los módulos tienen botones grandes');
    }
    for (const label of [
      'Planilla detallada',
      'Coordinación de entregas',
      'Avisos simulados',
      'Kardex',
      'Recetas',
      'Riesgo y mapa',
    ])
      assert.equal(await nav.getByRole('button', { name: label, exact: true }).count(), 0);
    if (role === 'callcenter') assert.equal(menu.length, 3);
    if (role === 'admin') {
      assert.equal(await p.locator('.stat-chart svg').count(), 4);
      assert.equal(
        await p
          .locator('.stat-chart svg')
          .evaluateAll((items) => items.some((el) => /NaN|undefined/.test(el.outerHTML))),
        false,
      );
      assert.equal(
        await p
          .locator('.records-viewport')
          .first()
          .evaluate((el) => getComputedStyle(el).overflowY),
        'auto',
      );
    }
    await shot(p, `03-${role}-escritorio`);
    await navigate(p, 'Pedidos y entregas');
    await p.getByRole('navigation', { name: 'Secciones del módulo' }).waitFor();
    for (const width of [390, 768, 1024, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      await noOverflow(p);
      await shot(p, `04-${role}-pedidos-${width}`);
      const toggle = p.getByRole('button', { name: 'Ver módulos', exact: true });
      if (await toggle.isVisible()) {
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await nav.waitFor();
        await noOverflow(p);
        await shot(p, `05-${role}-menu-${width}`);
        await p.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await navigate(p, 'Inventario');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await noOverflow(p);
        await navigate(p, 'Pedidos y entregas');
      } else {
        await nav.waitFor();
        assert.equal(
          await nav.evaluate((el) =>
            Boolean(
              el.compareDocumentPosition(document.querySelector('h1')) &
              Node.DOCUMENT_POSITION_FOLLOWING,
            ),
          ),
          true,
          'Los módulos están arriba del contenido central',
        );
      }
    }
    if (role === 'admin') {
      for (const label of [
        'Catálogo',
        'Kardex',
        'Planilla detallada',
        'Coordinación de entregas',
        'Avisos simulados',
        'Recetas',
        'Riesgo y mapa',
      ])
        await navigate(p, label);
      for (const label of ['Sucursales', 'Activos fijos', 'Personal y planilla']) {
        await navigate(p, label);
        assert.equal(await p.getByRole('heading', { name: /Mantenimiento/ }).count(), 0);
        await p.getByRole('button', { name: 'Editar', exact: true }).first().click();
        const dialog = p.getByRole('dialog', { name: 'Editar registro', exact: true });
        await dialog.waitFor();
        await p.setViewportSize({ width: 390, height: 900 });
        await noOverflow(p);
        assert.equal(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth), false);
        await shot(p, `06-editar-${label.replaceAll(' ', '-')}-movil`);
        await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
        await p.setViewportSize({ width: 1440, height: 900 });
      }
      await navigate(p, 'Inventario');
      assert.equal(await p.getByRole('heading', { name: /Mantenimiento/ }).count(), 0);
      await p.getByRole('button', { name: 'Ver lotes y movimientos', exact: true }).first().click();
      await p.getByRole('button', { name: 'Solicitar ajuste', exact: true }).first().click();
      const dialog = p.getByRole('dialog', { name: 'Solicitar revisión', exact: true });
      await dialog.getByLabel('Ajuste de unidades (+ / −)', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await p.setViewportSize({ width: 390, height: 900 });
      await noOverflow(p);
      const inventoryRows = p.locator('.record-table tbody tr');
      assert.ok(
        (await inventoryRows.count()) <= 5,
        'El celular muestra bloques cortos y paginados',
      );
      assert.equal(
        await inventoryRows.first().evaluate((el) => getComputedStyle(el).display),
        'block',
      );
      assert.ok(
        (await inventoryRows.first().locator('.record-field-label').count()) >= 6,
        'Cada valor conserva su etiqueta',
      );
      await shot(p, '08-inventario-tarjetas-movil');
      await navigate(p, 'Activos fijos');
      assert.equal(
        await p
          .locator('.stats-grid.three .stat>strong')
          .evaluateAll((nodes) => nodes.every((el) => el.scrollWidth <= el.clientWidth)),
        true,
        'Los importes no se cortan',
      );
      await p.evaluate(() => document.fonts.ready);
      assert.equal(await p.evaluate(() => document.fonts.check('14px Manrope')), true);
      await shot(p, '09-activos-tarjetas-movil');
      results.push(
        'Editar sucursal, activo y empleado desde el registro principal; ajuste desde inventario sin tabla repetida: PASS',
      );
    }
    await p.setViewportSize({ width: 390, height: 900 });
    await p.getByRole('button', { name: 'Abrir menú de usuario', exact: true }).click();
    await p.getByRole('button', { name: 'Mi perfil', exact: true }).click();
    await p.getByRole('dialog', { name: 'Mi perfil', exact: true }).waitFor();
    await noOverflow(p);
    await shot(p, `06-${role}-perfil-movil`);
    results.push(
      `${role}: navegación superior sin duplicados, botones grandes, panel central sin cambiar URL ni abrir pestañas, 390/768/1024/1440px y perfil móvil: PASS`,
    );
    await c.close();
  }
  const portal = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await portal.goto(qa.base + '/portal');
  await portal.getByRole('heading', { name: '1. Elige tu sucursal', exact: true }).waitFor();
  await noOverflow(portal);
  await shot(portal, '07-portal-movil');
  assert.deepEqual(errors, []);
  results.push('Cuatro accesos principales, reparto opcional y portal con nueva paleta: PASS');
  writeFileSync(
    `${dir}/resultados.json`,
    JSON.stringify({ date: new Date().toISOString(), results, errors }, null, 2),
  );
  console.log(results.join('\n'));
} catch (e) {
  for (const c of browser.contexts())
    for (const p of c.pages()) await shot(p, 'error').catch(() => {});
  throw e;
} finally {
  await browser.close();
  qa.stop();
}
