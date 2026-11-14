import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { Database, db } from '../server/database/db.js';
import { startQa, Client } from './qa-server.mjs';
import { totpFor } from '../server/models/authentication.js';
import { navigate } from './ui-navigation.mjs';
const qa = await startQa(),
  fixture = new Database('', qa.file);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
mkdirSync('evidencia/inventario', { recursive: true });
try {
  for (const [id, expiry, quantity] of [
    ['qa-valid', '2031-01-01', 7],
    ['qa-expired', '2020-01-01', 3],
  ]) {
    await fixture.query('INSERT INTO inventory VALUES ($1,$2,$3,$4,$5,$6,$7)', [
      id,
      'b1',
      'p1',
      id,
      expiry,
      quantity,
      20,
    ]);
    await fixture.query('INSERT INTO stock_ledger VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
      id,
      'b1',
      'p1',
      id,
      quantity,
      'INGRESO',
      id,
      'Ingreso de prueba',
      '2026-01-01T16:00:00Z',
      'u-admin',
    ]);
  }
  const client = new Client(qa.base);
  let login = await client.request('/auth/login', {
    email: 'sucursal@farmacia.gt',
    password: 'Sucursal2026!',
  });
  if (login.data.step === 'enroll')
    login = await client.request('/auth/complete', {
      challenge: login.data.challenge,
      code: totpFor(login.data.secret).generate(),
    });
  assert.ok(login.data.user);
  const snap = (await client.request('/snapshot')).data;
  const expected = snap.inventory
    .filter((i) => i.product_id === 'p1' && i.expires_on > snap.date)
    .reduce((s, i) => s + i.quantity, 0);
  assert.equal(
    snap.inventory.find((i) => i.id === 'qa-valid').first_received_at,
    '2026-01-01T16:00:00Z',
  );
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies(client.browserCookies());
  const p = await context.newPage(),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(qa.base);
  await p.getByRole('heading', { name: /^Bienvenido,/ }).waitFor();
  await navigate(p, 'Inventario');
  const panel = p
    .locator('.panel')
    .filter({ has: p.getByRole('heading', { name: 'Inventario por medicamento', exact: true }) });
  assert.equal(
    await panel.locator('tbody tr').count(),
    new Set(snap.inventory.map((i) => i.product_id)).size,
  );
  const row = panel.locator('tbody tr').filter({ hasText: 'Acetaminofén 500 mg' });
  assert.equal(await row.count(), 1);
  assert.ok(
    (await row.textContent()).includes(
      new Intl.NumberFormat('es-GT').format(expected) + ' unidades',
    ),
  );
  await p.screenshot({ path: 'evidencia/inventario/resumen.png', fullPage: true });
  await row.getByRole('button', { name: 'Ver lotes y movimientos', exact: true }).click();
  const modal = p.getByRole('dialog', { name: 'Lotes de Acetaminofén 500 mg', exact: true });
  await modal.getByText('qa-expired', { exact: true }).waitFor();
  await modal.getByLabel('Movimientos del lote').selectOption('qa-valid');
  await modal.getByRole('heading', { name: 'Kardex histórico por lote', exact: true }).waitFor();
  await modal.getByText('Ingreso de prueba', { exact: true }).waitFor();
  const history = await client.request('/history/kardex?product_id=p1&inventory_id=qa-valid');
  assert.equal(history.data.total, 1);
  assert.ok(history.data.rows.every((r) => r.product_id === 'p1' && r.inventory_id === 'qa-valid'));
  const filtered = await client.request('/history/kardex?product_id=p2&inventory_id=qa-valid');
  assert.equal(filtered.data.total, 0);
  for (const width of [320, 390, 768, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await modal.evaluate((el) => el.scrollWidth > el.clientWidth), false);
  }
  await p.setViewportSize({ width: 390, height: 900 });
  await p.screenshot({ path: 'evidencia/inventario/lotes-movil.png', fullPage: true });
  await modal.getByRole('button', { name: 'Solicitar ajuste', exact: true }).first().click();
  await p.getByRole('dialog', { name: 'Solicitar revisión', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: una fila por producto, cantidades sin vencidos, lotes conservados, primer ingreso real, historial filtrado por producto/lote, ajuste disponible y modal responsive desde 320px.',
  );
} finally {
  await browser.close();
  await fixture.close();
  await db.close();
  qa.stop();
}
