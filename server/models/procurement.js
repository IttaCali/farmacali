import { randomUUID } from 'node:crypto';
import { db } from '../database/db.js';
import { AppError, ledgerEntry } from './pharmacy.js';
import { writeAudit } from './audit.js';
import { sha256 } from '../security/crypto.js';
import { addInventoryCost } from './costs.js';
import { text, num, cents, date, permit, scope } from './domain.js';
const generatedLot = () =>
  `FC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
export class Procurement {
  constructor(database = db) {
    this.db = database;
  }
  async snapshot(user) {
    permit(user, 'abastecimiento.ver');
    const where = user.scope === 'branch' ? ' WHERE p.branch_id=$1' : '',
      args = user.scope === 'branch' ? [user.branch_id] : [];
    return this.db.transaction(async (q) => ({
      suppliers: (await q('SELECT * FROM suppliers ORDER BY name')).rows,
      orders: (
        await q(
          'SELECT p.*,s.name AS supplier_name,b.name AS branch_name FROM purchase_orders p JOIN suppliers s ON s.id=p.supplier_id JOIN branches b ON b.id=p.branch_id' +
            where +
            ' ORDER BY p.created_at DESC',
          args,
        )
      ).rows,
      lines: (
        await q(
          'SELECT l.*,pr.name AS product_name FROM purchase_lines l JOIN purchase_orders p ON p.id=l.purchase_id JOIN products pr ON pr.id=l.product_id' +
            where,
          args,
        )
      ).rows,
      receipts: (
        await q(
          'SELECT r.*,pr.name AS product_name,i.lot,i.expires_on FROM purchase_receipts r JOIN purchase_orders p ON p.id=r.purchase_id JOIN inventory i ON i.id=r.inventory_id JOIN products pr ON pr.id=i.product_id' +
            where +
            ' ORDER BY r.created_at DESC',
          args,
        )
      ).rows,
      returns: (
        await q(
          'SELECT r.*,p.branch_id,s.name AS supplier_name FROM supplier_returns r JOIN purchase_receipts pr ON pr.id=r.receipt_id JOIN purchase_orders p ON p.id=pr.purchase_id JOIN suppliers s ON s.id=p.supplier_id' +
            where +
            ' ORDER BY r.created_at DESC',
          args,
        )
      ).rows,
      margins: (
        await q(
          "SELECT t.branch_id,SUM(t.revenue) AS revenue,SUM(t.known_cost) AS known_cost,SUM(t.unknown_units) AS unknown_units FROM (SELECT o.id,o.branch_id,o.total_cents AS revenue,COALESCE(SUM(CASE WHEN c.known=1 THEN i.quantity*c.unit_cost_cents ELSE 0 END),0) AS known_cost,COALESCE(SUM(CASE WHEN c.known=1 THEN 0 ELSE i.quantity END),0) AS unknown_units FROM orders o JOIN order_items i ON i.order_id=o.id LEFT JOIN order_item_costs c ON c.item_id=i.id WHERE o.status='Entregado'" +
            (user.scope === 'branch' ? ' AND o.branch_id=$1' : '') +
            ' GROUP BY o.id,o.branch_id,o.total_cents) t GROUP BY t.branch_id',
          args,
        )
      ).rows.map((r) => ({
        ...r,
        revenue: Number(r.revenue),
        known_cost: Number(r.known_cost),
        unknown_units: Number(r.unknown_units),
        gross_margin: Number(r.unknown_units) ? null : Number(r.revenue) - Number(r.known_cost),
      })),
    }));
  }
  async supplier(data, user) {
    permit(user, 'abastecimiento.gestionar');
    const id = randomUUID();
    await this.db.transaction(async (q) => {
      await q(
        'INSERT INTO suppliers (id,name,nit,phone,email,address) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          id,
          text(data.name, 'Proveedor', 100),
          text(data.nit, 'NIT', 30),
          text(data.phone, 'Teléfono', 25),
          String(data.email || '').slice(0, 150),
          String(data.address || '').slice(0, 250),
        ],
      );
      await writeAudit(q, user, 'CREAR', 'proveedor', id, { name: data.name });
    });
    return { id };
  }
  async create(data, user) {
    permit(user, 'abastecimiento.gestionar');
    const branch = text(data.branch_id, 'Sucursal');
    scope(user, branch);
    if (
      !Array.isArray(data.items) ||
      !data.items.length ||
      data.items.length > 50 ||
      new Set(data.items.map((i) => i.product_id)).size !== data.items.length
    )
      throw new AppError('La compra debe incluir de 1 a 50 productos distintos.');
    const id = randomUUID();
    await this.db.transaction(async (q) => {
      if (
        !(await q('SELECT id FROM suppliers WHERE id=$1 AND active=1', [data.supplier_id])).rows
          .length
      )
        throw new AppError('Proveedor inexistente o inactivo.');
      if (
        !(await q("SELECT id FROM branches WHERE id=$1 AND active=1 AND state='Activo'", [branch]))
          .rows.length
      )
        throw new AppError('Sucursal no disponible.');
      if (!['Efectivo', 'Tarjeta', 'Transferencia'].includes(data.payment))
        throw new AppError('Método de pago inválido.');
      await q(
        'INSERT INTO purchase_orders (id,supplier_id,branch_id,payment,notes,created_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [
          id,
          data.supplier_id,
          branch,
          data.payment,
          String(data.notes || '').slice(0, 500),
          new Date().toISOString(),
          user.id,
        ],
      );
      for (const i of data.items) {
        if (
          !(await q("SELECT id FROM products WHERE id=$1 AND state='Activo'", [i.product_id])).rows
            .length
        )
          throw new AppError('Producto no disponible.');
        await q(
          'INSERT INTO purchase_lines (id,purchase_id,product_id,quantity,unit_cost_cents) VALUES ($1,$2,$3,$4,$5)',
          [
            randomUUID(),
            id,
            i.product_id,
            num(i.quantity, 'Cantidad', 1, 100000, true),
            cents(i.unit_cost, 'Costo unitario'),
          ],
        );
      }
      await writeAudit(q, user, 'CREAR', 'compra', id, {
        branch_id: branch,
        lines: data.items.length,
      });
    });
    return { id };
  }
  async registerMedicine(data, user) {
    permit(user, 'abastecimiento.gestionar');
    const branch = text(data.branch_id, 'Sucursal'),
      supplier = text(data.supplier_id, 'Proveedor'),
      name = text(data.name, 'Medicamento', 100),
      component = text(data.component, 'Componente', 150),
      sku = text(data.sku, 'SKU', 40),
      category = text(data.category, 'Clasificación', 60),
      price = cents(data.price, 'Precio de venta'),
      unitCost = cents(data.unit_cost, 'Costo unitario'),
      quantity = num(data.quantity, 'Cantidad', 1, 100000, true),
      expiresOn = date(data.expires_on),
      minimum = num(data.minimum ?? 20, 'Mínimo', 0, 100000, true),
      document = text(data.document, 'Documento del proveedor', 100),
      payment = data.payment,
      productId = randomUUID(),
      purchaseId = randomUUID(),
      lineId = randomUUID(),
      inventoryId = randomUUID(),
      receiptId = randomUUID(),
      lot = generatedLot(),
      total = quantity * unitCost,
      controlled = data.controlled === true,
      prescription = controlled || data.prescription === true;
    scope(user, branch);
    if (!['Efectivo', 'Tarjeta', 'Transferencia'].includes(payment))
      throw new AppError('Método de pago inválido.');
    if (
      expiresOn <= new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Guatemala',
      })
    )
      throw new AppError('El lote debe tener una fecha de vencimiento futura.');
    if (total > 2147483647)
      throw new AppError('El monto de la recepción supera el límite permitido.');
    await this.db.transaction(async (q) => {
      if (!(await q('SELECT id FROM suppliers WHERE id=$1 AND active=1', [supplier])).rows.length)
        throw new AppError('Proveedor inexistente o inactivo.');
      if (
        !(await q("SELECT id FROM branches WHERE id=$1 AND active=1 AND state='Activo'", [branch]))
          .rows.length
      )
        throw new AppError('Sucursal no disponible.');
      if ((await q('SELECT id FROM products WHERE sku=$1', [sku])).rows.length)
        throw new AppError('Ya existe un medicamento con ese SKU.', 409);
      await q(
        'INSERT INTO products (id,name,sku,component,category,price_cents,prescription,controlled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [productId, name, sku, component, category, price, prescription ? 1 : 0, controlled ? 1 : 0],
      );
      await q(
        'INSERT INTO purchase_orders (id,supplier_id,branch_id,status,payment,notes,created_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          purchaseId,
          supplier,
          branch,
          'Recibida',
          payment,
          'Registro inicial de medicamento',
          new Date().toISOString(),
          user.id,
        ],
      );
      await q(
        'INSERT INTO purchase_lines (id,purchase_id,product_id,quantity,unit_cost_cents,received) VALUES ($1,$2,$3,$4,$5,$4)',
        [lineId, purchaseId, productId, quantity, unitCost],
      );
      const stock = { id: inventoryId, branch_id: branch, product_id: productId };
      await q(
        'INSERT INTO inventory (id,branch_id,product_id,lot,expires_on,quantity,minimum) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [inventoryId, branch, productId, lot, expiresOn, quantity, minimum],
      );
      await addInventoryCost(q, inventoryId, 0, quantity, unitCost);
      await q(
        'INSERT INTO purchase_receipts (id,purchase_id,line_id,inventory_id,quantity,unit_cost_cents,document,created_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          receiptId,
          purchaseId,
          lineId,
          inventoryId,
          quantity,
          unitCost,
          document,
          new Date().toISOString(),
          user.id,
        ],
      );
      await ledgerEntry(
        q,
        user,
        stock,
        quantity,
        'COMPRA',
        receiptId,
        'Recepción de compra ' + document,
      );
      await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
        randomUUID(),
        branch,
        'Egreso',
        'Compra de medicamentos',
        total,
        payment,
        'Compra ' + purchaseId + ' · ' + document,
        new Date().toISOString(),
        user.id,
      ]);
      await writeAudit(q, user, 'CREAR', 'medicamento', productId, {
        name,
        sku,
        supplier_id: supplier,
        branch_id: branch,
      });
      await writeAudit(q, user, 'RECIBIR', 'compra', purchaseId, {
        document,
        quantity,
        total_cents: total,
        branch_id: branch,
      });
    });
    return {
      product_id: productId,
      purchase_id: purchaseId,
      receipt_id: receiptId,
      name,
      lot,
      quantity,
    };
  }
  async action(id, data, user) {
    permit(user, 'abastecimiento.gestionar');
    return this.db.transaction(async (q) => {
      const p = (
        await q(
          'SELECT * FROM purchase_orders WHERE id=$1' + (this.db.cloud ? ' FOR UPDATE' : ''),
          [id],
        )
      ).rows[0];
      if (!p) throw new AppError('Compra no encontrada.', 404);
      scope(user, p.branch_id);
      const status =
        data.action === 'confirm' ? 'Confirmada' : data.action === 'cancel' ? 'Cancelada' : null;
      if (!status || p.status !== 'Borrador')
        throw new AppError('Solo se puede confirmar o cancelar una compra en borrador.', 409);
      await q('UPDATE purchase_orders SET status=$1 WHERE id=$2', [status, id]);
      await writeAudit(q, user, 'ESTADO', 'compra', id, { status, branch_id: p.branch_id });
      return { id };
    });
  }
  async receive(id, data, user) {
    permit(user, 'abastecimiento.gestionar');
    const request = text(data.request_id, 'Identificador de recepción', 100),
      document = text(data.document, 'Documento del proveedor', 100),
      digest = sha256(JSON.stringify({ id, ...data }));
    if (
      !Array.isArray(data.items) ||
      !data.items.length ||
      data.items.length > 50 ||
      new Set(data.items.map((i) => i.line_id)).size !== data.items.length
    )
      throw new AppError('Selecciona líneas de recepción distintas.');
    return this.db.transaction(async (q) => {
      const prior = (await q('SELECT * FROM procurement_actions WHERE request_id=$1', [request]))
        .rows[0];
      const p = (
        await q(
          'SELECT * FROM purchase_orders WHERE id=$1' + (this.db.cloud ? ' FOR UPDATE' : ''),
          [id],
        )
      ).rows[0];
      if (!p) throw new AppError('Compra no encontrada.', 404);
      scope(user, p.branch_id);
      if (prior) {
        if (prior.payload_hash !== digest || prior.entity_id !== id)
          throw new AppError('Este intento ya se utilizó con otra recepción.', 409);
        return { id: prior.entity_id, repeated: true };
      }
      if (!['Confirmada', 'Parcial'].includes(p.status))
        throw new AppError('La compra no está pendiente de recepción.', 409);
      let total = 0;
      const lots = [];
      for (const i of data.items) {
        const line = (
          await q('SELECT * FROM purchase_lines WHERE id=$1 AND purchase_id=$2', [i.line_id, id])
        ).rows[0];
        if (!line) throw new AppError('Línea de compra no encontrada.');
        const quantity = num(i.quantity, 'Cantidad recibida', 1, 100000, true),
          lot = generatedLot(),
          expiry = date(i.expires_on);
        if (expiry <= new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' }))
          throw new AppError('No se reciben medicamentos vencidos.');
        const changed = await q(
          'UPDATE purchase_lines SET received=received+$1 WHERE id=$2 AND received+$1<=quantity',
          [quantity, line.id],
        );
        if (!changed.rowCount) throw new AppError('La recepción supera lo pendiente.', 409);
        let stock = (
          await q('SELECT * FROM inventory WHERE branch_id=$1 AND product_id=$2 AND lot=$3', [
            p.branch_id,
            line.product_id,
            lot,
          ])
        ).rows[0];
        const before = stock?.quantity || 0;
        if (stock) {
          if (stock.expires_on !== expiry)
            throw new AppError('El lote ya existe con otro vencimiento.');
          await q('UPDATE inventory SET quantity=quantity+$1 WHERE id=$2', [quantity, stock.id]);
        } else {
          stock = { id: randomUUID(), branch_id: p.branch_id, product_id: line.product_id };
          await q('INSERT INTO inventory VALUES ($1,$2,$3,$4,$5,$6,$7)', [
            stock.id,
            p.branch_id,
            line.product_id,
            lot,
            expiry,
            quantity,
            20,
          ]);
        }
        await addInventoryCost(q, stock.id, before, quantity, line.unit_cost_cents);
        const receipt = randomUUID();
        await q(
          'INSERT INTO purchase_receipts (id,purchase_id,line_id,inventory_id,quantity,unit_cost_cents,document,created_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            receipt,
            id,
            line.id,
            stock.id,
            quantity,
            line.unit_cost_cents,
            document,
            new Date().toISOString(),
            user.id,
          ],
        );
        await ledgerEntry(
          q,
          user,
          stock,
          quantity,
          'COMPRA',
          receipt,
          'Recepción de compra ' + document,
        );
        lots.push({ product_id: line.product_id, lot, quantity });
        total += quantity * line.unit_cost_cents;
      }
      if (total > 2147483647)
        throw new AppError('El monto de la recepción supera el límite permitido.');
      await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
        randomUUID(),
        p.branch_id,
        'Egreso',
        'Compra de medicamentos',
        total,
        p.payment,
        'Compra ' + id + ' · ' + document,
        new Date().toISOString(),
        user.id,
      ]);
      const pending = Number(
        (
          await q(
            'SELECT COUNT(*) AS n FROM purchase_lines WHERE purchase_id=$1 AND received<quantity',
            [id],
          )
        ).rows[0].n,
      );
      await q('UPDATE purchase_orders SET status=$1 WHERE id=$2', [
        pending ? 'Parcial' : 'Recibida',
        id,
      ]);
      await q('INSERT INTO procurement_actions VALUES ($1,$2,$3)', [request, id, digest]);
      await writeAudit(q, user, 'RECIBIR', 'compra', id, {
        document,
        total_cents: total,
        branch_id: p.branch_id,
      });
      return { id, total_cents: total, lots };
    });
  }
  async returnGoods(data, user) {
    permit(user, 'abastecimiento.gestionar');
    return this.db.transaction(async (q) => {
      const r = (
        await q(
          'SELECT r.*,p.branch_id FROM purchase_receipts r JOIN purchase_orders p ON p.id=r.purchase_id WHERE r.id=$1' +
            (this.db.cloud ? ' FOR UPDATE' : ''),
          [data.receipt_id],
        )
      ).rows[0];
      if (!r) throw new AppError('Recepción no encontrada.', 404);
      scope(user, r.branch_id);
      const qty = num(data.quantity, 'Unidades a devolver', 1, 100000, true),
        reason = text(data.reason, 'Motivo', 500),
        credit = text(data.credit_note, 'Nota de crédito', 100);
      if (
        !(
          await q(
            'UPDATE purchase_receipts SET returned=returned+$1 WHERE id=$2 AND returned+$1<=quantity',
            [qty, r.id],
          )
        ).rowCount
      )
        throw new AppError('La devolución supera lo recibido disponible.', 409);
      if (
        !(
          await q('UPDATE inventory SET quantity=quantity-$1 WHERE id=$2 AND quantity>=$1', [
            qty,
            r.inventory_id,
          ])
        ).rowCount
      )
        throw new AppError(
          'No puedes devolver unidades reservadas, vendidas o no disponibles.',
          409,
        );
      const id = randomUUID(),
        amount = qty * r.unit_cost_cents;
      await q(
        'INSERT INTO supplier_returns (id,receipt_id,quantity,amount_cents,reason,credit_note,created_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, r.id, qty, amount, reason, credit, new Date().toISOString(), user.id],
      );
      const stock = (await q('SELECT * FROM inventory WHERE id=$1', [r.inventory_id])).rows[0];
      await ledgerEntry(q, user, stock, -qty, 'DEVOLUCION_PROVEEDOR', id, reason);
      await writeAudit(q, user, 'DEVOLVER', 'proveedor', id, {
        branch_id: r.branch_id,
        quantity: qty,
        credit_note: credit,
        amount_cents: amount,
      });
      return { id };
    });
  }
  async refund(id, user) {
    permit(user, 'abastecimiento.gestionar');
    return this.db.transaction(async (q) => {
      const r = (
        await q(
          'SELECT r.*,p.branch_id,p.payment FROM supplier_returns r JOIN purchase_receipts pr ON pr.id=r.receipt_id JOIN purchase_orders p ON p.id=pr.purchase_id WHERE r.id=$1' +
            (this.db.cloud ? ' FOR UPDATE' : ''),
          [id],
        )
      ).rows[0];
      if (!r) throw new AppError('Devolución inexistente.', 404);
      scope(user, r.branch_id);
      if (
        !(
          await q(
            "UPDATE supplier_returns SET status='Reembolsada' WHERE id=$1 AND status='Pendiente de reembolso'",
            [id],
          )
        ).rowCount
      )
        throw new AppError('El reembolso ya fue registrado.', 409);
      await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
        randomUUID(),
        r.branch_id,
        'Ingreso',
        'Reembolso de proveedor',
        r.amount_cents,
        r.payment,
        'Nota de crédito ' + r.credit_note,
        new Date().toISOString(),
        user.id,
      ]);
      await writeAudit(q, user, 'REEMBOLSAR', 'proveedor', id, {
        amount_cents: r.amount_cents,
        branch_id: r.branch_id,
      });
      return { id };
    });
  }
}
export const procurement = new Procurement();
