import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { schema } from './schema.js';
import { demoMode } from '../config.js';
import { migrate } from './migrations.js';
import { seedDemoCatalog } from './demo-catalog.js';
export async function initialize(database = db) {
  for (const sql of schema) await database.query(sql);
  await database.transaction(async (q) => {
    if ((await q('SELECT id FROM users LIMIT 1')).rows.length) return;
    await q('INSERT INTO users VALUES ($1,$2,$3,$4,$5)', [
      'u-admin',
      'Administrador',
      process.env.ADMIN_EMAIL || 'admin@farmacia.gt',
      await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Farmacia2026!', 12),
      'admin',
    ]);
    if (!demoMode) return;
    await q('INSERT INTO users VALUES ($1,$2,$3,$4,$5)', [
      'u-auditor',
      'Auditor de operaciones',
      'auditor@farmacia.gt',
      await bcrypt.hash('Auditor2026!', 12),
      'auditor',
    ]);
    await q('INSERT INTO users VALUES ($1,$2,$3,$4,$5)', [
      'u-operator',
      'Operador del call center',
      'operador@farmacia.gt',
      await bcrypt.hash('Operador2026!', 12),
      'operator',
    ]);
    const branches = [
      [
        'b1',
        'Miraflores',
        'Guatemala',
        'Centro Comercial Miraflores, zona 11',
        'Centro comercial',
        14.6134,
        -90.5505,
      ],
      [
        'b2',
        'Pradera Xela',
        'Quetzaltenango',
        'Centro Comercial Pradera Xela',
        'Centro comercial',
        14.8544,
        -91.5182,
      ],
      [
        'b3',
        'Pradera Escuintla',
        'Escuintla',
        'Centro Comercial Pradera Escuintla',
        'Centro comercial',
        14.305,
        -90.785,
      ],
      [
        'b4',
        'Estación Cobán',
        'Alta Verapaz',
        'Stand en gasolinera, ingreso a Cobán',
        'Gasolinera',
        15.4708,
        -90.3701,
      ],
      [
        'b5',
        'Pradera Chiquimula',
        'Chiquimula',
        'Centro Comercial Pradera Chiquimula',
        'Centro comercial',
        14.797,
        -89.545,
      ],
      [
        'b6',
        'Estación Petén',
        'Petén',
        'Stand en gasolinera, Santa Elena',
        'Gasolinera',
        16.918,
        -89.892,
      ],
    ];
    for (const b of branches)
      await q(
        'INSERT INTO branches (id,name,department,address,type,lat,lng) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        b,
      );
    const products = [
      ['p1', 'Acetaminofén 500 mg', 'MED-001', 'Analgésicos', 1850, 0],
      ['p2', 'Ibuprofeno 400 mg', 'MED-002', 'Antiinflamatorios', 3200, 0],
      ['p3', 'Amoxicilina 500 mg', 'MED-003', 'Antibióticos', 6800, 1],
      ['p4', 'Loratadina 10 mg', 'MED-004', 'Antialérgicos', 2450, 0],
      ['p5', 'Omeprazol 20 mg', 'MED-005', 'Gastrointestinal', 4500, 0],
      ['p6', 'Suero oral 500 ml', 'MED-006', 'Hidratación', 1500, 0],
      ['p7', 'Vitamina C 1000 mg', 'MED-007', 'Vitaminas', 5500, 0],
      ['p8', 'Losartán 50 mg', 'MED-008', 'Cardiovascular', 7200, 1],
    ];
    for (const p of products) await q('INSERT INTO products VALUES ($1,$2,$3,$4,$5,$6)', p);
    const now = new Date();
    const later = (days) => new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
    for (let bi = 0; bi < branches.length; bi++) {
      for (let pi = 0; pi < products.length; pi++)
        await q('INSERT INTO inventory VALUES ($1,$2,$3,$4,$5,$6,$7)', [
          randomUUID(),
          branches[bi][0],
          products[pi][0],
          `LT-${bi + 1}0${pi + 1}`,
          later(pi === 2 ? 22 : 180 + pi * 30),
          bi === 3 && pi === 0 ? 8 : 50 + ((bi * 47 + pi * 31) % 180),
          20,
        ]);
      for (let day = 6; day >= 0; day--) {
        const date = new Date(now.getTime() - day * 86400000).toISOString();
        for (const [kind, amount, category] of [
          ['Ingreso', 42500 + bi * 7800 + ((day * 17300) % 35000), 'Venta en mostrador'],
          ['Egreso', 9500 + bi * 1700, 'Operación'],
        ])
          await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
            randomUUID(),
            branches[bi][0],
            kind,
            category,
            amount,
            'Efectivo',
            `Movimiento de demostración · ${category}`,
            date,
            'u-admin',
          ]);
      }
      await q('INSERT INTO assets VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
        randomUUID(),
        branches[bi][0],
        'Refrigerador farmacéutico',
        `AF-${bi + 1}-001`,
        1450000,
        '2025-04-10',
        60,
        'Activo',
      ]);
      await q('INSERT INTO assets VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
        randomUUID(),
        branches[bi][0],
        'Equipo de punto de venta',
        `AF-${bi + 1}-002`,
        650000,
        '2025-08-01',
        36,
        'Activo',
      ]);
      await q('INSERT INTO employees VALUES ($1,$2,$3,$4,$5,$6)', [
        randomUUID(),
        branches[bi][0],
        [
          'Ana López',
          'Carlos Méndez',
          'María Pérez',
          'Jorge Ruiz',
          'Lucía Morales',
          'Diego García',
        ][bi],
        'Encargado de farmacia',
        520000 + bi * 15000,
        1,
      ]);
      await q('INSERT INTO employees VALUES ($1,$2,$3,$4,$5,$6)', [
        randomUUID(),
        branches[bi][0],
        [
          'Luis Torres',
          'Elena Castillo',
          'Pedro Díaz',
          'Sofía Ramírez',
          'Andrés Gómez',
          'Valeria Cruz',
        ][bi],
        'Auxiliar de farmacia',
        380000,
        1,
      ]);
    }
    await q('INSERT INTO audit_log VALUES ($1,$2,$3,$4,$5,$6,$7)', [
      randomUUID(),
      'u-admin',
      'INICIALIZAR',
      'sistema',
      'demo',
      'Datos ficticios para presentación académica',
      now.toISOString(),
    ]);
  });
  await migrate(database);
  const catalog = await seedDemoCatalog(database);
  if (!catalog.skipped) console.log('Catalogo demo cargado:', catalog);
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/database/init.js')) {
  await initialize();
  console.log('Base de datos inicializada.');
  await db.close();
}
