import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Database, db } from '../server/database/db.js';
import { initialize } from '../server/database/init.js';
import { Pharmacy } from '../server/models/pharmacy.js';
import { Management } from '../server/models/management.js';
import { Authentication } from '../server/models/authentication.js';
import { deliveryEstimate } from '../server/security/delivery.js';
const database = new Database('', ':memory:'),
  clock = () => new Date('2026-10-04T16:00:00Z');
const model = new Pharmacy(database, clock),
  manage = new Management(database, clock),
  auth = new Authentication(database),
  q = database.query.bind(database);
let admin, branch, second, auditor;
before(async () => {
  await initialize(database);
  admin = auth.publicUser(await auth.user('u-admin'));
  branch = auth.publicUser(await auth.user('u-branch'));
  auditor = auth.publicUser(await auth.user('u-auditor'));
  const u = await manage.createUser(
    {
      name: 'Admin independiente',
      email: 'segundo@farmacia.gt',
      password: 'Segundo2026!',
      role_id: 'r-admin',
    },
    admin,
  );
  second = auth.publicUser(await auth.user(u.id));
});
after(async () => {
  await database.close();
  await db.close();
});
const order = (branchId = 'b1') => ({
  branch_id: branchId,
  product_id: 'p1',
  quantity: 2,
  payment: 'Efectivo',
  customer: 'Prueba operativa',
  phone: '5555 0101',
  address: 'Dirección ficticia',
  lat: 14.6134,
  lng: -90.5505,
});
test('Horario y cola: rechaza cierre y recalcula ETA en confirmación', async () => {
  const b = { opens_at: '07:00', closes_at: '22:00' };
  assert.equal(deliveryEstimate(b, 1, 0, new Date('2026-10-05T03:55:00Z')).serviceable, false);
  assert.equal(
    deliveryEstimate(b, 1, 0, new Date('2026-10-04T11:00:00Z')).unavailable_reason,
    'Sucursal cerrada',
  );
  const before = await model.quote({ product_id: 'p1', quantity: 2, lat: 14.6134, lng: -90.5505 });
  const created = await model.order(order(), admin);
  assert.equal(created.eta_minutes, before.options.find((b) => b.id === 'b1').eta_minutes);
  const after = await model.quote({ product_id: 'p1', quantity: 2, lat: 14.6134, lng: -90.5505 });
  assert.equal(after.options.find((b) => b.id === 'b1').eta_minutes, created.eta_minutes + 8);
  await q("UPDATE branches SET closes_at='10:01' WHERE id='b1'");
  await assert.rejects(() => model.order(order(), admin), /cierre/);
  await q("UPDATE branches SET closes_at='22:00' WHERE id='b1'");
});
test('Reasignación libera reserva anterior; solo se edita antes de preparar', async () => {
  const b = await model.branches(
    {
      name: 'Sucursal cercana QA',
      department: 'Guatemala',
      address: 'Ficticia',
      type: 'Gasolinera',
      lat: 14.614,
      lng: -90.551,
    },
    admin,
  );
  await model.stock(
    {
      branch_id: b.id,
      product_id: 'p1',
      lot: 'QA-REASIGNAR',
      expires_on: '2029-12-31',
      quantity: 10,
    },
    admin,
  );
  const total = Number(
      (await q("SELECT SUM(quantity) AS n FROM inventory WHERE product_id='p1'")).rows[0].n,
    ),
    o = await model.order(order(), admin);
  await manage.edit('orders', o.id, { reason: 'Cercanía', values: { branch_id: b.id } }, admin);
  assert.equal(
    (await q('SELECT branch_id FROM orders WHERE id=$1', [o.id])).rows[0].branch_id,
    b.id,
  );
  assert.equal(
    Number((await q("SELECT SUM(quantity) AS n FROM inventory WHERE product_id='p1'")).rows[0].n),
    total - 2,
  );
  await model.orderStatus(o.id, { status: 'Preparando' }, admin);
  await assert.rejects(
    () =>
      manage.edit(
        'orders',
        o.id,
        { reason: 'Tarde', values: { address: 'Otra dirección' } },
        admin,
      ),
    /antes de iniciar/,
  );
  await assert.rejects(() => model.orderStatus(o.id, { status: 'Cancelado' }, admin), /motivo/);
  await model.orderStatus(o.id, { status: 'Cancelado', reason: 'Prueba terminada' }, admin);
  assert.equal(
    Number((await q("SELECT SUM(quantity) AS n FROM inventory WHERE product_id='p1'")).rows[0].n),
    total,
  );
});
test('Dos reservas simultáneas de la última unidad: solo una se concreta', async () => {
  const p = await model.products(
    { name: 'Última unidad QA', sku: 'ULTIMA-QA', category: 'Prueba', price: 10 },
    admin,
  );
  await model.stock(
    { branch_id: 'b1', product_id: p.id, lot: 'ULTIMA', expires_on: '2029-12-31', quantity: 1 },
    admin,
  );
  const attempts = await Promise.allSettled([
    model.order({ ...order(), product_id: p.id, quantity: 1 }, admin),
    model.order({ ...order(), product_id: p.id, quantity: 1 }, admin),
  ]);
  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await q('SELECT quantity FROM inventory WHERE product_id=$1', [p.id])).rows[0].quantity,
    0,
  );
});
test('Borrador cancela sin descontar; recepción parcial genera alerta de riesgo', async () => {
  const s = (await q("SELECT * FROM inventory WHERE branch_id='b1' AND product_id='p2'")).rows[0];
  const canceled = await manage.draft(
    { inventory_id: s.id, destination_id: 'b2', quantity: 3 },
    branch,
  );
  await manage.draftAction(canceled.id, { action: 'cancel', reason: 'Error de destino' }, branch);
  assert.equal(
    (await q('SELECT quantity FROM inventory WHERE id=$1', [s.id])).rows[0].quantity,
    s.quantity,
  );
  const draft = await manage.draft(
      { inventory_id: s.id, destination_id: 'b2', quantity: 3 },
      branch,
    ),
    transfer = await manage.draftAction(draft.id, { action: 'dispatch' }, branch);
  await assert.rejects(
    () => manage.draftAction(draft.id, { action: 'cancel', reason: 'Tarde' }, branch),
    /ya se despachó/,
  );
  await assert.rejects(
    () => model.receive(transfer.id, admin, { received_quantity: 2 }),
    /motivo/i,
  );
  await model.receive(transfer.id, admin, { received_quantity: 2, reason: 'Una unidad dañada' });
  const risk = await manage.risk(auditor);
  assert.ok(risk.find((b) => b.id === 'b2').points >= 2);
});
test('Controlados requieren receta registrada del producto y confirmación', async () => {
  const p = await model.products(
    {
      name: 'Controlado ficticio',
      sku: 'CONTROL-QA',
      category: 'Prueba',
      price: 10,
      controlled: true,
    },
    admin,
  );
  await model.stock(
    { branch_id: 'b1', product_id: p.id, lot: 'CONTROL', expires_on: '2029-12-31', quantity: 3 },
    admin,
  );
  const sale = {
    branch_id: 'b1',
    product_id: p.id,
    quantity: 1,
    payment: 'Tarjeta',
    prescription_confirmed: true,
  };
  await assert.rejects(() => model.order(sale, branch, true), /receta registrada/);
  const prescription = await manage.prescription(
    {
      customer_name: 'Paciente ficticio',
      doctor: 'Médico ficticio',
      license: 'QA-001',
      issued_on: new Date().toISOString().slice(0, 10),
      product_id: p.id,
    },
    branch,
  );
  assert.ok((await model.order({ ...sale, prescription_id: prescription.id }, branch, true)).id);
});
test('Planilla anula conservando documento y sucursal; permite repago', async () => {
  await model.payroll({ period: '2026-11' }, admin);
  const payment = (await q("SELECT * FROM payroll WHERE period='2026-11' LIMIT 1")).rows[0];
  await manage.edit(
    'employees',
    payment.employee_id,
    { reason: 'Traslado', values: { branch_id: 'b2' } },
    admin,
  );
  const request = await manage.request(
    { type: 'payroll_void', entity_id: payment.id, reason: 'Pago ficticio erróneo' },
    admin,
  );
  await manage.decision(
    request.id,
    { approve: true, reason: 'Revisión independiente', password: 'Segundo2026!' },
    second,
  );
  assert.equal(
    (await q('SELECT state FROM payroll WHERE id=$1', [payment.id])).rows[0].state,
    'Anulado',
  );
  const reverse = (
    await q(
      "SELECT * FROM cash_movements WHERE category='Contra-asiento' AND description LIKE $1",
      [`%${payment.id.slice(0, 8)}%`],
    )
  ).rows[0];
  assert.equal(reverse.branch_id, payment.branch_id);
  assert.equal((await model.payroll({ period: '2026-11' }, admin)).count, 1);
  assert.equal(
    (
      await q('SELECT COUNT(*) AS n FROM payroll WHERE employee_id=$1 AND period=$2', [
        payment.employee_id,
        payment.period,
      ])
    ).rows[0].n,
    2,
  );
});
test('Depreciación conserva una valoración mensual y salario conserva historial', async () => {
  const asset = (await q('SELECT * FROM assets LIMIT 1')).rows[0];
  const report = await manage.depreciation(asset.id, { reason: 'Cierre ficticio' }, admin);
  assert.ok(report.net_cents >= 0);
  await assert.rejects(
    () => manage.depreciation(asset.id, { reason: 'Duplicado' }, admin),
    /ya fue registrado/,
  );
  const employee = (await q('SELECT * FROM employees LIMIT 1')).rows[0];
  await manage.edit(
    'employees',
    employee.id,
    { reason: 'Revisión salarial', values: { salary: 6000, user_id: 'u-branch' } },
    admin,
  );
  const snapshot = await model.snapshot(admin);
  assert.ok(
    snapshot.salary_history.some((h) => h.employee_id === employee.id && h.salary_cents === 600000),
  );
});
test('Descuento inusual genera riesgo; simulación detecta alteración sin modificar cadena', async () => {
  await model.order(
    { branch_id: 'b1', product_id: 'p1', quantity: 1, payment: 'Efectivo', discount_percent: 20 },
    branch,
    true,
  );
  const risk = await manage.risk(auditor);
  assert.ok(
    risk.find((b) => b.id === 'b1').reasons.some((r) => r.startsWith('1 ventas con descuento')),
  );
  const simulation = await manage.simulation(auditor);
  assert.equal(simulation.original.valid, true);
  assert.equal(simulation.simulation.valid, false);
  assert.equal((await manage.integrity()).valid, true);
});
