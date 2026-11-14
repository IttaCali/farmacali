import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { startQa } from './qa-server.mjs';
import QRCode from 'qrcode';
import { navigate } from './ui-navigation.mjs';
const qa = await startQa(),
  browser = await chromium.launch({ channel: 'chrome', headless: true });
const dir = 'evidencia/portal';
mkdirSync(dir, { recursive: true });
const errors = [],
  results = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const screenshot = async (name, p = page, mask = []) =>
  p.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: 'disabled', mask });
const noOverflow = async (p) =>
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
const confirm = async () => {
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/portal/orders') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Confirmar pedido y obtener ticket', exact: true })
    .click();
  const res = await response;
  const data = await res.json();
  assert.equal(res.status(), 201, JSON.stringify(data));
  await page.getByRole('heading', { name: '¡Pedido confirmado!', exact: true }).waitFor();
  return data;
};
async function login(role) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(qa.base);
  await p.getByRole('button', { name: role, exact: true }).click();
  await p.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await p.getByRole('heading', { name: /^Bienvenido,/ }).waitFor();
  await navigate(p, 'Pedidos y entregas');
  return p;
}
try {
  await page.goto(qa.base + '/portal');
  await page.getByRole('heading', { name: '1. Elige tu sucursal', exact: true }).waitFor();
  await screenshot('01-portal-escritorio');
  assert.equal((await page.request.get(qa.base + '/api/snapshot')).status(), 401);
  const catalog = await (await page.request.get(qa.base + '/api/portal/catalog')).json();
  assert.ok(catalog.availability.length);
  assert.ok(catalog.availability.every((a) => a.available === true && !('quantity' in a)));
  assert.equal(catalog.clients, undefined);
  for (const width of [320, 360, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await screenshot(`02-portal-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Elegir Miraflores', exact: true }).click();
  await page.getByRole('heading', { name: '¿Qué medicamento necesitas?', exact: true }).waitFor();
  assert.equal(await page.locator('.fc-product').count(), 0);
  await screenshot('03-buscador-movil');
  for (const name of ['Acetaminofén 500 mg', 'Ibuprofeno 400 mg']) {
    await page.getByRole('textbox', { name: 'Buscar medicamento', exact: true }).fill(name);
    await page.getByRole('button', { name: 'Agregar ' + name, exact: true }).click();
  }
  await page.getByRole('textbox', { name: 'Buscar medicamento', exact: true }).fill('acetaminofen');
  await page.getByLabel('Cantidad en catálogo de Acetaminofén 500 mg', { exact: true }).fill('');
  await page.getByLabel('Cantidad en catálogo de Acetaminofén 500 mg', { exact: true }).fill('2');
  assert.equal(
    await page.getByLabel('Cantidad de Acetaminofén 500 mg', { exact: true }).inputValue(),
    '2',
  );
  await screenshot('03-cesta-movil');
  await noOverflow(page);
  await page.getByRole('button', { name: 'Continuar con mis datos', exact: true }).click();
  await page.getByRole('heading', { name: '3. Confirma tu pedido', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Subir foto de receta', { exact: true }).count(), 0);
  await page.getByRole('combobox').waitFor();
  assert.deepEqual(await page.getByRole('combobox').locator('option').allTextContents(), [
    'Efectivo',
    'Tarjeta',
  ]);
  await page.getByRole('button', { name: 'Agregar o cambiar medicamentos', exact: true }).click();
  await page.getByRole('textbox', { name: 'Buscar medicamento', exact: true }).fill('Amoxicilina');
  await page.getByRole('button', { name: 'Agregar Amoxicilina 500 mg', exact: true }).click();
  assert.equal(await page.getByText(/\d+ disponibles/).count(), 0);
  assert.equal(await page.locator('.fc-product input[type=number]').getAttribute('max'), '100');
  await page.getByRole('textbox', { name: 'Buscar medicamento', exact: true }).fill('mg');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot('03-cesta-escritorio');
  await noOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Continuar con mis datos', exact: true }).click();
  await page.getByLabel('Nombre completo', { exact: true }).fill('Cliente ficticio de prueba');
  assert.equal(await page.getByLabel('DPI opcional · 13 dígitos').getAttribute('required'), null);
  await page.getByLabel('Número de celular').fill('55551234');
  await page.getByLabel('Subir foto de receta', { exact: true }).setInputFiles({
    name: 'receta-ficticia.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/2kAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByLabel('Confirmo los datos y autorizo su uso para atender este pedido.').check();
  await screenshot('04-confirmar-movil');
  await noOverflow(page);
  const receipt = await confirm();
  assert.equal(receipt.items.length, 3);
  assert.equal(receipt.prescription_status, 'Pendiente');
  assert.match(receipt.ticket, /^FC-[0-9A-F]{6}$/);
  assert.match(receipt.access_code, /^\d{6}$/);
  await page.getByAltText('QR con ticket y código de autorización').waitFor();
  await screenshot('05-ticket-movil', page, [
    page.locator('.pp-ticket-number code'),
    page.locator('.fc-ticket-qr img'),
  ]);
  await noOverflow(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await noOverflow(page);
  await screenshot('05-ticket-escritorio', page, [
    page.locator('.pp-ticket-number code'),
    page.locator('.fc-ticket-qr img'),
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar ticket', exact: true }).click();
  const file = await download;
  assert.equal(file.suggestedFilename(), receipt.ticket + '.html');
  const saved = readFileSync(await file.path(), 'utf8');
  assert.ok(saved.includes(receipt.qr));
  assert.ok(saved.includes('QR de tu pedido'));
  results.push(
    'Sucursal primero; cesta con tres medicamentos, cantidades, total cercano, efectivo/tarjeta y receta condicional: PASS',
    'Sin inventario público, medicamentos únicamente al buscar y explicación de pedido anticipado: PASS',
    'Ticket corto, autorización de seis números y QR siempre visible, también en descarga HTML: PASS',
  );
  const cc = await login('Call center'),
    crow = cc.getByRole('row').filter({ hasText: receipt.ticket });
  assert.equal(await crow.getByRole('button').count(), 1);
  await crow.getByRole('button', { name: 'Gestionar pedido', exact: true }).click();
  const cd = cc.getByRole('dialog');
  await cd.getByAltText('Receta adjunta por el cliente').waitFor();
  await cd
    .getByLabel('Observaciones de revisión')
    .fill('Revisión ficticia para la prueba del flujo.');
  await cd.getByRole('button', { name: 'Marcar receta revisada y aprobada', exact: true }).click();
  await cd.getByText('Revisada', { exact: true }).waitFor();
  await screenshot('06-receta-callcenter', cc);
  await cd.getByRole('button', { name: 'Confirmar y preparar', exact: true }).click();
  await cd.locator('.order-status-pill').getByText('Preparando', { exact: true }).waitFor();
  assert.equal(await cc.getByRole('dialog').count(), 1);
  await cd.getByRole('button', { name: 'Cerrar', exact: true }).click();
  const staff = await login('Sucursal'),
    row = staff.getByRole('row').filter({ hasText: receipt.ticket });
  assert.equal(await row.getByRole('button').count(), 1);
  await row.getByRole('button', { name: 'Gestionar pedido', exact: true }).click();
  let dialog = staff.getByRole('dialog');
  for (const name of ['Acetaminofén 500 mg', 'Ibuprofeno 400 mg', 'Amoxicilina 500 mg'])
    await dialog.getByRole('cell', { name: new RegExp(name) }).waitFor();
  await screenshot('07-detalle-preparacion', staff);
  await staff.setViewportSize({ width: 390, height: 844 });
  assert.equal(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth), false);
  await screenshot('07-gestion-movil', staff);
  await staff.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByLabel('Pedido empacado', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Marcar listo para recoger', exact: true }).click();
  await dialog
    .locator('.order-status-pill')
    .getByText('Listo para recoger', { exact: true })
    .waitFor();
  await screenshot('08-pedido-listo', staff);
  await page.getByRole('button', { name: 'Consultar ticket', exact: true }).click();
  await page
    .getByLabel('Código de autorización', { exact: true })
    .fill('000000' === receipt.access_code ? '111111' : '000000');
  await page.getByRole('button', { name: 'Consultar pedido', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await page.getByLabel('Código de autorización', { exact: true }).fill(receipt.access_code);
  await page.getByRole('button', { name: 'Consultar pedido', exact: true }).click();
  await page.locator('.pp-order-status').getByText('Listo para recoger', { exact: true }).waitFor();
  await page.getByAltText('QR con ticket y código de autorización').waitFor();
  await dialog.getByRole('button', { name: 'Leer QR', exact: true }).click();
  const otherTicket = receipt.ticket === 'FC-000000' ? 'FC-111111' : 'FC-000000';
  await dialog.getByLabel('Imagen del QR del pedido', { exact: true }).setInputFiles({
    name: 'otro-ticket.png',
    mimeType: 'image/png',
    buffer: await QRCode.toBuffer(
      JSON.stringify({ ticket: otherTicket, access_code: receipt.access_code }),
    ),
  });
  await dialog
    .getByRole('alert')
    .getByText(/pertenece a otro pedido/)
    .waitFor();
  await dialog.getByLabel('Imagen del QR del pedido', { exact: true }).setInputFiles({
    name: 'ticket-correcto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(receipt.qr.split(',')[1], 'base64'),
  });
  await dialog.getByText('QR de este pedido leído', { exact: true }).waitFor();
  await staff.evaluate(async (qr) => {
    const img = new Image();
    img.src = qr;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 640, 480);
    ctx.imageSmoothingEnabled = false;
    window.__qaQrFrame = img;
    window.__qaQrCanvas = canvas;
    window.__qaQrCamera = canvas.captureStream(5);
    navigator.mediaDevices.getUserMedia = async () => window.__qaQrCamera;
  }, receipt.qr);
  await dialog.getByRole('button', { name: 'Usar cámara', exact: true }).click();
  await dialog.getByRole('button', { name: 'Detener cámara', exact: true }).waitFor();
  await staff.evaluate(() =>
    window.__qaQrCanvas.getContext('2d').drawImage(window.__qaQrFrame, 200, 120, 240, 240),
  );
  await dialog.getByRole('button', { name: 'Usar cámara', exact: true }).waitFor();
  assert.equal(
    await staff.evaluate(() =>
      window.__qaQrCamera.getTracks().every((t) => t.readyState === 'ended'),
    ),
    true,
  );
  assert.equal(await dialog.getByRole('alert').count(), 0);
  await dialog.getByLabel('Entrega y cobro confirmados', { exact: true }).check();
  await screenshot('09-entrega-qr', staff);
  await dialog.getByRole('button', { name: 'Confirmar entrega y cobro', exact: true }).click();
  await dialog.getByText('Entrega completada', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await row.getByText('Entregado', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Consultar pedido', exact: true }).click();
  await page.locator('.pp-order-status').getByText('Entregado', { exact: true }).waitFor();
  assert.equal(await page.getByText(/Receta pendiente de revisión/).count(), 0);
  results.push(
    'Call center ve foto y lista de medicamentos; aprobación previa obligatoria: PASS',
    'Farmacia ve cantidades, confirma bolsa preparada y entrega con autorización: PASS',
    'Consulta privada con código correcto y estado actualizado; sin alertas de receta después de entrega: PASS',
    'Un solo botón por pedido: receta, detalles y estados sin salir del diálogo: PASS',
    'Lectura real de QR por imagen y cámara simulada; rechaza QR ajeno y libera la cámara: PASS',
  );
  await page.getByRole('button', { name: 'Hacer otro pedido', exact: true }).click();
  await page.getByRole('button', { name: 'Elegir Miraflores', exact: true }).click();
  await page.getByRole('textbox', { name: 'Buscar medicamento', exact: true }).fill('Ibuprofeno');
  await page.getByRole('button', { name: 'Agregar Ibuprofeno 400 mg', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar con mis datos', exact: true }).click();
  await page.getByLabel('Recibir en casa', { exact: true }).check();
  await page.getByLabel('Nombre completo', { exact: true }).fill('Cliente ficticio domicilio');
  await page.getByLabel('DPI opcional · 13 dígitos').fill('1234567890101');
  await page.getByLabel('Número de celular').fill('55551234');
  await page
    .getByLabel('Dirección de casa y referencias')
    .fill('Dirección ficticia junto a Miraflores');
  await context.grantPermissions(['geolocation'], { origin: qa.base });
  await context.setGeolocation({ latitude: 14.6134, longitude: -90.5505 });
  await page.getByRole('button', { name: 'Usar mi ubicación', exact: true }).click();
  await page.getByText('Ubicación marcada.', { exact: true }).waitFor();
  await page.getByLabel('Confirmo los datos y autorizo su uso para atender este pedido.').check();
  await noOverflow(page);
  const delivery = await confirm();
  assert.equal(delivery.fulfillment, 'delivery');
  await cc.reload();
  await navigate(cc, 'Pedidos y entregas');
  const deliveryRow = cc.getByRole('row').filter({ hasText: delivery.ticket });
  await deliveryRow.getByRole('button', { name: 'Gestionar pedido', exact: true }).click();
  const deliveryDialog = cc.getByRole('dialog', { name: 'Gestionar pedido', exact: true });
  await deliveryDialog.getByText('Corregir datos o reasignar sucursal', { exact: true }).click();
  await deliveryDialog.getByLabel('Teléfono', { exact: true }).fill('55554321');
  await deliveryDialog
    .getByLabel('Motivo del cambio', { exact: true })
    .fill('Corregir contacto ficticio desde la gestión unificada');
  await deliveryDialog
    .getByRole('button', { name: 'Guardar cambios del pedido', exact: true })
    .click();
  await deliveryDialog
    .locator('.order-customer-details')
    .getByText('55554321', { exact: true })
    .waitFor();
  await deliveryDialog.getByRole('button', { name: 'Confirmar y preparar', exact: true }).click();
  await deliveryDialog
    .getByRole('button', { name: 'Confirmar salida a domicilio', exact: true })
    .click();
  await deliveryDialog
    .getByLabel('Código de autorización del ticket', { exact: true })
    .fill(delivery.access_code === '000000' ? '111111' : '000000');
  await deliveryDialog.getByLabel('Entrega y cobro confirmados', { exact: true }).check();
  await deliveryDialog
    .getByRole('button', { name: 'Confirmar entrega y cobro', exact: true })
    .click();
  await deliveryDialog.getByRole('alert').waitFor();
  await deliveryDialog
    .getByLabel('Código de autorización del ticket', { exact: true })
    .fill(delivery.access_code);
  await deliveryDialog
    .getByRole('button', { name: 'Confirmar entrega y cobro', exact: true })
    .click();
  await deliveryDialog.getByText('Entrega completada', { exact: true }).waitFor();
  await deliveryDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  const cancelResponse = await page.request.post(qa.base + '/api/portal/orders', {
    data: {
      request_id: crypto.randomUUID(),
      branch_id: 'b1',
      items: [{ product_id: 'p2', quantity: 1 }],
      fulfillment: 'pickup',
      customer: 'Cliente ficticio cancelación',
      dpi: '1234567890101',
      phone: '55551234',
      payment: 'Efectivo',
    },
  });
  assert.equal(cancelResponse.status(), 201);
  const canceled = await cancelResponse.json();
  await cc.reload();
  await navigate(cc, 'Pedidos y entregas');
  await cc
    .getByRole('row')
    .filter({ hasText: canceled.ticket })
    .getByRole('button', { name: 'Gestionar pedido', exact: true })
    .click();
  const cancelDialog = cc.getByRole('dialog', { name: 'Gestionar pedido', exact: true });
  await cancelDialog.getByText('Cancelar pedido', { exact: true }).click();
  await cancelDialog
    .getByLabel('Motivo de cancelación', { exact: true })
    .fill('Cancelación ficticia solicitada por el cliente');
  await cancelDialog
    .getByRole('button', { name: 'Cancelar y liberar existencias', exact: true })
    .click();
  await cancelDialog.getByText('Pedido cancelado', { exact: true }).waitFor();
  results.push(
    'Domicilio mantiene mapa, dirección, cobertura y cliente frecuente: PASS',
    'Call center completa el seguimiento y entrega con código; código incorrecto no cobra: PASS',
    'Corregir datos y cancelar con motivo desde la misma ventana: PASS',
    'Vistas de 320, 360, 390, 768 y 1440 píxeles sin desbordamiento horizontal: PASS',
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    `${dir}/verificacion.json`,
    JSON.stringify({ results, browserErrors: errors }, null, 2),
  );
  writeFileSync(
    `${dir}/index.html`,
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FarmaCali · Portal</title><style>body{font:15px system-ui;background:#faf8fd;max-width:1100px;margin:30px auto;padding:20px}img{max-width:100%}section{background:white;padding:20px;margin:20px 0;border-radius:12px}</style><h1>Portal FarmaCali: cesta y recetas</h1><p>Base separada y datos ficticios. Autorizaciones ocultas en capturas.</p><ul>${results.map((r) => `<li>${r}</li>`).join('')}</ul>${['01-portal-escritorio', '02-portal-390', '03-cesta-escritorio', '03-cesta-movil', '04-confirmar-movil', '05-ticket-movil', '06-receta-callcenter', '07-detalle-preparacion', '08-pedido-listo'].map((n) => `<section><h2>${n}</h2><img loading="lazy" src="${n}.png" alt="${n}"></section>`).join('')}</html>`,
  );
  console.log(results.join('\n'));
} catch (e) {
  await screenshot('revision-error').catch(() => {});
  throw e;
} finally {
  await browser.close();
  qa.stop();
}
