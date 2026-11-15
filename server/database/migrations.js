import { upgradeRolePolicy } from '../security/role-policy.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { roleSeeds, permissionLabels } from '../security/permissions.js';
import { encrypt, decrypt, privateHash, reencryptLegacyDemoValue } from '../security/crypto.js';
import { auditDigest } from '../models/audit.js';
import { demoMode } from '../config.js';
import { schema } from './schema.js';
import { upgradeExpansion } from './expansion.js';
export const extraSchema = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',scope TEXT NOT NULL DEFAULT 'all',require_totp INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS permissions (code TEXT PRIMARY KEY,description TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS role_permissions (role_id TEXT NOT NULL REFERENCES roles(id),permission_code TEXT NOT NULL REFERENCES permissions(code),PRIMARY KEY(role_id,permission_code))`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),refresh_hash TEXT NOT NULL UNIQUE,csrf_hash TEXT NOT NULL,ip TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,last_seen TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS used_refresh_tokens (token_hash TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id))`,
  `CREATE TABLE IF NOT EXISTS auth_challenges (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),token_hash TEXT NOT NULL UNIQUE,purpose TEXT NOT NULL,secret_cipher TEXT,expires_at TEXT NOT NULL,consumed INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS recovery_codes (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),code_hash TEXT NOT NULL UNIQUE,used_at TEXT,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id,used_at)`,
  `CREATE TABLE IF NOT EXISTS audit_head (id TEXT PRIMARY KEY,sequence INTEGER NOT NULL,last_hash TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY,name TEXT NOT NULL,nit TEXT NOT NULL DEFAULT 'CF',cui_cipher TEXT,phone TEXT NOT NULL,address TEXT NOT NULL,lat DOUBLE PRECISION NOT NULL,lng DOUBLE PRECISION NOT NULL,state TEXT NOT NULL DEFAULT 'Activo',deactivated_at TEXT,deactivated_by TEXT REFERENCES users(id),deactivation_reason TEXT)`,
  `CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY,type TEXT NOT NULL,entity_id TEXT NOT NULL,payload TEXT NOT NULL,requester_id TEXT NOT NULL REFERENCES users(id),approver_id TEXT REFERENCES users(id),status TEXT NOT NULL DEFAULT 'Pendiente',reason TEXT NOT NULL,decision_reason TEXT,created_at TEXT NOT NULL,resolved_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS cash_shifts (id TEXT PRIMARY KEY,branch_id TEXT NOT NULL REFERENCES branches(id),user_id TEXT NOT NULL REFERENCES users(id),opening_cents INTEGER NOT NULL,opened_at TEXT NOT NULL,closed_at TEXT,expected_cents INTEGER,counted_cents INTEGER,difference_cents INTEGER,state TEXT NOT NULL DEFAULT 'Abierto',notes TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS stock_ledger (id TEXT PRIMARY KEY,branch_id TEXT NOT NULL REFERENCES branches(id),product_id TEXT NOT NULL REFERENCES products(id),inventory_id TEXT REFERENCES inventory(id),quantity INTEGER NOT NULL,type TEXT NOT NULL,reference_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS prescriptions (id TEXT PRIMARY KEY,customer_name TEXT NOT NULL,doctor TEXT NOT NULL,license TEXT NOT NULL,issued_on TEXT NOT NULL,product_id TEXT NOT NULL REFERENCES products(id),notes TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS salary_history (id TEXT PRIMARY KEY,employee_id TEXT NOT NULL REFERENCES employees(id),salary_cipher TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS entity_history (id TEXT PRIMARY KEY,entity TEXT NOT NULL,entity_id TEXT NOT NULL,event TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS voided_records (id TEXT PRIMARY KEY,entity TEXT NOT NULL,entity_id TEXT NOT NULL UNIQUE,reason TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS client_addresses (id TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES clients(id),label TEXT NOT NULL,address TEXT NOT NULL,lat DOUBLE PRECISION NOT NULL,lng DOUBLE PRECISION NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS transfer_drafts (id TEXT PRIMARY KEY,inventory_id TEXT NOT NULL REFERENCES inventory(id),destination_id TEXT NOT NULL REFERENCES branches(id),quantity INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'Borrador',created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,reason TEXT)`,
  `CREATE TABLE IF NOT EXISTS asset_depreciation (id TEXT PRIMARY KEY,asset_id TEXT NOT NULL REFERENCES assets(id),period TEXT NOT NULL,original_cents INTEGER NOT NULL,depreciation_cents INTEGER NOT NULL,net_cents INTEGER NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),UNIQUE(asset_id,period))`,
  `CREATE INDEX IF NOT EXISTS idx_ledger_branch_product ON stock_ledger(branch_id,product_id,created_at)`,
  `CREATE TABLE IF NOT EXISTS portal_clients (dpi_hash TEXT PRIMARY KEY,client_id TEXT NOT NULL UNIQUE REFERENCES clients(id))`,
  `CREATE TABLE IF NOT EXISTS portal_orders (order_id TEXT PRIMARY KEY REFERENCES orders(id),ticket TEXT NOT NULL UNIQUE,access_hash TEXT NOT NULL,request_hash TEXT NOT NULL UNIQUE,payload_hash TEXT NOT NULL,ready_estimate TEXT NOT NULL,expires_at TEXT,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_portal_expiry ON portal_orders(expires_at)`,
  `CREATE TABLE IF NOT EXISTS portal_prescriptions (order_id TEXT PRIMARY KEY REFERENCES orders(id),image_cipher TEXT NOT NULL,mime TEXT NOT NULL,review_status TEXT NOT NULL DEFAULT 'Pendiente',reviewed_by TEXT REFERENCES users(id),reviewed_at TEXT,notes TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS portal_access_guards (ticket TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,locked_until TEXT)`,
];
const additions = {
  employees: { user_id: 'TEXT REFERENCES users(id)' },
  users: {
    surname: "TEXT NOT NULL DEFAULT ''",
    dpi: "TEXT NOT NULL DEFAULT ''",
    phone: "TEXT NOT NULL DEFAULT ''",
    birth_date: "TEXT NOT NULL DEFAULT ''",
    address: "TEXT NOT NULL DEFAULT ''",
    position: "TEXT NOT NULL DEFAULT ''",
    role_id: 'TEXT REFERENCES roles(id)',
    branch_id: 'TEXT REFERENCES branches(id)',
    state: "TEXT NOT NULL DEFAULT 'Activo'",
    failed_attempts: 'INTEGER NOT NULL DEFAULT 0',
    locked_until: 'TEXT',
    must_change_password: 'INTEGER NOT NULL DEFAULT 0',
    totp_cipher: 'TEXT',
    totp_enabled: 'INTEGER NOT NULL DEFAULT 0',
    last_totp_step: 'INTEGER NOT NULL DEFAULT -1',
    deactivated_at: 'TEXT',
    deactivated_by: 'TEXT',
    deactivation_reason: 'TEXT',
  },
  branches: {
    municipality: "TEXT NOT NULL DEFAULT ''",
    opens_at: "TEXT NOT NULL DEFAULT '07:00'",
    closes_at: "TEXT NOT NULL DEFAULT '22:00'",
    state: "TEXT NOT NULL DEFAULT 'Activo'",
    deactivated_at: 'TEXT',
    deactivated_by: 'TEXT',
    deactivation_reason: 'TEXT',
  },
  products: {
    controlled: 'INTEGER NOT NULL DEFAULT 0',
    state: "TEXT NOT NULL DEFAULT 'Activo'",
    deactivated_at: 'TEXT',
    deactivated_by: 'TEXT',
    deactivation_reason: 'TEXT',
  },
  employees: {
    salary_cipher: 'TEXT',
    state: "TEXT NOT NULL DEFAULT 'Activo'",
    user_id: 'TEXT REFERENCES users(id)',
    deactivated_at: 'TEXT',
    deactivated_by: 'TEXT',
    deactivation_reason: 'TEXT',
  },
  assets: { deactivated_at: 'TEXT', deactivated_by: 'TEXT', deactivation_reason: 'TEXT' },
  orders: {
    client_id: 'TEXT REFERENCES clients(id)',
    channel: "TEXT NOT NULL DEFAULT 'telefono'",
    nit: "TEXT NOT NULL DEFAULT 'CF'",
    prescription_id: 'TEXT REFERENCES prescriptions(id)',
  },
  transfers: { received_quantity: 'INTEGER', difference_reason: 'TEXT' },
  audit_log: {
    sequence: 'INTEGER',
    previous_hash: 'TEXT',
    current_hash: 'TEXT',
    role_code: "TEXT NOT NULL DEFAULT 'legacy'",
    branch_id: 'TEXT',
    before_value: 'TEXT',
    after_value: 'TEXT',
    ip: "TEXT NOT NULL DEFAULT 'local'",
  },
};
export async function migrate(database) {
  for (const sql of extraSchema) await database.query(sql);
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=1')).rows.length) {
    await upgradePayroll(database);
    await upgradeOperations(database);
    await upgradeRecipeRead(database);
    await upgradePortal(database);
    await upgradeExpansion(database);
    await upgradeRetail(database);
    await upgradeRolePolicy(database);
    await upgradeCashRegister(database);
    await removePhoneVerificationTables(database);
    await upgradeCourierBranches(database);
    await upgradeEncryptionKey(database);
    return;
  }
  await database.transaction(async (q) => {
    const employeeColumns = database.cloud
      ? await q(
          "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='employees'",
        )
      : await q('PRAGMA table_info(employees)');
    const employeeHasUserId = employeeColumns.rows.some(
      (column) => (column.column_name || column.name) === 'user_id',
    );
    for (const [table, columns] of Object.entries(additions)) {
      for (const [column, type] of Object.entries(columns)) {
        if (table === 'employees' && column === 'user_id' && employeeHasUserId) continue;
        await q(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    }
    for (const [code, label] of Object.entries(permissionLabels))
      await q('INSERT INTO permissions VALUES ($1,$2)', [code, label]);
    for (const role of roleSeeds) {
      await q(
        'INSERT INTO roles (id,code,name,description,scope,require_totp) VALUES ($1,$2,$3,$4,$5,$6)',
        [role.id, role.code, role.name, role.name, role.scope, role.totp],
      );
      for (const permission of role.permissions)
        await q('INSERT INTO role_permissions VALUES ($1,$2)', [role.id, permission]);
    }
    await q(
      "UPDATE users SET role_id=CASE WHEN role='admin' THEN 'r-admin' WHEN role='auditor' THEN 'r-auditor' ELSE 'r-callcenter' END",
    );
    await q(
      'INSERT INTO users (id,name,email,password_hash,role,role_id,state) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        'u-system',
        'Sistema',
        'system@internal.invalid',
        await bcrypt.hash(randomUUID(), 12),
        'auditor',
        'r-auditor',
        'Inactivo',
      ],
    );
    if (demoMode) {
      const branch = (await q('SELECT id FROM branches ORDER BY id LIMIT 1')).rows[0];
      if (branch)
        await q(
          'INSERT INTO users (id,name,email,password_hash,role,role_id,branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [
            'u-branch',
            'Operador de Miraflores',
            'sucursal@farmacia.gt',
            await bcrypt.hash('Sucursal2026!', 12),
            'operator',
            'r-branch',
            branch.id,
          ],
        );
      if (branch)
        await q(
          "UPDATE users SET email='callcenter@farmacia.gt',branch_id=COALESCE(branch_id,$1) WHERE id='u-operator'",
          [branch.id],
        );
      else await q("UPDATE users SET email='callcenter@farmacia.gt' WHERE id='u-operator'");
    }
    for (const e of (await q('SELECT * FROM employees')).rows) {
      await q('UPDATE employees SET salary_cipher=$1,salary_cents=1 WHERE id=$2', [
        encrypt(e.salary_cents),
        e.id,
      ]);
      await q('INSERT INTO salary_history VALUES ($1,$2,$3,$4,$5,$6)', [
        randomUUID(),
        e.id,
        encrypt(e.salary_cents),
        'MigraciÃ³n inicial',
        new Date().toISOString(),
        'u-system',
      ]);
    }
    for (const stock of (await q('SELECT * FROM inventory')).rows)
      await q('INSERT INTO stock_ledger VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
        randomUUID(),
        stock.branch_id,
        stock.product_id,
        stock.id,
        stock.quantity,
        'SALDO_INICIAL',
        stock.id,
        'Saldo en la fecha de migraciÃ³n; no reconstruye movimientos histÃ³ricos',
        new Date().toISOString(),
        'u-system',
      ]);
    let previous = '0'.repeat(64),
      sequence = 0;
    for (const row of (await q('SELECT * FROM audit_log ORDER BY created_at,id')).rows) {
      row.sequence = ++sequence;
      row.previous_hash = previous;
      row.before_value = 'null';
      row.after_value = row.details;
      row.current_hash = auditDigest(row);
      await q(
        'UPDATE audit_log SET sequence=$1,previous_hash=$2,current_hash=$3,before_value=$4,after_value=$5 WHERE id=$6',
        [row.sequence, previous, row.current_hash, row.before_value, row.after_value, row.id],
      );
      previous = row.current_hash;
    }
    await q('INSERT INTO audit_head VALUES ($1,$2,$3)', ['main', sequence, previous]);
    await q('CREATE UNIQUE INDEX idx_audit_sequence ON audit_log(sequence)');
    // Triggers protect ordinary application writes; a database owner can still alter DDL.
    if (database.cloud) {
      await q(
        `CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'La auditorÃ­a es solo de inserciÃ³n'; END; $$ LANGUAGE plpgsql`,
      );
      await q(
        'CREATE TRIGGER audit_no_mutation BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation()',
      );
    } else {
      await q(
        "CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'La auditorÃ­a es solo de inserciÃ³n'); END",
      );
      await q(
        "CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'La auditorÃ­a es solo de inserciÃ³n'); END",
      );
    }
    await q('INSERT INTO schema_migrations VALUES ($1,$2)', [1, new Date().toISOString()]);
  });
  await upgradePayroll(database);
  await upgradeOperations(database);
  await upgradeRecipeRead(database);
  await upgradePortal(database);
  await upgradeExpansion(database);
  await upgradeRetail(database);
  await upgradeRolePolicy(database);
  await upgradeCashRegister(database);
  await removePhoneVerificationTables(database);
  await upgradeCourierBranches(database);
  await upgradeEncryptionKey(database);
}

const encryptedColumns = [
  ['users', 'id', 'totp_cipher'],
  ['auth_challenges', 'id', 'secret_cipher'],
  ['employees', 'id', 'salary_cipher'],
  ['salary_history', 'id', 'salary_cipher'],
  ['clients', 'id', 'cui_cipher'],
  ['portal_credentials', 'order_id', 'code_cipher'],
  ['payroll_details', 'payroll_id', 'breakdown_cipher'],
  ['simulated_messages', 'id', 'phone_cipher'],
  ['simulated_messages', 'id', 'text_cipher'],
  ['prescription_versions', 'id', 'image_cipher'],
  ['portal_prescriptions', 'order_id', 'image_cipher'],
];

function normalizedPhone(value) {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .replace(/^502(?=\d{8}$)/, '');
  if (!/^\d{8}$/.test(digits))
    throw new Error('Teléfono inválido durante la migración de cifrado.');
  return '+502' + digits;
}

function clientPortalHash(client) {
  if (client.cui_cipher) {
    const cui = decrypt(client.cui_cipher).replace(/[\s-]/g, '');
    if (!/^\d{13}$/.test(cui)) throw new Error('CUI inválido durante la migración de cifrado.');
    return privateHash('dpi:' + cui);
  }
  const name = String(client.name || '')
    .trim()
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ');
  return privateHash('contact:' + normalizedPhone(client.phone) + ':' + name);
}

async function upgradeEncryptionKey(database) {
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=13')).rows.length)
    return;
  await database.transaction(async (q) => {
    for (const [table, idColumn, cipherColumn] of encryptedColumns) {
      const rows = (
        await q(
          `SELECT ${idColumn},${cipherColumn} FROM ${table} WHERE ${cipherColumn} IS NOT NULL`,
        )
      ).rows;
      for (const row of rows) {
        const ciphertext = reencryptLegacyDemoValue(row[cipherColumn]);
        if (ciphertext !== row[cipherColumn])
          await q(`UPDATE ${table} SET ${cipherColumn}=$1 WHERE ${idColumn}=$2`, [
            ciphertext,
            row[idColumn],
          ]);
      }
    }

    const portalClients = (
      await q(
        'SELECT c.id,c.name,c.phone,c.cui_cipher FROM portal_clients p JOIN clients c ON c.id=p.client_id',
      )
    ).rows.map((client) => ({ client_id: client.id, dpi_hash: clientPortalHash(client) }));
    if (new Set(portalClients.map((client) => client.dpi_hash)).size !== portalClients.length)
      throw new Error('Hay contactos duplicados durante la migración de cifrado.');
    await q('DELETE FROM portal_clients');
    for (const client of portalClients)
      await q('INSERT INTO portal_clients (dpi_hash,client_id) VALUES ($1,$2)', [
        client.dpi_hash,
        client.client_id,
      ]);

    const messages = (await q('SELECT id,phone_cipher FROM simulated_messages')).rows;
    for (const message of messages)
      await q('UPDATE simulated_messages SET phone_hash=$1 WHERE id=$2', [
        privateHash('phone:' + normalizedPhone(decrypt(message.phone_cipher))),
        message.id,
      ]);

    const cancellations = (
      await q(
        'SELECT pc.order_id,pc.dpi_hash,o.phone,c.cui_cipher FROM portal_cancellations pc JOIN orders o ON o.id=pc.order_id LEFT JOIN clients c ON c.id=o.client_id',
      )
    ).rows;
    for (const cancellation of cancellations) {
      const dpiHash =
        cancellation.dpi_hash && cancellation.cui_cipher
          ? privateHash('dpi:' + decrypt(cancellation.cui_cipher).replace(/[\s-]/g, ''))
          : null;
      if (cancellation.dpi_hash && !dpiHash)
        throw new Error('No se pudo reconstruir el índice CUI de una cancelación.');
      await q('UPDATE portal_cancellations SET phone_hash=$1,dpi_hash=$2 WHERE order_id=$3', [
        privateHash('phone:' + normalizedPhone(cancellation.phone)),
        dpiHash,
        cancellation.order_id,
      ]);
    }

    await q('INSERT INTO schema_migrations VALUES ($1,$2)', [13, new Date().toISOString()]);
  });
}
async function upgradePortal(database) {
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=5')).rows.length)
    return;
  if (!database.cloud) await database.query('PRAGMA foreign_keys=OFF');
  try {
    await database.transaction(async (q) => {
      if (database.cloud) {
        await q('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check');
        await q(
          "ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN ('Pendiente','Preparando','En ruta','Listo para recoger','Entregado','Cancelado'))",
        );
        await q(
          "ALTER TABLE orders ADD COLUMN fulfillment TEXT NOT NULL DEFAULT 'delivery' CHECK(fulfillment IN ('delivery','pickup'))",
        );
      } else {
        const old = (await q("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'"))
          .rows[0].sql;
        const ddl = old
          .replace(/CREATE TABLE\s+[\"`\[]?orders[\"`\]]?/i, 'CREATE TABLE orders_portal')
          .replace("'En ruta','Entregado'", "'En ruta','Listo para recoger','Entregado'");
        const columns = (await q('PRAGMA table_info(orders)')).rows.map((c) => c.name).join(',');
        await q(ddl);
        await q(`INSERT INTO orders_portal (${columns}) SELECT ${columns} FROM orders`);
        await q('DROP TABLE orders');
        await q('ALTER TABLE orders_portal RENAME TO orders');
        await q(
          "ALTER TABLE orders ADD COLUMN fulfillment TEXT NOT NULL DEFAULT 'delivery' CHECK(fulfillment IN ('delivery','pickup'))",
        );
        await q('CREATE INDEX idx_orders_branch ON orders(branch_id,status)');
      }
      for (const c of (await q('SELECT id,cui_cipher FROM clients WHERE cui_cipher IS NOT NULL'))
        .rows) {
        const dpi = decrypt(c.cui_cipher);
        if (/^\d{13}$/.test(dpi || ''))
          await q('INSERT INTO portal_clients VALUES ($1,$2) ON CONFLICT(dpi_hash) DO NOTHING', [
            privateHash(`dpi:${dpi}`),
            c.id,
          ]);
      }
      for (const role of (await q("SELECT id FROM roles WHERE code='branch'")).rows)
        await q(
          'INSERT INTO role_permissions VALUES ($1,$2) ON CONFLICT(role_id,permission_code) DO NOTHING',
          [role.id, 'pedido.gestionar'],
        );
      await q('INSERT INTO schema_migrations VALUES ($1,$2)', [5, new Date().toISOString()]);
    });
  } finally {
    if (!database.cloud) await database.query('PRAGMA foreign_keys=ON');
  }
  if (!database.cloud && (await database.query('PRAGMA foreign_key_check')).rows.length)
    throw new Error('Referencias invÃ¡lidas en la migraciÃ³n del portal.');
}
async function upgradeRecipeRead(database) {
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=4')).rows.length)
    return;
  await database.transaction(async (q) => {
    await q(
      'INSERT INTO permissions (code,description) VALUES ($1,$2) ON CONFLICT(code) DO NOTHING',
      ['receta.ver', 'Consultar recetas'],
    );
    for (const role of (
      await q("SELECT id FROM roles WHERE code IN ('admin','branch','callcenter','auditor')")
    ).rows)
      await q(
        'INSERT INTO role_permissions VALUES ($1,$2) ON CONFLICT(role_id,permission_code) DO NOTHING',
        [role.id, 'receta.ver'],
      );
    await q('INSERT INTO schema_migrations VALUES ($1,$2)', [4, new Date().toISOString()]);
  });
}
async function upgradeOperations(database) {
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=3')).rows.length)
    return;
  // Initialization runs before serving requests. Foreign keys are disabled only during the
  // SQLite table rebuild, then checked again before initialization succeeds.
  if (!database.cloud) await database.query('PRAGMA foreign_keys=OFF');
  try {
    await database.transaction(async (q) => {
      if (database.cloud) {
        await q('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check');
        await q(
          "ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN ('Pendiente','Preparando','En ruta','Entregado','Cancelado'))",
        );
        await q(
          'ALTER TABLE orders ADD COLUMN discount_percent DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK(discount_percent>=0 AND discount_percent<=50)',
        );
      } else {
        const ddl = schema
          .find((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS orders '))
          .replace('IF NOT EXISTS orders', 'orders_v3')
          .replace("'Preparando','En ruta'", "'Pendiente','Preparando','En ruta'");
        await q(ddl);
        for (const [column, type] of Object.entries(additions.orders))
          await q(`ALTER TABLE orders_v3 ADD COLUMN ${column} ${type}`);
        await q(
          'ALTER TABLE orders_v3 ADD COLUMN discount_percent DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK(discount_percent>=0 AND discount_percent<=50)',
        );
        const columns =
          'id,branch_id,customer,phone,address,lat,lng,payment,total_cents,eta_minutes,status,prescription_confirmed,created_at,delivered_at,created_by,client_id,channel,nit,prescription_id';
        await q(`INSERT INTO orders_v3 (${columns}) SELECT ${columns} FROM orders`);
        await q('DROP TABLE orders');
        await q('ALTER TABLE orders_v3 RENAME TO orders');
        await q('CREATE INDEX idx_orders_branch ON orders(branch_id,status)');
      }
      await q('ALTER TABLE payroll ADD COLUMN branch_id TEXT REFERENCES branches(id)');
      await q(
        'UPDATE payroll SET branch_id=(SELECT branch_id FROM employees WHERE employees.id=payroll.employee_id)',
      );
      await q(
        "CREATE UNIQUE INDEX idx_shift_open_branch ON cash_shifts(branch_id) WHERE state='Abierto'",
      );
      await q('CREATE INDEX idx_sessions_user ON sessions(user_id,revoked)');
      await q('CREATE INDEX idx_requests_state ON requests(status,created_at)');
      await q('INSERT INTO schema_migrations VALUES ($1,$2)', [3, new Date().toISOString()]);
    });
  } finally {
    if (!database.cloud) await database.query('PRAGMA foreign_keys=ON');
  }
  if (!database.cloud && (await database.query('PRAGMA foreign_key_check')).rows.length)
    throw new Error(
      'La migraciÃ³n detectÃ³ referencias invÃ¡lidas. Restaura el respaldo antes de continuar.',
    );
}
async function upgradePayroll(database) {
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=2')).rows.length)
    return;
  await database.transaction(async (q) => {
    if (database.cloud) {
      await q("ALTER TABLE payroll ADD COLUMN state TEXT NOT NULL DEFAULT 'Pagado'");
      await q('ALTER TABLE payroll DROP CONSTRAINT IF EXISTS payroll_employee_id_period_key');
    } else {
      await q(
        "CREATE TABLE payroll_v2 (id TEXT PRIMARY KEY,employee_id TEXT NOT NULL REFERENCES employees(id),period TEXT NOT NULL,gross_cents INTEGER NOT NULL,deductions_cents INTEGER NOT NULL,net_cents INTEGER NOT NULL CHECK(net_cents>0),created_at TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'Pagado')",
      );
      await q(
        'INSERT INTO payroll_v2 (id,employee_id,period,gross_cents,deductions_cents,net_cents,created_at) SELECT id,employee_id,period,gross_cents,deductions_cents,net_cents,created_at FROM payroll',
      );
      await q('DROP TABLE payroll');
      await q('ALTER TABLE payroll_v2 RENAME TO payroll');
    }
    await q(
      "CREATE UNIQUE INDEX idx_payroll_active_period ON payroll(employee_id,period) WHERE state='Pagado'",
    );
    await q('INSERT INTO schema_migrations VALUES ($1,$2)', [2, new Date().toISOString()]);
  });
}

async function upgradeRetail(database) {
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=7')).rows.length)
    return;
  await database.transaction(async (q) => {
    await q("ALTER TABLE products ADD COLUMN component TEXT NOT NULL DEFAULT ''");
    await q(
      'CREATE TABLE IF NOT EXISTS counter_sales (request_id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,order_id TEXT NOT NULL REFERENCES orders(id),amount_received_cents INTEGER,change_cents INTEGER)',
    );
    await q(
      'CREATE TABLE IF NOT EXISTS portal_cancellations (order_id TEXT PRIMARY KEY REFERENCES orders(id),phone_hash TEXT NOT NULL,dpi_hash TEXT,reason TEXT NOT NULL,created_at TEXT NOT NULL)',
    );
    await q('CREATE INDEX idx_cancel_phone ON portal_cancellations(phone_hash)');
    await q('CREATE INDEX idx_cancel_dpi ON portal_cancellations(dpi_hash)');
    const products = (await q('SELECT id,name FROM products')).rows;
    for (const p of products) {
      const names = [
        'AcetaminofÃ©n',
        'Ibuprofeno',
        'Amoxicilina',
        'Loratadina',
        'Omeprazol',
        'Vitamina C',
        'LosartÃ¡n',
      ];
      const match = names.find((n) => p.name.toLowerCase().startsWith(n.toLowerCase()));
      if (match) await q('UPDATE products SET component=$1 WHERE id=$2', [match, p.id]);
    }
    await q('INSERT INTO schema_migrations VALUES ($1,$2)', [7, new Date().toISOString()]);
  });
}

async function upgradeCashRegister(database) {
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=11')).rows.length)
    return;
  await database.transaction(async (q) => {
    if (database.cloud) {
      await q('ALTER TABLE counter_sales ADD COLUMN IF NOT EXISTS amount_received_cents INTEGER');
      await q('ALTER TABLE counter_sales ADD COLUMN IF NOT EXISTS change_cents INTEGER');
    } else {
      const columns = new Set(
        (await q('PRAGMA table_info(counter_sales)')).rows.map((column) => column.name),
      );
      if (!columns.has('amount_received_cents'))
        await q('ALTER TABLE counter_sales ADD COLUMN amount_received_cents INTEGER');
      if (!columns.has('change_cents'))
        await q('ALTER TABLE counter_sales ADD COLUMN change_cents INTEGER');
    }
    await q('INSERT INTO schema_migrations VALUES ($1,$2)', [11, new Date().toISOString()]);
  });
}

async function removePhoneVerificationTables(database) {
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=12')).rows.length)
    return;
  await database.transaction(async (q) => {
    await q('DROP TABLE IF EXISTS portal_phone_records');
    await q('DROP TABLE IF EXISTS phone_proofs');
    await q('DROP TABLE IF EXISTS phone_challenges');
    await q('INSERT INTO schema_migrations VALUES ($1,$2)', [12, new Date().toISOString()]);
  });
}

async function upgradeCourierBranches(database) {
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=13')).rows.length)
    return;
  await database.transaction(async (q) => {
    await q("UPDATE roles SET scope='branch' WHERE code='courier'");
    const preferred = (
      await q("SELECT id FROM branches WHERE id='b3' AND active=1 AND state='Activo'")
    ).rows[0];
    const fallback = preferred || (
      await q("SELECT id FROM branches WHERE active=1 AND state='Activo' ORDER BY name LIMIT 1")
    ).rows[0];
    if (fallback)
      await q(
        "UPDATE users SET branch_id=$1 WHERE role_id=(SELECT id FROM roles WHERE code='courier') AND branch_id IS NULL",
        [fallback.id],
      );
    await q('INSERT INTO schema_migrations VALUES ($1,$2)', [13, new Date().toISOString()]);
  });
}
