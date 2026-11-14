import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001/api';
const results = [];
async function request(path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json() };
}
async function check(name, fn) {
  await fn();
  results.push({ test: name, result: 'PASS' });
  console.log(`PASS ${name}`);
}
await check('API saludable y base disponible', async () => {
  const r = await request('/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'ok');
});
await check('Consulta sin sesión rechazada', async () =>
  assert.equal((await request('/snapshot')).status, 401),
);
await check('Contraseña incorrecta rechazada', async () =>
  assert.equal(
    (await request('/auth/login', { body: { email: 'admin@farmacia.gt', password: 'incorrecta' } }))
      .status,
    401,
  ),
);
const admin = await request('/auth/login', {
  body: { email: 'admin@farmacia.gt', password: 'Farmacia2026!' },
});
assert.equal(admin.status, 200);
const auditor = await request('/auth/login', {
  body: { email: 'auditor@farmacia.gt', password: 'Auditor2026!' },
});
assert.equal(auditor.status, 200);
const operator = await request('/auth/login', {
  body: { email: 'operador@farmacia.gt', password: 'Operador2026!' },
});
assert.equal(operator.status, 200);
await check('Administrador inicia sesión y consulta datos', async () => {
  const r = await request('/snapshot', { token: admin.data.token });
  assert.equal(r.status, 200);
  assert.ok(r.data.branches.length >= 6);
  assert.equal(r.data.products.length, 8);
});
await check('Auditor consulta, pero no puede registrar movimientos', async () => {
  assert.equal((await request('/snapshot', { token: auditor.data.token })).status, 200);
  assert.equal((await request('/cash', { token: auditor.data.token, body: {} })).status, 403);
  assert.equal((await request('/inventory', { token: auditor.data.token, body: {} })).status, 403);
});
await check('Operador no puede administrar planilla ni activos', async () => {
  assert.equal(
    (await request('/payroll', { token: operator.data.token, body: { period: '2026-10' } })).status,
    403,
  );
  assert.equal((await request('/assets', { token: operator.data.token, body: {} })).status, 403);
});
await check('Cotización permite al auditor obtener ETA y stock', async () => {
  const r = await request('/delivery/quote', {
    token: auditor.data.token,
    body: { product_id: 'p1', quantity: 1, lat: 14.6134, lng: -90.5505 },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.options[0].id, 'b1');
  assert.equal(r.data.options[0].eta_minutes, 20);
});
await check('Inventario rechaza cantidad inválida desde HTTP', async () =>
  assert.equal(
    (await request('/inventory', { token: admin.data.token, body: { quantity: -1 } })).status,
    400,
  ),
);
await check('JWT manipulado rechazado', async () =>
  assert.equal((await request('/snapshot', { token: admin.data.token + 'x' })).status, 401),
);
await check('Ruta API inexistente devuelve JSON 404 con sesión válida', async () => {
  const r = await request('/no-existe', { token: admin.data.token });
  assert.equal(r.status, 404);
  assert.ok(r.data.error);
});
mkdirSync('evidencia', { recursive: true });
writeFileSync(
  'evidencia/pruebas-api.json',
  JSON.stringify({ timestamp: new Date().toISOString(), base, results }, null, 2),
);
