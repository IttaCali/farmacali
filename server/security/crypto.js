import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { demoMode } from '../config.js';
const configured = process.env.DATA_ENCRYPTION_KEY;
if (!demoMode && !/^[a-f\d]{64}$/i.test(configured || ''))
  throw new Error('DATA_ENCRYPTION_KEY debe ser una clave hexadecimal de 32 bytes.');
const key = configured
  ? Buffer.from(configured, 'hex')
  : createHash('sha256').update('farmared-only-local-demo-encryption').digest();
const demoKey = createHash('sha256').update('farmared-only-local-demo-encryption').digest();
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const privateHash = (value) => createHmac('sha256', key).update(value).digest('hex');
export const legacyPrivateHash = (value) =>
  createHmac('sha256', demoKey).update(value).digest('hex');

function encryptWithKey(value, encryptionKey) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const data = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

function decryptWithKey(value, encryptionKey) {
  const [iv, tag, data] = value.split('.').map((s) => Buffer.from(s, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}

export function encrypt(value) {
  if (value == null) return null;
  return encryptWithKey(value, key);
}
export function decrypt(value) {
  if (!value) return null;
  return decryptWithKey(value, key);
}

export function reencryptLegacyDemoValue(value) {
  if (!value) return value;
  try {
    decryptWithKey(value, key);
    return value;
  } catch {
    return encryptWithKey(decryptWithKey(value, demoKey), key);
  }
}
