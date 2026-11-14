import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startQa, Client } from './qa-server.mjs';
import { totpFor } from '../server/models/authentication.js';
import ExcelJS from 'exceljs';
const qa = await startQa(),
  results = [];
const httpEvidence = [];
async function check(name, fn) {
  await fn();
  results.push({ test: name, result: 'PASS' });
  console.log('PASS ' + name);
}
async function login(email, password) {
  const c = new Client(qa.base);
  let r = await c.request('/auth/login', { email, password });
  if (r.data.step === 'enroll')
    r = await c.request('/auth/complete', {
      challenge: r.data.challenge,
      code: totpFor(r.data.secret).generate(),
    });
  assert.equal(r.status, 200);
  return c;
}
try {
  await check('La sesión solo se entrega después del segundo factor', async () => {
    const c = new Client(qa.base),
      r = await c.request('/auth/login', { email: 'admin@farmacia.gt', password: 'Farmacia2026!' });
    assert.equal(r.data.step, 'enroll');
    assert.equal(c.jar.has('access'), false);
  });
  const admin = await login('admin@farmacia.gt', 'Farmacia2026!'),
    branch = await login('sucursal@farmacia.gt', 'Sucursal2026!'),
    call = await login('callcenter@farmacia.gt', 'Operador2026!'),
    auditor = await login('auditor@farmacia.gt', 'Auditor2026!');
  await check('Cookies HttpOnly y SameSite Strict; el cuerpo no devuelve tokens', async () => {
    const r = await branch.request('/auth/me');
    assert.equal(r.status, 200);
    assert.ok(branch.jar.has('access'));
    const out = await call.request('/auth/refresh', {});
    assert.equal(out.data.access, undefined);
    assert.ok(
      out.response.headers
        .getSetCookie()
        .find((v) => v.startsWith('access='))
        .includes('HttpOnly'),
    );
    assert.ok(out.response.headers.getSetCookie().every((v) => v.includes('SameSite=Strict')));
  });
  await check('Gerente: snapshot, auditoría e inventario limitados a su sucursal', async () => {
    const denied = await branch.request('/inventory', {}, 'POST');
    httpEvidence.push({
      case: 'Gerente intenta ingresar stock directamente',
      method: 'POST',
      path: '/api/inventory',
      status: denied.status,
      body: denied.data,
    });
    const s = (await branch.request('/snapshot')).data;
    assert.ok(s.payroll.every((r) => r.branch_id === 'b1'));
    assert.ok(s.audit.every((r) => r.branch_id === 'b1'));
    assert.ok(s.inventory.every((i) => i.branch_id === 'b1'));
    assert.equal(denied.status, 403);
    assert.equal(
      (await branch.request('/orders/no-order/status', { status: 'Preparando' }, 'PATCH')).status,
      403,
    );
    assert.equal(
      (await branch.request('/deliveries/no-order/assign', { courier_id: 'u-courier' })).status,
      403,
    );
  });
  await check('Auditor: 403 al crear medicamentos; administrador no exporta bitácora', async () => {
    const denied = await auditor.request('/procurement/medicines', {
      supplier_id: 'supplier-qa',
      branch_id: 'b1',
      name: 'Medicamento ficticio',
      component: 'Componente de prueba',
      sku: 'MED-PRUEBA-403',
      category: 'General',
      price: 12,
      unit_cost: 7,
      quantity: 1,
      expires_on: '2035-01-01',
      payment: 'Transferencia',
      document: 'FAC-PRUEBA',
    });
    assert.equal(denied.status, 403);
    httpEvidence.push({
      case: 'Auditor intenta crear medicamento',
      method: 'POST',
      path: '/api/procurement/medicines',
      status: denied.status,
      body: denied.data,
    });
    assert.equal((await admin.request('/reports/audit/csv')).status, 403);
  });
  await check('Call center no puede crear ventas ni consultar planilla', async () => {
    assert.equal((await call.request('/sales', {})).status, 403);
    const s = (await call.request('/snapshot')).data;
    assert.deepEqual(s.cash, []);
    assert.deepEqual(s.employees, []);
  });
  await check('CSRF y origen no permitido rechazan escritura', async () => {
    assert.equal(
      (await branch.request('/inventory', {}, 'POST', { 'X-CSRF-Token': 'incorrecto' })).status,
      403,
    );
    assert.equal(
      (await branch.request('/inventory', {}, 'POST', { Origin: 'https://ajeno.invalid' })).status,
      403,
    );
  });
  await check('Sucursal falsificada se ignora y SQL se trata como datos', async () => {
    const r = await branch.request('/inventory', {
      branch_id: 'b2',
      product_id: 'p1',
      lot: "QA'; DROP TABLE inventory;--",
      expires_on: '2028-12-31',
      quantity: 3,
      minimum: 1,
    });
    assert.equal(r.status, 201);
    const s = (await branch.request('/snapshot')).data;
    assert.equal(s.inventory.find((i) => i.id === r.data.id).branch_id, 'b1');
  });
  await check('Solicitud de ajuste: operador solicita y admin distinto aprueba', async () => {
    const s = (await branch.request('/snapshot')).data,
      stock = s.inventory.find((i) => i.quantity > 5),
      request = await branch.request('/requests', {
        type: 'stock_adjust',
        entity_id: stock.id,
        quantity: -1,
        reason: 'Merma ficticia',
      });
    assert.equal(request.status, 201);
    assert.equal(
      (
        await admin.request(`/requests/${request.data.id}/decision`, {
          approve: true,
          reason: 'Revisión conforme',
          password: 'Farmacia2026!',
        })
      ).status,
      200,
    );
  });
  await check(
    'Anulación de venta: conserva documento, reintegra stock y contra-asiento',
    async () => {
      const s = (await branch.request('/snapshot')).data,
        total = s.inventory
          .filter((i) => i.product_id === 'p1')
          .reduce((n, i) => n + i.quantity, 0),
        sale = await branch.request('/sales', {
          branch_id: 'b2',
          product_id: 'p1',
          quantity: 2,
          payment: 'Efectivo',
          nit: 'CF',
          prescription_confirmed: false,
        });
      assert.equal(sale.status, 201);
      const request = await branch.request('/requests', {
        type: 'sale_void',
        entity_id: sale.data.id,
        reason: 'Venta de prueba errónea',
      });
      assert.equal(
        (
          await admin.request(`/requests/${request.data.id}/decision`, {
            approve: true,
            reason: 'Confirmado',
            password: 'Farmacia2026!',
          })
        ).status,
        200,
      );
      const after = (await branch.request('/snapshot')).data;
      assert.equal(
        after.inventory.filter((i) => i.product_id === 'p1').reduce((n, i) => n + i.quantity, 0),
        total,
      );
      assert.equal(after.orders.find((o) => o.id === sale.data.id).status, 'Cancelado');
      assert.ok(after.cash.some((c) => c.category === 'Contra-asiento'));
    },
  );
  await check('Cierre de caja calcula esperado y diferencia', async () => {
    const shift = await branch.request('/shifts', { branch_id: 'b2', opening: 100 });
    assert.equal(shift.status, 201);
    const closed = await branch.request(`/shifts/${shift.data.id}/close`, {
      counted: 95,
      notes: 'Faltante ficticio',
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.data.difference_cents, -500);
  });
  await check('Usuarios: alta temporal, cambio obligatorio y revocación remota', async () => {
    const r = await admin.request('/users', {
      name: 'Operador de prueba',
      email: 'qa@farmacia.gt',
      password: 'Temporal2026!',
      role_id: 'r-branch',
      branch_id: 'b2',
    });
    assert.equal(r.status, 201);
    const client = new Client(qa.base),
      first = await client.request('/auth/login', {
        email: 'qa@farmacia.gt',
        password: 'Temporal2026!',
      });
    assert.equal(first.data.step, 'password');
    const complete = await client.request('/auth/complete', {
      challenge: first.data.challenge,
      new_password: 'Definitiva2026!',
    });
    assert.equal(complete.status, 200);
    assert.ok(complete.data.user);
    assert.equal(
      (
        await admin.request(`/manage/users/${r.data.id}`, {
          reason: 'Prueba remota',
          values: { action: 'revoke_sessions' },
        })
      ).status,
      200,
    );
    assert.equal((await client.request('/snapshot')).status, 401);
  });
  await check('Cliente CUI y direcciones, recetas y canal de atención', async () => {
    const c = await call.request('/clients', {
      name: 'Cliente ficticio',
      nit: 'CF',
      cui: '1234567890123',
      phone: '5555 0101',
      address: 'Dirección ficticia',
      lat: 14.6134,
      lng: -90.5505,
    });
    assert.equal(c.status, 201);
    assert.equal(
      (
        await call.request(`/clients/${c.data.id}/addresses`, {
          label: 'Oficina',
          address: 'Otra dirección ficticia',
          lat: 14.614,
          lng: -90.551,
        })
      ).status,
      201,
    );
    const snapshot = (await call.request('/snapshot')).data;
    assert.equal(snapshot.clients[0].cui_cipher, undefined);
    assert.equal(snapshot.addresses.length, 2);
  });
  await check('Cotización explica stock, cola, horarios, pago y score', async () => {
    const quote = await call.request('/delivery/quote', {
      product_id: 'p1',
      quantity: 1,
      lat: 14.6134,
      lng: -90.5505,
    });
    assert.equal(quote.status, 200);
    assert.ok(quote.data.options[0].explanation);
    assert.ok(Array.isArray(quote.data.options[0].payment_methods));
    assert.equal(typeof quote.data.options[0].score, 'number');
  });
  await check('Excel se abre y PDF contiene formato válido', async () => {
    const xlsx = await fetch(qa.base + '/api/reports/inventory/xlsx', {
      headers: { Cookie: [...branch.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    assert.equal(xlsx.status, 200);
    const buffer = Buffer.from(await xlsx.arrayBuffer()),
      book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    assert.ok(book.worksheets[0].rowCount > 1);
    const pdf = await fetch(qa.base + '/api/reports/cash/pdf', {
        headers: { Cookie: [...branch.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      }),
      pdfBuffer = Buffer.from(await pdf.arrayBuffer());
    assert.equal(pdf.status, 200);
    assert.equal(pdfBuffer.subarray(0, 5).toString(), '%PDF-');
    mkdirSync('evidencia/ampliacion', { recursive: true });
    writeFileSync('evidencia/ampliacion/inventario-qa.xlsx', buffer);
    writeFileSync('evidencia/ampliacion/caja-qa.pdf', pdfBuffer);
  });
  await check('Swagger describe el contrato y auditor detecta alteración en copia', async () => {
    const spec = await auditor.request('/openapi.json');
    assert.equal(spec.status, 200);
    assert.equal(spec.data.openapi, '3.1.0');
    assert.ok(spec.data.paths['/sales/cart'].post.requestBody);
    assert.ok(spec.data.paths['/portal/cancel'].post.requestBody);
    const simulation = await auditor.request('/audit/simulation', {});
    assert.equal(simulation.data.original.valid, true);
    assert.equal(simulation.data.simulation.valid, false);
    httpEvidence.push({
      case: 'Copia alterada, original conservado',
      method: 'POST',
      path: '/api/audit/simulation',
      status: simulation.status,
      body: simulation.data,
    });
  });
  await check('Cinco fallos bloquean la cuenta; sexto ingreso válido se rechaza', async () => {
    const failed = new Client(qa.base);
    for (let attempt = 1; attempt <= 5; attempt++) {
      const r = await failed.request('/auth/login', {
        email: 'qa@farmacia.gt',
        password: 'Incorrecta2026!',
      });
      assert.equal(r.status, 401);
      httpEvidence.push({
        case: `Login fallido ${attempt}`,
        method: 'POST',
        path: '/api/auth/login',
        status: r.status,
        body: r.data,
      });
    }
    const locked = await failed.request('/auth/login', {
      email: 'qa@farmacia.gt',
      password: 'Definitiva2026!',
    });
    assert.equal(locked.status, 401);
    httpEvidence.push({
      case: 'Sexto ingreso con clave correcta, cuenta bloqueada',
      method: 'POST',
      path: '/api/auth/login',
      status: locked.status,
      body: locked.data,
    });
  });
  await check('Auditor verifica cadena y logout revoca la sesión', async () => {
    const r = await auditor.request('/audit/integrity');
    assert.equal(r.data.valid, true);
    assert.equal((await auditor.request('/auth/logout', {})).status, 200);
    assert.equal((await auditor.request('/snapshot')).status, 401);
  });
} finally {
  mkdirSync('evidencia/ampliacion', { recursive: true });
  writeFileSync(
    'evidencia/ampliacion/http-seguridad.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        note: 'Solicitudes HTTP reales mediante fetch; no son capturas de Postman. Sin cookies, claves ni secretos TOTP.',
        requests: httpEvidence,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    'evidencia/ampliacion/pruebas-api.json',
    JSON.stringify(
      { date: new Date().toISOString(), database: 'SQLite QA aislada', results },
      null,
      2,
    ),
  );
  qa.stop();
}
