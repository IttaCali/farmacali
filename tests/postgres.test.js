import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { initialize } from '../server/database/init.js';
import { Pharmacy } from '../server/models/pharmacy.js';
import { db } from '../server/database/db.js';
import { Management } from '../server/models/management.js';
import { Authentication, totpFor } from '../server/models/authentication.js';
import { Portal } from '../server/models/portal.js';
const engine = new PGlite();
const result = (r) => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });
const database = {
  cloud: true,
  query: async (sql, params = []) => result(await engine.query(sql, params)),
  transaction: (fn) =>
    engine.transaction((tx) => fn(async (sql, params = []) => result(await tx.query(sql, params)))),
};
const model = new Pharmacy(database, () => new Date('2026-10-04T16:00:00Z')),
  user = { id: 'u-admin' },
  q = database.query;
before(async () => {
  await initialize(database);
});
test('PostgreSQL: cesta con receta cifrada, revisión y reasignación conserva cada producto', async () => {
  const portal = new Portal(database, () => new Date('2026-10-04T16:00:00Z'));
  const r = await portal.create({
    request_id: crypto.randomUUID(),
    items: [
      { product_id: 'p1', quantity: 1 },
      { product_id: 'p3', quantity: 2 },
    ],
    branch_id: 'b1',
    fulfillment: 'pickup',
    customer: 'Cliente ficticio PostgreSQL',
    dpi: '1111222233334',
    phone: '55551234',
    payment: 'Tarjeta',
    prescription_image:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/2kAAAAASUVORK5CYII=',
  });
  const id = (await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [r.ticket])).rows[0]
    .order_id;
  assert.equal(r.items.length, 2);
  assert.equal(r.prescription_status, 'Pendiente');
  await assert.rejects(
    () => model.orderStatus(id, { status: 'Preparando', prescription_confirmed: true }, user),
    /revisada y aprobada/,
  );
  const admin = { id: 'u-admin', role: 'admin', scope: 'all', permissions: ['pedido.gestionar'] };
  await portal.reviewPrescription(id, { approved: true, notes: 'Prueba PostgreSQL' }, admin);
  await new Management(database, () => new Date('2026-10-04T16:00:00Z')).edit(
    'orders',
    id,
    { reason: 'Reasignar cesta', values: { branch_id: 'b2' } },
    admin,
  );
  const lines = (
    await q(
      'SELECT product_id,SUM(quantity)::integer AS n FROM order_items WHERE order_id=$1 GROUP BY product_id ORDER BY product_id',
      [id],
    )
  ).rows;
  assert.deepEqual(lines, [
    { product_id: 'p1', n: 1 },
    { product_id: 'p3', n: 2 },
  ]);
  await model.orderStatus(id, { status: 'Preparando' }, admin);
  await model.orderStatus(id, { status: 'Listo para recoger', packed: true }, admin);
  assert.equal((await portal.lookup(r)).status, 'Listo para recoger');
  await model.orderStatus(
    id,
    {
      status: 'Entregado',
      qr_payload: JSON.stringify({ ticket: r.ticket, access_code: r.access_code }),
    },
    admin,
  );
  assert.equal((await portal.lookup(r)).status, 'Entregado');
});
after(async () => {
  await engine.close();
  await db.close();
});
test('PostgreSQL embebido: esquema, claves y snapshot compatibles', async () => {
  const data = await model.snapshot();
  assert.equal(data.branches.length, 6);
  assert.equal(data.inventory.length, 48);
  assert.equal(data.database, 'PostgreSQL');
});
test('PostgreSQL: portal reserva, consulta privada y retiro con el nuevo estado', async () => {
  const portal = new Portal(database, () => new Date('2026-10-04T16:00:00Z'));
  const result = await portal.create({
    request_id: crypto.randomUUID(),
    product_id: 'p2',
    quantity: 1,
    branch_id: 'b1',
    fulfillment: 'pickup',
    customer: 'Prueba PostgreSQL portal',
    dpi: '1234567890101',
    phone: '55551234',
    payment: 'Efectivo',
  });
  const row = (await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [result.ticket]))
    .rows[0];
  await model.orderStatus(row.order_id, { status: 'Preparando' }, user);
  await model.orderStatus(row.order_id, { status: 'Listo para recoger' }, user);
  assert.equal(
    (await portal.lookup({ ticket: result.ticket, access_code: result.access_code })).status,
    'Listo para recoger',
  );
  await model.orderStatus(
    row.order_id,
    { status: 'Entregado', pickup_code: result.access_code },
    user,
  );
  assert.equal(
    (await portal.lookup({ ticket: result.ticket, access_code: result.access_code })).status,
    'Entregado',
  );
});

test('PostgreSQL: segundo factor emite códigos, recuperación consume uno y regeneración invalida los anteriores', async () => {
  const auth = new Authentication(database);
  const setup = await auth.login({ email: 'admin@farmacia.gt', password: 'Farmacia2026!' });
  const session = await auth.complete({
    challenge: setup.challenge,
    code: totpFor(setup.secret).generate(),
  });
  assert.equal(session.recovery_codes.length, 10);
  const challenge = await auth.login({ email: 'admin@farmacia.gt', password: 'Farmacia2026!' });
  const recovered = await auth.complete({
    challenge: challenge.challenge,
    recovery_code: session.recovery_codes[0],
  });
  const identity = await auth.authenticate(recovered.access);
  assert.equal((await auth.securityStatus(identity.user)).recovery_remaining, 9);
  const renewed = await auth.securityAction(identity.user, identity.session.id, {
    action: 'codes',
    current_password: 'Farmacia2026!',
    recovery_code: session.recovery_codes[1],
  });
  assert.equal(renewed.recovery_codes.length, 10);
  const again = await auth.login({ email: 'admin@farmacia.gt', password: 'Farmacia2026!' });
  await assert.rejects(() =>
    auth.complete({ challenge: again.challenge, recovery_code: session.recovery_codes[2] }),
  );
  await auth.complete({ challenge: again.challenge, recovery_code: renewed.recovery_codes[0] });
});
test('PostgreSQL embebido: traslado y recepción conservan stock', async () => {
  const stock = (await q("SELECT * FROM inventory WHERE branch_id='b1' AND product_id='p1'"))
    .rows[0];
  const initial = Number(
    (await q("SELECT SUM(quantity) AS n FROM inventory WHERE product_id='p1'")).rows[0].n,
  );
  const t = await model.transfer(
    { inventory_id: stock.id, destination_id: 'b2', quantity: 4 },
    user,
  );
  await model.receive(t.id, user);
  assert.equal(
    Number((await q("SELECT SUM(quantity) AS n FROM inventory WHERE product_id='p1'")).rows[0].n),
    initial,
  );
  await assert.rejects(() => model.receive(t.id, user), /ya fue recibido/);
});
test('PostgreSQL embebido: rollback no modifica stock ante error', async () => {
  const stock = (await q('SELECT * FROM inventory LIMIT 1')).rows[0];
  await assert.rejects(() =>
    model.transfer({ inventory_id: stock.id, destination_id: 'b2', quantity: 999999 }, user),
  );
  assert.equal(
    (await q('SELECT quantity FROM inventory WHERE id=$1', [stock.id])).rows[0].quantity,
    stock.quantity,
  );
});
test('PostgreSQL embebido: reserva y entrega crean un único ingreso', async () => {
  const o = await model.order(
    {
      branch_id: 'b1',
      product_id: 'p1',
      quantity: 2,
      payment: 'Efectivo',
      lat: 14.6134,
      lng: -90.5505,
      customer: 'Prueba PG',
      phone: '5555 0101',
      address: 'Dirección ficticia',
    },
    user,
  );
  await model.orderStatus(o.id, { status: 'Preparando' }, user);
  await model.orderStatus(o.id, { status: 'En ruta' }, user);
  await model.orderStatus(o.id, { status: 'Entregado' }, user);
  assert.equal(
    Number(
      (
        await q('SELECT COUNT(*) AS n FROM cash_movements WHERE description LIKE $1', [
          `%${o.id.slice(0, 8)}%`,
        ])
      ).rows[0].n,
    ),
    1,
  );
});
test('PostgreSQL embebido: planilla única registra egresos', async () => {
  const paid = await model.payroll({ period: '2026-10' }, user);
  assert.equal(paid.count, 12);
  await assert.rejects(() => model.payroll({ period: '2026-10' }, user), /ya fue pagada/);
  assert.equal(
    Number(
      (await q("SELECT SUM(amount_cents) AS n FROM cash_movements WHERE category='Planilla'"))
        .rows[0].n,
    ),
    paid.total_cents,
  );
});
test('PostgreSQL embebido: cotización ordenada y stock disponible', async () => {
  const quote = await model.quote({ product_id: 'p1', quantity: 1, lat: 14.6134, lng: -90.5505 });
  assert.equal(quote.options[0].id, 'b1');
  assert.equal(quote.options[0].serviceable, true);
});
test('PostgreSQL embebido: trigger inmutable y verificación hash funcionan', async () => {
  const manage = new Management(database);
  assert.equal((await manage.integrity()).valid, true);
  await assert.rejects(() => q("UPDATE audit_log SET action='ALTERADO'"), /solo de inserción/);
  await assert.rejects(() => q('DELETE FROM audit_log'), /solo de inserción/);
});
