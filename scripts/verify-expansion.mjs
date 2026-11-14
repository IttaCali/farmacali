import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startQa, Client } from './qa-server.mjs';
import { totpFor } from '../server/models/authentication.js';
import { navigate } from './ui-navigation.mjs';
const qa = await startQa(),
  browser = await chromium.launch({ channel: 'chrome', headless: true });
const dir = 'evidencia/operacion-integral';
mkdirSync(dir, { recursive: true });
const results = [],
  errors = [];
async function login(email, password) {
  const client = new Client(qa.base);
  let r = await client.request('/auth/login', { email, password });
  if (r.data.step === 'enroll')
    r = await client.request('/auth/complete', {
      challenge: r.data.challenge,
      code: totpFor(r.data.secret).generate(),
    });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies(client.browserCookies());
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(qa.base);
  await p.getByRole('heading', { name: /^Bienvenido,/ }).waitFor();
  return { p, client };
}
async function nav(p, name) {
  await navigate(p, name);
}
async function shot(p, name) {
  await p.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: 'disabled' });
}
async function save(p) {
  const d = p.getByRole('dialog');
  await d.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await d.waitFor({ state: 'hidden' });
}
async function responsive(p, name) {
  for (const width of [390, 768, 1440]) {
    await p.setViewportSize({ width, height: 1000 });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${name}: ${width}`,
    );
    await shot(p, `${name}-${width}`);
  }
}
try {
  const { p, client } = await login('admin@farmacia.gt', 'Farmacia2026!');
  await nav(p, 'Abastecimiento');
  await p.getByRole('button', { name: 'Nuevo proveedor', exact: true }).click();
  await p.getByLabel('Nombre del proveedor', { exact: true }).fill('Distribuidora ficticia QA');
  await p.getByLabel('NIT', { exact: true }).fill('CF');
  await p.getByLabel('Teléfono', { exact: true }).fill('55550000');
  await save(p);
  await p.getByRole('button', { name: 'Registrar medicamento', exact: true }).click();
  await p
    .getByLabel('Proveedor', { exact: true })
    .selectOption({ label: 'Distribuidora ficticia QA' });
  await p.getByLabel('Nombre del medicamento', { exact: true }).fill('Medicamento integrado QA');
  await p.getByLabel('Componente o principio activo', { exact: true }).fill('Componente de prueba');
  await p.getByLabel('SKU', { exact: true }).fill('MED-QA-001');
  await p.getByLabel('Precio de venta Q', { exact: true }).fill('12');
  await p.getByLabel('Costo unitario Q', { exact: true }).fill('7.50');
  await p.getByLabel('Cantidad inicial', { exact: true }).fill('10');
  await p.getByLabel('Vencimiento', { exact: true }).fill('2035-01-01');
  await p.getByLabel('Documento del proveedor', { exact: true }).fill('FAC-MED-QA');
  await p.getByLabel('Sucursal de ingreso', { exact: true }).selectOption('b1');
  await p.getByRole('button', { name: 'Registrar y agregar al inventario', exact: true }).click();
  await p.getByRole('dialog').waitFor({ state: 'hidden' });
  await p.getByText(/Lote generado:/).waitFor();
  results.push('Medicamento registrado con proveedor y lote automático: PASS');
  await p.getByRole('button', { name: 'Nueva orden de compra', exact: true }).click();
  await p.getByLabel('Sucursal', { exact: true }).selectOption('b1');
  await p.getByLabel('Medicamento', { exact: true }).selectOption('p1');
  await p.getByLabel('Cantidad', { exact: true }).fill('10');
  await p.getByLabel('Costo unitario Q', { exact: true }).fill('7.50');
  await p.getByRole('button', { name: 'Agregar línea', exact: true }).click();
  await responsive(p, '01-compra');
  await p.getByRole('button', { name: 'Guardar borrador de compra', exact: true }).click();
  await p.getByRole('dialog').waitFor({ state: 'hidden' });
  await p.getByRole('button', { name: 'Gestionar compra', exact: true }).click();
  await p.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await p.getByRole('dialog').waitFor({ state: 'hidden' });
  await p.getByRole('button', { name: 'Gestionar compra', exact: true }).click();
  await p.getByLabel('Documento del proveedor', { exact: true }).fill('FAC-QA-1');
  await p.getByLabel('Recibir unidades', { exact: true }).fill('6');
  await p.getByLabel('Vencimiento', { exact: true }).fill('2035-01-01');
  await p.getByRole('button', { name: 'Registrar recepción y egreso', exact: true }).click();
  await p.getByRole('dialog').waitFor({ state: 'hidden' });
  await p.getByText(/Lotes generados:/).waitFor();
  await p.getByRole('button', { name: 'Devolver a proveedor', exact: true }).click();
  await p.getByLabel('Cantidad a devolver', { exact: true }).fill('2');
  await p.getByLabel('Motivo', { exact: true }).fill('Devolución de prueba');
  await p.getByLabel('Número de nota de crédito', { exact: true }).fill('NC-QA');
  await save(p);
  await p.getByRole('button', { name: 'Confirmar reembolso recibido', exact: true }).click();
  await p.getByText('Reembolsada', { exact: true }).waitFor();
  await responsive(p, '02-abastecimiento');
  results.push('Compra, recepción parcial, devolución y reembolso mediante interfaz: PASS');
  await nav(p, 'Planilla detallada');
  await p.getByRole('button', { name: 'Parámetros de planilla', exact: true }).click();
  await p.getByLabel('Activar planilla detallada', { exact: true }).check();
  await save(p);
  await p.getByRole('button', { name: 'Novedades', exact: true }).first().click();
  await p.getByLabel('Bonificación Q', { exact: true }).fill('250');
  await p.getByLabel('Aplicar IGSS', { exact: true }).check();
  await save(p);
  await p.getByRole('button', { name: 'Ver desglose', exact: true }).first().click();
  await responsive(p, '03-planilla-desglose');
  await p.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await p.getByRole('button', { name: 'Revisar pago de planilla', exact: true }).click();
  await p.getByRole('button', { name: 'Confirmar pago neto', exact: true }).click();
  await p.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await p.getByRole('button', { name: 'Novedades', exact: true }).count(), 0);
  results.push('Planilla configurable, deducciones, provisiones y pago neto: PASS');
  const phone = '55551234',
    dpi = '1234567890101';
  const response = await p.request.post(qa.base + '/api/portal/orders', {
    data: {
      request_id: crypto.randomUUID(),
      phone,
      dpi,
      customer: 'Cliente ficticio entrega',
      branch_id: 'b1',
      items: [{ product_id: 'p1', quantity: 1 }],
      fulfillment: 'delivery',
      lat: 14.614,
      lng: -90.551,
      address: 'Dirección de prueba',
      payment: 'Tarjeta',
    },
  });
  const order = await response.json();
  assert.equal(response.status(), 201, JSON.stringify(order));
  const snapshot = (await client.request('/snapshot')).data;
  const id = snapshot.orders.find((o) => o.ticket === order.ticket).id;
  await nav(p, 'Coordinación de entregas');
  await p
    .getByRole('row')
    .filter({ hasText: order.ticket })
    .getByRole('button', { name: 'Gestionar entrega', exact: true })
    .click();
  await p.getByLabel('Repartidor', { exact: true }).selectOption('u-courier');
  await p.getByRole('button', { name: 'Guardar asignación', exact: true }).click();
  await p.getByLabel('Avance simulado', { exact: true }).fill('50');
  await p.getByRole('button', { name: 'Simular avance del repartidor', exact: true }).click();
  await p.getByText(/Ubicación: Simulación/).waitFor();
  await responsive(p, '04-entrega-simulada');
  await p.getByRole('button', { name: 'Cerrar', exact: true }).click();
  for (const status of ['Preparando', 'En ruta'])
    assert.equal((await client.request(`/orders/${id}/status`, { status }, 'PATCH')).status, 200);
  const { p: courier } = await login('repartidor@farmacia.gt', 'Repartidor2026!');
  await nav(courier, 'Mis entregas');
  await courier.getByRole('button', { name: 'Gestionar entrega', exact: true }).click();
  await courier.getByLabel('Código de autorización', { exact: true }).fill(order.access_code);
  await courier.getByLabel('Confirmo la entrega y el cobro.', { exact: true }).check();
  await courier.getByRole('button', { name: 'Confirmar entrega asignada', exact: true }).click();
  await courier.getByText('Entrega y cobro registrados.', { exact: true }).waitFor();
  await responsive(courier, '05-repartidor');
  results.push('Asignación, recorrido simulado, acceso del repartidor y entrega autorizada: PASS');
  await nav(p, 'Avisos simulados');
  await p.getByText(new RegExp('FarmaCali: pedido ' + order.ticket + '.*En ruta')).waitFor();
  await shot(p, '06-avisos');
  results.push('Avisos automáticos internos identificados como simulados: PASS');
  const image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/2kAAAAASUVORK5CYII=';
  const rxResponse = await p.request.post(qa.base + '/api/portal/orders', {
    data: {
      request_id: crypto.randomUUID(),
      phone,
      dpi,
      customer: 'Cliente ficticio receta',
      branch_id: 'b1',
      items: [{ product_id: 'p3', quantity: 1 }],
      fulfillment: 'pickup',
      prescription_image: image,
      payment: 'Efectivo',
    },
  });
  const rx = await rxResponse.json();
  assert.equal(rxResponse.status(), 201, JSON.stringify(rx));
  const s2 = (await client.request('/snapshot')).data;
  const rid = s2.orders.find((o) => o.ticket === rx.ticket).id;
  assert.equal(
    (
      await client.request(`/orders/${rid}/prescription-review`, {
        approved: false,
        notes: 'Foto de prueba ilegible',
      })
    ).status,
    200,
  );
  const publicPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  publicPage.on('pageerror', (e) => errors.push(e.message));
  await publicPage.goto(qa.base + '/portal');
  await publicPage.getByRole('button', { name: 'Consultar ticket', exact: true }).click();
  await publicPage.getByLabel('Número de ticket', { exact: true }).fill(rx.ticket);
  await publicPage.getByLabel('Código de autorización', { exact: true }).fill(rx.access_code);
  await publicPage.getByRole('button', { name: 'Consultar pedido', exact: true }).click();
  await publicPage.getByRole('heading', { name: 'Reemplaza tu receta', exact: true }).waitFor();
  await shot(publicPage, '07-recuperacion-receta');
  await publicPage.getByLabel('Nueva foto de receta', { exact: true }).setInputFiles({
    name: 'receta-prueba.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image.split(',')[1], 'base64'),
  });
  await publicPage
    .getByRole('button', { name: 'Enviar nueva receta a revisión', exact: true })
    .click();
  await publicPage
    .getByRole('heading', { name: 'Reemplaza tu receta', exact: true })
    .waitFor({ state: 'hidden' });
  await publicPage
    .getByRole('img', { name: 'QR con ticket y código de autorización', exact: true })
    .waitFor();
  await shot(publicPage, '08-receta-renovada');
  results.push(
    'Consulta con ticket y código de autorización y reemplazo público de receta rechazada: PASS',
  );
  assert.deepEqual(errors, []);
  console.log(results.join('\n'));
  writeFileSync(
    `${dir}/resultados.json`,
    JSON.stringify({ date: new Date().toISOString(), results, errors }, null, 2),
  );
} catch (e) {
  for (const c of browser.contexts())
    for (const p of c.pages()) await shot(p, 'error').catch(() => {});
  throw e;
} finally {
  await browser.close();
  qa.stop();
}
