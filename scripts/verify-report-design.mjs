import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import { startQa, Client } from './qa-server.mjs';
import { totpFor } from '../server/models/authentication.js';
const qa = await startQa();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
mkdirSync('evidencia/reportes', { recursive: true });
try {
  const client = new Client(qa.base);
  let login = await client.request('/auth/login', {
    email: 'auditor@farmacia.gt',
    password: 'Auditor2026!',
  });
  if (login.data.step === 'enroll')
    if (login.data.step === 'enroll')
      login = await client.request('/auth/complete', {
        challenge: login.data.challenge,
        code: totpFor(login.data.secret).generate(),
      });
  assert.ok(login.data.user);
  const context = await browser.newContext();
  await context.addCookies(client.browserCookies());
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setViewportSize({ width: 1440, height: 950 });
  await p.goto(qa.base);
  await p.getByRole('heading', { name: /^Bienvenido,/ }).waitFor();
  await p.screenshot({ path: 'evidencia/reportes/paleta-morada.png', fullPage: true });
  await p.getByRole('button', { name: 'Exportar reporte', exact: true }).click();
  const modal = p.getByRole('dialog', { name: 'Descargar reporte', exact: true });
  await modal.getByLabel('Período del reporte').selectOption('month');
  await modal.getByLabel('Mes del reporte').fill('2026-11');
  const [download] = await Promise.all([
    p.waitForEvent('download'),
    modal.getByRole('button', { name: 'Descargar Excel', exact: true }).click(),
  ]);
  await download.saveAs('evidencia/reportes/caja-noviembre.xlsx');
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile('evidencia/reportes/caja-noviembre.xlsx');
  const sheet = book.worksheets[0];
  assert.match(sheet.getCell('A2').value, /2026-11-01.*2026-11-30/);
  assert.equal(sheet.views[0].ySplit, 6);
  assert.equal(sheet.getCell('A6').fill.fgColor.argb, 'FF7050A4');
  const csv = await fetch(qa.base + '/api/reports/cash/csv?from=2026-11-01&to=2026-11-30', {
    headers: { Cookie: [...client.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
  });
  const rows = (await csv.text()).trim().split(/\r?\n/).length - 1;
  assert.equal(
    sheet.autoFilter ? Number(String(sheet.autoFilter).match(/:(?:[A-Z]+)(\d+)$/)[1]) - 6 : 0,
    rows,
  );
  await modal.getByLabel('Período del reporte').selectOption('week');
  await modal.getByLabel('Semana del reporte').fill('2026-W01');
  await modal.getByText(/2025-12-29 al 2026-01-04/).waitFor();
  await p.setViewportSize({ width: 390, height: 844 });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await p.screenshot({ path: 'evidencia/reportes/filtro-semana-movil.png', fullPage: true });
  await modal.getByLabel('Período del reporte').selectOption('custom');
  await modal.getByLabel('Desde', { exact: true }).fill('2099-01-01');
  await modal.getByLabel('Hasta', { exact: true }).fill('2099-01-31');
  const [empty] = await Promise.all([
    p.waitForEvent('download'),
    modal.getByRole('button', { name: 'Descargar Excel', exact: true }).click(),
  ]);
  await empty.saveAs('evidencia/reportes/sin-registros.xlsx');
  const emptyBook = new ExcelJS.Workbook();
  await emptyBook.xlsx.readFile('evidencia/reportes/sin-registros.xlsx');
  assert.match(emptyBook.worksheets[0].getCell('A7').value, /No hay registros/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: Excel descargado desde interfaz, mes completo, semana ISO entre años, rango vacío, formato morado, encabezados fijos, filas completas y celular sin desbordamiento.',
  );
} finally {
  await browser.close();
  qa.stop();
}
