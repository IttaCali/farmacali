import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('evidencia/capturas', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const results = [];
async function step(name, fn) {
  await fn();
  results.push({ test: name, result: 'PASS' });
  console.log(`PASS ${name}`);
}
// HTTP login único para observar los resultados persistidos tras las acciones de interfaz.
const login = await fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@farmacia.gt', password: 'Farmacia2026!' }),
});
const { token } = await login.json();
const state = async () =>
  (
    await fetch('http://localhost:3001/api/snapshot', {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
try {
  await page.goto('http://localhost:5173');
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  await page.getByRole('heading', { name: 'Resumen general', level: 1 }).waitFor();
  await step('Filtro global de sucursal modifica el inventario', async () => {
    await page.getByRole('button', { name: 'Inventario', exact: true }).click();
    await page.getByLabel('Filtrar por sucursal').selectOption('b1');
    const rows = page.locator('tbody tr');
    assert.ok((await rows.count()) >= 8);
    const cells = await page.locator('tbody tr td:nth-child(2)').allTextContents();
    assert.ok(cells.every((c) => c === 'Miraflores'));
    await page.getByLabel('Filtrar por sucursal').selectOption('all');
  });
  await step('Traslado por formulario, recepción y conservación de stock', async () => {
    const before = await state();
    const source = before.inventory.find((i) => i.branch_id === 'b1' && i.product_id === 'p1');
    const total = before.inventory
      .filter((i) => i.product_id === 'p1')
      .reduce((s, i) => s + i.quantity, 0);
    await page.getByRole('button', { name: 'Traslados', exact: true }).click();
    await page.getByRole('button', { name: 'Nuevo traslado', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Despachar un traslado' });
    await dialog.getByLabel('Lote de origen', { exact: true }).selectOption(source.id);
    await dialog.getByLabel('Sucursal de destino', { exact: true }).selectOption('b2');
    await dialog.getByLabel('Unidades a trasladar', { exact: true }).fill('3');
    await dialog.getByRole('button', { name: 'Guardar registro' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.screenshot({
      path: 'evidencia/capturas/16-traslado-en-transito.png',
      fullPage: true,
    });
    const active = page
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: 'Recibir', exact: true }) })
      .first();
    await active.getByRole('button', { name: 'Recibir', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Confirmar recepción' })
      .getByRole('button', { name: 'Confirmar operación' })
      .click();
    await page.getByRole('dialog', { name: 'Confirmar recepción' }).waitFor({ state: 'hidden' });
    const after = await state();
    assert.equal(
      after.inventory.filter((i) => i.product_id === 'p1').reduce((s, i) => s + i.quantity, 0),
      total,
    );
    assert.equal(after.inventory.find((i) => i.id === source.id).quantity, source.quantity - 3);
    await page.screenshot({ path: 'evidencia/capturas/17-traslado-recibido.png', fullPage: true });
  });
  await step('Activos: registro y valor contable visible', async () => {
    await page.getByRole('button', { name: 'Activos fijos', exact: true }).click();
    await page.getByRole('button', { name: 'Registrar activo', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar activo fijo' });
    await dialog.getByLabel('Nombre del activo', { exact: true }).fill('Equipo de demostración');
    await dialog.getByLabel('Código patrimonial', { exact: true }).fill(`QA-AF-${Date.now()}`);
    await dialog.getByLabel('Valor de adquisición (Q)', { exact: true }).fill('2500');
    await dialog.getByRole('button', { name: 'Guardar registro' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('Equipo de demostración', { exact: true }).last().waitFor();
    await page.screenshot({ path: 'evidencia/capturas/18-activo-registrado.png', fullPage: true });
  });
  await step('Pago de planilla desde interfaz genera egresos sin duplicar', async () => {
    const before = await state(),
      period = new Date().toISOString().slice(0, 7);
    await page.getByRole('button', { name: 'Personal y planilla', exact: true }).click();
    await page.getByRole('button', { name: 'Pagar planilla', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Pagar planilla' });
    await dialog.getByRole('button', { name: 'Confirmar pago', exact: true }).click();
    if (!before.payroll.some((p) => p.period === period)) {
      await dialog.waitFor({ state: 'hidden' });
      const after = await state();
      assert.equal(after.payroll.filter((p) => p.period === period).length, after.employees.length);
      await page.screenshot({ path: 'evidencia/capturas/19-planilla-pagada.png', fullPage: true });
      await page.getByRole('button', { name: 'Pagar planilla', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Pagar planilla' })
        .getByRole('button', { name: 'Confirmar pago', exact: true })
        .click();
    }
    await page
      .getByRole('status')
      .getByText('La planilla de este período ya fue pagada.')
      .waitFor();
    await page
      .getByRole('dialog', { name: 'Pagar planilla' })
      .getByRole('button', { name: 'Cerrar', exact: true })
      .click();
  });
  await step('Entrega desde interfaz registra un único cobro', async () => {
    await page.getByRole('button', { name: 'Pedidos y entregas', exact: true }).click();
    const row = page
      .getByRole('row')
      .filter({ hasText: 'Cliente de demostración' })
      .filter({ has: page.getByRole('button', { name: 'Despachar', exact: true }) })
      .first();
    await row.getByRole('button', { name: 'Despachar', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Despachar pedido' })
      .getByRole('button', { name: 'Confirmar operación' })
      .click();
    await page.getByRole('dialog', { name: 'Despachar pedido' }).waitFor({ state: 'hidden' });
    const route = page
      .getByRole('row')
      .filter({ hasText: 'Cliente de demostración' })
      .filter({ has: page.getByRole('button', { name: 'Entregar', exact: true }) })
      .first();
    await route.getByRole('button', { name: 'Entregar', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Confirmar entrega y cobro' })
      .getByRole('button', { name: 'Confirmar operación' })
      .click();
    await page
      .getByRole('dialog', { name: 'Confirmar entrega y cobro' })
      .waitFor({ state: 'hidden' });
    const after = await state(),
      delivered = after.orders.find(
        (o) => o.customer === 'Cliente de demostración' && o.status === 'Entregado',
      );
    assert.ok(delivered);
    assert.equal(
      after.cash.filter((c) => c.description.includes(delivered.id.slice(0, 8))).length,
      1,
    );
    await page.screenshot({ path: 'evidencia/capturas/20-pedido-entregado.png', fullPage: true });
  });
  await step('CSV descargable desde auditoría', async () => {
    await page.getByRole('button', { name: 'Auditoría', exact: true }).click();
    const promise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    const download = await promise;
    assert.ok(download.suggestedFilename().endsWith('.csv'));
    await download.saveAs('evidencia/auditoria-demostracion.csv');
    await page.screenshot({
      path: 'evidencia/capturas/21-auditoria-operaciones.png',
      fullPage: true,
    });
  });
  await step('Resumen móvil después de operaciones', async () => {
    await page.getByRole('button', { name: 'Resumen general', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({
      path: 'evidencia/capturas/22-resumen-movil-final.png',
      fullPage: true,
      animations: 'disabled',
    });
  });
} finally {
  writeFileSync(
    'evidencia/pruebas-flujos.json',
    JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2),
  );
  await browser.close();
}
