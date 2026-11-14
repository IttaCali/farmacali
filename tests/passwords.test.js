import assert from 'node:assert/strict';
import test from 'node:test';
import { passwordValid, temporaryPassword } from '../server/security/passwords.js';

test('temporary passwords meet policy and are independently generated', () => {
  const generated = Array.from({ length: 64 }, temporaryPassword);
  assert.equal(new Set(generated).size, generated.length);
  for (const password of generated) assert.equal(passwordValid(password), true);
});
