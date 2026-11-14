import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

process.env.DEMO_MODE = 'true';
process.env.DATA_ENCRYPTION_KEY = 'ab'.repeat(32);

const [{ initialize }, { migrate }, crypto, { db }] = await Promise.all([
  import('../server/database/init.js'),
  import('../server/database/migrations.js'),
  import('../server/security/crypto.js'),
  import('../server/database/db.js'),
]);
const engine = new PGlite();
const result = (query) => ({ rows: query.rows, rowCount: query.affectedRows ?? query.rows.length });
const database = {
  cloud: true,
  query: async (sql, params = []) => result(await engine.query(sql, params)),
  transaction: (fn) =>
    engine.transaction((tx) => fn(async (sql, params = []) => result(await tx.query(sql, params)))),
};
const demoKey = createHash('sha256').update('farmared-only-local-demo-encryption').digest();
const legacyHash = (value) => createHmac('sha256', demoKey).update(value).digest('hex');
function encryptWithDemoKey(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', demoKey, iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
}

before(async () => {
  await initialize(database);
});

test('migration re-encrypts demo data and rebuilds key-dependent contact hashes', async () => {
  const cui = '1234567890123';
  await database.query('DELETE FROM schema_migrations WHERE version=13');
  await database.query('UPDATE users SET totp_cipher=$1 WHERE id=$2', [
    encryptWithDemoKey('authenticator-secret'),
    'u-admin',
  ]);
  await database.query(
    'INSERT INTO clients (id,name,cui_cipher,phone,address,lat,lng) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [
      'client-rekey',
      'Cliente migración',
      encryptWithDemoKey(cui),
      '+50255551234',
      'Dirección',
      14.6,
      -90.5,
    ],
  );
  await database.query('INSERT INTO portal_clients (dpi_hash,client_id) VALUES ($1,$2)', [
    legacyHash('dpi:' + cui),
    'client-rekey',
  ]);
  await database.query(
    'INSERT INTO simulated_messages (id,phone_hash,phone_cipher,order_id,kind,text_cipher,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [
      'message-rekey',
      legacyHash('phone:+50255551234'),
      encryptWithDemoKey('+50255551234'),
      null,
      'pedido',
      encryptWithDemoKey('Mensaje privado'),
      new Date().toISOString(),
    ],
  );

  await migrate(database);

  const user = (await database.query('SELECT totp_cipher FROM users WHERE id=$1', ['u-admin']))
    .rows[0];
  assert.equal(crypto.decrypt(user.totp_cipher), 'authenticator-secret');
  const client = (
    await database.query('SELECT cui_cipher FROM clients WHERE id=$1', ['client-rekey'])
  ).rows[0];
  assert.equal(crypto.decrypt(client.cui_cipher), cui);
  assert.equal(
    (
      await database.query('SELECT dpi_hash FROM portal_clients WHERE client_id=$1', [
        'client-rekey',
      ])
    ).rows[0].dpi_hash,
    crypto.privateHash('dpi:' + cui),
  );
  const message = (
    await database.query(
      'SELECT phone_hash,phone_cipher,text_cipher FROM simulated_messages WHERE id=$1',
      ['message-rekey'],
    )
  ).rows[0];
  assert.equal(crypto.decrypt(message.phone_cipher), '+50255551234');
  assert.equal(crypto.decrypt(message.text_cipher), 'Mensaje privado');
  assert.equal(message.phone_hash, crypto.privateHash('phone:+50255551234'));
  assert.ok(
    (await database.query('SELECT version FROM schema_migrations WHERE version=13')).rows.length,
  );
});

after(async () => {
  await engine.close();
  await db.close();
});
