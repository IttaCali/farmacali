import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { demoMode } from '../config.js';
export const expansionSchema = [
  `CREATE TABLE IF NOT EXISTS portal_credentials (order_id TEXT PRIMARY KEY REFERENCES orders(id),code_cipher TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS procurement_actions (request_id TEXT PRIMARY KEY,entity_id TEXT NOT NULL,payload_hash TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY,name TEXT NOT NULL,nit TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS purchase_orders (id TEXT PRIMARY KEY,supplier_id TEXT NOT NULL REFERENCES suppliers(id),branch_id TEXT NOT NULL REFERENCES branches(id),status TEXT NOT NULL DEFAULT 'Borrador',payment TEXT NOT NULL DEFAULT 'Transferencia',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS purchase_lines (id TEXT PRIMARY KEY,purchase_id TEXT NOT NULL REFERENCES purchase_orders(id),product_id TEXT NOT NULL REFERENCES products(id),quantity INTEGER NOT NULL CHECK(quantity>0),unit_cost_cents INTEGER NOT NULL CHECK(unit_cost_cents>0),received INTEGER NOT NULL DEFAULT 0,UNIQUE(purchase_id,product_id))`,
  `CREATE TABLE IF NOT EXISTS purchase_receipts (id TEXT PRIMARY KEY,purchase_id TEXT NOT NULL REFERENCES purchase_orders(id),line_id TEXT NOT NULL REFERENCES purchase_lines(id),inventory_id TEXT NOT NULL REFERENCES inventory(id),quantity INTEGER NOT NULL CHECK(quantity>0),unit_cost_cents INTEGER NOT NULL,returned INTEGER NOT NULL DEFAULT 0,document TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS supplier_returns (id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL REFERENCES purchase_receipts(id),quantity INTEGER NOT NULL CHECK(quantity>0),amount_cents INTEGER NOT NULL,reason TEXT NOT NULL,credit_note TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Pendiente de reembolso',created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS inventory_costs (inventory_id TEXT PRIMARY KEY REFERENCES inventory(id),unit_cost_cents INTEGER NOT NULL DEFAULT 0,known INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS order_item_costs (item_id TEXT PRIMARY KEY REFERENCES order_items(id) ON DELETE CASCADE,unit_cost_cents INTEGER NOT NULL,known INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS transfer_costs (transfer_id TEXT PRIMARY KEY REFERENCES transfers(id),unit_cost_cents INTEGER NOT NULL,known INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS payroll_rules (id TEXT PRIMARY KEY,settings TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS payroll_inputs (employee_id TEXT NOT NULL REFERENCES employees(id),period TEXT NOT NULL,days INTEGER NOT NULL DEFAULT 30,bonus_cents INTEGER NOT NULL DEFAULT 0,overtime_cents INTEGER NOT NULL DEFAULT 0,isr_cents INTEGER NOT NULL DEFAULT 0,other_cents INTEGER NOT NULL DEFAULT 0,other_reason TEXT NOT NULL DEFAULT '',social_security INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(employee_id,period))`,
  `CREATE TABLE IF NOT EXISTS payroll_details (payroll_id TEXT PRIMARY KEY REFERENCES payroll(id),breakdown_cipher TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS payroll_benefits (id TEXT PRIMARY KEY,employee_id TEXT NOT NULL REFERENCES employees(id),kind TEXT NOT NULL,period TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),reason TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),UNIQUE(employee_id,kind,period))`,
  `CREATE TABLE IF NOT EXISTS delivery_assignments (order_id TEXT PRIMARY KEY REFERENCES orders(id),courier_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL DEFAULT 'Asignado',lat DOUBLE PRECISION,lng DOUBLE PRECISION,accuracy DOUBLE PRECISION,location_at TEXT,location_source TEXT,assigned_at TEXT NOT NULL,assigned_by TEXT NOT NULL REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS delivery_points (id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),lat DOUBLE PRECISION NOT NULL,lng DOUBLE PRECISION NOT NULL,accuracy DOUBLE PRECISION,source TEXT NOT NULL,created_at TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS simulated_messages (id TEXT PRIMARY KEY,phone_hash TEXT NOT NULL,phone_cipher TEXT NOT NULL,order_id TEXT REFERENCES orders(id),kind TEXT NOT NULL,text_cipher TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS prescription_versions (id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),image_cipher TEXT NOT NULL,mime TEXT NOT NULL,review_status TEXT NOT NULL,reviewed_by TEXT,reviewed_at TEXT,notes TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_phone ON simulated_messages(phone_hash,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_courier ON delivery_assignments(courier_id,status)`,
  `CREATE INDEX IF NOT EXISTS idx_purchase_branch ON purchase_orders(branch_id,created_at)`,
];
export async function upgradeExpansion(database) {
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=6')).rows.length)
    return;
  await database.transaction(async (q) => {
    for (const sql of expansionSchema) await q(sql);
    const permissions = {
      'abastecimiento.ver': 'Consultar abastecimiento y costos',
      'abastecimiento.gestionar': 'Gestionar compras y proveedores',
      'entrega.ver': 'Consultar coordinación de entregas',
      'entrega.gestionar': 'Asignar repartidores',
      'entrega.propia': 'Gestionar entregas asignadas',
      'mensajes.ver': 'Consultar avisos de pedidos',
    };
    for (const [code, label] of Object.entries(permissions))
      await q(
        'INSERT INTO permissions (code,description) VALUES ($1,$2) ON CONFLICT(code) DO NOTHING',
        [code, label],
      );
    for (const role of ['admin', 'branch', 'callcenter', 'auditor'])
      for (const permission of Object.keys(permissions)) {
        const grant =
          (role === 'admin' && permission !== 'entrega.propia') ||
          (role === 'branch' &&
            ['abastecimiento.ver', 'entrega.ver', 'entrega.gestionar'].includes(permission)) ||
          (role === 'callcenter' &&
            ['entrega.ver', 'entrega.gestionar', 'mensajes.ver'].includes(permission)) ||
          (role === 'auditor' && ['abastecimiento.ver', 'entrega.ver'].includes(permission));
        if (grant)
          await q(
            'INSERT INTO role_permissions (role_id,permission_code) SELECT id,$1 FROM roles WHERE code=$2 ON CONFLICT(role_id,permission_code) DO NOTHING',
            [permission, role],
          );
      }
    await q(
      "INSERT INTO roles (id,code,name,description,scope,require_totp) VALUES ('r-courier','courier','Repartidor','Solo entregas asignadas','all',0) ON CONFLICT(id) DO NOTHING",
    );
    for (const permission of ['resumen.ver', 'entrega.propia'])
      await q(
        "INSERT INTO role_permissions VALUES ('r-courier',$1) ON CONFLICT(role_id,permission_code) DO NOTHING",
        [permission],
      );
    if (demoMode)
      await q(
        "INSERT INTO users (id,name,email,password_hash,role,role_id,must_change_password) VALUES ($1,$2,$3,$4,'operator','r-courier',0) ON CONFLICT(email) DO NOTHING",
        [
          'u-courier',
          'Repartidor asignado',
          'repartidor@farmacia.gt',
          await bcrypt.hash('Repartidor2026!', 12),
        ],
      );
    const settings = {
      employee_igss_percent: 4.83,
      employer_igss_percent: 10.67,
      irtra_percent: 0,
      intecap_percent: 0,
      aguinaldo_months: 12,
      bono14_months: 12,
      vacation_days_year: 15,
      enabled: false,
    };
    await q('INSERT INTO payroll_rules VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING', [
      'main',
      JSON.stringify(settings),
      new Date().toISOString(),
      null,
    ]);
    await q('INSERT INTO schema_migrations VALUES (6,$1)', [new Date().toISOString()]);
  });
}
