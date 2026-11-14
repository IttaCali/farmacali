import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Database, db } from '../server/database/db.js';
import { initialize } from '../server/database/init.js';
import { Authentication, totpFor } from '../server/models/authentication.js';
import { Pharmacy } from '../server/models/pharmacy.js';
import { Management } from '../server/models/management.js';
import { verifyRecords } from '../server/models/audit.js';
import { decrypt } from '../server/security/crypto.js';
const database = new Database('', ':memory:'),
  auth = new Authentication(database),
  model = new Pharmacy(database),
  manage = new Management(database),
  q = database.query.bind(database);
before(async () => initialize(database));
after(async () => {
  await database.close();
  await db.close();
});
test('Migración conserva roles anteriores, agrega repartidor y mantiene salarios cifrados', async () => {
  assert.equal((await q('SELECT * FROM roles')).rows.length, 5);
  const row = (await q('SELECT * FROM employees LIMIT 1')).rows[0];
  assert.equal(row.salary_cents, 1);
  assert.ok(Number(decrypt(row.salary_cipher)) > 1);
});
test('Admin debe enrolar TOTP antes de obtener una sesión', async () => {
  const first = await auth.login({ email: 'admin@farmacia.gt', password: 'Farmacia2026!' });
  assert.equal(first.step, 'enroll');
  assert.ok(first.qr.startsWith('data:image/png'));
  assert.equal(first.access, undefined);
  const session = await auth.complete({
    challenge: first.challenge,
    code: totpFor(first.secret).generate(),
  });
  assert.equal(session.user.role, 'admin');
  assert.ok(session.access);
  await assert.rejects(() =>
    auth.complete({ challenge: first.challenge, code: totpFor(first.secret).generate() }),
  );
});
test('Cookies/sesión revocable: logout invalida access y refresh', async () => {
  const session = await auth.login({ email: 'sucursal@farmacia.gt', password: 'Sucursal2026!' });
  const identity = await auth.authenticate(session.access);
  await auth.logout(identity.session, identity.user);
  await assert.rejects(() => auth.authenticate(session.access), /Sesión inválida/);
  await assert.rejects(() => auth.refresh(session.refresh, session.csrf));
});
test('Rotación refresh y reutilización revocan la sesión', async () => {
  const session = await auth.login({ email: 'callcenter@farmacia.gt', password: 'Operador2026!' }),
    next = await auth.refresh(session.refresh, session.csrf);
  assert.notEqual(next.refresh, session.refresh);
  await assert.rejects(() => auth.refresh(session.refresh, session.csrf));
  await assert.rejects(() => auth.authenticate(next.access));
});
test('Cinco fallos bloquean cuenta y quedan registrados sin revelar el correo', async () => {
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      () => auth.login({ email: 'callcenter@farmacia.gt', password: 'incorrecta' }),
      /Credenciales inválidas/,
    );
  await assert.rejects(
    () => auth.login({ email: 'callcenter@farmacia.gt', password: 'Operador2026!' }),
    /Credenciales inválidas/,
  );
  const row = (await q("SELECT * FROM users WHERE id='u-operator'")).rows[0];
  assert.ok(row.locked_until > new Date().toISOString());
  assert.equal(row.failed_attempts, 5);
});
test('Gerente de sucursal recibe solo su personal e inventario; sin bitácora global', async () => {
  const user = auth.publicUser(await auth.user('u-branch')),
    snapshot = await model.snapshot(user);
  assert.ok(snapshot.employees.length > 0);
  assert.ok(snapshot.employees.every((e) => e.branch_id === user.branch_id));
  assert.ok(snapshot.cash.every((c) => c.branch_id === user.branch_id));
  assert.deepEqual(snapshot.audit, []);
  assert.ok(snapshot.inventory.every((i) => i.branch_id === user.branch_id));
  assert.equal(snapshot.branches.length, 1);
});
test('Sucursal enviada por el cliente es ignorada al ingresar stock', async () => {
  const user = auth.publicUser(await auth.user('u-branch'));
  const stock = await model.stock(
    {
      branch_id: 'b2',
      product_id: 'p1',
      lot: 'QA-AISLAMIENTO',
      expires_on: '2028-01-01',
      quantity: 2,
    },
    user,
  );
  assert.equal(
    (await q('SELECT branch_id FROM inventory WHERE id=$1', [stock.id])).rows[0].branch_id,
    'b1',
  );
});
test('Operador no puede trasladar o recibir stock ajeno', async () => {
  const user = auth.publicUser(await auth.user('u-branch')),
    stock = (await q("SELECT * FROM inventory WHERE branch_id='b2' LIMIT 1")).rows[0];
  await assert.rejects(
    () => model.transfer({ inventory_id: stock.id, destination_id: 'b3', quantity: 1 }, user),
    /otra sucursal/,
  );
});
test('Auditoría: trigger bloquea UPDATE/DELETE y cadena detecta copia alterada', async () => {
  const report = await manage.integrity();
  assert.equal(report.valid, true);
  await assert.rejects(() => q("UPDATE audit_log SET action='ALTERADO'"), /solo de inserción/);
  await assert.rejects(() => q('DELETE FROM audit_log'), /solo de inserción/);
  const rows = (await q('SELECT * FROM audit_log ORDER BY sequence')).rows.map((r) => ({ ...r }));
  rows[0].details = 'alterado';
  assert.equal(verifyRecords(rows).valid, false);
});
test('Cuatro ojos: solicitante no aprueba su propio ajuste', async () => {
  const user = auth.publicUser(await auth.user('u-admin')),
    stock = (await q('SELECT * FROM inventory LIMIT 1')).rows[0];
  const request = await manage.request(
    { type: 'stock_adjust', entity_id: stock.id, quantity: -1, reason: 'Merma ficticia' },
    user,
  );
  await assert.rejects(
    () =>
      manage.decision(
        request.id,
        { approve: true, reason: 'Aprobar', password: 'Farmacia2026!' },
        user,
      ),
    /propia solicitud/,
  );
});
test('Baja de sucursal con stock y baja de propia cuenta se rechazan', async () => {
  const user = auth.publicUser(await auth.user('u-admin'));
  await assert.rejects(
    () =>
      manage.edit(
        'branches',
        'b1',
        { values: { action: 'deactivate' }, reason: 'Prueba', password: 'Farmacia2026!' },
        user,
      ),
    /existencias/,
  );
  await assert.rejects(
    () =>
      manage.edit(
        'users',
        user.id,
        { values: { action: 'deactivate' }, reason: 'Prueba', password: 'Farmacia2026!' },
        user,
      ),
    /propia cuenta/,
  );
});
