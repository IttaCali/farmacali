import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Database, db } from '../server/database/db.js';
import { initialize } from '../server/database/init.js';
import { Pharmacy, distance } from '../server/models/pharmacy.js';
const database = new Database('', ':memory:');
const model = new Pharmacy(database, () => new Date('2026-10-04T16:00:00Z')),
  user = { id: 'u-admin' },
  q = database.query.bind(database);
before(async () => initialize(database));
after(async () => {
  await database.close();
  await db.close();
});
test('Consulta contiene seis sucursales, medicamentos y existencias reales', async () => {
  const s = await model.snapshot();
  assert.equal(s.branches.length, 6);
  assert.equal(s.products.length, 8);
  assert.equal(s.inventory.length, 48);
  assert.ok(s.inventory.every((i) => i.quantity >= 0));
});
test('El traslado conserva las unidades entre origen, tránsito y destino', async () => {
  const source = (await q("SELECT * FROM inventory WHERE branch_id='b1' AND product_id='p1'"))
    .rows[0];
  const initial = (await q('SELECT SUM(quantity) AS n FROM inventory WHERE product_id=$1', ['p1']))
    .rows[0].n;
  const t = await model.transfer(
    { inventory_id: source.id, destination_id: 'b2', quantity: 7 },
    user,
  );
  assert.equal(
    (await q('SELECT quantity FROM inventory WHERE id=$1', [source.id])).rows[0].quantity,
    source.quantity - 7,
  );
  assert.equal(
    (await q('SELECT SUM(quantity) AS n FROM inventory WHERE product_id=$1', ['p1'])).rows[0].n,
    initial - 7,
  );
  await model.receive(t.id, user);
  assert.equal(
    (await q('SELECT SUM(quantity) AS n FROM inventory WHERE product_id=$1', ['p1'])).rows[0].n,
    initial,
  );
  await assert.rejects(() => model.receive(t.id, user), /ya fue recibido/);
  assert.equal(
    (await q('SELECT SUM(quantity) AS n FROM inventory WHERE product_id=$1', ['p1'])).rows[0].n,
    initial,
  );
});
test('Traslado excesivo revierte toda la transacción sin registrar auditoría', async () => {
  const source = (await q('SELECT * FROM inventory LIMIT 1')).rows[0];
  const audit = (await q('SELECT COUNT(*) AS n FROM audit_log')).rows[0].n;
  await assert.rejects(
    () => model.transfer({ inventory_id: source.id, destination_id: 'b2', quantity: 999999 }, user),
    /suficientes existencias/,
  );
  assert.equal(
    (await q('SELECT quantity FROM inventory WHERE id=$1', [source.id])).rows[0].quantity,
    source.quantity,
  );
  assert.equal((await q('SELECT COUNT(*) AS n FROM audit_log')).rows[0].n, audit);
});
test('No permite trasladar medicamentos a la misma sucursal', async () => {
  const source = (await q('SELECT * FROM inventory LIMIT 1')).rows[0];
  await assert.rejects(
    () =>
      model.transfer(
        { inventory_id: source.id, destination_id: source.branch_id, quantity: 1 },
        user,
      ),
    /otra sucursal/,
  );
});
test('Venta utiliza el lote de menor vencimiento (FEFO) y registra caja', async () => {
  const s = await model.snapshot();
  const near = new Date(new Date(s.date).getTime() + 3 * 86400000).toISOString().slice(0, 10);
  const early = await model.stock(
    {
      branch_id: 'b1',
      product_id: 'p2',
      lot: 'TEST-FEFO',
      expires_on: near,
      quantity: 2,
      minimum: 1,
    },
    user,
  );
  const sale = await model.order(
    { branch_id: 'b1', product_id: 'p2', quantity: 3, payment: 'Efectivo' },
    user,
    true,
  );
  assert.equal(
    (await q('SELECT quantity FROM inventory WHERE id=$1', [early.id])).rows[0].quantity,
    0,
  );
  const items = (await q('SELECT * FROM order_items WHERE order_id=$1', [sale.id])).rows;
  assert.equal(
    items.reduce((n, i) => n + i.quantity, 0),
    3,
  );
  assert.equal(items.length, 2);
  const cash = (
    await q('SELECT * FROM cash_movements WHERE description LIKE $1', [`%${sale.id.slice(0, 8)}%`])
  ).rows;
  assert.equal(cash.length, 1);
  assert.equal(cash[0].amount_cents, 9600);
});
test('Rechaza antibiótico sin receta validada', async () => {
  await assert.rejects(
    () =>
      model.order(
        { branch_id: 'b1', product_id: 'p3', quantity: 1, payment: 'Tarjeta' },
        user,
        true,
      ),
    /receta/,
  );
});
test('Una cadena de texto no sustituye la confirmación booleana de receta', async () => {
  await assert.rejects(
    () =>
      model.order(
        {
          branch_id: 'b1',
          product_id: 'p3',
          quantity: 1,
          payment: 'Tarjeta',
          prescription_confirmed: 'false',
        },
        user,
        true,
      ),
    /receta/,
  );
});
test('Un lote vencido no puede venderse ni ingresarse como vigente', async () => {
  await q("UPDATE inventory SET expires_on='2020-01-01' WHERE branch_id='b6' AND product_id='p8'");
  await assert.rejects(
    () =>
      model.order(
        {
          branch_id: 'b6',
          product_id: 'p8',
          quantity: 1,
          payment: 'Tarjeta',
          prescription_confirmed: true,
        },
        user,
        true,
      ),
    /Stock insuficiente/,
  );
  await assert.rejects(
    () =>
      model.stock(
        { branch_id: 'b6', product_id: 'p8', lot: 'X', expires_on: '2020-01-01', quantity: 1 },
        user,
      ),
    /vencimiento futura/,
  );
});
test('Cotización ordena sucursales por distancia y señala cobertura', async () => {
  const result = await model.quote({ product_id: 'p1', quantity: 1, lat: 14.6134, lng: -90.5505 });
  assert.equal(result.options[0].id, 'b1');
  assert.equal(result.options[0].eta_minutes, 20);
  assert.equal(result.options[0].serviceable, true);
  assert.ok(result.options.some((o) => !o.serviceable));
  assert.equal(distance(14, -90, 14, -90), 0);
});
test('Cancelar devuelve reservas y no genera cobro', async () => {
  const before = (
    await q("SELECT SUM(quantity) AS n FROM inventory WHERE branch_id='b1' AND product_id='p4'")
  ).rows[0].n;
  const o = await model.order(
    {
      branch_id: 'b1',
      product_id: 'p4',
      quantity: 3,
      payment: 'Efectivo',
      lat: 14.6134,
      lng: -90.5505,
      customer: 'Cliente prueba',
      phone: '5555 0101',
      address: 'Dirección ficticia',
    },
    user,
  );
  assert.equal(
    (await q("SELECT SUM(quantity) AS n FROM inventory WHERE branch_id='b1' AND product_id='p4'"))
      .rows[0].n,
    before - 3,
  );
  await model.orderStatus(o.id, { status: 'Cancelado', reason: 'Cancelación de prueba' }, user);
  assert.equal(
    (await q("SELECT SUM(quantity) AS n FROM inventory WHERE branch_id='b1' AND product_id='p4'"))
      .rows[0].n,
    before,
  );
  assert.equal(
    (
      await q('SELECT COUNT(*) AS n FROM cash_movements WHERE description LIKE $1', [
        `%${o.id.slice(0, 8)}%`,
      ])
    ).rows[0].n,
    0,
  );
});
test('Entrega cobra una sola vez y exige transición de estados', async () => {
  const o = await model.order(
    {
      branch_id: 'b1',
      product_id: 'p5',
      quantity: 1,
      payment: 'Transferencia',
      lat: 14.6134,
      lng: -90.5505,
      customer: 'Cliente prueba',
      phone: '5555 0102',
      address: 'Dirección ficticia',
    },
    user,
  );
  await assert.rejects(
    () => model.orderStatus(o.id, { status: 'Entregado' }, user),
    /no permitido/,
  );
  await model.orderStatus(o.id, { status: 'Preparando' }, user);
  await model.orderStatus(o.id, { status: 'En ruta' }, user);
  await model.orderStatus(o.id, { status: 'Entregado' }, user);
  await assert.rejects(
    () => model.orderStatus(o.id, { status: 'Entregado' }, user),
    /no permitido/,
  );
  assert.equal(
    (
      await q('SELECT COUNT(*) AS n FROM cash_movements WHERE description LIKE $1', [
        `%${o.id.slice(0, 8)}%`,
      ])
    ).rows[0].n,
    1,
  );
});
test('Pedidos fuera del radio de cobertura se rechazan', async () => {
  await assert.rejects(
    () =>
      model.order(
        {
          branch_id: 'b1',
          product_id: 'p1',
          quantity: 1,
          payment: 'Efectivo',
          lat: 16.918,
          lng: -89.892,
          customer: 'Prueba',
          phone: '5555 0101',
          address: 'Petén',
        },
        user,
      ),
    /radio de entrega/,
  );
});
test('Planilla no duplica pago y cada pago registra egreso', async () => {
  const result = await model.payroll({ period: '2026-10' }, user);
  assert.equal(result.count, 12);
  await assert.rejects(() => model.payroll({ period: '2026-10' }, user), /ya fue pagada/);
  assert.equal((await q("SELECT COUNT(*) AS n FROM payroll WHERE period='2026-10'")).rows[0].n, 12);
  assert.equal(
    (await q("SELECT SUM(amount_cents) AS n FROM cash_movements WHERE category='Planilla'")).rows[0]
      .n,
    result.total_cents,
  );
});
test('Operaciones concurrentes no pueden sobregirar el inventario', async () => {
  const stock = (await q("SELECT * FROM inventory WHERE branch_id='b3' AND product_id='p6'"))
    .rows[0];
  const results = await Promise.allSettled([
    model.transfer(
      { inventory_id: stock.id, destination_id: 'b4', quantity: stock.quantity },
      user,
    ),
    model.transfer(
      { inventory_id: stock.id, destination_id: 'b5', quantity: stock.quantity },
      user,
    ),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await q('SELECT quantity FROM inventory WHERE id=$1', [stock.id])).rows[0].quantity,
    0,
  );
});
test('Valida cantidades, montos, períodos y fechas imposibles', async () => {
  await assert.rejects(() => model.stock({ quantity: 1.5 }, user), /Cantidad/);
  await assert.rejects(
    () =>
      model.cash(
        {
          branch_id: 'b1',
          kind: 'Ingreso',
          category: 'Prueba',
          amount: -10,
          method: 'Efectivo',
          description: 'Prueba',
        },
        user,
      ),
    /Monto/,
  );
  await assert.rejects(() => model.payroll({ period: '2026-13' }, user), /Período/);
  await assert.rejects(
    () => model.stock({ quantity: 1, expires_on: '2027-02-31' }, user),
    /fecha no válida/,
  );
});
