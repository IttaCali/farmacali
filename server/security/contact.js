import { randomUUID } from 'node:crypto';
import { AppError } from '../models/pharmacy.js';
import { privateHash, encrypt } from './crypto.js';
import { validGuatemalanCui } from '../../shared/guatemalan-cui.js';

export const phoneNumber = (value) => {
  const p = String(value || '').replace(/\D/g, '').replace(/^502(?=\d{8}$)/, '');
  if (!/^\d{8}$/.test(p)) throw new AppError('Escribe un teléfono de Guatemala de 8 dígitos.');
  return '+502' + p;
};

export const dpi = (value) => {
  const p = String(value || '').replace(/[\s-]/g, '');
  if (!p) return '';
  if (!/^\d{13}$/.test(p)) throw new AppError('El CUI/DPI debe tener 13 dígitos.');
  return p;
};

export const validCui = validGuatemalanCui;

export const portalContactKey = (value, phone, name) =>
  value
    ? privateHash('dpi:' + dpi(value))
    : privateHash(
        'contact:' + phoneNumber(phone) + ':' + String(name || '').trim().toLocaleLowerCase('es').replace(/\s+/g, ' '),
      );

export async function simulatedMessage(q, phone, orderId, kind, content) {
  await q(
    'INSERT INTO simulated_messages (id,phone_hash,phone_cipher,order_id,kind,text_cipher,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [randomUUID(), privateHash('phone:' + phoneNumber(phone)), encrypt(phoneNumber(phone)), orderId, kind, encrypt(content), new Date().toISOString()],
  );
}
