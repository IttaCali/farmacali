import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { startQa, Client } from './qa-server.mjs';
import { Database, db } from '../server/database/db.js';
import { totpFor } from '../server/models/authentication.js';
import { navigate } from './ui-navigation.mjs';
const qa = await startQa(),
  fixture = new Database('', qa.file),
  browser = await chromium.launch({ channel: 'chrome', headless: true });
mkdirSync('evidencia/mostrador', { recursive: true });
try {
  await fixture.query("UPDATE products SET component='Compuesto de demostracion' WHERE id='p1'");
  const client = new Client(qa.base);
  let login = await client.request('/auth/login', {
    email: 'callcenter@farmacia.gt',
    password: 'Operador2026!',
  });
  if (login.data.step === 'enroll')
    login = await client.request('/auth/complete', {
      challenge: login.data.challenge,
      code: totpFor(login.data.secret).generate(),
    });
  assert.ok(login.data.user);
  assert.equal(login.data.user.branch_id, 'b1');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies(client.browserCookies());
  const p = await context.newPage(),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(qa.base);
  await p.getByRole('heading', { name: /^Bienvenido,/ }).waitFor();
  assert.equal(
    await p
      .getByRole('navigation', { name: 'Módulos del sistema' })
      .getByRole('button', { name: 'Clientes', exact: true })
      .count(),
    0,
  );
  await navigate(p, 'Inventario');
  await p.getByPlaceholder('Buscar por nombre o componente...').fill('Compuesto de demostracion');
  assert.equal(await p.locator('.record-table tbody tr').count(), 1);
  await navigate(p, 'Ventas en mostrador');
  assert.equal(await p.getByLabel('Sucursal de venta').count(), 0);
  for (const name of ['Compuesto de demostracion', 'Ibuprofeno']) {
    await p.getByLabel('Buscar para venta').fill(name);
    await p
      .locator('.counter-results')
      .getByRole('button', { name: 'Agregar', exact: true })
      .click();
  }
  await p.getByLabel('Efectivo recibido Q', { exact: true }).fill('1000');
  for (const width of [320, 390, 768, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await p.screenshot({ path: 'evidencia/mostrador/cesta.png', fullPage: true });
  const response = p.waitForResponse(
    (r) => r.url().endsWith('/api/sales/cart') && r.request().method() === 'POST',
  );
  await p.getByRole('button', { name: 'Confirmar venta y cobro', exact: true }).click();
  const res = await response;
  assert.equal(res.status(), 201);
  const sale = await res.json();
  assert.ok(sale.amount_received_cents >= sale.total_cents);
  assert.equal(sale.change_cents, sale.amount_received_cents - sale.total_cents);
  await p
    .getByRole('status')
    .getByText(/Venta registrada/)
    .waitFor();
  const repeat = await client.request('/sales/cart', res.request().postDataJSON());
  assert.equal(repeat.status, 201);
  assert.equal(repeat.data.id, sale.id);
  assert.equal(
    Number(
      (
        await fixture.query('SELECT COUNT(*) AS n FROM cash_movements WHERE description=$1', [
          'Venta ' + sale.id,
        ])
      ).rows[0].n,
    ),
    1,
  );
  const tender = (
    await fixture.query(
      'SELECT amount_received_cents,change_cents FROM counter_sales WHERE order_id=$1',
      [sale.id],
    )
  ).rows[0];
  assert.equal(tender.amount_received_cents, sale.amount_received_cents);
  assert.equal(tender.change_cents, sale.change_cents);
  await navigate(p, 'Pedidos y entregas');
  assert.equal(
    await p.getByRole('button', { name: 'Consultar y crear pedido', exact: true }).count(),
    0,
  );
  assert.equal((await client.request('/orders', {})).status, 403);
  const publicClient = new Client(qa.base),
    phone = '55550192';
  const result = await publicClient.request('/portal/orders', {
    request_id: randomUUID(),
    branch_id: 'b1',
    fulfillment: 'pickup',
    customer: 'Cliente prueba cancelacion',
    phone,
    payment: 'Efectivo',
    items: [{ product_id: 'p1', quantity: 1 }],
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  await p.goto(qa.base + '/portal');
  await p.getByRole('button', { name: 'Consultar ticket', exact: true }).click();
  await p.getByLabel('Número de ticket', { exact: true }).fill(result.data.ticket);
  await p.getByLabel('Código de autorización', { exact: true }).fill(result.data.access_code);
  await p.getByRole('button', { name: 'Consultar pedido', exact: true }).click();
  await p.getByRole('button', { name: 'Cancelar este pedido', exact: true }).click();
  await p.getByLabel('Motivo de cancelación', { exact: true }).fill('Cambio del cliente');
  await p.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click();
  await p.getByText('Pedido cancelado', { exact: false }).waitFor();
  assert.equal(
    Number((await fixture.query('SELECT COUNT(*) AS n FROM portal_cancellations')).rows[0].n),
    1,
  );
  await p.screenshot({ path: 'evidencia/mostrador/cancelacion-cliente.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: componente buscable, mostrador sin módulo de clientes, cesta responsive, cobro único e idempotente, pedidos internos restringidos y cancelación autenticada desde portal.',
  );
} finally {
  await browser.close();
  await fixture.close();
  await db.close();
  qa.stop();
}
