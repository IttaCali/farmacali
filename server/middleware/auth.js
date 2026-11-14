import { authentication } from '../models/authentication.js';
import { sha256 } from '../security/crypto.js';
export async function authenticate(req, res, next) {
  try {
    const { user, session } = await authentication.authenticate(req.cookies?.access);
    req.user = { ...user, ip: req.ip };
    req.session = session;
    next();
  } catch {
    res.status(401).json({ error: 'Inicia sesión para continuar.' });
  }
}
export const requirePermission = (permission) => (req, res, next) =>
  req.user.permissions.includes(permission)
    ? next()
    : res.status(403).json({ error: 'Tu rol no permite esta operación.' });
export function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (sha256(req.get('x-csrf-token') || '') !== req.session.csrf_hash)
    return res.status(403).json({ error: 'Solicitud no autorizada (CSRF).' });
  next();
}
