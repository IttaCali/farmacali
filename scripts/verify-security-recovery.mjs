import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startQa } from './qa-server.mjs';
import * as OTPAuth from 'otpauth';
const qa = await startQa();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const dir = 'evidencia/seguridad-cuenta';
mkdirSync(dir, { recursive: true });
const results = [],
  errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => errors.push(e.message));
const response = (path) =>
  page.waitForResponse((r) => r.url().endsWith(path) && r.request().method() === 'POST');
const otp = (secret) =>
  new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate();
async function saved() {
  await page.getByRole('checkbox', { name: 'Ya guardé mis códigos en un lugar seguro.' }).check();
  await page.getByRole('button', { name: 'Ya guardé mis códigos', exact: true }).click();
}
async function login(role) {
  await page.goto(qa.base);
  await page.getByRole('button', { name: role, exact: true }).click();
  const wait = response('/auth/login');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  return (await wait).json();
}
async function security() {
  await page.getByRole('button', { name: 'Abrir menú de usuario' }).click();
  await page.getByRole('button', { name: 'Seguridad', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Información de seguridad', exact: true });
  await dialog.getByRole('heading', { name: 'Métodos de inicio de sesión' }).waitFor();
  return dialog;
}
async function logout() {
  await page.getByRole('button', { name: 'Abrir menú de usuario' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('heading', { name: 'Bienvenido a FarmaCali' }).waitFor();
}
async function confirmSetup(setup) {
  await page.getByLabel('Código de Microsoft Authenticator').fill(otp(setup.secret));
  const wait = response('/auth/security/confirm');
  await page
    .getByRole('button', { name: 'Confirmar Microsoft Authenticator', exact: true })
    .click();
  const result = await (await wait).json();
  assert.equal(result.recovery_codes.length, 10);
  await saved();
  return result.recovery_codes;
}
try {
  const challenge = await login('Administrador');
  await page.getByLabel('Código de autenticación').fill(otp(challenge.secret));
  const completed = response('/auth/complete');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const initial = await (await completed).json();
  assert.equal(initial.recovery_codes.length, 10);
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar códigos', exact: true }).click();
  assert.equal((await downloadWait).suggestedFilename(), 'farmacali-codigos-recuperacion.txt');
  await saved();
  await page.getByRole('heading', { name: /^Bienvenido,/ }).waitFor();
  await page.getByRole('button', { name: 'Abrir menú de usuario' }).click();
  const visible = await page
    .getByRole('button', { name: 'Seguridad', exact: true })
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
  assert.equal(visible, true, 'El menú debe estar por encima de la bienvenida');
  await page.screenshot({ path: `${dir}/menu-sobre-resumen.png`, animations: 'disabled' });
  await page.keyboard.press('Escape');
  let dialog = await security();
  assert.equal(
    await dialog.evaluate((el) => el.parentElement.parentElement === document.body),
    true,
  );
  await dialog.getByText('10 códigos de recuperación disponibles', { exact: true }).waitFor();
  await page.screenshot({ path: `${dir}/configuracion-seguridad.png`, animations: 'disabled' });
  results.push('Menú por encima del resumen, diálogo independiente y descarga de códigos: PASS');
  await dialog.getByRole('button', { name: 'Cambiar', exact: true }).click();
  await dialog.getByLabel('Contraseña actual').fill('Farmacia2026!');
  await dialog
    .getByRole('button', {
      name: 'No tengo el dispositivo: usar un código de recuperación',
      exact: true,
    })
    .click();
  await dialog.getByLabel('Código de recuperación').fill(initial.recovery_codes[0]);
  const setupWait = response('/auth/security');
  await dialog.getByRole('button', { name: 'Continuar con seguridad', exact: true }).click();
  const setup = await (await setupWait).json();
  const replacement = await confirmSetup(setup);
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await logout();
  await login('Administrador');
  await page
    .getByRole('button', { name: 'Perdí mi dispositivo: usar código de recuperación', exact: true })
    .click();
  await page.getByLabel('Código de recuperación').fill(replacement[0]);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('heading', { name: /^Bienvenido,/ }).waitFor();
  dialog = await security();
  await dialog.getByText('9 códigos de recuperación disponibles', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${dir}/seguridad-movil.png`, animations: 'disabled' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  results.push('Cambiar app, entrar sin dispositivo con código de un solo uso y vista móvil: PASS');
  await logout();
  await login('Sucursal');
  await page.getByRole('heading', { name: /^Bienvenido,/ }).waitFor();
  dialog = await security();
  await dialog.getByRole('button', { name: 'Agregar método de inicio de sesión' }).click();
  await dialog.getByLabel('Contraseña actual').fill('Sucursal2026!');
  const optionalWait = response('/auth/security');
  await dialog.getByRole('button', { name: 'Continuar con seguridad', exact: true }).click();
  const optionalCodes = await confirmSetup(await (await optionalWait).json());
  await dialog.getByRole('button', { name: 'Quitar Microsoft Authenticator' }).first().click();
  await dialog.getByLabel('Contraseña actual').fill('Sucursal2026!');
  await dialog
    .getByRole('button', {
      name: 'No tengo el dispositivo: usar un código de recuperación',
      exact: true,
    })
    .click();
  await dialog.getByLabel('Código de recuperación').fill(optionalCodes[0]);
  await dialog
    .getByRole('button', { name: 'Quitar Microsoft Authenticator', exact: true })
    .last()
    .click();
  await dialog.getByText('No agregado', { exact: true }).waitFor();
  results.push('Rol opcional agrega y elimina su autenticador: PASS');
  assert.deepEqual(errors, []);
  writeFileSync(
    `${dir}/verificacion.json`,
    JSON.stringify({ results, browserErrors: errors }, null, 2),
  );
  console.log(results.join('\n'));
} finally {
  await browser.close();
  qa.stop();
}
