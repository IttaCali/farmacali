import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { Database, db } from '../server/database/db.js';
import { initialize } from '../server/database/init.js';
import { Authentication } from '../server/models/authentication.js';
import { Pharmacy } from '../server/models/pharmacy.js';
import { Portal } from '../server/models/portal.js';
import { Procurement } from '../server/models/procurement.js';
import { PayrollEngine } from '../server/models/payroll.js';
import { History } from '../server/models/history.js';
import { PortalSupport } from '../server/models/portal-support.js';
import { Delivery } from '../server/models/delivery.js';
const clock = () => new Date('2026-10-04T16:00:00Z');
const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/2kAAAAASUVORK5CYII=';
after(() => db.close());
for (const dialect of ['SQLite', 'PostgreSQL']) {
  test(`${dialect}: ampliación integral, privacidad y transacciones`, async (t) => {
    const engine = dialect === 'PostgreSQL' ? new PGlite() : null;
    const result = (r) => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });
    const database = engine
      ? {
          cloud: true,
          query: async (s, p = []) => result(await engine.query(s, p)),
          transaction: (fn) =>
            engine.transaction((tx) => fn(async (s, p = []) => result(await tx.query(s, p)))),
          close: () => engine.close(),
        }
      : new Database('', ':memory:');
    const q = database.query.bind(database);
    try {
      await initialize(database);
      if (database.cloud) {
        const tables = (
          await q(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('phone_challenges','phone_proofs','portal_phone_records')",
          )
        ).rows;
        assert.deepEqual(tables, []);
      }
      const auth = new Authentication(database);
      const admin = auth.publicUser(await auth.user('u-admin'));
      const auditor = auth.publicUser(await auth.user('u-auditor'));
      const branch = auth.publicUser(await auth.user('u-branch'));
      const callcenter = {
        ...auth.publicUser(await auth.user('u-operator')),
        branch_id: 'b1',
      };
      const courier = {
        ...auth.publicUser(await auth.user('u-courier')),
        branch_id: 'b1',
      };
      await q("UPDATE users SET branch_id='b1' WHERE id IN ($1,$2)", [
        callcenter.id,
        courier.id,
      ]);
      const model = new Pharmacy(database, clock),
        portal = new Portal(database, clock),
        procurement = new Procurement(database),
        payroll = new PayrollEngine(database),
        portalSupport = new PortalSupport(database, clock),
        delivery = new Delivery(database),
        history = new History(database);
      const cart = async (extra = {}) =>
        portal.create({
          request_id: randomUUID(),
          branch_id: 'b1',
          items: [{ product_id: 'p1', quantity: 1 }],
          fulfillment: 'pickup',
          customer: 'Cliente ficticio ampliación',
          dpi: '1234567890101',
          phone: '55551234',
          payment: 'Efectivo',
          ...extra,
        });
      await t.test(
        'Historial mayor a 1,000, totales completos y filtros por fecha/sucursal',
        async () => {
          await database.transaction(async (tx) => {
            for (let n = 0; n < 1051; n++)
              await tx('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
                'hist-' + n,
                n === 0 ? 'b2' : 'b1',
                'Ingreso',
                'Prueba histórica',
                100,
                'Efectivo',
                'Referencia histórica ' + n,
                '2025-01-01T07:00:00.000Z',
                'u-admin',
              ]);
          });
          const filter = { from: '2025-01-01', to: '2025-01-01', search: 'Referencia histórica' };
          const first = await history.list('cash', filter, auditor);
          assert.equal(first.total, 1051);
          assert.equal(first.rows.length, 50);
          assert.equal(first.totals.income, 105100);
          assert.equal(
            (await history.list('cash', { ...filter, page: 22 }, auditor)).rows.length,
            1,
          );
          assert.equal((await history.list('cash', filter, auditor, true)).rows.length, 1051);
          assert.equal(
            (await history.list('cash', { ...filter, branch_id: 'b2' }, branch, true)).rows.length,
            1050,
          );
          await assert.rejects(
            () => history.list('cash', { from: '2025-02-30' }, auditor),
            /Fecha/,
          );
          const snap = await model.snapshot(auditor);
          assert.ok(snap.cash_summary.reduce((a, r) => a + Number(r.income), 0) >= 105100);
        },
      );
      await t.test(
        'Compra parcial, repetición segura, costo real, devolución y reembolso único',
        async () => {
          const supplier = await procurement.supplier(
            { name: 'Proveedor ficticio', nit: 'CF', phone: '55550000' },
            branch,
          );
          const p = await procurement.create(
            {
              supplier_id: supplier.id,
              branch_id: 'b1',
              payment: 'Transferencia',
              items: [{ product_id: 'p1', quantity: 10, unit_cost: 7 }],
            },
            branch,
          );
          await procurement.action(p.id, { action: 'confirm' }, branch);
          const line = (await q('SELECT * FROM purchase_lines WHERE purchase_id=$1', [p.id]))
            .rows[0];
          const input = {
            request_id: randomUUID(),
            document: 'FAC-PRUEBA',
            items: [
              { line_id: line.id, quantity: 6, lot: 'COMPRA-TEST', expires_on: '2035-01-01' },
            ],
          };
          await procurement.receive(p.id, input, branch);
          assert.equal((await procurement.receive(p.id, input, branch)).repeated, true);
          assert.equal(
            (await q('SELECT status FROM purchase_orders WHERE id=$1', [p.id])).rows[0].status,
            'Parcial',
          );
          await assert.rejects(
            () =>
              procurement.receive(
                p.id,
                { ...input, request_id: randomUUID(), items: [{ ...input.items[0], quantity: 5 }] },
                branch,
              ),
            /supera/,
          );
          await procurement.receive(
            p.id,
            { ...input, request_id: randomUUID(), items: [{ ...input.items[0], quantity: 4 }] },
            branch,
          );
          const stock = (await q("SELECT * FROM inventory WHERE lot='COMPRA-TEST'")).rows[0];
          assert.equal(stock.quantity, 10);
          assert.equal(
            (
              await q('SELECT unit_cost_cents FROM inventory_costs WHERE inventory_id=$1', [
                stock.id,
              ])
            ).rows[0].unit_cost_cents,
            700,
          );
          const receipt = (await q('SELECT * FROM purchase_receipts WHERE purchase_id=$1', [p.id]))
            .rows[0];
          const r = await procurement.returnGoods(
            { receipt_id: receipt.id, quantity: 2, reason: 'Prueba', credit_note: 'NC-1' },
            branch,
          );
          await procurement.refund(r.id, branch);
          await assert.rejects(() => procurement.refund(r.id, branch), /ya fue/);
          assert.equal(
            (await q('SELECT quantity FROM inventory WHERE id=$1', [stock.id])).rows[0].quantity,
            8,
          );
          // Force the costed lot first in FEFO, proving cost capture and discounted revenue.
          await q("UPDATE inventory SET expires_on='2036-01-01' WHERE product_id='p1' AND id<>$1", [
            stock.id,
          ]);
          const sale = await model.order(
            {
              branch_id: 'b1',
              product_id: 'p1',
              quantity: 2,
              payment: 'Efectivo',
              discount_percent: 10,
            },
            branch,
            true,
          );
          const oi = (await q('SELECT * FROM order_items WHERE order_id=$1', [sale.id])).rows[0];
          assert.equal(oi.inventory_id, stock.id);
          const margins = (await procurement.snapshot(branch)).margins.find(
            (r) => r.branch_id === 'b1',
          );
          assert.equal(margins.unknown_units, 0);
          assert.equal(margins.known_cost, 1400);
          assert.equal(margins.gross_margin, sale.total_cents - 1400);
          await assert.rejects(() => procurement.supplier({ name: 'No' }, admin), /rol/);
        },
      );
      await t.test(
        'Planilla calcula neto y provisiones, conserva detalle e impide doble pago',
        async () => {
          await payroll.saveRules({ ...(await payroll.rules()), enabled: true }, admin);
          const employee = (await q('SELECT * FROM employees ORDER BY name')).rows[0];
          await payroll.input(
            {
              employee_id: employee.id,
              period: '2030-01',
              days: 30,
              bonus: 250,
              overtime: 100,
              isr: 50,
              other: 10,
              other_reason: 'Prueba',
              social_security: true,
            },
            admin,
          );
          const preview = await payroll.preview('2030-01', admin);
          const b = preview.lines.find((l) => l.employee_id === employee.id).breakdown;
          assert.equal(b.net, b.gross - b.igss - 6000);
          assert.ok(b.aguinaldo_provision > 0 && b.employer_igss > 0);
          const paid = await payroll.pay({ period: '2030-01' }, admin);
          assert.equal(
            paid.total_cents,
            preview.lines.reduce((sum, l) => sum + l.breakdown.net, 0),
          );
          assert.equal(
            (await payroll.preview('2030-01', admin)).lines.find(
              (l) => l.employee_id === employee.id,
            ).breakdown.net,
            b.net,
          );
          await assert.rejects(() => payroll.pay({ period: '2030-01' }, admin), /pagada/);
          await assert.rejects(
            () => payroll.input({ employee_id: employee.id, period: '2030-01', days: 30 }, admin),
            /pagada/,
          );
          await payroll.benefit(
            {
              employee_id: employee.id,
              period: '2030-01',
              kind: 'Aguinaldo',
              amount: 100,
              reason: 'Cálculo académico revisado',
            },
            admin,
          );
          await assert.rejects(() =>
            payroll.benefit(
              {
                employee_id: employee.id,
                period: '2030-01',
                kind: 'Aguinaldo',
                amount: 100,
                reason: 'Duplicado',
              },
              admin,
            ),
          );
          await payroll.input(
            {
              employee_id: employee.id,
              period: '2030-02',
              days: 30,
              other: 999999,
              other_reason: 'Probar reversión',
            },
            admin,
          );
          await assert.rejects(() => payroll.pay({ period: '2030-02' }, admin), /deducciones/);
          assert.equal((await q("SELECT * FROM payroll WHERE period='2030-02'")).rows.length, 0);
        },
      );
      await t.test(
        'Pedido sin DPI y contacto estable sin verificación telefónica',
        async () => {
          const phone = '55550991';
          const first = await cart({
            dpi: '',
            phone,
          });
          const second = await cart({
            dpi: undefined,
            phone,
          });
          const records = (
            await q(
              'SELECT client_id FROM orders WHERE id IN (SELECT order_id FROM portal_orders WHERE ticket=$1 OR ticket=$2)',
              [first.ticket, second.ticket],
            )
          ).rows;
          assert.equal(records.length, 2);
          assert.equal(records[0].client_id, records[1].client_id);
          assert.equal(
            (await q('SELECT cui_cipher FROM clients WHERE id=$1', [records[0].client_id])).rows[0]
              .cui_cipher,
            null,
          );
          await assert.rejects(() => cart({ dpi: '123', phone }), /DPI/);
        },
      );
      await t.test(
        'Mostrador: cesta atómica, cobro único, repetición segura y receta obligatoria',
        async () => {
          const data = {
            request_id: randomUUID(),
            branch_id: 'b1',
            payment: 'Efectivo',
            amount_received: 1000,
            nit: 'CF',
            items: [
              { product_id: 'p1', quantity: 2 },
              { product_id: 'p2', quantity: 1 },
            ],
          };
          const callcenter = { ...admin, role: 'callcenter', scope: 'all', branch_id: 'b1' };
          await assert.rejects(
            () => model.counterSale({ ...data, branch_id: 'b2' }, callcenter),
            /otra sucursal/i,
          );
          await assert.rejects(
            () => model.counterSale(data, { ...callcenter, branch_id: null }),
            /sin sucursal/i,
          );
          const result = await model.counterSale(data, admin);
          assert.equal(result.amount_received_cents, 100000);
          assert.equal(result.change_cents, result.amount_received_cents - result.total_cents);
          const order = (await q('SELECT * FROM orders WHERE id=$1', [result.id])).rows[0];
          assert.equal(order.channel, 'mostrador');
          assert.equal(order.status, 'Entregado');
          assert.equal(
            Number(
              (
                await q('SELECT COUNT(*) AS n FROM cash_movements WHERE description=$1', [
                  'Venta ' + result.id,
                ])
              ).rows[0].n,
            ),
            1,
          );
          assert.equal((await model.counterSale(data, admin)).id, result.id);
          const before = Number(
            (
              await q(
                "SELECT SUM(quantity) AS n FROM inventory WHERE branch_id='b1' AND product_id='p1'",
              )
            ).rows[0].n,
          );
          await assert.rejects(
            () =>
              model.counterSale(
                { ...data, request_id: randomUUID(), amount_received: 1 },
                admin,
              ),
            /efectivo recibido/i,
          );
          assert.equal(
            Number(
              (
                await q(
                  "SELECT SUM(quantity) AS n FROM inventory WHERE branch_id='b1' AND product_id='p1'",
                )
              ).rows[0].n,
            ),
            before,
          );
          await assert.rejects(
            () =>
              model.counterSale(
                {
                  ...data,
                  request_id: randomUUID(),
                  items: [
                    { product_id: 'p1', quantity: 1 },
                    { product_id: 'p2', quantity: 10000 },
                  ],
                },
                admin,
              ),
            /Stock/,
          );
          assert.equal(
            Number(
              (
                await q(
                  "SELECT SUM(quantity) AS n FROM inventory WHERE branch_id='b1' AND product_id='p1'",
                )
              ).rows[0].n,
            ),
            before,
          );
          await assert.rejects(
            () =>
              model.counterSale(
                { ...data, request_id: randomUUID(), items: [{ product_id: 'p3', quantity: 1 }] },
                admin,
              ),
            /receta/,
          );
        },
      );
      await t.test(
        'Solo cancelaciones del cliente cuentan; sexta bloquea por celular o DPI',
        async () => {
          const phone = '55550771',
            dpi = '7777777777777';
          const first = await cart({ phone, dpi });
          const oid = (
            await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [first.ticket])
          ).rows[0].order_id;
          await model.orderStatus(
            oid,
            { status: 'Cancelado', reason: 'Sin stock del proveedor' },
            admin,
          );
          assert.equal(
            Number((await q('SELECT COUNT(*) AS n FROM portal_cancellations')).rows[0].n),
            0,
          );
          for (let n = 0; n < 6; n++) {
            const r = await cart({ phone, dpi });
            await assert.rejects(() =>
              portal.cancel({ ticket: r.ticket, access_code: 'incorrecto', reason: 'Prueba' }),
            );
            await portal.cancel({
              ticket: r.ticket,
              access_code: r.access_code,
              reason: 'Cambio del cliente',
            });
            await portal.cancel({
              ticket: r.ticket,
              access_code: r.access_code,
              reason: 'Repetida',
            });
          }
          assert.equal(
            Number((await q('SELECT COUNT(*) AS n FROM portal_cancellations')).rows[0].n),
            6,
          );
          await assert.rejects(
            async () => cart({ phone, dpi: '' }),
            /cancelaciones/,
          );
          await assert.rejects(
            async () => cart({ phone: '55550772', dpi }),
            /cancelaciones/,
          );
          const allowed = await cart({ phone: '55550773', dpi: '' });
          assert.ok(allowed.ticket);
        },
      );
      await t.test('Receta rechazada se reemplaza y archiva, y exige nueva revisión', async () => {
        const r = await cart({
          items: [{ product_id: 'p3', quantity: 1 }],
          prescription_image: image,
        });
        const oid = (await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [r.ticket]))
          .rows[0].order_id;
        await portal.reviewPrescription(oid, { approved: false, notes: 'Foto ilegible' }, admin);
        await portalSupport.replacePrescription({ ...r, prescription_image: image });
        assert.equal((await portal.lookup(r)).prescription_status, 'Pendiente');
        assert.equal(
          (await q('SELECT * FROM prescription_versions WHERE order_id=$1', [oid])).rows.length,
          1,
        );
        await assert.rejects(
          () => model.orderStatus(oid, { status: 'Preparando' }, admin),
          /revisada/,
        );
        await portal.reviewPrescription(oid, { approved: true, notes: 'Revisada' }, admin);
        await model.orderStatus(oid, { status: 'Preparando' }, admin);
        await assert.rejects(
          () => portalSupport.replacePrescription({ ...r, prescription_image: image }),
          /rechazada/,
        );
      });
      await t.test(
        'Repartidor solo ve asignadas; ubicación, QR, cobro y avisos simulados',
        async () => {
          assert.deepEqual(courier.permissions.sort(), ['entrega.propia', 'resumen.ver']);
          const r = await cart({
            fulfillment: 'delivery',
            lat: 14.614,
            lng: -90.551,
            address: 'Dirección ficticia de prueba',
          });
          const oid = (await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [r.ticket]))
            .rows[0].order_id;
          await assert.rejects(
            () => delivery.location(oid, { lat: 14.614, lng: -90.551, simulated: true }, courier),
            /asignada/,
          );
          await model.orderStatus(oid, { status: 'Preparando' }, callcenter);
          await delivery.assign(oid, { courier_id: courier.id }, callcenter);
          await delivery.location(oid, { lat: 14.614, lng: -90.551, simulated: true }, callcenter);
          const list = await delivery.list(courier);
          assert.equal(list.orders.length, 1);
          assert.equal(list.points.length, 1);
          await assert.rejects(
            () =>
              delivery.location(
                oid,
                { lat: 14.614, lng: -90.551, simulated: false },
                callcenter,
              ),
            /GPS real/,
          );
          await delivery.location(
            oid,
            { lat: 14.614, lng: -90.551, accuracy: 15, simulated: false },
            courier,
          );
          await delivery.progress(oid, { action: 'pickup' }, courier);
          assert.equal(
            (await q('SELECT status FROM delivery_assignments WHERE order_id=$1', [oid])).rows[0]
              .status,
            'Recogido',
          );
          await delivery.progress(oid, { action: 'route' }, courier);
          await assert.rejects(() => delivery.finish(oid, { pickup_code: 'incorrecto' }, courier));
          await delivery.finish(
            oid,
            { qr_payload: JSON.stringify({ ticket: r.ticket, access_code: r.access_code }) },
            courier,
          );
          assert.equal((await portal.lookup(r)).status, 'Entregado');
          await assert.rejects(() => delivery.finish(oid, { pickup_code: r.access_code }, courier));
          const messages = await portalSupport.messages(branch);
          assert.equal(messages.simulation, true);
          assert.ok(messages.messages.length >= 2);
          await assert.rejects(() => portalSupport.messages(courier), /rol/);
          assert.equal((await model.snapshot(courier)).orders.length, 0);
        },
      );
    } finally {
      await database.close();
    }
  });
}
