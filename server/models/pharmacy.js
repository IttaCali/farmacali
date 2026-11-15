import { randomUUID } from 'node:crypto';
import { db } from '../database/db.js';
import { writeAudit } from './audit.js';
import { decrypt, encrypt, sha256 } from '../security/crypto.js';
import { can, scopedBranch } from '../security/permissions.js';
import { deliveryEstimate, pickupEstimate } from '../security/delivery.js';
import { businessClock } from '../config.js';
import { parseOrderTicket } from '../../shared/order-ticket.js';
import { addInventoryCost, recordOrderCost } from './costs.js';
import { PayrollEngine } from './payroll.js';
import { simulatedMessage } from '../security/contact.js';
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const id = () => randomUUID();
const now = () => new Date().toISOString();
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const required = (value, label, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new AppError(`${label}: escribe un valor vÃ¡lido (mÃ¡ximo ${max} caracteres).`);
  return value.trim();
};
const number = (value, label, min = 1, max = 100000000, integer = true) => {
  const n = Number(value);
  if (
    value === '' ||
    value === null ||
    typeof value === 'boolean' ||
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new AppError(`${label}: valor fuera de rango.`);
  return n;
};
const cents = (v, label = 'Monto') => Math.round(number(v, label, 0.01, 1000000, false) * 100);
const choice = (v, values, label) => {
  if (!values.includes(v)) throw new AppError(`${label} no vÃ¡lido.`);
  return v;
};
const date = (v, label) => {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    Number.isNaN(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw new AppError(`${label}: fecha no vÃ¡lida.`);
  return v;
};
const exists = async (q, table, key) => {
  if (!(await q(`SELECT id FROM ${table} WHERE id=$1`, [key])).rows.length)
    throw new AppError('El registro seleccionado no existe.', 404);
};
const audit = writeAudit;
export const ledgerEntry = async (q, user, stock, quantity, type, reference, reason) => {
  if (type === 'INGRESO')
    await q('UPDATE inventory_costs SET known=0 WHERE inventory_id=$1', [stock.id]);
  return q('INSERT INTO stock_ledger VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    id(),
    stock.branch_id,
    stock.product_id,
    stock.id,
    quantity,
    type,
    reference,
    reason,
    now(),
    user.id,
  ]);
};
export function distance(lat1, lng1, lat2, lng2) {
  const r = (x) => (x * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class Pharmacy {
  constructor(database = db, clock = businessClock) {
    this.db = database;
    this.clock = clock;
  }
  async snapshot(user) {
    const businessDay = this.db.cloud
      ? "TO_CHAR(CAST(created_at AS timestamptz) AT TIME ZONE 'America/Guatemala','YYYY-MM-DD')"
      : "DATE(created_at,'-6 hours')";
    const recent = new Date(this.clock().getTime() - 7 * 86400000).toISOString();
    const queries = {
      branches: 'SELECT * FROM branches ORDER BY name',
      products: 'SELECT * FROM products ORDER BY name',
      inventory: `SELECT i.*,received.first_received_at,p.name AS product_name,p.sku,p.category,p.component,p.price_cents,p.prescription,b.name AS branch_name FROM inventory i JOIN products p ON p.id=i.product_id JOIN branches b ON b.id=i.branch_id LEFT JOIN (SELECT inventory_id,MIN(created_at) AS first_received_at FROM stock_ledger WHERE quantity>0 AND type IN ('INGRESO','COMPRA','TRASLADO_ENTRADA') GROUP BY inventory_id) received ON received.inventory_id=i.id ORDER BY i.expires_on,p.name`,
      cash: 'SELECT c.*,b.name AS branch_name,u.name AS user_name FROM cash_movements c JOIN branches b ON b.id=c.branch_id JOIN users u ON u.id=c.created_by ORDER BY c.created_at DESC LIMIT 1000',
      transfers:
        'SELECT t.*,p.name AS product_name,s.name AS source_name,d.name AS destination_name FROM transfers t JOIN products p ON p.id=t.product_id JOIN branches s ON s.id=t.source_id JOIN branches d ON d.id=t.destination_id ORDER BY t.created_at DESC',
      assets:
        'SELECT a.*,b.name AS branch_name FROM assets a JOIN branches b ON b.id=a.branch_id ORDER BY a.code',
      employees:
        'SELECT e.*,b.name AS branch_name FROM employees e JOIN branches b ON b.id=e.branch_id ORDER BY e.name',
      payroll:
        'SELECT p.*,e.name AS employee_name,b.name AS branch_name FROM payroll p JOIN employees e ON e.id=p.employee_id JOIN branches b ON b.id=p.branch_id ORDER BY p.period DESC,e.name',
      orders:
        `SELECT o.*,b.name AS branch_name,creator.name AS created_by_name,creator_role.name AS created_by_role,da.courier_id,da.status AS delivery_status,courier.name AS courier_name,po.ticket,po.expires_at AS reservation_expires_at,rx.review_status AS uploaded_rx_status,
        COALESCE(courier.name,(SELECT au.name FROM audit_log al JOIN users au ON au.id=al.user_id WHERE al.entity='pedido' AND al.entity_id=o.id AND al.action='CAMBIAR_ESTADO' ORDER BY al.sequence DESC LIMIT 1),creator.name) AS attended_by_name,
        COALESCE(courier_role.name,(SELECT ar.name FROM audit_log al JOIN users au ON au.id=al.user_id JOIN roles ar ON ar.id=au.role_id WHERE al.entity='pedido' AND al.entity_id=o.id AND al.action='CAMBIAR_ESTADO' ORDER BY al.sequence DESC LIMIT 1),creator_role.name) AS attended_by_role,
        CASE WHEN EXISTS(SELECT 1 FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=o.id AND p.prescription=1) THEN 1 ELSE 0 END AS needs_prescription
        FROM orders o JOIN branches b ON b.id=o.branch_id LEFT JOIN users creator ON creator.id=o.created_by LEFT JOIN roles creator_role ON creator_role.id=creator.role_id LEFT JOIN delivery_assignments da ON da.order_id=o.id LEFT JOIN users courier ON courier.id=da.courier_id LEFT JOIN roles courier_role ON courier_role.id=courier.role_id LEFT JOIN portal_orders po ON po.order_id=o.id LEFT JOIN portal_prescriptions rx ON rx.order_id=o.id ORDER BY o.created_at DESC`,
      order_items: 'SELECT * FROM order_items',
      audit:
        'SELECT a.*,u.name AS user_name FROM audit_log a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 500',
      clients: 'SELECT * FROM clients ORDER BY name',
      users:
        "SELECT u.id,u.name,u.surname,u.position,u.dpi,u.phone,u.birth_date,u.address,u.email,u.state,u.branch_id,u.role_id,u.must_change_password,u.totp_enabled,r.code AS role,r.name AS role_name,b.name AS branch_name FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN branches b ON b.id=u.branch_id WHERE u.id<>'u-system' ORDER BY u.name",
      roles: 'SELECT * FROM roles ORDER BY name',
      role_permissions: 'SELECT * FROM role_permissions',
      permissions: 'SELECT * FROM permissions ORDER BY code',
      requests:
        'SELECT r.*,u.name AS requester_name,a.name AS approver_name FROM requests r JOIN users u ON u.id=r.requester_id LEFT JOIN users a ON a.id=r.approver_id ORDER BY r.created_at DESC',
      shifts:
        'SELECT s.*,b.name AS branch_name,u.name AS user_name FROM cash_shifts s JOIN branches b ON b.id=s.branch_id JOIN users u ON u.id=s.user_id ORDER BY s.opened_at DESC',
      ledger:
        'SELECT k.*,p.name AS product_name,b.name AS branch_name,i.lot FROM stock_ledger k JOIN products p ON p.id=k.product_id JOIN branches b ON b.id=k.branch_id LEFT JOIN inventory i ON i.id=k.inventory_id ORDER BY k.created_at DESC LIMIT 1000',
      prescriptions:
        'SELECT r.*,p.name AS product_name FROM prescriptions r JOIN products p ON p.id=r.product_id ORDER BY r.created_at DESC',
      addresses: 'SELECT * FROM client_addresses ORDER BY label',
      drafts:
        'SELECT d.*,i.branch_id AS source_id,i.product_id,p.name AS product_name,b.name AS source_name,t.name AS destination_name FROM transfer_drafts d JOIN inventory i ON i.id=d.inventory_id JOIN products p ON p.id=i.product_id JOIN branches b ON b.id=i.branch_id JOIN branches t ON t.id=d.destination_id ORDER BY d.created_at DESC',
      salary_history:
        'SELECT h.*,e.name AS employee_name FROM salary_history h JOIN employees e ON e.id=h.employee_id ORDER BY h.created_at DESC',
      depreciation:
        'SELECT h.*,a.name AS asset_name,b.name AS branch_name FROM asset_depreciation h JOIN assets a ON a.id=h.asset_id JOIN branches b ON b.id=a.branch_id ORDER BY h.period DESC',
      history: 'SELECT * FROM entity_history ORDER BY created_at DESC LIMIT 500',
      cash_summary:
        "SELECT branch_id,COALESCE(SUM(CASE WHEN kind='Ingreso' THEN amount_cents ELSE 0 END),0) AS income,COALESCE(SUM(CASE WHEN kind='Egreso' THEN amount_cents ELSE 0 END),0) AS expense,COUNT(*) AS records FROM cash_movements GROUP BY branch_id",
      cash_daily: `SELECT branch_id,${businessDay} AS day,kind,SUM(amount_cents) AS amount_cents FROM cash_movements WHERE created_at>='${recent}' GROUP BY branch_id,${businessDay},kind`,
    };
    const entries = await this.db.transaction((query) =>
      Promise.all(
        Object.entries(queries).map(async ([key, sql]) => [key, (await query(sql)).rows]),
      ),
    );
    const result = Object.fromEntries(entries);
    result.employees = result.employees.map((e) => ({
      ...e,
      salary_cents: e.salary_cipher ? Number(decrypt(e.salary_cipher)) : e.salary_cents,
      salary_cipher: undefined,
    }));
    result.clients = result.clients.map((c) => ({
      ...c,
      cui: c.cui_cipher ? decrypt(c.cui_cipher) : '',
      cui_cipher: undefined,
    }));
    result.salary_history = result.salary_history.map((h) => ({
      ...h,
      salary_cents: Number(decrypt(h.salary_cipher)),
      salary_cipher: undefined,
    }));
    if (user) {
      const modules = {
        branches: 'sucursal.ver',
        products: 'inventario.ver',
        inventory: 'inventario.ver',
        cash: 'caja.ver',
        transfers: 'traslado.ver',
        assets: 'activo.ver',
        employees: 'planilla.ver',
        payroll: 'planilla.ver',
        orders: 'pedido.ver',
        audit: 'auditoria.ver',
        clients: 'cliente.ver',
        users: 'usuario.ver',
        roles: 'usuario.ver',
        role_permissions: 'usuario.ver',
        permissions: 'usuario.ver',
        requests: 'solicitud.ver',
        shifts: 'caja.ver',
        ledger: 'kardex.ver',
        prescriptions: 'receta.ver',
        addresses: 'cliente.ver',
        drafts: 'traslado.ver',
      };
      modules.order_items = 'pedido.ver';
      modules.salary_history = 'planilla.ver';
      modules.depreciation = 'activo.ver';
      modules.history = 'auditoria.ver';
      modules.cash_summary = 'caja.ver';
      modules.cash_daily = 'caja.ver';
      for (const [key, permission] of Object.entries(modules))
        if (!can(user, permission)) result[key] = [];
      if (user.scope === 'branch') {
        for (const key of [
          'inventory',
          'cash',
          'orders',
          'shifts',
          'ledger',
          'cash_summary',
          'cash_daily',
          'assets',
          'employees',
          'payroll',
        ])
          result[key] = result[key].filter((r) => r.branch_id === user.branch_id);
        result.audit = result.audit.filter((r) => r.branch_id === user.branch_id);
        result.history = [];
        result.branches = result.branches.filter((b) => b.id === user.branch_id);
        // Operators need destination names to coordinate transfers, not other branches' stock.
        result.transfer_destinations = Object.fromEntries(entries)
          .branches.filter((b) => b.active === 1)
          .map(({ id, name, department }) => ({ id, name, department }));
        result.transfers = result.transfers.filter(
          (t) => t.source_id === user.branch_id || t.destination_id === user.branch_id,
        );
        result.requests = (
          await this.db.query(
            `SELECT r.*,u.name AS requester_name,a.name AS approver_name FROM requests r JOIN users u ON u.id=r.requester_id LEFT JOIN users a ON a.id=r.approver_id WHERE (r.type='sale_void' AND EXISTS(SELECT 1 FROM orders t WHERE t.id=r.entity_id AND t.branch_id=$1)) OR (r.type='cash_void' AND EXISTS(SELECT 1 FROM cash_movements t WHERE t.id=r.entity_id AND t.branch_id=$1)) OR (r.type='stock_adjust' AND EXISTS(SELECT 1 FROM inventory t WHERE t.id=r.entity_id AND t.branch_id=$1)) OR (r.type='payroll_void' AND EXISTS(SELECT 1 FROM payroll t WHERE t.id=r.entity_id AND t.branch_id=$1)) ORDER BY r.created_at DESC`,
            [user.branch_id],
          )
        ).rows;
        const clients = new Set(result.orders.map((o) => o.client_id));
        result.clients = result.clients.filter((c) => clients.has(c.id));
        result.addresses = result.addresses.filter((a) => clients.has(a.client_id));
        result.drafts = result.drafts.filter((d) => d.source_id === user.branch_id);
        const employeeIds = new Set(result.employees.map((e) => e.id));
        const assetIds = new Set(result.assets.map((a) => a.id));
        result.salary_history = result.salary_history.filter((h) => employeeIds.has(h.employee_id));
        result.depreciation = result.depreciation.filter((d) => assetIds.has(d.asset_id));
        const orderIds = new Set(result.orders.map((o) => o.id));
        result.order_items = result.order_items.filter((i) => orderIds.has(i.order_id));
      }
    }
    return {
      ...result,
      date: today(),
      database: this.db.cloud ? 'PostgreSQL' : 'SQLite Â· demostraciÃ³n local',
      snapshot_notes: {
        cash: 'Vista reciente; totales completos en cash_summary e historial paginado en /history/cash',
        audit: 'Vista reciente; historial completo en /history/audit',
        ledger: 'Vista reciente; historial completo en /history/kardex',
      },
    };
  }
  async branches(data, user) {
    const values = [
      id(),
      required(data.name, 'Nombre', 80),
      required(data.department, 'Departamento', 80),
      required(data.municipality, 'Municipio', 80),
      required(data.address, 'DirecciÃ³n'),
      choice(data.type, ['Centro comercial', 'Gasolinera'], 'Tipo'),
      Number(data.lat ?? 14.6349),
      Number(data.lng ?? -90.5069),
    ];
    return this.db.transaction(async (q) => {
      await q(
        'INSERT INTO branches (id,name,department,municipality,address,type,lat,lng) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        values,
      );
      await audit(q, user, 'CREAR', 'sucursal', values[0], { name: values[1] });
      return { id: values[0] };
    });
  }
  async products(data, user) {
    const values = [
      id(),
      required(data.name, 'Medicamento', 100),
      required(data.sku, 'SKU', 40),
      required(data.category, 'CategorÃ­a', 60),
      cents(data.price, 'Precio'),
      data.prescription === true ? 1 : 0,
    ];
    return this.db.transaction(async (q) => {
      await q(
        'INSERT INTO products (id,name,sku,category,price_cents,prescription) VALUES ($1,$2,$3,$4,$5,$6)',
        values,
      );
      await q('UPDATE products SET component=$1 WHERE id=$2', [data.component || '', values[0]]);
      if (data.controlled)
        await q('UPDATE products SET controlled=1,prescription=1 WHERE id=$1', [values[0]]);
      await audit(q, user, 'CREAR', 'medicamento', values[0], { name: values[1] });
      return { id: values[0] };
    });
  }
  async stock(data, user) {
    data = { ...data, branch_id: scopedBranch(user, data.branch_id) };
    const quantity = number(data.quantity, 'Cantidad'),
      expiry = date(data.expires_on, 'Vencimiento'),
      lot = required(data.lot, 'Lote', 60),
      minimum = number(data.minimum ?? 20, 'MÃ­nimo', 0);
    if (expiry <= today())
      throw new AppError('El lote debe tener una fecha de vencimiento futura.');
    return this.db.transaction(async (q) => {
      await exists(q, 'branches', data.branch_id);
      await exists(q, 'products', data.product_id);
      const branch = (await q('SELECT active FROM branches WHERE id=$1', [data.branch_id])).rows[0],
        product = (await q('SELECT state FROM products WHERE id=$1', [data.product_id])).rows[0];
      if (!branch.active || product.state !== 'Activo')
        throw new AppError('Sucursal o medicamento inactivo.');
      const current = (
        await q('SELECT * FROM inventory WHERE branch_id=$1 AND product_id=$2 AND lot=$3', [
          data.branch_id,
          data.product_id,
          lot,
        ])
      ).rows[0];
      const key = current?.id || id();
      if (current) {
        if (current.expires_on !== expiry)
          throw new AppError('El lote existente tiene otra fecha de vencimiento.');
        await q('UPDATE inventory SET quantity=quantity+$1,minimum=$2 WHERE id=$3', [
          quantity,
          minimum,
          key,
        ]);
      } else
        await q(
          'INSERT INTO inventory (id,branch_id,product_id,lot,expires_on,quantity,minimum) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [key, data.branch_id, data.product_id, lot, expiry, quantity, minimum],
        );
      await ledgerEntry(
        q,
        user,
        { id: key, branch_id: data.branch_id, product_id: data.product_id },
        quantity,
        'INGRESO',
        key,
        'Ingreso de existencias',
      );
      await audit(q, user, 'INGRESAR_EXISTENCIAS', 'inventario', key, {
        quantity,
        lot,
        branch_id: data.branch_id,
      });
      return { id: key };
    });
  }
  async cash(data, user) {
    data = { ...data, branch_id: scopedBranch(user, data.branch_id) };
    const values = [
      id(),
      data.branch_id,
      choice(data.kind, ['Ingreso', 'Egreso'], 'Tipo'),
      required(data.category, 'CategorÃ­a', 60),
      cents(data.amount),
      choice(data.method, ['Efectivo', 'Tarjeta', 'Transferencia'], 'Forma de pago'),
      required(data.description, 'DescripciÃ³n'),
      now(),
      user.id,
    ];
    return this.db.transaction(async (q) => {
      await exists(q, 'branches', data.branch_id);
      await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', values);
      await audit(q, user, 'REGISTRAR', 'caja', values[0], {
        kind: values[2],
        amount_cents: values[4],
        branch_id: data.branch_id,
      });
      return { id: values[0] };
    });
  }
  async transfer(data, user) {
    const qty = number(data.quantity, 'Cantidad');
    return this.db.transaction(async (q) => {
      const stock = (
        await q('SELECT * FROM inventory WHERE id=$1' + (this.db.cloud ? ' FOR UPDATE' : ''), [
          data.inventory_id,
        ])
      ).rows[0];
      if (!stock) throw new AppError('El lote no existe.', 404);
      if (user.scope === 'branch' && stock.branch_id !== user.branch_id)
        throw new AppError('Este lote pertenece a otra sucursal.', 403);
      if (stock.branch_id === data.destination_id)
        throw new AppError('El destino debe ser otra sucursal.');
      await exists(q, 'branches', data.destination_id);
      if (
        !(await q('SELECT active FROM branches WHERE id=$1', [data.destination_id])).rows[0].active
      )
        throw new AppError('El destino estÃ¡ cerrado.');
      if (stock.expires_on <= today())
        throw new AppError('No se permite trasladar lotes vencidos.');
      const changed = await q(
        'UPDATE inventory SET quantity=quantity-$1 WHERE id=$2 AND quantity >= $1',
        [qty, stock.id],
      );
      if (!changed.rowCount)
        throw new AppError('No hay suficientes existencias para el traslado.', 409);
      const key = id();
      await q(
        'INSERT INTO transfers (id,source_id,destination_id,product_id,lot,expires_on,quantity,status,created_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          key,
          stock.branch_id,
          data.destination_id,
          stock.product_id,
          stock.lot,
          stock.expires_on,
          qty,
          'En trÃ¡nsito',
          now(),
          user.id,
        ],
      );
      await ledgerEntry(q, user, stock, -qty, 'TRASLADO_SALIDA', key, 'Despacho entre sucursales');
      const transferCost = (
        await q('SELECT * FROM inventory_costs WHERE inventory_id=$1', [stock.id])
      ).rows[0];
      await q('INSERT INTO transfer_costs VALUES ($1,$2,$3)', [
        key,
        transferCost?.unit_cost_cents || 0,
        transferCost?.known || 0,
      ]);
      await audit(q, user, 'DESPACHAR', 'traslado', key, {
        quantity: qty,
        source: stock.branch_id,
        destination: data.destination_id,
        lot: stock.lot,
      });
      return { id: key };
    });
  }
  async receive(key, user, data = {}) {
    return this.db.transaction(async (q) => {
      const t = (await q('SELECT * FROM transfers WHERE id=$1', [key])).rows[0];
      if (!t) throw new AppError('Traslado no encontrado.', 404);
      if (user.scope === 'branch' && t.destination_id !== user.branch_id)
        throw new AppError('Solo la sucursal de destino puede recibir.', 403);
      if (t.status !== 'En trÃ¡nsito') throw new AppError('Este traslado ya fue recibido.', 409);
      const received =
        data.received_quantity === undefined
          ? t.quantity
          : number(data.received_quantity, 'Cantidad recibida', 0, t.quantity);
      if (received !== t.quantity) required(data.reason, 'Motivo de diferencia');
      const changed = await q(
        "UPDATE transfers SET status='Recibido',received_at=$1,received_quantity=$3,difference_reason=$4 WHERE id=$2 AND status='En trÃ¡nsito'",
        [now(), key, received, data.reason || null],
      );
      if (!changed.rowCount) throw new AppError('Este traslado ya fue recibido.', 409);
      const existing = (
        await q('SELECT * FROM inventory WHERE branch_id=$1 AND product_id=$2 AND lot=$3', [
          t.destination_id,
          t.product_id,
          t.lot,
        ])
      ).rows[0];
      if (existing && existing.expires_on !== t.expires_on)
        throw new AppError('El lote en destino tiene un vencimiento distinto.');
      if (existing)
        await q('UPDATE inventory SET quantity=quantity+$1 WHERE id=$2', [received, existing.id]);
      else
        await q(
          'INSERT INTO inventory (id,branch_id,product_id,lot,expires_on,quantity,minimum) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [id(), t.destination_id, t.product_id, t.lot, t.expires_on, received, 20],
        );
      const destination = (
        await q('SELECT * FROM inventory WHERE branch_id=$1 AND product_id=$2 AND lot=$3', [
          t.destination_id,
          t.product_id,
          t.lot,
        ])
      ).rows[0];
      if (received > 0) {
        const cost = (await q('SELECT * FROM transfer_costs WHERE transfer_id=$1', [key])).rows[0];
        await addInventoryCost(
          q,
          destination.id,
          existing?.quantity || 0,
          received,
          cost?.unit_cost_cents || 0,
          cost?.known === 1,
        );
      }
      await ledgerEntry(
        q,
        user,
        destination,
        received,
        'TRASLADO_ENTRADA',
        key,
        data.reason || 'RecepciÃ³n entre sucursales',
      );
      await audit(
        q,
        user,
        received === t.quantity ? 'RECIBIR' : 'RECIBIR_CON_DIFERENCIA',
        'traslado',
        key,
        {
          quantity: received,
          missing: t.quantity - received,
          reason: data.reason || '',
          branch_id: t.destination_id,
        },
      );
      return { id: key };
    });
  }
  async assets(data, user) {
    data = { ...data, branch_id: scopedBranch(user, data.branch_id) };
    const values = [
      id(),
      data.branch_id,
      required(data.name, 'Activo', 100),
      required(data.code, 'CÃ³digo', 40),
      cents(data.value, 'Valor'),
      date(data.acquired_on, 'AdquisiciÃ³n'),
      number(data.useful_life_months, 'Vida Ãºtil', 1, 600),
      'Activo',
    ];
    if (values[5] > today()) throw new AppError('La adquisiciÃ³n no puede ser futura.');
    return this.db.transaction(async (q) => {
      await exists(q, 'branches', data.branch_id);
      await q(
        'INSERT INTO assets (id,branch_id,name,code,value_cents,acquired_on,useful_life_months,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        values,
      );
      await audit(q, user, 'CREAR', 'activo', values[0], {
        code: values[3],
        value_cents: values[4],
      });
      return { id: values[0] };
    });
  }
  async employees(data, user) {
    const values = [
      id(),
      data.branch_id,
      required(data.name, 'Nombre', 100),
      required(data.position, 'Puesto', 80),
      cents(data.salary, 'Salario'),
      1,
      data.user_id || null,
    ];
    return this.db.transaction(async (q) => {
      await exists(q, 'branches', data.branch_id);
      if (data.user_id) await exists(q, 'users', data.user_id);
      const salary = values[4];
      values[4] = 1;
      await q(
        'INSERT INTO employees (id,branch_id,name,position,salary_cents,active,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        values,
      );
      await q('UPDATE employees SET salary_cipher=$1 WHERE id=$2', [encrypt(salary), values[0]]);
      await q('INSERT INTO salary_history VALUES ($1,$2,$3,$4,$5,$6)', [
        id(),
        values[0],
        encrypt(salary),
        'Alta inicial',
        now(),
        user.id,
      ]);
      await audit(q, user, 'CREAR', 'empleado', values[0], {
        name: values[2],
        branch_id: data.branch_id,
      });
      return { id: values[0] };
    });
  }
  async payroll(data, user) {
    const rules = await new PayrollEngine(this.db).rules();
    if (rules.enabled) return new PayrollEngine(this.db).pay(data, user);
    if (typeof data.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.period))
      throw new AppError('PerÃ­odo de planilla no vÃ¡lido (AAAA-MM).');
    return this.db.transaction(async (q) => {
      const employees = (await q('SELECT * FROM employees WHERE active=1')).rows;
      if (!employees.length) throw new AppError('Registra empleados antes de pagar la planilla.');
      let total = 0,
        count = 0;
      for (const e of employees) {
        if (e.salary_cipher) e.salary_cents = Number(decrypt(e.salary_cipher));
        if (
          (
            await q(
              "SELECT id FROM payroll WHERE employee_id=$1 AND period=$2 AND state='Pagado'",
              [e.id, data.period],
            )
          ).rows.length
        )
          continue;
        // DeducciÃ³n configurable en una siguiente fase; prototipo paga el bruto completo.
        await q(
          'INSERT INTO payroll (id,employee_id,period,gross_cents,deductions_cents,net_cents,created_at,branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [id(), e.id, data.period, e.salary_cents, 0, e.salary_cents, now(), e.branch_id],
        );
        await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
          id(),
          e.branch_id,
          'Egreso',
          'Planilla',
          e.salary_cents,
          'Transferencia',
          `Planilla ${data.period} Â· ${e.name}`,
          now(),
          user.id,
        ]);
        total += e.salary_cents;
        count++;
      }
      if (!count) throw new AppError('La planilla de este perÃ­odo ya fue pagada.', 409);
      await audit(q, user, 'PAGAR', 'planilla', data.period, {
        employees: count,
        total_cents: total,
      });
      return { count, total_cents: total };
    });
  }
  async quote(data, user) {
    const quantity = number(data.quantity, 'Cantidad', 1, 10000),
      lat = Number(data.lat ?? 14.6349),
      lng = number(data.lng, 'Longitud', -93, -88, false);
    await exists(this.db.query.bind(this.db), 'products', data.product_id);
    const product = (await this.db.query('SELECT * FROM products WHERE id=$1', [data.product_id]))
      .rows[0];
    if (product.state !== 'Activo') throw new AppError('Este medicamento estÃ¡ descontinuado.');
    const branches = (
      await this.db.query(
        'SELECT b.*,COALESCE(SUM(i.quantity),0) AS available FROM branches b LEFT JOIN inventory i ON i.branch_id=b.id AND i.product_id=$1 AND i.expires_on>$2 WHERE b.active=1 GROUP BY b.id,b.name,b.department,b.address,b.type,b.lat,b.lng,b.active',
        [data.product_id, today()],
      )
    ).rows;
    const queue = (
      await this.db.query(
        "SELECT branch_id,COUNT(*) AS n FROM orders WHERE status IN ('Pendiente','Preparando','En ruta') GROUP BY branch_id",
      )
    ).rows;
    return {
      product,
      total_cents: quantity * product.price_cents,
      options: branches
        .filter(
          (b) =>
            Number(b.available) >= quantity &&
            (!user || user.scope !== 'branch' || b.id === user.branch_id),
        )
        .map((b) => {
          const km = distance(lat, lng, b.lat, b.lng);
          const queued = Number(queue.find((q) => q.branch_id === b.id)?.n || 0),
            estimate = deliveryEstimate(b, km, queued, this.clock()),
            eta = estimate.eta_minutes;
          return {
            ...b,
            distance_km: Math.round(km * 10) / 10,
            ...estimate,
            payment_methods: ['Efectivo', 'Tarjeta', 'Transferencia'],
            score:
              Math.round((km * 2 + queued * 5 + (quantity / Number(b.available)) * 20) * 100) / 100,
            explanation: `${eta} min estimados Â· ${b.available} unidades Â· ${queued} pedidos en cola Â· cierra ${b.closes_at}`,
          };
        })
        .sort((a, b) => Number(b.serviceable) - Number(a.serviceable) || a.score - b.score),
      radius_km: 30,
      note: 'Ranking: distancia, proporciÃ³n de stock y pedidos en cola. ETA: preparaciÃ³n 20 min + 8 min por pedido + viaje a 25 km/h. Horarios de Guatemala; sin trÃ¡fico real.',
    };
  }
  async order(data, user, isSale = false, transaction = null, parent = null, deferCash = false) {
    data = { ...data, branch_id: scopedBranch(user, data.branch_id) };
    const qty = number(data.quantity, 'Cantidad', 1, 10000),
      payment = choice(data.payment, ['Efectivo', 'Tarjeta', 'Transferencia'], 'Pago');
    const customer = isSale ? 'Venta en mostrador' : required(data.customer, 'Cliente', 100),
      phone = isSale ? '' : required(data.phone, 'TelÃ©fono', 25),
      address = isSale ? 'Mostrador' : required(data.address, 'DirecciÃ³n');
    if (!isSale && !/^[+\d\s()-]{8,25}$/.test(phone)) throw new AppError('TelÃ©fono no vÃ¡lido.');
    const lat = isSale ? 14.6 : Number(data.lat ?? 14.6349),
      lng = isSale ? -90.5 : number(data.lng, 'Longitud', -93, -88, false);
    const run = transaction ? (fn) => fn(transaction) : this.db.transaction.bind(this.db);
    return run(async (q) => {
      const p = (await q('SELECT * FROM products WHERE id=$1', [data.product_id])).rows[0];
      const b = (await q('SELECT * FROM branches WHERE id=$1 AND active=1', [data.branch_id]))
        .rows[0];
      if (!p || !b) throw new AppError('Selecciona medicamento y sucursal vÃ¡lidos.');
      if (p.state !== 'Activo') throw new AppError('Este medicamento estÃ¡ descontinuado.');
      if (
        data.client_id &&
        !(await q("SELECT id FROM clients WHERE id=$1 AND state='Activo'", [data.client_id])).rows
          .length
      )
        throw new AppError('Cliente inexistente o inactivo.');
      const portalRequest = user.id === 'u-system' && user.role === 'portal';
      const pickup = portalRequest && data.fulfillment === 'pickup';
      if (p.prescription && data.prescription_confirmed !== true && !portalRequest)
        throw new AppError('Confirma la validaciÃ³n de receta para este medicamento.');
      if (p.controlled && !data.prescription_id)
        throw new AppError('Los controlados requieren una receta registrada.');
      if (data.prescription_id) {
        const rx = (
          await q('SELECT * FROM prescriptions WHERE id=$1 AND product_id=$2', [
            data.prescription_id,
            p.id,
          ])
        ).rows[0];
        if (!rx) throw new AppError('Receta no vÃ¡lida para el medicamento.');
      }
      const km = isSale ? 0 : distance(lat, lng, b.lat, b.lng);
      if (km > 30 && !pickup)
        throw new AppError('La direcciÃ³n excede el radio de entrega de 30 km de esta sucursal.');
      const stocks = (
        await q(
          'SELECT * FROM inventory WHERE branch_id=$1 AND product_id=$2 AND expires_on>$3 AND quantity>0 ORDER BY expires_on,lot' +
            (this.db.cloud ? ' FOR UPDATE' : ''),
          [b.id, p.id, today()],
        )
      ).rows;
      if (stocks.reduce((sum, s) => sum + s.quantity, 0) < qty)
        throw new AppError('Stock insuficiente. Actualiza la disponibilidad.', 409);
      const queued = Number(
        (
          await q(
            "SELECT COUNT(*) AS n FROM orders WHERE branch_id=$1 AND status IN ('Pendiente','Preparando','En ruta')",
            [b.id],
          )
        ).rows[0].n,
      );
      const estimate = pickup
        ? { ...pickupEstimate(b, queued, this.clock()), serviceable: true }
        : deliveryEstimate(b, km, queued, this.clock());
      if (!isSale && !estimate.serviceable)
        throw new AppError(
          `${estimate.unavailable_reason}. Vuelve a consultar las opciones de entrega.`,
          409,
        );
      const discount = isSale ? number(data.discount_percent ?? 0, 'Descuento', 0, 50, false) : 0;
      const key = parent?.id || id(),
        total = Math.round(qty * p.price_cents * (1 - discount / 100)),
        eta = isSale ? 0 : estimate.eta_minutes,
        created = now();
      if (total > 2147483647)
        throw new AppError('El total excede el lÃ­mite permitido por pedido.');
      if (!parent) {
        await q(
          'INSERT INTO orders (id,branch_id,customer,phone,address,lat,lng,payment,total_cents,eta_minutes,status,prescription_confirmed,created_at,delivered_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
          [
            key,
            b.id,
            customer,
            phone,
            address,
            lat,
            lng,
            payment,
            total,
            eta,
            isSale ? 'Entregado' : 'Pendiente',
            data.prescription_confirmed === true ? 1 : 0,
            created,
            isSale ? created : null,
            user.id,
          ],
        );
        await q('UPDATE orders SET client_id=$1,channel=$2,nit=$3,prescription_id=$4 WHERE id=$5', [
          data.client_id || null,
          isSale ? 'mostrador' : data.channel || 'telefono',
          data.nit || 'CF',
          data.prescription_id || null,
          key,
        ]);
        await q('UPDATE orders SET discount_percent=$1 WHERE id=$2', [discount, key]);
        if (pickup) await q("UPDATE orders SET fulfillment='pickup' WHERE id=$1", [key]);
      } else {
        const changed = await q(
          'UPDATE orders SET total_cents=total_cents+$1 WHERE id=$2 AND total_cents+$1<=2147483647',
          [total, key],
        );
        if (!changed.rowCount)
          throw new AppError('El total del pedido supera el lÃ­mite permitido.');
      }
      let left = qty;
      for (const s of stocks) {
        if (!left) break;
        const take = Math.min(left, s.quantity);
        const changed = await q(
          'UPDATE inventory SET quantity=quantity-$1 WHERE id=$2 AND quantity >= $1',
          [take, s.id],
        );
        if (!changed.rowCount)
          throw new AppError('Las existencias cambiaron. Intenta nuevamente.', 409);
        const itemKey = id();
        await q('INSERT INTO order_items VALUES ($1,$2,$3,$4,$5,$6)', [
          itemKey,
          key,
          s.id,
          p.id,
          take,
          p.price_cents,
        ]);
        await recordOrderCost(q, itemKey, s.id);
        await ledgerEntry(
          q,
          user,
          s,
          -take,
          isSale ? 'VENTA' : 'RESERVA',
          key,
          isSale ? 'Venta en mostrador' : 'Reserva de pedido',
        );
        left -= take;
      }
      if (isSale && !deferCash)
        await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
          id(),
          b.id,
          'Ingreso',
          'Venta en mostrador',
          total,
          payment,
          `Venta ${key.slice(0, 8)} Â· ${p.name}`,
          created,
          user.id,
        ]);
      await audit(q, user, isSale ? 'VENDER' : 'CREAR', 'pedido', key, {
        branch_id: b.id,
        product: p.name,
        quantity: qty,
        total_cents: total,
        eta_minutes: eta,
        discount_percent: discount,
      });
      return { id: key, total_cents: total, eta_minutes: eta };
    });
  }
  async counterSale(data, user) {
    if (user.role === 'callcenter' && !user.branch_id)
      throw new AppError(
        'Esta cuenta no tiene sucursal asignada. Solicita apoyo al administrador.',
        403,
      );
    if (user.scope === 'branch' && !user.branch_id)
      throw new AppError('Esta cuenta no tiene sucursal asignada.', 403);
    const branch = user.branch_id || data.branch_id;
    if (!branch) throw new AppError('Selecciona la sucursal de la venta.');
    if (user.branch_id && data.branch_id && data.branch_id !== user.branch_id)
      throw new AppError('No puedes registrar la venta en otra sucursal.', 403);
    if (!['Efectivo', 'Tarjeta'].includes(data.payment))
      throw new AppError('Forma de pago inválida.');
    const amountReceived =
      data.payment === 'Efectivo'
        ? Math.round(number(data.amount_received, 'Efectivo recibido', 0, 10000000, false) * 100)
        : null;
    if (
      !Array.isArray(data.items) ||
      !data.items.length ||
      new Set(data.items.map((i) => i.product_id)).size !== data.items.length
    )
      throw new AppError('Revisa los medicamentos de la venta.');
    const hash = sha256(JSON.stringify({ ...data, branch_id: branch }));
    return this.db.transaction(async (q) => {
      const prior = (await q('SELECT * FROM counter_sales WHERE request_id=$1', [data.request_id]))
        .rows[0];
      if (prior) {
        if (prior.payload_hash !== hash)
          throw new AppError('Esta referencia ya se utilizÃ³ con otros datos.', 409);
        const sale = (
          await q('SELECT id,total_cents FROM orders WHERE id=$1', [prior.order_id])
        ).rows[0];
        return {
          ...sale,
          amount_received_cents: prior.amount_received_cents,
          change_cents: prior.change_cents,
        };
      }
      let parent = null,
        total = 0;
      for (const item of data.items) {
        const line = await this.order(
          { ...item, branch_id: branch, payment: data.payment, nit: data.nit || 'CF' },
          user,
          true,
          q,
          parent,
          true,
        );
        parent = { id: line.id };
        total += line.total_cents;
      }
      const change = amountReceived === null ? null : amountReceived - total;
      if (change !== null && change < 0)
        throw new AppError('El efectivo recibido no cubre el total de la venta.');
      await q('UPDATE orders SET customer=$1 WHERE id=$2', [
        String(data.customer || 'Venta en mostrador').slice(0, 100),
        parent.id,
      ]);
      await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
        id(),
        branch,
        'Ingreso',
        'Venta en mostrador',
        total,
        data.payment,
        'Venta ' + parent.id,
        now(),
        user.id,
      ]);
      await q(
        'INSERT INTO counter_sales (request_id,payload_hash,order_id,amount_received_cents,change_cents) VALUES ($1,$2,$3,$4,$5)',
        [data.request_id, hash, parent.id, amountReceived, change],
      );
      await audit(q, user, 'COBRAR', 'venta_mostrador', parent.id, {
        branch_id: branch,
        total_cents: total,
        amount_received_cents: amountReceived,
        change_cents: change,
        payment: data.payment,
      });
      return {
        id: parent.id,
        total_cents: total,
        amount_received_cents: amountReceived,
        change_cents: change,
      };
    });
  }
  async orderStatus(key, data, user, transaction = null) {
    const status = choice(
      data.status,
      ['Preparando', 'En ruta', 'Listo para recoger', 'Entregado', 'Cancelado'],
      'Estado',
    );
    const run = transaction ? (fn) => fn(transaction) : this.db.transaction.bind(this.db);
    return run(async (q) => {
      const o = (
        await q('SELECT * FROM orders WHERE id=$1' + (this.db.cloud ? ' FOR UPDATE' : ''), [key])
      ).rows[0];
      if (!o) throw new AppError('Pedido no encontrado.', 404);
      if (user.scope === 'branch' && o.branch_id !== user.branch_id)
        throw new AppError('Pedido de otra sucursal.', 403);
      if (
        user.permissions?.includes('entrega.propia') &&
        !user.permissions.includes('pedido.gestionar')
      ) {
        const assigned = (
          await q(
            'SELECT courier_id,status FROM delivery_assignments WHERE order_id=$1' +
              (this.db.cloud ? ' FOR UPDATE' : ''),
            [key],
          )
        ).rows[0];
        const courierTransition =
          assigned?.courier_id === user.id &&
          ((status === 'En ruta' && assigned.status === 'Recogido') ||
            (status === 'Entregado' && assigned.status === 'En ruta'));
        if (!courierTransition)
          throw new AppError('Esta entrega no te estÃ¡ asignada.', 403);
      }
      const allowed = {
        Pendiente: ['Preparando', 'Cancelado'],
        Preparando: [o.fulfillment === 'pickup' ? 'Listo para recoger' : 'En ruta', 'Cancelado'],
        'En ruta': ['Entregado', 'Cancelado'],
        'Listo para recoger': ['Entregado', 'Cancelado'],
      };
      if (!allowed[o.status]?.includes(status))
        throw new AppError('Cambio de estado no permitido.', 409);
      if (o.channel === 'portal') {
        const portal = (await q('SELECT * FROM portal_orders WHERE order_id=$1', [key])).rows[0];
        if (status === 'Listo para recoger' && portal?.ticket.length === 9 && data.packed !== true)
          throw new AppError(
            'Confirma que todos los medicamentos estÃ¡n en la bolsa y listos para entregar.',
          );
        if (status !== 'Cancelado' && portal?.expires_at && portal.expires_at <= now())
          throw new AppError('La reserva venciÃ³. Actualiza los pedidos.', 409);
        if (status === 'Preparando') {
          const uploaded = (
            await q('SELECT review_status FROM portal_prescriptions WHERE order_id=$1', [key])
          ).rows[0];
          if (uploaded && uploaded.review_status !== 'Revisada')
            throw new AppError('La receta debe estar revisada y aprobada antes de preparar.');
          const rx = (
            await q(
              'SELECT p.prescription FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=$1',
              [key],
            )
          ).rows.some((p) => p.prescription);
          if (rx && !o.prescription_confirmed && data.prescription_confirmed !== true)
            throw new AppError(
              'Revisa la receta y confirma su validez antes de preparar el pedido.',
            );
          if (rx && data.prescription_confirmed)
            await q('UPDATE orders SET prescription_confirmed=1 WHERE id=$1', [key]);
        }
        if (status === 'Entregado') {
          let code = String(data.pickup_code || '')
            .replace(/\s/g, '')
            .toUpperCase();
          if (data.qr_payload) {
            let qr;
            try {
              qr = parseOrderTicket(data.qr_payload);
            } catch (error) {
              throw new AppError(error.message);
            }
            if (qr.ticket !== portal?.ticket)
              throw new AppError(
                'Este QR pertenece a otro pedido. No se realizÃ³ la entrega.',
                403,
              );
            code = qr.code;
          }
          if (portal && code === String(portal.ticket || '').toUpperCase()) {
            const credential = (
              await q('SELECT code_cipher FROM portal_credentials WHERE order_id=$1', [key])
            ).rows[0];
            if (credential?.code_cipher) code = decrypt(credential.code_cipher);
          }
          if (!portal || sha256(code) !== portal.access_hash)
            throw new AppError('El cÃ³digo privado del ticket no es vÃ¡lido.', 403);
        }
      }
      if (status === 'Cancelado' && !data.reason?.trim())
        throw new AppError('La cancelaciÃ³n requiere un motivo.');
      const changed = await q(
        'UPDATE orders SET status=$1,delivered_at=$2 WHERE id=$3 AND status=$4',
        [status, status === 'Entregado' ? now() : null, key, o.status],
      );
      if (!changed.rowCount) throw new AppError('El estado cambiÃ³. Actualiza la pÃ¡gina.', 409);
      if (['En ruta', 'Entregado', 'Cancelado'].includes(status))
        await q('UPDATE delivery_assignments SET status=$1 WHERE order_id=$2', [status, key]);
      if (status === 'Cancelado')
        for (const item of (await q('SELECT * FROM order_items WHERE order_id=$1', [key])).rows) {
          await q('UPDATE inventory SET quantity=quantity+$1 WHERE id=$2', [
            item.quantity,
            item.inventory_id,
          ]);
          const stock = (await q('SELECT * FROM inventory WHERE id=$1', [item.inventory_id]))
            .rows[0];
          await ledgerEntry(
            q,
            user,
            stock,
            item.quantity,
            'LIBERAR_RESERVA',
            key,
            'Pedido cancelado',
          );
        }
      if (status === 'Entregado')
        await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
          id(),
          o.branch_id,
          'Ingreso',
          o.fulfillment === 'pickup' ? 'Retiro en sucursal' : 'Entrega a domicilio',
          o.total_cents,
          o.payment,
          `Cobro pedido ${key.slice(0, 8)}`,
          now(),
          user.id,
        ]);
      await audit(q, user, 'CAMBIAR_ESTADO', 'pedido', key, {
        branch_id: o.branch_id,
        previous: o.status,
        status,
        reason: data.reason || null,
        ...(status === 'Entregado' && o.channel === 'portal'
          ? { authorization_method: data.qr_payload ? 'QR' : 'CÃ³digo' }
          : {}),
      });
      if (
        o.channel === 'portal' &&
        ['Listo para recoger', 'En ruta', 'Entregado', 'Cancelado'].includes(status)
      ) {
        const ticket = (await q('SELECT ticket FROM portal_orders WHERE order_id=$1', [key]))
          .rows[0]?.ticket;
        await simulatedMessage(
          q,
          o.phone,
          key,
          status,
          `FarmaCali: pedido ${ticket} â€” ${status}. Consulta el portal para ver su avance.`,
        );
      }
      return { id: key };
    });
  }
}
