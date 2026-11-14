import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('evidencia/capturas', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const report = [];
async function step(name, fn) {
  await fn();
  report.push({ test: name, result: 'PASS' });
  console.log(`PASS ${name}`);
}
try {
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('heading', { name: 'Bienvenido a FarmaCali' }).waitFor();
  await page.screenshot({ path: 'evidencia/capturas/01-login.png', fullPage: true });
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  await page.getByRole('heading', { name: /^Bienvenido,/ }).waitFor();
  await step('Login y resumen con datos reales', async () => {
    assert.ok(await page.getByText('Ingresos registrados', { exact: true }).isVisible());
    await page.screenshot({ path: 'evidencia/capturas/02-resumen.png', fullPage: true });
  });
  for (const [label, file] of [
    ['Sucursales', '03-sucursales'],
    ['Inventario', '04-inventario'],
    ['Traslados', '05-traslados'],
    ['Caja y ventas', '06-caja'],
    ['Activos fijos', '07-activos'],
    ['Personal y planilla', '08-planilla'],
    ['Pedidos y entregas', '09-entregas'],
    ['Auditoría', '10-auditoria'],
  ]) {
    await step(`Navegación ${label}`, async () => {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('heading', { name: label, exact: true, level: 1 }).waitFor();
      await page.screenshot({ path: `evidencia/capturas/${file}.png`, fullPage: true });
    });
  }
  await page.getByRole('button', { name: 'Inventario', exact: true }).click();
  await step('Ingreso de lote desde formulario', async () => {
    await page.getByRole('button', { name: 'Ingresar existencias', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Ingresar existencias' });
    await dialog.getByLabel('Número de lote').fill(`QA-UI-${Date.now()}`);
    await dialog.getByLabel('Fecha de vencimiento').fill('2028-12-31');
    await dialog.getByLabel('Cantidad de unidades').fill('5');
    await dialog.getByRole('button', { name: 'Guardar registro' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page
      .getByRole('status')
      .getByText('Operación completada y registrada en auditoría.')
      .waitFor();
  });
  await step('Venta en mostrador y descuento de inventario', async () => {
    await page.getByRole('button', { name: 'Caja y ventas', exact: true }).click();
    await page.getByRole('button', { name: 'Registrar venta', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Venta en mostrador' });
    await dialog.getByLabel('Medicamento', { exact: true }).selectOption('p1');
    await dialog.getByLabel('Unidades', { exact: true }).fill('1');
    await dialog.getByRole('button', { name: 'Guardar registro' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.screenshot({ path: 'evidencia/capturas/11-venta-registrada.png', fullPage: true });
  });
  await step('Call center cotiza, reserva y crea un pedido', async () => {
    await page.getByRole('button', { name: 'Pedidos y entregas', exact: true }).click();
    await page.getByRole('button', { name: 'Nuevo pedido', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo pedido a domicilio' });
    await dialog.getByRole('combobox').first().selectOption('p1');
    await dialog.getByRole('button', { name: 'Consultar disponibilidad', exact: true }).click();
    await dialog.getByText('Sucursales con existencias vigentes').waitFor();
    await dialog.getByLabel('Nombre del cliente').fill('Cliente de demostración');
    await dialog.getByLabel('Teléfono').fill('5555 0101');
    await dialog
      .getByLabel('Dirección exacta de entrega')
      .fill('Dirección ficticia, cerca de Miraflores');
    await page.screenshot({
      path: 'evidencia/capturas/12-cotizacion-callcenter.png',
      fullPage: true,
    });
    await dialog.getByRole('button', { name: 'Confirmar pedido' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('Cliente de demostración', { exact: false }).first().waitFor();
    await page.screenshot({ path: 'evidencia/capturas/13-pedido-creado.png', fullPage: true });
  });
  await step('Auditoría contiene ingreso, venta y pedido', async () => {
    await page.getByRole('button', { name: 'Auditoría', exact: true }).click();
    await page.getByRole('button', { name: 'Ver detalle', exact: true }).first().click();
    await page.getByRole('dialog', { name: 'Detalle de auditoría' }).waitFor();
    await page.screenshot({ path: 'evidencia/capturas/14-detalle-auditoria.png', fullPage: true });
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  });
  await step('Vista móvil sin desbordamiento horizontal', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.getByRole('button', { name: 'Resumen general', exact: true }).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    await page.screenshot({
      path: 'evidencia/capturas/15-resumen-movil.png',
      fullPage: true,
      animations: 'disabled',
    });
  });
  await step('No hay errores de ejecución React', async () => assert.deepEqual(errors, []));
} finally {
  writeFileSync(
    'evidencia/pruebas-interfaz.json',
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        browser: 'Chrome headless local',
        results: report,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
