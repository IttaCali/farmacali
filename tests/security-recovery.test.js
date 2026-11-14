import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database, db } from '../server/database/db.js';
import { initialize } from '../server/database/init.js';
import { Authentication, totpFor } from '../server/models/authentication.js';

const database = new Database('', ':memory:');
const auth = new Authentication(database),
  q = database.query.bind(database);
before(async () => initialize(database));
after(async () => {
  await database.close();
  await db.close();
});
async function account(required = true) {
  const template = await auth.user(required ? 'u-admin' : 'u-branch');
  const id = randomUUID(),
    email = `${id}@example.test`;
  await q(
    'INSERT INTO users (id,name,email,password_hash,role,role_id,branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [
      id,
      'Prueba recuperación',
      email,
      template.password_hash,
      template.role === 'admin' ? 'admin' : 'operator',
      template.role_id,
      template.branch_id,
    ],
  );
  const password = required ? 'Farmacia2026!' : 'Sucursal2026!';
  const login = await auth.login({ email, password });
  const session = required
    ? await auth.complete({ challenge: login.challenge, code: totpFor(login.secret).generate() })
    : login;
  const identity = await auth.authenticate(session.access);
  return { id, email, password, session, identity, secret: login.secret };
}

test('Códigos aleatorios se guardan como hash y solo sirven una vez, incluso en paralelo', async () => {
  const a = await account();
  assert.equal(a.session.recovery_codes.length, 10);
  assert.equal(new Set(a.session.recovery_codes).size, 10);
  assert.ok(
    (await q('SELECT * FROM recovery_codes WHERE user_id=$1', [a.id])).rows.every(
      (r) => !a.session.recovery_codes.some((c) => r.code_hash.includes(c.replaceAll('-', ''))),
    ),
  );
  const challenge = await auth.login({ email: a.email, password: a.password });
  await assert.rejects(() =>
    auth.complete({ challenge: challenge.challenge, recovery_code: '0000-0000-0000-0000' }),
  );
  const secondChallenge = await auth.login({ email: a.email, password: a.password });
  const attempts = await Promise.allSettled(
    [challenge, secondChallenge].map((c) =>
      auth.complete({ challenge: c.challenge, recovery_code: a.session.recovery_codes[0] }),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
  await assert.rejects(() => auth.authenticate(a.session.access));
  assert.equal((await auth.securityStatus({ id: a.id })).recovery_remaining, 9);
});

test('Cambiar app exige contraseña y factor; no reemplaza la anterior hasta confirmar y revoca las otras sesiones', async () => {
  const a = await account();
  await assert.rejects(() =>
    auth.securityAction(a.identity.user, a.identity.session.id, {
      action: 'setup',
      current_password: 'incorrecta',
      recovery_code: a.session.recovery_codes[0],
    }),
  );
  const setup = await auth.securityAction(a.identity.user, a.identity.session.id, {
    action: 'setup',
    current_password: a.password,
    recovery_code: a.session.recovery_codes[0],
  });
  assert.ok(setup.qr.startsWith('data:image/png'));
  const previous = (await auth.user(a.id)).totp_cipher;
  await assert.rejects(() =>
    auth.complete({ challenge: setup.challenge, code: totpFor(setup.secret).generate() }),
  );
  await assert.rejects(() =>
    auth.securityConfirm(a.identity.user, 'otra-sesion', {
      challenge: setup.challenge,
      code: totpFor(setup.secret).generate(),
    }),
  );
  const wrong = String((Number(totpFor(setup.secret).generate()) + 1) % 1000000).padStart(6, '0');
  await assert.rejects(() =>
    auth.securityConfirm(a.identity.user, a.identity.session.id, {
      challenge: setup.challenge,
      code: wrong,
    }),
  );
  assert.equal((await auth.user(a.id)).totp_cipher, previous);
  const otherChallenge = await auth.login({ email: a.email, password: a.password });
  const otherSession = await auth.complete({
    challenge: otherChallenge.challenge,
    recovery_code: a.session.recovery_codes[1],
  });
  // Recovery login invalidates pending changes and sessions; begin again in that new session.
  const otherIdentity = await auth.authenticate(otherSession.access);
  const next = await auth.securityAction(otherIdentity.user, otherIdentity.session.id, {
    action: 'setup',
    current_password: a.password,
    recovery_code: a.session.recovery_codes[2],
  });
  const changed = await auth.securityConfirm(otherIdentity.user, otherIdentity.session.id, {
    challenge: next.challenge,
    code: totpFor(next.secret).generate(),
  });
  assert.equal(changed.recovery_codes.length, 10);
  assert.notEqual((await auth.user(a.id)).totp_cipher, previous);
  await auth.authenticate(otherSession.access);
  await assert.rejects(() =>
    auth.securityConfirm(otherIdentity.user, otherIdentity.session.id, {
      challenge: next.challenge,
      code: totpFor(next.secret).generate(),
    }),
  );
  const login = await auth.login({ email: a.email, password: a.password });
  await assert.rejects(() =>
    auth.complete({ challenge: login.challenge, recovery_code: a.session.recovery_codes[3] }),
  );
  assert.equal((await auth.securityStatus({ id: a.id })).recovery_remaining, 10);
});

test('Regenerar códigos invalida el juego anterior y los roles obligatorios no pueden quitar el segundo factor', async () => {
  const a = await account();
  const regenerated = await auth.securityAction(a.identity.user, a.identity.session.id, {
    action: 'codes',
    current_password: a.password,
    recovery_code: a.session.recovery_codes[0],
  });
  assert.equal(regenerated.recovery_codes.length, 10);
  await assert.rejects(
    () =>
      auth.securityAction(a.identity.user, a.identity.session.id, {
        action: 'disable',
        current_password: a.password,
        recovery_code: regenerated.recovery_codes[0],
      }),
    /requiere segundo factor/,
  );
  const challenge = await auth.login({ email: a.email, password: a.password });
  await assert.rejects(() =>
    auth.complete({ challenge: challenge.challenge, recovery_code: a.session.recovery_codes[1] }),
  );
  await auth.complete({
    challenge: challenge.challenge,
    recovery_code: regenerated.recovery_codes[0],
  });
});

test('Rol opcional puede agregar y eliminar su app; cinco fallos mantienen el bloqueo aunque la contraseña sea correcta', async () => {
  const a = await account(false);
  const setup = await auth.securityAction(a.identity.user, a.identity.session.id, {
    action: 'setup',
    current_password: a.password,
  });
  const enabled = await auth.securityConfirm(a.identity.user, a.identity.session.id, {
    challenge: setup.challenge,
    code: totpFor(setup.secret).generate(),
  });
  await auth.securityAction(a.identity.user, a.identity.session.id, {
    action: 'disable',
    current_password: a.password,
    recovery_code: enabled.recovery_codes[0],
  });
  assert.equal((await auth.securityStatus({ id: a.id })).enabled, false);
  assert.equal((await auth.securityStatus({ id: a.id })).recovery_remaining, 0);
  assert.ok((await auth.login({ email: a.email, password: a.password })).access);
  const b = await account();
  for (let i = 0; i < 5; i++) {
    const challenge = await auth.login({ email: b.email, password: b.password });
    await assert.rejects(() =>
      auth.complete({ challenge: challenge.challenge, recovery_code: '0000-0000-0000-0000' }),
    );
  }
  await assert.rejects(() => auth.login({ email: b.email, password: b.password }));
  assert.equal((await auth.user(b.id)).failed_attempts, 5);
});
