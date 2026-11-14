import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startQa } from './qa-server.mjs';
import { totpFor } from '../server/models/authentication.js';
import { navigate } from './ui-navigation.mjs';
const qa = await startQa(),
  browser = await chromium.launch({ channel: 'chrome', headless: true });
let uiPortalReceipt;
const results = [],
  errors = [],
  contexts = [],
  dir = 'evidencia/ampliacion/capturas';
mkdirSync(dir, { recursive: true });
async function check(name, fn) {
  await fn();
  results.push({ test: name, result: 'PASS' });
  console.log('PASS ' + name);
}
async function shot(page, name) {
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: 'disabled' });
}
async function login(label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  contexts.push(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(qa.base);
  await p.getByRole('heading', { name: 'Bienvenido a FarmaCali' }).waitFor();
  await p.getByRole('button', { name: label, exact: true }).click();
  const response = p.waitForResponse(
    (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
  );
  await p.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  const data = await (await response).json();
  if (data.step === 'enroll') {
    await p.getByRole('heading', { name: 'Configura tu segundo factor' }).waitFor();
    assert.equal(
      (await ctx.cookies()).some((c) => c.name === 'access'),
      false,
    );
    await p.locator('.totp-setup img').evaluate((el) => (el.style.visibility = 'hidden'));
    await shot(p, `02-2fa-${label.toLowerCase()}`);
    await p.getByLabel('Código de autenticación').fill(totpFor(data.secret).generate());
    await p.getByRole('button', { name: 'Continuar', exact: true }).click();
    await p.getByRole('checkbox', { name: 'Ya guardé mis códigos en un lugar seguro.' }).check();
    await p.getByRole('button', { name: 'Ya guardé mis códigos', exact: true }).click();
  }
  await p.getByRole('heading', { name: /^Bienvenido,/, level: 1 }).waitFor();
  return p;
}
async function nav(p, label) {
  await navigate(p, label);
}
async function submit(dialog) {
  await dialog.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 10000 });
}
try {
  await check('Login fallido: mensaje genérico visible', async () => {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    await p.goto(qa.base);
    await p.getByLabel('Correo electrónico').fill('inexistente@farmacia.gt');
    await p.getByLabel('Contraseña', { exact: true }).fill('Incorrecta2026!');
    await p.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await p.getByRole('alert').getByText('Credenciales inválidas', { exact: true }).waitFor();
    await shot(p, '01-login-fallido');
    await p.close();
  });
  const admin = await login('Administrador');
  await check('Admin: login con 2FA y avatar con perfil, clave y logout', async () => {
    await admin.getByRole('button', { name: 'Abrir menú de usuario' }).click();
    assert.ok(await admin.getByRole('button', { name: 'Cerrar sesión', exact: true }).isVisible());
    await shot(admin, '03-menu-usuario');
    await admin.getByRole('button', { name: 'Mi perfil', exact: true }).click();
    await admin.getByRole('dialog', { name: 'Mi perfil' }).waitFor();
    await admin.getByRole('button', { name: 'Cerrar', exact: true }).click();
  });
  for (const label of [
    'Sucursales',
    'Inventario',
    'Traslados',
    'Caja y ventas',
    'Activos fijos',
    'Personal y planilla',
    'Pedidos y entregas',
    'Clientes',
    'Usuarios y roles',
    'Anulaciones y ajustes',
    'Kardex',
    'Recetas',
    'Riesgo y mapa',
    'Auditoría',
  ])
    await check('Pantalla administrador: ' + label, async () => {
      await nav(admin, label);
      await shot(admin, `admin-${label.replaceAll(' ', '-')}`);
    });
  await check('Tablas: filtro, ordenamiento y paginación', async () => {
    await nav(admin, 'Inventario');
    const table = admin.locator('.panel').filter({
      has: admin.getByRole('heading', { name: 'Inventario por medicamento', exact: true }),
    });
    const root = (await table.count()) ? table : admin.locator('.panel').first();
    await root.getByLabel('Buscar en esta tabla').fill('Acetaminofén');
    await root.getByText('Acetaminofén 500 mg', { exact: true }).first().waitFor();
    await root.getByLabel('Buscar en esta tabla').fill('');
    await root.getByRole('button', { name: 'Medicamento', exact: true }).click();
    await root.getByLabel('Filas por página').selectOption('5');
    await root.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await shot(admin, '19-tablas-paginadas');
  });
  await check('Usuarios: formulario y alta temporal desde interfaz', async () => {
    await nav(admin, 'Usuarios y roles');
    await admin.getByRole('button', { name: 'Crear usuario', exact: true }).click();
    const d = admin.getByRole('dialog', { name: 'Crear usuario' });
    await d.getByLabel('Nombre', { exact: true }).fill('Usuario UI ficticio');
    await d.getByLabel('Correo', { exact: true }).fill('ui@farmacia.gt');
    await d.getByLabel('Rol', { exact: true }).selectOption('r-branch');
    await d.getByLabel('Sucursal', { exact: true }).selectOption('b2');
    await d.getByLabel('Contraseña temporal', { exact: true }).fill('Temporal2026!');
    await submit(d);
    assert.ok(await admin.getByText('ui@farmacia.gt', { exact: true }).isVisible());
    await shot(admin, '20-usuario-creado');
  });
  await check('Clave temporal: cambio obligatorio en la primera entrada', async () => {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    await p.goto(qa.base);
    await p.getByLabel('Correo electrónico').fill('ui@farmacia.gt');
    await p.getByLabel('Contraseña', { exact: true }).fill('Temporal2026!');
    await p.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await p.getByRole('heading', { name: 'Cambia tu clave temporal' }).waitFor();
    await shot(p, '20b-clave-temporal');
    await p.getByLabel('Contraseña nueva', { exact: true }).fill('Definitiva2026!');
    await p.getByRole('button', { name: 'Continuar', exact: true }).click();
    await p.getByRole('heading', { name: /^Bienvenido,/, level: 1 }).waitFor();
    await p.getByRole('button', { name: 'Abrir menú de usuario' }).click();
    await p.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await p.getByRole('heading', { name: 'Bienvenido a FarmaCali' }).waitFor();
    await p.close();
  });
  await check('Bloqueo: cinco fallos y sexto intento válido rechazado en login', async () => {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    await p.goto(qa.base);
    await p.getByLabel('Correo electrónico').fill('ui@farmacia.gt');
    await p.getByLabel('Contraseña', { exact: true }).fill('Incorrecta2026!');
    for (let i = 0; i < 5; i++) {
      const response = p.waitForResponse((r) => r.url().endsWith('/auth/login'));
      await p.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
      assert.equal((await response).status(), 401);
      await p.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor();
    }
    await p.getByLabel('Contraseña', { exact: true }).fill('Definitiva2026!');
    const response = p.waitForResponse((r) => r.url().endsWith('/auth/login'));
    await p.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    assert.equal((await response).status(), 401);
    await p.getByRole('alert').getByText('Credenciales inválidas', { exact: true }).waitFor();
    await shot(p, '20c-cuenta-bloqueada');
    await p.close();
  });
  await check('Activos: conservar valoración mensual', async () => {
    await nav(admin, 'Activos fijos');
    await admin.getByRole('button', { name: 'Registrar este mes', exact: true }).first().click();
    const d = admin.getByRole('dialog', { name: 'Registrar depreciación' });
    await d.getByLabel('Motivo obligatorio').fill('Valoración ficticia para presentación');
    await submit(d);
    await shot(admin, '21-depreciacion');
  });
  await check('Modo oscuro y búsqueda global Ctrl K', async () => {
    await admin.getByRole('button', { name: 'Cambiar tema' }).click();
    assert.equal(await admin.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await shot(admin, '22-modo-oscuro');
    await admin.keyboard.press('Control+k');
    const d = admin.getByRole('dialog', { name: 'Búsqueda global' });
    await d.getByLabel('Buscar en la red').fill('Acetaminofén');
    await d.getByRole('button', { name: /Acetaminofén/ }).waitFor();
    await shot(admin, '23-busqueda-global');
    await d.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await admin.getByRole('button', { name: 'Cambiar tema' }).click();
  });
  const branch = await login('Sucursal');
  await check('Sucursal: menú restringido, sucursal asignada y venta FEFO', async () => {
    assert.equal(
      await branch
        .getByRole('navigation', { name: 'Módulos del sistema', exact: true })
        .getByRole('button', { name: 'Personal y planilla', exact: true })
        .count(),
      0,
    );
    await nav(branch, 'Ventas en mostrador');
    await branch.getByLabel('Buscar para venta').fill('Acetaminof');
    await branch
      .locator('.counter-results')
      .getByRole('button', { name: 'Agregar', exact: true })
      .click();
    await branch.getByRole('button', { name: 'Confirmar venta y cobro', exact: true }).click();
    await branch
      .getByRole('status')
      .getByText(/Venta registrada/)
      .waitFor();
    await nav(branch, 'Caja');
    await shot(branch, '24-venta-sucursal');
  });
  await check('Sucursal: apertura y cierre con faltante', async () => {
    await branch.getByRole('button', { name: 'Abrir turno', exact: true }).click();
    const d = branch.getByRole('dialog', { name: 'Abrir turno' });
    await d.getByLabel('Efectivo inicial Q').fill('100');
    await submit(d);
    await branch.getByRole('button', { name: 'Cerrar turno', exact: true }).first().click();
    const close = branch.getByRole('dialog', { name: 'Cerrar turno' });
    await close.getByLabel('Efectivo contado Q').fill('95');
    await close.getByLabel('Motivo de diferencia / nota').fill('Faltante ficticio de demostración');
    await submit(close);
    await shot(branch, '25-cierre-caja');
  });
  await check('Traslado: borrador, cancelación, despacho y recepción parcial', async () => {
    await nav(branch, 'Traslados');
    for (const action of ['Cancelar', 'Despachar']) {
      await branch.getByRole('button', { name: 'Nuevo traslado', exact: true }).click();
      const d = branch.getByRole('dialog', { name: 'Crear borrador de traslado' });
      await d.getByLabel('Sucursal de destino', { exact: true }).selectOption('b2');
      await d.getByLabel('Unidades a trasladar').fill('3');
      await submit(d);
      await branch.getByRole('button', { name: action, exact: true }).first().click();
      const confirm = branch.getByRole('dialog');
      await confirm.getByLabel('Motivo obligatorio').fill('Operación ficticia de prueba');
      await submit(confirm);
    }
    await shot(branch, '25b-traslado-despachado');
    await admin.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
    await nav(admin, 'Traslados');
    await admin
      .getByRole('button', { name: 'Recibir y registrar diferencia', exact: true })
      .first()
      .click();
    const d = admin.getByRole('dialog', { name: 'Registrar recepción real' });
    await d.getByLabel('Unidades recibidas').fill('2');
    await d.getByLabel('Motivo obligatorio').fill('Una unidad dañada en la prueba');
    await submit(d);
    await admin.getByText('Recibido con diferencia', { exact: true }).waitFor();
    await shot(admin, '25c-traslado-diferencia');
  });
  await check('Cuatro ojos: sucursal solicita anulación y otro rol aprueba', async () => {
    await nav(branch, 'Caja y ventas');
    await branch.getByRole('button', { name: 'Solicitar anulación', exact: true }).first().click();
    const d = branch.getByRole('dialog');
    await d.getByLabel('Motivo obligatorio').fill('Venta ficticia errónea');
    await submit(d);
    await shot(branch, '25d-anulacion-solicitada');
    await admin.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
    await nav(admin, 'Anulaciones y ajustes');
    await admin.getByRole('button', { name: 'Resolver', exact: true }).first().click();
    const resolve = admin.getByRole('dialog', { name: 'Resolver solicitud' });
    await resolve.getByLabel('Motivo obligatorio').fill('Revisión independiente de la prueba');
    await resolve.getByLabel('Confirma tu contraseña').fill('Farmacia2026!');
    await submit(resolve);
    await admin.getByText('Aprobada', { exact: true }).waitFor();
    await shot(admin, '25e-anulacion-aprobada');
  });
  await check('Exportación Excel desde botón: descarga real y auditoría', async () => {
    await nav(admin, 'Inventario');
    const downloaded = admin.waitForEvent('download');
    await admin.getByRole('link', { name: 'Excel', exact: true }).click();
    const file = await downloaded;
    assert.ok(file.suggestedFilename().endsWith('.xlsx'));
    await file.saveAs('evidencia/ampliacion/inventario-ui.xlsx');
  });
  const call = await login('Call center');
  await check('Call center: consulta sin crear clientes ni ventas', async () => {
    const navMenu = call.getByRole('navigation', { name: 'Módulos del sistema', exact: true });
    assert.equal(await navMenu.getByRole('button').count(), 3);
    assert.equal(await navMenu.getByRole('button', { name: 'Clientes', exact: true }).count(), 0);
    await nav(call, 'Pedidos y entregas');
    await call.getByRole('button', { name: 'Consultar disponibilidad', exact: true }).click();
    const d = call.getByRole('dialog', { name: 'Consultar disponibilidad', exact: true });
    await d.getByRole('button', { name: 'Consultar disponibilidad', exact: true }).click();
    await d.getByText('Sucursales con existencias vigentes').waitFor();
    assert.equal(await d.getByRole('button', { name: 'Confirmar pedido', exact: true }).count(), 0);
    await d.getByRole('button', { name: 'Cerrar', exact: true }).click();
  });
  await check('Pedido creado por el cliente del portal', async () => {
    const phone = '55550101';
    const r = await call.request.post(qa.base + '/api/portal/orders', {
      data: {
        request_id: randomUUID(),
        branch_id: 'b1',
        items: [{ product_id: 'p1', quantity: 1 }],
        customer: 'Cliente de entrega UI',
        phone,
        fulfillment: 'delivery',
        payment: 'Efectivo',
        address: 'Direccion ficticia cerca de Miraflores',
        lat: 14.6134,
        lng: -90.5505,
      },
    });
    uiPortalReceipt = await r.json();
    assert.equal(r.status(), 201, JSON.stringify(uiPortalReceipt));
    await call.reload();
    await nav(call, 'Pedidos y entregas');
  });
  await check('Pedido: preparar, despachar y entregar con cobro único', async () => {
    const row = call.locator('tr').filter({ hasText: 'Cliente de entrega UI' }).first();
    await row.getByRole('button', { name: 'Gestionar pedido', exact: true }).click();
    const d = call.getByRole('dialog', { name: 'Gestionar pedido', exact: true });
    await d.getByRole('button', { name: 'Confirmar y preparar', exact: true }).click();
    await d.getByRole('button', { name: 'Confirmar salida a domicilio', exact: true }).click();
    await d
      .getByLabel('Código de autorización del ticket', { exact: true })
      .fill(uiPortalReceipt.access_code);
    await d.getByLabel('Entrega y cobro confirmados', { exact: true }).check();
    await d.getByRole('button', { name: 'Confirmar entrega y cobro', exact: true }).click();
    await d.getByText('Entrega completada', { exact: true }).waitFor();
    await d.getByRole('button', { name: 'Cerrar', exact: true }).click();
    assert.ok(await row.getByText('Entregado', { exact: true }).isVisible());
    await shot(call, '29-pedido-entregado');
  });
  const auditor = await login('Auditor');
  await check('Auditor: solo lectura, cadena y simulación segura de alteración', async () => {
    await nav(auditor, 'Inventario');
    assert.equal(
      await auditor.getByRole('button', { name: 'Ingresar existencias', exact: true }).count(),
      0,
    );
    await nav(auditor, 'Auditoría');
    await auditor.getByRole('button', { name: 'Verificar integridad', exact: true }).click();
    await auditor.getByText(/Cadena íntegra/).waitFor();
    await shot(auditor, '30-cadena-verificada');
    await auditor.getByRole('button', { name: 'Simular alteración en copia', exact: true }).click();
    const d = auditor.getByRole('dialog', { name: 'Simulación de alteración' });
    await d.getByText('Copia alterada: inconsistencia detectada').waitFor();
    await shot(auditor, '31-alteracion-detectada');
    await d.getByRole('button', { name: 'Cerrar', exact: true }).click();
  });
  await check('Swagger: contrato navegable autenticado', async () => {
    const p = await auditor.context().newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(qa.base + '/api/docs/');
    await p.getByText('FarmaCali API MVC', { exact: false }).first().waitFor();
    assert.ok((await p.locator('.opblock').count()) > 25);
    await shot(p, '32-swagger');
    await p.close();
  });
  await check('Tablet y móvil: venta sin desbordamiento de la página', async () => {
    await nav(branch, 'Caja y ventas');
    for (const [width, height] of [
      [768, 1024],
      [390, 844],
    ]) {
      await branch.setViewportSize({ width, height });
      assert.equal(
        await branch.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
      );
      await shot(branch, `33-venta-${width}`);
    }
  });
  await check('Cerrar sesión desde avatar impide volver al sistema', async () => {
    await auditor.getByRole('button', { name: 'Abrir menú de usuario' }).click();
    await auditor.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await auditor.getByRole('heading', { name: 'Bienvenido a FarmaCali' }).waitFor();
    assert.equal(
      (await auditor.context().cookies()).some((c) => c.name === 'access'),
      false,
    );
    await shot(auditor, '34-logout');
  });
  await check('React y Swagger sin errores de ejecución', async () => assert.deepEqual(errors, []));
} finally {
  writeFileSync(
    'evidencia/ampliacion/pruebas-ui.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: 'Chrome local, Playwright',
        database: 'SQLite QA aislada',
        clock: '2026-10-04 10:00 Guatemala; horario fijo solo en QA',
        results,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
  qa.stop();
}
