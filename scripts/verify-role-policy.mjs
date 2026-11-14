import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { startQa, Client } from './qa-server.mjs';
import { totpFor } from '../server/models/authentication.js';
const qa = await startQa(),
  browser = await chromium.launch({ channel: 'chrome', headless: true });
mkdirSync('evidencia/roles', { recursive: true });
async function login(email, password) {
  const c = new Client(qa.base);
  let r = await c.request('/auth/login', { email, password });
  if (r.data.step === 'enroll')
    r = await c.request('/auth/complete', {
      challenge: r.data.challenge,
      code: totpFor(r.data.secret).generate(),
    });
  assert.ok(r.data.user, JSON.stringify(r.data));
  return { c, user: r.data.user };
}
try {
  const admin = await login('admin@farmacia.gt', 'Farmacia2026!'),
    branch = await login('sucursal@farmacia.gt', 'Sucursal2026!'),
    call = await login('callcenter@farmacia.gt', 'Operador2026!'),
    auditor = await login('auditor@farmacia.gt', 'Auditor2026!');
  const snap = (await admin.c.request('/snapshot')).data;
  for (const key of ['inventory', 'cash', 'assets', 'orders'])
    assert.equal(snap[key].length, 0, 'Admin no recibe ' + key);
  assert.equal((await admin.c.request('/sales/cart', {})).status, 403);
  assert.equal((await admin.c.request('/procurement')).status, 403);
  const local = (await branch.c.request('/snapshot')).data;
  for (const key of ['inventory', 'assets', 'employees', 'payroll'])
    assert.ok(local[key].every((r) => r.branch_id === branch.user.branch_id));
  assert.ok(local.audit.every((r) => r.branch_id === branch.user.branch_id));
  assert.equal(local.history.length, 0);
  const branchAudit = (await branch.c.request('/history/audit')).data;
  assert.ok(branchAudit.rows.every((r) => r.branch_id === branch.user.branch_id));
  assert.equal((await branch.c.request('/users', {})).status, 403);
  assert.equal((await branch.c.request('/branches', {})).status, 403);
  assert.equal((await branch.c.request('/procurement')).status, 200);
  assert.equal((await branch.c.request('/inventory', {})).status, 403);
  assert.equal(
    (await branch.c.request('/orders/not-a-real-id/status', { status: 'Preparando' }, 'PATCH'))
      .status,
    403,
  );
  assert.equal(
    (await branch.c.request('/deliveries/not-a-real-id/assign', { courier_id: 'u-courier' }))
      .status,
    403,
  );
  assert.equal((await call.c.request('/sales/cart', {})).status, 400);
  assert.equal((await call.c.request('/history/cash')).status, 403);
  assert.equal((await auditor.c.request('/sales/cart', {})).status, 403);
  const asset = local.assets[0];
  assert.ok(asset);
  assert.equal(
    (
      await branch.c.request(`/manage/assets/${asset.id}`, {
        reason: 'Probar limite de sucursal',
        values: { branch_id: 'b2' },
      })
    ).status,
    403,
  );
  const incident = await branch.c.request('/asset-incidents', {
    asset_id: asset.id,
    description: 'Falla de encendido, equipo de prueba',
  });
  assert.equal(incident.status, 201, JSON.stringify(incident.data));
  const incidents = await auditor.c.request('/asset-incidents');
  assert.ok(incidents.data.some((i) => i.id === incident.data.id));
  assert.equal(
    (
      await auditor.c.request('/asset-incidents', {
        asset_id: asset.id,
        description: 'Prueba no autorizada',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await branch.c.request(`/asset-incidents/${incident.data.id}/resolve`, {
        resolution: 'Revision tecnica y encendido correcto',
      })
    ).status,
    200,
  );
  const audit = (await admin.c.request('/history/audit?user_id=' + branch.user.id)).data;
  assert.ok(audit.total > 0);
  assert.ok(
    audit.rows.every(
      (r) =>
        r.user_id === branch.user.id || (r.entity === 'usuario' && r.entity_id === branch.user.id),
    ),
  );
  for (const [role, client] of [
    ['admin', admin.c],
    ['branch', branch.c],
    ['callcenter', call.c],
    ['auditor', auditor.c],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(client.browserCookies());
    const p = await context.newPage();
    await p.goto(qa.base);
    await p.getByRole('heading', { name: /^Bienvenido,/ }).waitFor();
    const nav = p.getByRole('navigation', { name: 'Módulos del sistema', exact: true });
    const labels = await nav
      .getByRole('button')
      .evaluateAll((es) => es.map((e) => e.getAttribute('aria-label')));
    if (role === 'admin') {
      assert.ok(labels.includes('Usuarios y roles'));
      assert.ok(!labels.includes('Ventas en mostrador'));
      assert.ok(!labels.includes('Inventario'));
      await p.getByText('Usuarios del sistema', { exact: true }).waitFor();
    }
    if (role === 'branch') {
      assert.ok(labels.includes('Activos fijos'));
      assert.ok(labels.includes('Abastecimiento'));
      assert.ok(!labels.includes('Usuarios y roles'));
    }
    if (role === 'callcenter') {
      assert.ok(labels.includes('Ventas en mostrador'));
      assert.ok(!labels.includes('Caja'));
    }
    if (role === 'auditor') {
      await nav.getByRole('button', { name: 'Ventas en mostrador', exact: true }).click();
      assert.equal(
        await p.getByRole('button', { name: 'Confirmar venta y cobro', exact: true }).count(),
        0,
      );
      await nav.getByRole('button', { name: 'Auditoría', exact: true }).click();
      await p.getByRole('button', { name: 'Riesgo y mapa', exact: true }).click();
      await p.waitForFunction(
        () => document.querySelectorAll('.leaflet-tile-loaded').length > 0,
        {},
        { timeout: 20000 },
      );
      assert.ok(await p.locator('.leaflet-tile-loaded').count());
      await p.waitForFunction(
        () => {
          const map = document.querySelector('.leaflet-container'),
            r = map.getBoundingClientRect(),
            tiles = [...map.querySelectorAll('img.leaflet-tile-loaded')]
              .filter((i) => i.complete && i.naturalWidth > 0)
              .map((i) => i.getBoundingClientRect());
          return [0.1, 0.5, 0.9].every((f) =>
            tiles.some(
              (t) =>
                t.left <= r.left + r.width * f &&
                t.right >= r.left + r.width * f &&
                t.top <= r.top + r.height / 2 &&
                t.bottom >= r.top + r.height / 2,
            ),
          );
        },
        {},
        { timeout: 25000 },
      );
      await p.waitForTimeout(400);
      await p.screenshot({ path: 'evidencia/roles/mapa-funcionando.png', fullPage: true });
    }
    await p.screenshot({ path: `evidencia/roles/${role}.png`, fullPage: true });
    await p.setViewportSize({ width: 390, height: 844 });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await context.close();
  }
  const mfa = await admin.c.request('/roles/r-branch/mfa', {
    enabled: true,
    reason: 'Exigir seguridad en gerencia de prueba',
    password: 'Farmacia2026!',
  });
  assert.equal(mfa.status, 200, JSON.stringify(mfa.data));
  assert.equal((await branch.c.request('/auth/me')).status, 401);
  const next = await branch.c.request('/auth/login', {
    email: 'sucursal@farmacia.gt',
    password: 'Sucursal2026!',
  });
  assert.equal(next.data.step, 'enroll');
  console.log(
    'PASS: administrador de sistemas, gerente limitado a sucursal, call center con mostrador sin caja, auditor de consulta, fallas auditadas, actividad por usuario, MFA obligatorio por rol y mapa con calles cargadas.',
  );
} finally {
  await browser.close();
  qa.stop();
}
