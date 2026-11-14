import express from 'express';
import path from 'node:path';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const app = express();
let unavailable = true;
app.get('/api/portal/catalog', (req, res) =>
  unavailable
    ? res.status(401).json({ error: 'Inicia sesión para continuar.' })
    : res.json({ products: [], branches: [] }),
);
app.use(express.static('dist'));
app.get('/portal', (req, res) => res.sendFile(path.resolve('dist/index.html')));
const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/portal`);
  await page
    .getByRole('heading', { name: 'No pudimos cargar los medicamentos', exact: true })
    .waitFor();
  assert.equal(
    await page.getByText('Cargando medicamentos y sucursales…', { exact: true }).count(),
    0,
  );
  await page
    .getByRole('alert')
    .getByText(/Reinicia FarmaCali/)
    .waitFor();
  unavailable = false;
  await page.getByRole('button', { name: 'Reintentar carga', exact: true }).click();
  await page.getByRole('heading', { name: '1. Elige tu sucursal', exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  mkdirSync('evidencia/portal', { recursive: true });
  writeFileSync(
    'evidencia/portal/carga-recuperada.json',
    JSON.stringify(
      {
        results: [
          'Servidor anterior: error visible y cargador detenido: PASS',
          'Reintentar recupera catálogo sin recargar la página: PASS',
        ],
      },
      null,
      2,
    ),
  );
  console.log('PASS: no hay carga infinita y el reintento recupera el catálogo.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
