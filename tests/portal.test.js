import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database, db } from '../server/database/db.js';
import { initialize } from '../server/database/init.js';
import { schema } from '../server/database/schema.js';
import { Portal } from '../server/models/portal.js';
import { Pharmacy } from '../server/models/pharmacy.js';
import { Management } from '../server/models/management.js';
import { decrypt } from '../server/security/crypto.js';
import { schemas } from '../server/middleware/validation.js';
import { parseOrderTicket } from '../shared/order-ticket.js';
const database = new Database('', ':memory:'),
  q = database.query.bind(database);
const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
const clock = () => new Date(`${date}T16:00:00Z`);
const portal = new Portal(database, clock),
  pharmacy = new Pharmacy(database, clock);
const user = { id: 'u-admin', role: 'admin', scope: 'all' };
const input = (extra) => ({
  request_id: randomUUID(),
  product_id: 'p1',
  branch_id: 'b1',
  quantity: 2,
  fulfillment: 'pickup',
  customer: 'Cliente del portal',
  dpi: '1234567890101',
  phone: '55551234',
  payment: 'Efectivo',
  ...extra,
});
before(async () => initialize(database));
after(async () => {
  await database.close();
  await db.close();
});
test('Migración de una instalación anterior conserva pedidos, lotes y sus relaciones', async () => {
  const legacy = new Database('', ':memory:');
  try {
    for (const sql of schema) await legacy.query(sql);
    await legacy.query(
      "INSERT INTO users VALUES ('u-admin','Admin anterior','anterior@example.test','hash-no-utilizado','admin')",
    );
    await legacy.query(
      "INSERT INTO branches VALUES ('b1','Anterior','Guatemala','Dirección de prueba','Gasolinera',14.6,-90.5,1)",
    );
    await legacy.query(
      "INSERT INTO products VALUES ('p1','Producto anterior','ANT-1','Prueba',1000,0)",
    );
    await legacy.query("INSERT INTO inventory VALUES ('i1','b1','p1','L-1','2030-01-01',8,1)");
    await legacy.query(
      "INSERT INTO orders VALUES ('o1','b1','Cliente anterior','55551234','Dirección',14.6,-90.5,'Efectivo',2000,30,'Preparando',0,'2026-10-01T16:00:00Z',NULL,'u-admin')",
    );
    await legacy.query("INSERT INTO order_items VALUES ('oi1','o1','i1','p1',2,1000)");
    await initialize(legacy);
    const previous = (await legacy.query("SELECT * FROM orders WHERE id='o1'")).rows[0];
    assert.equal(previous.customer, 'Cliente anterior');
    assert.equal(previous.fulfillment, 'delivery');
    assert.equal(
      (await legacy.query("SELECT quantity FROM inventory WHERE id='i1'")).rows[0].quantity,
      8,
    );
    assert.equal(
      (await legacy.query("SELECT order_id FROM order_items WHERE id='oi1'")).rows[0].order_id,
      'o1',
    );
    assert.deepEqual((await legacy.query('PRAGMA foreign_key_check')).rows, []);
  } finally {
    await legacy.close();
  }
});
test('DPI opcional con formato válido, catálogo público acotado y sucursales sin datos internos', async () => {
  assert.equal(schemas.portalOrder.shape.dpi.safeParse(undefined).success, true);
  assert.equal(schemas.portalOrder.shape.dpi.safeParse('').success, true);
  assert.equal(schemas.portalOrder.shape.dpi.safeParse('123').success, false);
  const catalog = await portal.catalog();
  assert.equal(catalog.branches.length, 6);
  assert.equal(catalog.clients, undefined);
  assert.equal(catalog.users, undefined);
  assert.equal(catalog.branches[0].active, undefined);
  assert.ok(catalog.availability.length);
  assert.ok(catalog.availability.every((a) => a.available === true && !('quantity' in a)));
  const options = await portal.options({ product_id: 'p1', quantity: 1, fulfillment: 'pickup' });
  assert.ok(options.options.some((b) => b.serviceable));
  assert.ok(options.options.every((b) => b.ready_at));
  assert.ok(options.options.every((b) => typeof b.available === 'boolean'));
});
test('Reserva FEFO atómica e idempotente; DPI cifrado y cliente frecuente sin sobrescritura', async () => {
  const stock = Number(
    (await q("SELECT SUM(quantity) AS n FROM inventory WHERE branch_id='b1' AND product_id='p1'"))
      .rows[0].n,
  );
  const data = input();
  const receipt = await portal.create(data);
  assert.match(receipt.ticket, /^FC-[A-F0-9]{12}$/);
  assert.match(receipt.access_code, /^[A-F0-9]{24}$/);
  assert.equal(receipt.fulfillment, 'pickup');
  assert.equal(receipt.status, 'Pendiente');
  const again = await portal.create(data);
  assert.equal(again.ticket, receipt.ticket);
  assert.equal(again.access_code, receipt.access_code);
  assert.equal(
    Number(
      (await q("SELECT SUM(quantity) AS n FROM inventory WHERE branch_id='b1' AND product_id='p1'"))
        .rows[0].n,
    ),
    stock - 2,
  );
  await assert.rejects(() => portal.create({ ...data, quantity: 3 }), /intento ya se utilizó/);
  const row = (await q('SELECT c.* FROM clients c JOIN portal_clients pc ON pc.client_id=c.id'))
    .rows[0];
  assert.equal(decrypt(row.cui_cipher), data.dpi);
  assert.notEqual(row.cui_cipher, data.dpi);
  await portal.create(input({ customer: 'Otro nombre enviado', phone: '44441234' }));
  assert.equal(Number((await q('SELECT COUNT(*) AS n FROM portal_clients')).rows[0].n), 1);
  assert.equal(
    (await q('SELECT name,phone FROM clients WHERE id=$1', [row.id])).rows[0].name,
    data.customer,
  );
});
test('Consulta requiere ticket y código; el resultado no expone DPI ni contacto ni domicilio', async () => {
  const receipt = await portal.create(input());
  const status = await portal.lookup({ ticket: receipt.ticket, access_code: receipt.access_code });
  assert.match(status.qr, /^data:image\/png;base64,/);
  for (const field of [
    'customer',
    'dpi',
    'phone',
    'address',
    'access_hash',
    'access_code',
    'client_id',
  ])
    assert.equal(status[field], undefined);
  await assert.rejects(
    () => portal.lookup({ ticket: receipt.ticket, access_code: '0'.repeat(24) }),
    /No encontramos/,
  );
  await assert.rejects(
    () => portal.lookup({ ticket: 'FC-000000000000', access_code: receipt.access_code }),
    /No encontramos/,
  );
});
test('Retiro avanza a listo y se entrega únicamente con código, cobro una vez', async () => {
  const receipt = await portal.create(input());
  const id = (await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [receipt.ticket]))
    .rows[0].order_id;
  await pharmacy.orderStatus(id, { status: 'Preparando' }, user);
  await assert.rejects(
    () =>
      pharmacy.orderStatus(
        id,
        { status: 'Listo para recoger' },
        { id: 'u-branch', role: 'branch', scope: 'branch', branch_id: 'b2' },
      ),
    /otra sucursal/,
  );
  await assert.rejects(
    () => pharmacy.orderStatus(id, { status: 'En ruta' }, user),
    /Cambio de estado/,
  );
  await pharmacy.orderStatus(id, { status: 'Listo para recoger' }, user);
  await assert.rejects(
    () => pharmacy.orderStatus(id, { status: 'Entregado', pickup_code: 'invalido' }, user),
    /código privado/,
  );
  await pharmacy.orderStatus(id, { status: 'Entregado', pickup_code: receipt.access_code }, user);
  await assert.rejects(
    () => pharmacy.orderStatus(id, { status: 'Entregado', pickup_code: receipt.access_code }, user),
    /Cambio de estado/,
  );
  assert.equal(
    (await portal.lookup({ ticket: receipt.ticket, access_code: receipt.access_code })).status,
    'Entregado',
  );
  assert.equal(
    Number(
      (
        await q('SELECT COUNT(*) AS n FROM cash_movements WHERE description=$1', [
          `Cobro pedido ${id.slice(0, 8)}`,
        ])
      ).rows[0].n,
    ),
    1,
  );
});
test('Vencer la reserva devuelve existencias y no cobra', async () => {
  const data = input({ product_id: 'p2', quantity: 1 });
  const stock = Number(
    (await q("SELECT SUM(quantity) AS n FROM inventory WHERE branch_id='b1' AND product_id='p2'"))
      .rows[0].n,
  );
  const receipt = await portal.create(data);
  const id = (await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [receipt.ticket]))
    .rows[0].order_id;
  await q('UPDATE portal_orders SET expires_at=$1 WHERE order_id=$2', [
    new Date(Date.now() - 60000).toISOString(),
    id,
  ]);
  const result = await portal.lookup({ ticket: receipt.ticket, access_code: receipt.access_code });
  assert.equal(result.status, 'Cancelado');
  assert.equal(
    Number(
      (await q("SELECT SUM(quantity) AS n FROM inventory WHERE branch_id='b1' AND product_id='p2'"))
        .rows[0].n,
    ),
    stock,
  );
  await portal.expire();
  assert.equal(
    Number(
      (await q("SELECT SUM(quantity) AS n FROM inventory WHERE branch_id='b1' AND product_id='p2'"))
        .rows[0].n,
    ),
    stock,
  );
});
test('Domicilio mantiene cobertura; stock insuficiente y fallos no crean clientes huérfanos', async () => {
  const before = Number((await q('SELECT COUNT(*) AS n FROM clients')).rows[0].n);
  await assert.rejects(
    () => portal.create(input({ dpi: '9999999999999', branch_id: 'b4', quantity: 100 })),
    /Stock insuficiente/,
  );
  await assert.rejects(
    () =>
      portal.create(
        input({
          dpi: '9999999999999',
          fulfillment: 'delivery',
          address: 'Dirección lejana',
          lat: 16.9,
          lng: -89.9,
        }),
      ),
    /radio de entrega/,
  );
  assert.equal(Number((await q('SELECT COUNT(*) AS n FROM clients')).rows[0].n), before);
  const receipt = await portal.create(
    input({
      fulfillment: 'delivery',
      address: 'Dirección ficticia de prueba',
      lat: 14.6134,
      lng: -90.5505,
    }),
  );
  assert.equal(receipt.fulfillment, 'delivery');
  assert.equal(receipt.expires_at, null);
});
test('Recetas se revisan internamente; medicamentos controlados no se reservan públicamente', async () => {
  await assert.rejects(() => portal.create(input({ product_id: 'p3' })), /contar con receta/);
  const receipt = await portal.create(input({ product_id: 'p3', has_prescription: true }));
  const id = (await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [receipt.ticket]))
    .rows[0].order_id;
  await assert.rejects(
    () => pharmacy.orderStatus(id, { status: 'Preparando' }, user),
    /Revisa la receta/,
  );
  await pharmacy.orderStatus(id, { status: 'Preparando', prescription_confirmed: true }, user);
  await q("UPDATE products SET controlled=1 WHERE id='p8'");
  await assert.rejects(
    () => portal.create(input({ product_id: 'p8', has_prescription: true })),
    /atención presencial/,
  );
});
test('Reinicializar preserva pedidos y relaciones del portal', async () => {
  const count = Number((await q('SELECT COUNT(*) AS n FROM portal_orders')).rows[0].n);
  await initialize(database);
  assert.equal(Number((await q('SELECT COUNT(*) AS n FROM portal_orders')).rows[0].n), count);
  assert.deepEqual((await q('PRAGMA foreign_key_check')).rows, []);
});

const cartInput = (extra = {}) => {
  const { product_id, quantity, ...base } = input();
  return {
    ...base,
    items: [
      { product_id: 'p1', quantity: 2 },
      { product_id: 'p2', quantity: 3 },
    ],
    ...extra,
  };
};
const photo =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/2kAAAAASUVORK5CYII=';
test('Reasignar una cesta conserva todos los medicamentos y sus cantidades', async () => {
  const r = await portal.create(cartInput());
  const id = (await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [r.ticket])).rows[0]
    .order_id;
  await new Management(database, clock).edit(
    'orders',
    id,
    { reason: 'Prueba de reasignación de cesta', values: { branch_id: 'b2' } },
    { ...user, permissions: ['pedido.gestionar'] },
  );
  const lines = (
    await q(
      'SELECT oi.product_id,SUM(oi.quantity) AS n FROM order_items oi JOIN inventory i ON i.id=oi.inventory_id WHERE oi.order_id=$1 AND i.branch_id=$2 GROUP BY oi.product_id ORDER BY oi.product_id',
      [id, 'b2'],
    )
  ).rows;
  assert.deepEqual(
    lines.map((line) => ({ ...line })),
    [
      { product_id: 'p1', n: 2 },
      { product_id: 'p2', n: 3 },
    ],
  );
  assert.equal((await portal.lookup(r)).total_cents, r.total_cents);
});
test('Cesta pública: varios productos, total calculado, ticket corto, QR e idempotencia', async () => {
  const data = cartInput(),
    r = await portal.create(data),
    again = await portal.create(data);
  assert.equal(schemas.portalOrder.safeParse({ ...data, payment: 'Transferencia' }).success, false);
  assert.equal(schemas.portalOrder.safeParse(input()).success, false);
  assert.match(r.ticket, /^FC-[A-F0-9]{6}$/);
  assert.match(r.access_code, /^\d{6}$/);
  assert.match(r.qr, /^data:image\/png;base64,/);
  assert.equal(again.ticket, r.ticket);
  assert.equal(r.items.length, 2);
  assert.equal(
    r.total_cents,
    r.items.reduce((n, i) => n + i.quantity * i.unit_price_cents, 0),
  );
  const id = (await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [r.ticket])).rows[0]
    .order_id;
  await pharmacy.orderStatus(id, { status: 'Preparando' }, user);
  await assert.rejects(
    () => pharmacy.orderStatus(id, { status: 'Listo para recoger' }, user),
    /bolsa/,
  );
  await pharmacy.orderStatus(id, { status: 'Listo para recoger', packed: true }, user);
  await pharmacy.orderStatus(id, { status: 'Entregado', pickup_code: r.access_code }, user);
  assert.equal((await portal.lookup(r)).status, 'Entregado');
});
test('Cesta revierte todas sus líneas si falla una; duplicados y cantidades inválidas se rechazan', async () => {
  const before = (
    await q("SELECT SUM(quantity) AS n FROM inventory WHERE product_id='p1' AND branch_id='b1'")
  ).rows[0].n;
  const count = (await q('SELECT COUNT(*) AS n FROM orders')).rows[0].n;
  await q("UPDATE inventory SET quantity=0 WHERE product_id='p7' AND branch_id='b1'");
  await assert.rejects(
    () =>
      portal.create(
        cartInput({
          dpi: '7777777777777',
          items: [
            { product_id: 'p1', quantity: 1 },
            { product_id: 'p7', quantity: 1 },
          ],
        }),
      ),
    /Stock insuficiente/,
  );
  assert.equal(
    (await q("SELECT SUM(quantity) AS n FROM inventory WHERE product_id='p1' AND branch_id='b1'"))
      .rows[0].n,
    before,
  );
  assert.equal((await q('SELECT COUNT(*) AS n FROM orders')).rows[0].n, count);
  for (const items of [
    [{ product_id: 'p1', quantity: 0 }],
    [{ product_id: 'p1', quantity: 101 }],
    [
      { product_id: 'p1', quantity: 1 },
      { product_id: 'p1', quantity: 1 },
    ],
  ])
    await assert.rejects(() => portal.create(cartInput({ items })), /cantidades/);
});
test('Foto de receta cifrada, revisión central y bloqueo real de preparación', async () => {
  const data = cartInput({
    items: [
      { product_id: 'p1', quantity: 1 },
      { product_id: 'p3', quantity: 1 },
    ],
  });
  await assert.rejects(() => portal.create(data), /foto/);
  await assert.rejects(
    () => portal.create({ ...data, prescription_image: 'data:image/png;base64,SG9sYQ==' }),
    /foto no es válida/,
  );
  const r = await portal.create({ ...data, prescription_image: photo });
  const id = (await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [r.ticket])).rows[0]
    .order_id;
  const row = (await q('SELECT * FROM portal_prescriptions WHERE order_id=$1', [id])).rows[0];
  assert.notEqual(row.image_cipher, photo);
  assert.equal(decrypt(row.image_cipher), photo);
  assert.equal(r.prescription_status, 'Pendiente');
  assert.equal(r.image, undefined);
  assert.equal((await portal.prescription(id, user)).image, photo);
  await assert.rejects(
    () => portal.prescription(id, { scope: 'branch', branch_id: 'b2' }),
    /otra sucursal/,
  );
  await assert.rejects(
    () => pharmacy.orderStatus(id, { status: 'Preparando', prescription_confirmed: true }, user),
    /revisada y aprobada/,
  );
  await assert.rejects(
    () =>
      portal.reviewPrescription(
        id,
        { approved: true, notes: '' },
        { id: 'u-branch', role: 'branch', scope: 'branch' },
      ),
    /call center/,
  );
  const cc = { id: 'u-operator', role: 'callcenter', scope: 'all' };
  await portal.reviewPrescription(
    id,
    { approved: false, notes: 'Foto ilegible, contactar cliente' },
    cc,
  );
  await assert.rejects(
    () => pharmacy.orderStatus(id, { status: 'Preparando' }, user),
    /revisada y aprobada/,
  );
  await portal.reviewPrescription(
    id,
    { approved: true, notes: 'Revisada para los medicamentos solicitados' },
    cc,
  );
  await pharmacy.orderStatus(id, { status: 'Preparando' }, cc);
  await assert.rejects(
    () => portal.reviewPrescription(id, { approved: false, notes: 'Tarde' }, cc),
    /pendientes/,
  );
  assert.equal((await portal.lookup(r)).prescription_status, 'Revisada');
});
test('Código corto bloquea consultas después de cinco fallos y permite recuperarse al vencer el bloqueo', async () => {
  const r = await portal.create(cartInput({ items: [{ product_id: 'p2', quantity: 1 }] }));
  const wrong = r.access_code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      () => portal.lookup({ ticket: r.ticket, access_code: wrong }),
      /No encontramos/,
    );
  await assert.rejects(() => portal.lookup(r), /15 minutos/);
  await q('UPDATE portal_access_guards SET locked_until=$1 WHERE ticket=$2', [
    new Date(Date.now() - 1000).toISOString(),
    r.ticket,
  ]);
  assert.equal((await portal.lookup(r)).ticket, r.ticket);
});

test('Entrega por QR o código: call center da seguimiento; QR de otro pedido nunca autoriza', async () => {
  const r = await portal.create(cartInput({ items: [{ product_id: 'p2', quantity: 1 }] }));
  const id = (await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [r.ticket])).rows[0]
    .order_id;
  const cc = { id: 'u-operator', role: 'callcenter', scope: 'all' };
  await pharmacy.orderStatus(id, { status: 'Preparando' }, cc);
  await assert.rejects(
    () => pharmacy.orderStatus(id, { status: 'Listo para recoger' }, cc),
    /bolsa/,
  );
  await pharmacy.orderStatus(id, { status: 'Listo para recoger', packed: true }, cc);
  const raw = JSON.stringify({ ticket: r.ticket, access_code: r.access_code });
  assert.deepEqual(parseOrderTicket(raw), { ticket: r.ticket, code: r.access_code });
  for (const invalid of [
    'https://example.test/',
    '{}',
    'null',
    JSON.stringify({ ticket: r.ticket, access_code: 123456 }),
  ])
    assert.throws(() => parseOrderTicket(invalid), /QR no es/);
  const other = r.ticket === 'FC-000000' ? 'FC-111111' : 'FC-000000';
  await assert.rejects(
    () =>
      pharmacy.orderStatus(
        id,
        {
          status: 'Entregado',
          qr_payload: JSON.stringify({ ticket: other, access_code: r.access_code }),
          pickup_code: r.access_code,
        },
        cc,
      ),
    /otro pedido/,
  );
  await assert.rejects(
    () => pharmacy.orderStatus(id, { status: 'Entregado', qr_payload: '{}' }, cc),
    /QR no es/,
  );
  await assert.rejects(
    () =>
      pharmacy.orderStatus(
        id,
        { status: 'Entregado', qr_payload: raw },
        { id: 'u-branch', role: 'branch', scope: 'branch', branch_id: 'b2' },
      ),
    /otra sucursal/,
  );
  assert.equal((await portal.lookup(r)).status, 'Listo para recoger');
  await pharmacy.orderStatus(id, { status: 'Entregado', qr_payload: raw }, cc);
  await assert.rejects(
    () => pharmacy.orderStatus(id, { status: 'Entregado', qr_payload: raw }, cc),
    /Cambio de estado/,
  );
  assert.equal((await portal.lookup(r)).status, 'Entregado');
  const audit = (
    await q(
      "SELECT details FROM audit_log WHERE entity_id=$1 AND action='CAMBIAR_ESTADO' ORDER BY sequence DESC",
      [id],
    )
  ).rows[0];
  assert.equal(JSON.parse(audit.details).authorization_method, 'QR');
  assert.ok(!audit.details.includes(r.access_code));
});
