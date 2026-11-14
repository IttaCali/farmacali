import { AppError } from './pharmacy.js';
export function text(value, label, max = 250) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new AppError(`${label}: campo obligatorio (máximo ${max}).`);
  return value.trim();
}
export function num(value, label, min = 0, max = 1000000, integer = false) {
  const n = Number(value);
  if (
    value == null ||
    value === '' ||
    typeof value === 'boolean' ||
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new AppError(`${label}: valor inválido.`);
  return n;
}
export const cents = (v, label = 'Monto') => Math.round(num(v, label, 0.01, 1000000) * 100);
export function date(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new AppError('Fecha inválida.');
  return value;
}
export function permit(user, permission) {
  if (!user?.permissions?.includes(permission))
    throw new AppError('Tu rol no permite esta operación.', 403);
}
export function scope(user, branch) {
  if (user.scope === 'branch' && branch !== user.branch_id)
    throw new AppError('Operación de otra sucursal.', 403);
}
