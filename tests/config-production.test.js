import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const configUrl = pathToFileURL(resolve('server/config.js')).href;
const cleanEnv = () => {
  const env = { ...process.env, JWT_SECRET: 'x'.repeat(64) };
  for (const key of ['DEMO_MODE', 'DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'APP_ORIGIN'])
    delete env[key];
  return env;
};

test('unset DEMO_MODE fails closed and requires production configuration', () => {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(configUrl)})`],
    { cwd: tmpdir(), env: cleanEnv(), encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Producción requiere DATABASE_URL, ADMIN_EMAIL y ADMIN_PASSWORD/);
});

test('demo mode cannot run with a production Node environment', () => {
  const env = cleanEnv();
  env.DEMO_MODE = 'true';
  env.NODE_ENV = 'production';
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(configUrl)})`],
    { cwd: tmpdir(), env, encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DEMO_MODE no puede estar habilitado en producción/);
});
