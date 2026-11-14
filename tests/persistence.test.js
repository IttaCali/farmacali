import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database, db } from '../server/database/db.js';
import { initialize } from '../server/database/init.js';
import { Pharmacy } from '../server/models/pharmacy.js';
test('SQLite conserva registros al cerrar y volver a abrir la base', async () => {
  const filename = `data/prueba-persistencia-${randomUUID()}.sqlite`;
  const first = new Database('', filename);
  await initialize(first);
  const branch = await new Pharmacy(first).branches(
    {
      name: 'Sucursal prueba persistencia',
      department: 'Guatemala',
      address: 'Dirección ficticia',
      type: 'Gasolinera',
      lat: 14.6,
      lng: -90.5,
    },
    { id: 'u-admin' },
  );
  await first.close();
  const second = new Database('', filename);
  const row = (await second.query('SELECT * FROM branches WHERE id=$1', [branch.id])).rows[0];
  assert.equal(row.name, 'Sucursal prueba persistencia');
  assert.equal(
    (await second.query('SELECT COUNT(*) AS n FROM audit_log WHERE entity_id=$1', [branch.id]))
      .rows[0].n,
    1,
  );
  await second.close();
  await db.close();
});
