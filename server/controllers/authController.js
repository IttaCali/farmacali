import { authentication } from '../models/authentication.js';
import { demoMode } from '../config.js';
import { db } from '../database/db.js';
const options = {
  httpOnly: true,
  secure: !demoMode || process.env.COOKIE_SECURE === 'true',
  sameSite: 'strict',
  path: '/api',
};
export function cookies(res, result) {
  res.cookie('access', result.access, { ...options, maxAge: 15 * 60000 });
  res.cookie('refresh', result.refresh, { ...options, maxAge: 7 * 86400000 });
  res.cookie('csrf', result.csrf, { ...options, httpOnly: false, path: '/', maxAge: 7 * 86400000 });
  res.json({
    user: result.user,
    ...(result.recovery_codes ? { recovery_codes: result.recovery_codes } : {}),
  });
}
export function clearCookies(res) {
  res.clearCookie('access', options);
  res.clearCookie('refresh', options);
  res.clearCookie('csrf', { ...options, httpOnly: false, path: '/' });
}
export async function login(req, res) {
  const result = await authentication.login(req.body, req.ip);
  if (result.step) return res.json(result);
  cookies(res, result);
}
export async function complete(req, res) {
  const result = await authentication.complete(req.body, req.ip);
  if (result.step) return res.json(result);
  cookies(res, result);
}
export async function refresh(req, res) {
  try {
    cookies(
      res,
      await authentication.refresh(req.cookies?.refresh, req.get('x-csrf-token'), req.ip),
    );
  } catch (e) {
    clearCookies(res);
    throw e;
  }
}
export async function logout(req, res) {
  await authentication.logout(req.session, req.user);
  clearCookies(res);
  res.json({ message: 'Sesión cerrada.' });
}
export async function activity(req, res) {
  await db.query('UPDATE sessions SET last_seen=$1 WHERE id=$2', [
    new Date().toISOString(),
    req.session.id,
  ]);
  res.json({ expires_in_seconds: 900 });
}
export async function password(req, res) {
  const out = await authentication.password(req.user, req.body);
  clearCookies(res);
  res.json(out);
}
export async function securityStatus(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await authentication.securityStatus(req.user));
}
export async function securityAction(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(
    await authentication.securityAction({ ...req.user, ip: req.ip }, req.session.id, req.body),
  );
}
export async function securityConfirm(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(
    await authentication.securityConfirm({ ...req.user, ip: req.ip }, req.session.id, req.body),
  );
}
