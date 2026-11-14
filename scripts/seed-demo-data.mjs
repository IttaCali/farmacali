import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import '../server/config.js';

if (process.env.DEMO_MODE !== 'true')
  throw new Error('La carga demo requiere configurar DEMO_MODE=true explícitamente.');
if (!/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL || ''))
  throw new Error('La carga demo requiere DATABASE_URL de PostgreSQL; no se usó SQLite.');

const [{ db }, { initialize }, { encrypt }] = await Promise.all([
  import('../server/database/db.js'),
  import('../server/database/init.js'),
  import('../server/security/crypto.js'),
]);
const departmentCodes = {
  guatemala: '01',
  'el progreso': '02',
  sacatepequez: '03',
  chimaltenango: '04',
  escuintla: '05',
  'santa rosa': '06',
  solola: '07',
  totonicapan: '08',
  quetzaltenango: '09',
  suchitepequez: '10',
  retalhuleu: '11',
  'san marcos': '12',
  huehuetenango: '13',
  quiche: '14',
  'baja verapaz': '15',
  'alta verapaz': '16',
  peten: '17',
  izabal: '18',
  zacapa: '19',
  chiquimula: '20',
  jalapa: '21',
  jutiapa: '22',
};
const people = [
  ['Andrea', 'Cifuentes', 'Diego', 'Mazariegos', 'Claudia', 'Pineda'],
  ['Mauricio', 'Lemus', 'Paola', 'Batz', 'Byron', 'Solares'],
  ['Daniela', 'Alvarado', 'Kevin', 'Ajú', 'Mónica', 'Barrera'],
  ['Estuardo', 'Rosales', 'María José', 'Choc', 'Fernando', 'Caal'],
  ['Karla', 'Barrios', 'Óscar', 'Marroquín', 'Silvia', 'Orellana'],
  ['Ricardo', 'Maldonado', 'Gabriela', 'Pop', 'Julio', 'Cabrera'],
];
const positions = {
  branch: 'Gerente de sucursal',
  callcenter: 'Operador de call center',
  courier: 'Repartidor',
  admin: 'Administrador',
  auditor: 'Auditor',
};
const salaryCents = { branch: 625000, callcenter: 450000, courier: 400000 };
const roleValues = {
  admin: 'admin',
  auditor: 'auditor',
  branch: 'operator',
  callcenter: 'operator',
  courier: 'operator',
};
const legacyIds = {
  admin: 'u-admin',
  auditor: 'u-auditor',
  branch: 'u-branch',
  callcenter: 'u-operator',
  courier: 'u-courier',
};
const slug = (value) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
const normalize = (value) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
function syntheticCui(index, department, usedCuis) {
  const departmentCode = departmentCodes[normalize(department)] || '01';
  let value = index * 10;
  while (true) {
    const digits = String(value).padStart(8, '0').slice(-8);
    const check = digits.split('').reduce((sum, digit, i) => sum + Number(digit) * (i + 2), 0) % 11;
    const cui = `${digits}${check}${departmentCode}01`;
    if (check < 10 && !usedCuis.has(cui)) {
      usedCuis.add(cui);
      return cui;
    }
    value++;
  }
}
const temporaryPassword = () => `F${randomBytes(18).toString('base64url')}9!`;
const profile = (kind, branch, branchIndex, accountIndex, usedCuis) => {
  const person = people[branchIndex % people.length];
  const central = {
    admin: ['Sofía', 'Maldonado'],
    auditor: ['Tomás', 'Santizo'],
  }[kind];
  const nameIndex = { branch: 0, callcenter: 2, courier: 4 }[kind],
    [name, surname] = central || [person[nameIndex], person[nameIndex + 1]];
  return {
    name,
    surname,
    dpi: syntheticCui(accountIndex, branch?.department || 'Guatemala', usedCuis),
    phone: String(55500000 + accountIndex),
    birth_date: `${1982 + (accountIndex % 17)}-${String(1 + (accountIndex % 12)).padStart(2, '0')}-15`,
    address: branch
      ? `${branch.address}, ${branch.municipality || branch.department}, Guatemala`
      : 'Oficina central de demostración, Ciudad de Guatemala',
  };
};
function makeAccounts(branches) {
  const accounts = [],
    usedCuis = new Set();
  let index = 1;
  for (const kind of ['admin', 'auditor']) {
    const p = profile(kind, null, 0, index++, usedCuis);
    accounts.push({
      ...p,
      id: legacyIds[kind],
      kind,
      branch_id: null,
      email: `${kind}@farmacali.com`,
      branch_name: 'Oficina central',
    });
  }
  for (let branchIndex = 0; branchIndex < branches.length; branchIndex++) {
    const branch = branches[branchIndex];
    for (const kind of ['branch', 'callcenter', 'courier']) {
      const p = profile(kind, branch, branchIndex, index++, usedCuis);
      const prefix = { branch: 'gerente', callcenter: 'callcenter', courier: 'repartidor' }[kind];
      accounts.push({
        ...p,
        id: branch.id === 'b1' ? legacyIds[kind] : `demo-${kind}-${slug(branch.id)}`,
        kind,
        branch_id: branch.id,
        email: `${prefix}.${slug(branch.name)}@farmacali.com`,
        branch_name: branch.name,
      });
    }
  }
  return accounts;
}
async function seed(database) {
  await initialize(database);
  const branches = (
    await database.query(
      "SELECT id,name,department,municipality,address FROM branches WHERE active=1 AND state='Activo' ORDER BY id",
    )
  ).rows;
  if (!branches.length) throw new Error('No hay sucursales activas para cargar los datos demo.');
  const roles = new Map(
    (
      await database.query(
        "SELECT id,code FROM roles WHERE code IN ('admin','auditor','branch','callcenter','courier')",
      )
    ).rows.map((role) => [role.code, role.id]),
  );
  for (const kind of Object.keys(positions))
    if (!roles.has(kind)) throw new Error(`Falta configurar el rol ${kind}.`);

  const accounts = makeAccounts(branches).map((account) => ({
    ...account,
    role_id: roles.get(account.kind),
    role: roleValues[account.kind],
    position: positions[account.kind],
    password: temporaryPassword(),
  }));
  for (const account of accounts) account.password_hash = await bcrypt.hash(account.password, 12);

  await database.query(
    'CREATE TABLE IF NOT EXISTS demo_seed_runs (id TEXT PRIMARY KEY,completed_at TEXT NOT NULL,report_file TEXT NOT NULL)',
  );
  const prior = (await database.query("SELECT report_file FROM demo_seed_runs WHERE id='roles-v1'"))
    .rows[0];
  if (prior) {
    console.log(`La carga demo ya se ejecutó. Credenciales: ${prior.report_file}`);
    return;
  }

  await mkdir('data', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'),
    temporaryFile = join('data', `demo-credentials-${stamp}.tmp`),
    reportFile = join('data', `demo-credentials-${stamp}.txt`),
    report = [
      'FarmaCali · credenciales temporales de demostración',
      `Generadas: ${new Date().toISOString()}`,
      'Todas las cuentas requieren cambiar la contraseña al primer inicio.',
      'Administrador y auditor también deben completar el enrolamiento MFA.',
      'Los perfiles, salarios, proveedores y costos son ficticios; las sucursales son las de la base demo.',
      '',
      ...accounts.map(
        (account) =>
          `${account.position} | ${account.branch_name}\nCorreo: ${account.email}\nContraseña temporal: ${account.password}\n`,
      ),
    ].join('\n');
  await writeFile(temporaryFile, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });

  try {
    await database.transaction(async (q) => {
      if ((await q("SELECT id FROM demo_seed_runs WHERE id='roles-v1'")).rows.length)
        throw new Error('La carga demo ya se ejecutó en otra sesión.');
      for (const account of accounts) {
        const owner = (await q('SELECT id FROM users WHERE email=$1', [account.email])).rows[0];
        if (owner && owner.id !== account.id)
          throw new Error(`El correo demo ${account.email} ya pertenece a otra cuenta.`);
        const values = [
          account.name,
          account.surname,
          account.dpi,
          account.phone,
          account.birth_date,
          account.address,
          account.position,
          account.email,
          account.password_hash,
          account.role,
          account.role_id,
          account.branch_id,
        ];
        const existing = (await q('SELECT id FROM users WHERE id=$1', [account.id])).rows[0];
        if (existing) {
          await q(
            "UPDATE users SET name=$1,surname=$2,dpi=$3,phone=$4,birth_date=$5,address=$6,position=$7,email=$8,password_hash=$9,role=$10,role_id=$11,branch_id=$12,state='Activo',failed_attempts=0,locked_until=NULL,must_change_password=1,totp_cipher=NULL,totp_enabled=0,last_totp_step=-1,deactivated_at=NULL,deactivated_by=NULL,deactivation_reason=NULL WHERE id=$13",
            [...values, account.id],
          );
        } else {
          await q(
            "INSERT INTO users (id,name,surname,dpi,phone,birth_date,address,position,email,password_hash,role,role_id,branch_id,state,must_change_password) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Activo',1)",
            [account.id, ...values],
          );
        }
        await q('UPDATE sessions SET revoked=1 WHERE user_id=$1', [account.id]);
        await q('DELETE FROM recovery_codes WHERE user_id=$1', [account.id]);
      }

      const managers = accounts.filter((account) => account.kind === 'branch');
      for (const manager of managers) {
        const existing = (await q('SELECT id FROM employees WHERE user_id=$1', [manager.id]))
          .rows[0];
        if (existing) continue;
        const unassigned = (
          await q(
            "SELECT id FROM employees WHERE branch_id=$1 AND user_id IS NULL AND position IN ('Gerente de sucursal','Encargado de farmacia') ORDER BY id LIMIT 1",
            [manager.branch_id],
          )
        ).rows[0];
        if (unassigned) {
          await q('UPDATE employees SET name=$1,position=$2,user_id=$3 WHERE id=$4', [
            `${manager.name} ${manager.surname}`,
            positions.branch,
            manager.id,
            unassigned.id,
          ]);
        } else {
          await insertEmployee(q, manager, salaryCents.branch);
        }
      }
      for (const account of accounts.filter(
        (entry) => entry.kind === 'callcenter' || entry.kind === 'courier',
      )) {
        if (!(await q('SELECT id FROM employees WHERE user_id=$1', [account.id])).rows.length)
          await insertEmployee(q, account, salaryCents[account.kind]);
      }

      const suppliers = [
        [
          'demo-supplier-01',
          'Distribuidora Demo Salud GT',
          '5489123-4',
          '55501001',
          'ventas@salud-demo.farmacia.test',
          'Zona 1, Ciudad de Guatemala',
        ],
        [
          'demo-supplier-02',
          'Comercializadora Demo Farma Maya',
          '6231478-9',
          '55501002',
          'pedidos@farmamaya-demo.farmacia.test',
          'Zona 3, Quetzaltenango',
        ],
        [
          'demo-supplier-03',
          'Suministros Médicos Demo del Sur',
          '7362501-2',
          '55501003',
          'contacto@sur-demo.farmacia.test',
          'Zona 1, Escuintla',
        ],
      ];
      for (const supplier of suppliers)
        await q(
          'INSERT INTO suppliers (id,name,nit,phone,email,address) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',
          supplier,
        );
      await q(
        'INSERT INTO inventory_costs (inventory_id,unit_cost_cents,known) SELECT i.id,GREATEST(1,ROUND(p.price_cents*0.6)::INTEGER),1 FROM inventory i JOIN products p ON p.id=i.product_id ON CONFLICT(inventory_id) DO NOTHING',
      );
      await q('INSERT INTO demo_seed_runs (id,completed_at,report_file) VALUES ($1,$2,$3)', [
        'roles-v1',
        new Date().toISOString(),
        reportFile,
      ]);
    });
  } catch (error) {
    await unlink(temporaryFile);
    throw error;
  }
  await rename(temporaryFile, reportFile);
  console.log(
    `Carga demo completada: ${accounts.length} usuarios y ${branches.length} sucursales.`,
  );
  console.log(`Contraseñas temporales guardadas en ${reportFile}`);
}

async function insertEmployee(q, account, salary) {
  const encryptedSalary = encrypt(salary),
    employeeId = randomUUID();
  await q(
    "INSERT INTO employees (id,branch_id,name,position,salary_cents,active,salary_cipher,state,user_id) VALUES ($1,$2,$3,$4,1,1,$5,'Activo',$6)",
    [
      employeeId,
      account.branch_id,
      `${account.name} ${account.surname}`,
      account.position,
      encryptedSalary,
      account.id,
    ],
  );
  await q('INSERT INTO salary_history VALUES ($1,$2,$3,$4,$5,$6)', [
    randomUUID(),
    employeeId,
    encryptedSalary,
    'Alta ficticia para demostración',
    new Date().toISOString(),
    'u-system',
  ]);
}

try {
  await seed(db);
} finally {
  await db.close();
}
