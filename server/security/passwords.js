import { randomBytes } from 'node:crypto';

export const passwordValid = (password) =>
  typeof password === 'string' &&
  password.length >= 10 &&
  password.length <= 128 &&
  /[A-Z]/.test(password) &&
  /\d/.test(password) &&
  /[^a-zA-Z\d]/.test(password);

export const temporaryPassword = () => `F${randomBytes(18).toString('base64url')}9!`;
