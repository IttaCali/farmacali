import { mkdirSync, writeFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { initialize } from '../server/database/init.js';
import { db } from '../server/database/db.js';
const engine = new PGlite();
const result = (r) => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });
const database = {
  cloud: true,
  query: async (sql, params = []) => result(await engine.query(sql, params)),
  transaction: (fn) =>
    engine.transaction((tx) => fn(async (sql, params = []) => result(await tx.query(sql, params)))),
};
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
try {
  await initialize(database);
  const tables = (
    await database.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  const statements = [],
    model = [];
  for (const { tablename: name } of tables) {
    const columns = (
      await database.query(
        "SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum",
        [name],
      )
    ).rows;
    model.push({ table: name, columns });
    statements.push(
      `CREATE TABLE ${quote(name)} (\n${columns.map((c) => '  ' + quote(c.name) + ' ' + c.type + (c.required ? ' NOT NULL' : '') + (c.default_value ? ' DEFAULT ' + c.default_value : '')).join(',\n')}\n);`,
    );
  }
  const constraints = (
    await database.query(
      "SELECT t.relname AS table_name,c.conname AS name,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY CASE WHEN c.contype='f' THEN 1 ELSE 0 END,t.relname,c.conname",
    )
  ).rows;
  statements.push(
    ...constraints.map(
      (c) => `ALTER TABLE ${quote(c.table_name)} ADD CONSTRAINT ${quote(c.name)} ${c.definition};`,
    ),
  );
  const indexes = (
    await database.query(
      "SELECT i.indexdef FROM pg_indexes i WHERE i.schemaname='public' AND NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class x ON x.oid=c.conindid WHERE x.relname=i.indexname)",
    )
  ).rows;
  statements.push(...indexes.map((i) => i.indexdef + ';'));
  statements.push(
    (
      await database.query(
        "SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='prevent_audit_mutation'",
      )
    ).rows[0].definition.trim() + ';',
  );
  statements.push(
    'CREATE TRIGGER audit_no_mutation BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();',
  );
  mkdirSync('database', { recursive: true });
  const verification = new PGlite();
  try {
    await verification.exec('BEGIN;\n' + statements.join('\n\n') + '\nCOMMIT;');
  } finally {
    await verification.close();
  }
  writeFileSync(
    'database/postgresql.sql',
    '-- FarmaCali v2: esquema REAL después de las migraciones. PostgreSQL.\n-- Referencia técnica/insumo E-R; la aplicación instala esquema, roles y migraciones mediante initialize().\n-- No ejecutar manualmente sobre una instalación existente. Sin datos ni credenciales.\nBEGIN;\n' +
      statements.join('\n\n') +
      '\nCOMMIT;\n',
  );
  writeFileSync(
    'database/estructura-real.json',
    JSON.stringify({ generated: new Date().toISOString(), tables: model, constraints }, null, 2),
  );
  console.log(
    `Esquema actualizado: ${tables.length} tablas; constraints, índices y trigger incluidos.`,
  );
} finally {
  await engine.close();
  await db.close();
}
