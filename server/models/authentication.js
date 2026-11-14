import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { db } from '../database/db.js';
import { jwtSecret } from '../config.js';
import { encrypt, decrypt, sha256 } from '../security/crypto.js';
import { passwordValid } from '../security/passwords.js';
import { writeAudit } from './audit.js';
export { passwordValid };
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const instant = () => new Date().toISOString();
const random = () => randomBytes(32).toString('hex');
export const totpFor = (secret, label = 'FarmaCali') =>
  new OTPAuth.TOTP({
    issuer: 'FarmaCali',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
export class Authentication {
  constructor(database = db) {
    this.db = database;
  }
  async user(id, q = this.db.query.bind(this.db)) {
    const u = (
      await q(
        'SELECT u.*,r.code AS role_code,r.name AS role_name,r.scope,r.require_totp,b.name AS branch_name FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN branches b ON b.id=u.branch_id WHERE u.id=$1',
        [id],
      )
    ).rows[0];
    if (!u) return null;
    const permissions = (
      await q('SELECT permission_code FROM role_permissions WHERE role_id=$1', [u.role_id])
    ).rows.map((p) => p.permission_code);
    return { ...u, permissions, role: u.role_code };
  }
  publicUser(u) {
    const {
      id,
      name,
      email,
      role,
      role_id,
      role_name,
      scope,
      branch_id,
      branch_name,
      state,
      must_change_password,
      totp_enabled,
      permissions,
    } = u;
    return {
      id,
      name,
      email,
      role,
      role_id,
      role_name,
      scope,
      branch_id,
      branch_name,
      state,
      must_change_password,
      totp_enabled,
      permissions,
    };
  }
  async challenge(q, u, purpose, secret = null) {
    const raw = random();
    await q(
      'INSERT INTO auth_challenges (id,user_id,token_hash,purpose,secret_cipher,expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        randomUUID(),
        u.id,
        sha256(raw),
        purpose,
        secret ? encrypt(secret) : null,
        new Date(Date.now() + 5 * 60000).toISOString(),
      ],
    );
    const out = { challenge: raw, step: purpose };
    if (secret) {
      const otp = totpFor(secret, u.email);
      out.secret = secret;
      out.qr = await QRCode.toDataURL(otp.toString());
      out.instructions =
        'Escanea el QR con Microsoft Authenticator y escribe el código de verificación de seis dígitos.';
    }
    return out;
  }
  credentials(u, sid, refresh, csrf) {
    return {
      access: jwt.sign({ sid, branch_id: u.branch_id, role: u.role }, jwtSecret, {
        subject: u.id,
        issuer: 'farmared',
        audience: 'farmared-app',
        expiresIn: '15m',
      }),
      refresh,
      csrf,
      user: this.publicUser(u),
    };
  }
  async session(q, u, ip) {
    const raw = random(),
      csrf = random(),
      sid = randomUUID(),
      date = instant();
    await q('UPDATE users SET failed_attempts=0,locked_until=NULL WHERE id=$1', [u.id]);
    await q(
      'INSERT INTO sessions (id,user_id,refresh_hash,csrf_hash,ip,created_at,expires_at,last_seen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        sid,
        u.id,
        sha256(raw),
        sha256(csrf),
        ip,
        date,
        new Date(Date.now() + 7 * 86400000).toISOString(),
        date,
      ],
    );
    await writeAudit(q, { ...u, ip }, 'LOGIN', 'sesion', sid, { mfa: !!u.totp_enabled });
    return this.credentials(u, sid, raw, csrf);
  }
  async login({ email, password }, ip = 'local') {
    const found = (
      await this.db.query('SELECT id FROM users WHERE email=$1', [email.trim().toLowerCase()])
    ).rows[0];
    let u = found ? await this.user(found.id) : null;
    const valid = await bcrypt.compare(
      password,
      u?.password_hash || '$2b$12$5cAVNKSNvbVKJUS9LnrfEuHwqpTJ0GpmXsMMDEvnfnNc3VLBTArT2',
    );
    const result = await this.db.transaction(async (q) => {
      const current = u ? await this.user(u.id, q) : null;
      if (
        !current ||
        current.state !== 'Activo' ||
        current.locked_until > instant() ||
        !valid ||
        current.password_hash !== u.password_hash
      ) {
        if (
          current &&
          current.state === 'Activo' &&
          (!current.locked_until || current.locked_until <= instant())
        ) {
          const n = current.failed_attempts + 1;
          await q('UPDATE users SET failed_attempts=$1,locked_until=$2 WHERE id=$3', [
            n,
            n >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null,
            u.id,
          ]);
        }
        await writeAudit(
          q,
          u ? { ...u, ip } : { id: 'u-system', role: 'system', ip },
          'LOGIN_FALLIDO',
          'seguridad',
          u?.id || 'desconocido',
          { reason: 'Credenciales inválidas' },
        );
        return { failure: true };
      }
      u = current;
      if (u.must_change_password) return this.challenge(q, u, 'password');
      if (u.require_totp && !u.totp_enabled)
        return this.challenge(q, u, 'enroll', new OTPAuth.Secret({ size: 20 }).base32);
      if (u.totp_enabled) return this.challenge(q, u, 'totp');
      return this.session(q, u, ip);
    });
    if (result.failure) throw fail('Credenciales inválidas', 401);
    return result;
  }
  async complete({ challenge, code, new_password, recovery_code }, ip = 'local') {
    const result = await this.db.transaction(async (q) => {
      const c = (await q('SELECT * FROM auth_challenges WHERE token_hash=$1', [sha256(challenge)]))
        .rows[0];
      if (!c || c.consumed || c.expires_at < instant()) return { failure: true };
      if (!['password', 'enroll', 'totp'].includes(c.purpose)) return { failure: true };
      const u = await this.user(c.user_id, q);
      if (!u || u.state !== 'Activo' || u.locked_until > instant()) return { failure: true };
      if (c.purpose === 'password') {
        if (!passwordValid(new_password))
          throw fail('Contraseña: mínimo 10 caracteres, mayúscula, número y símbolo.');
        if (await bcrypt.compare(new_password, u.password_hash))
          throw fail('La clave nueva debe ser distinta de la temporal.');
        await q('UPDATE users SET password_hash=$1,must_change_password=0 WHERE id=$2', [
          await bcrypt.hash(new_password, 12),
          u.id,
        ]);
        await q('UPDATE sessions SET revoked=1 WHERE user_id=$1', [u.id]);
        await q('UPDATE auth_challenges SET consumed=1 WHERE user_id=$1', [u.id]);
        await writeAudit(q, { ...u, ip }, 'CAMBIAR_CLAVE', 'usuario', u.id, { first_login: true });
        u.must_change_password = 0;
        if (u.require_totp && !u.totp_enabled)
          return this.challenge(q, u, 'enroll', new OTPAuth.Secret({ size: 20 }).base32);
        if (u.totp_enabled) return this.challenge(q, u, 'totp');
        return this.session(q, u, ip);
      }
      if (c.purpose === 'totp' && recovery_code && !code) {
        if (!(await this.factor(q, u, { recovery_code }))) {
          await this.failedFactor(q, u, ip);
          return { failure: true };
        }
        await q('UPDATE auth_challenges SET consumed=1 WHERE user_id=$1', [u.id]);
        await q('UPDATE sessions SET revoked=1 WHERE user_id=$1', [u.id]);
        await writeAudit(q, { ...u, ip }, 'RECUPERAR_ACCESO', 'usuario', u.id, {});
        return this.session(q, u, ip);
      }
      if (recovery_code || (c.purpose === 'totp' && !u.totp_enabled)) return { failure: true };
      const secret = decrypt(c.purpose === 'enroll' ? c.secret_cipher : u.totp_cipher),
        otp = totpFor(secret, u.email),
        delta =
          typeof code === 'string' && /^\d{6}$/.test(code)
            ? otp.validate({ token: code, window: 1 })
            : null,
        step = Math.floor(Date.now() / 30000) + (delta ?? 0);
      if (delta === null || step <= u.last_totp_step) {
        const n = u.failed_attempts + 1;
        await q('UPDATE users SET failed_attempts=$1,locked_until=$2 WHERE id=$3', [
          n,
          n >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null,
          u.id,
        ]);
        await writeAudit(q, { ...u, ip }, '2FA_FALLIDO', 'seguridad', u.id, {});
        return { failure: true };
      }
      await q(
        'UPDATE users SET totp_cipher=$1,totp_enabled=1,last_totp_step=$2,failed_attempts=0 WHERE id=$3',
        [encrypt(secret), step, u.id],
      );
      await q('UPDATE auth_challenges SET consumed=1 WHERE user_id=$1', [u.id]);
      u.totp_enabled = 1;
      if (c.purpose === 'enroll')
        await writeAudit(q, { ...u, ip }, 'ACTIVAR_2FA', 'usuario', u.id, {});
      const session = await this.session(q, u, ip);
      if (c.purpose === 'enroll') session.recovery_codes = await this.newRecoveryCodes(q, u.id);
      return session;
    });
    if (result.failure) throw fail('Credenciales inválidas', 401);
    return result;
  }
  async failedFactor(q, u, ip) {
    const n = u.failed_attempts + 1;
    await q('UPDATE users SET failed_attempts=$1,locked_until=$2 WHERE id=$3', [
      n,
      n >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null,
      u.id,
    ]);
    await writeAudit(q, { ...u, ip }, '2FA_FALLIDO', 'seguridad', u.id, {});
  }
  async factor(q, u, { code, recovery_code }) {
    if (!u.totp_enabled || (code && recovery_code)) return false;
    if (recovery_code) {
      const normalized = recovery_code.toUpperCase().replace(/[\s-]/g, '');
      if (!/^[A-F0-9]{16}$/.test(normalized)) return false;
      const used = await q(
        'UPDATE recovery_codes SET used_at=$1 WHERE user_id=$2 AND code_hash=$3 AND used_at IS NULL',
        [instant(), u.id, sha256(`${u.id}:${normalized}`)],
      );
      return used.rowCount === 1;
    }
    if (!/^\d{6}$/.test(code || '')) return false;
    const delta = totpFor(decrypt(u.totp_cipher), u.email).validate({ token: code, window: 1 });
    const step = Math.floor(Date.now() / 30000) + (delta ?? 0);
    if (delta === null || step <= u.last_totp_step) return false;
    await q('UPDATE users SET last_totp_step=$1 WHERE id=$2', [step, u.id]);
    return true;
  }
  async newRecoveryCodes(q, userId) {
    await q('DELETE FROM recovery_codes WHERE user_id=$1', [userId]);
    const codes = [];
    for (let i = 0; i < 10; i++) {
      const raw = randomBytes(8).toString('hex').toUpperCase();
      codes.push(raw.match(/.{4}/g).join('-'));
      await q('INSERT INTO recovery_codes (id,user_id,code_hash,created_at) VALUES ($1,$2,$3,$4)', [
        randomUUID(),
        userId,
        sha256(`${userId}:${raw}`),
        instant(),
      ]);
    }
    return codes;
  }
  async securityStatus(user) {
    const u = await this.user(user.id);
    const count = (
      await this.db.query(
        'SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id=$1 AND used_at IS NULL',
        [u.id],
      )
    ).rows[0];
    return {
      enabled: !!u.totp_enabled,
      required: !!u.require_totp,
      recovery_remaining: Number(count.n),
    };
  }
  async securityAction(user, sessionId, { action, current_password, code, recovery_code }) {
    if (!['setup', 'disable', 'codes'].includes(action))
      throw fail('Acción de seguridad inválida.');
    const result = await this.db.transaction(async (q) => {
      const u = await this.user(user.id, q);
      if (!u || u.state !== 'Activo' || u.locked_until > instant()) return { failure: true };
      if (
        !(await bcrypt.compare(current_password, u.password_hash)) ||
        (u.totp_enabled && !(await this.factor(q, u, { code, recovery_code })))
      ) {
        await this.failedFactor(q, u, user.ip);
        return { failure: true };
      }
      if (action === 'disable' && u.require_totp)
        throw fail(
          'Tu rol requiere segundo factor. Utiliza Cambiar aplicación para vincular otro autenticador.',
        );
      if (action === 'codes' && !u.totp_enabled)
        throw fail('Primero activa una aplicación autenticadora.');
      await q('UPDATE users SET failed_attempts=0,locked_until=NULL WHERE id=$1', [u.id]);
      if (action === 'setup') {
        await q('UPDATE auth_challenges SET consumed=1 WHERE user_id=$1 AND purpose=$2', [
          u.id,
          `security:${sessionId}`,
        ]);
        return this.challenge(
          q,
          u,
          `security:${sessionId}`,
          new OTPAuth.Secret({ size: 20 }).base32,
        );
      }
      if (action === 'codes') {
        const codes = await this.newRecoveryCodes(q, u.id);
        await writeAudit(q, user, 'RENOVAR_CODIGOS_RECUPERACION', 'usuario', u.id, {});
        return { recovery_codes: codes };
      }
      await q('UPDATE users SET totp_cipher=NULL,totp_enabled=0,last_totp_step=-1 WHERE id=$1', [
        u.id,
      ]);
      await q('DELETE FROM recovery_codes WHERE user_id=$1', [u.id]);
      await q('UPDATE auth_challenges SET consumed=1 WHERE user_id=$1', [u.id]);
      await q('UPDATE sessions SET revoked=1 WHERE user_id=$1 AND id<>$2', [u.id, sessionId]);
      await writeAudit(q, user, 'DESACTIVAR_2FA', 'usuario', u.id, {});
      return { message: 'Aplicación desvinculada.' };
    });
    if (result.failure)
      throw fail('No se pudo verificar tu identidad. Revisa la contraseña y el código.', 403);
    return result;
  }
  async securityConfirm(user, sessionId, { challenge, code }) {
    const result = await this.db.transaction(async (q) => {
      const u = await this.user(user.id, q);
      const c = (
        await q('SELECT * FROM auth_challenges WHERE token_hash=$1 AND user_id=$2', [
          sha256(challenge),
          user.id,
        ])
      ).rows[0];
      if (
        !u ||
        u.state !== 'Activo' ||
        u.locked_until > instant() ||
        !c ||
        c.consumed ||
        c.expires_at < instant() ||
        c.purpose !== `security:${sessionId}`
      )
        return { failure: true };
      const secret = decrypt(c.secret_cipher);
      const delta = /^\d{6}$/.test(code || '')
        ? totpFor(secret, u.email).validate({ token: code, window: 1 })
        : null;
      if (delta === null) {
        await this.failedFactor(q, u, user.ip);
        return { failure: true };
      }
      await q(
        'UPDATE users SET totp_cipher=$1,totp_enabled=1,last_totp_step=$2,failed_attempts=0,locked_until=NULL WHERE id=$3',
        [encrypt(secret), Math.floor(Date.now() / 30000) + delta, u.id],
      );
      await q('UPDATE auth_challenges SET consumed=1 WHERE user_id=$1', [u.id]);
      await q('UPDATE sessions SET revoked=1 WHERE user_id=$1 AND id<>$2', [u.id, sessionId]);
      const codes = await this.newRecoveryCodes(q, u.id);
      await writeAudit(
        q,
        user,
        u.totp_enabled ? 'CAMBIAR_2FA' : 'ACTIVAR_2FA',
        'usuario',
        u.id,
        {},
      );
      return {
        recovery_codes: codes,
        message: 'Aplicación vinculada. Las otras sesiones se cerraron.',
      };
    });
    if (result.failure)
      throw fail('Código incorrecto o configuración expirada. Intenta nuevamente.', 403);
    return result;
  }
  async refresh(raw, csrf, ip = 'local') {
    const result = await this.db.transaction(async (q) => {
      const hash = sha256(raw || ''),
        s = (await q('SELECT * FROM sessions WHERE refresh_hash=$1', [hash])).rows[0];
      if (!s) {
        const used = (await q('SELECT * FROM used_refresh_tokens WHERE token_hash=$1', [hash]))
          .rows[0];
        if (used) {
          await q('UPDATE sessions SET revoked=1 WHERE id=$1', [used.session_id]);
          await writeAudit(
            q,
            { id: 'u-system', role: 'system', ip },
            'REPLAY_REFRESH',
            'sesion',
            used.session_id,
            {},
          );
        }
        return { failure: true };
      }
      const u = await this.user(s.user_id, q);
      if (
        s.revoked ||
        s.expires_at < instant() ||
        Date.now() - Date.parse(s.last_seen) > 15 * 60000 ||
        !u ||
        u.state !== 'Activo' ||
        u.must_change_password ||
        sha256(csrf || '') !== s.csrf_hash
      )
        return { failure: true };
      const next = random(),
        nextCsrf = random();
      await q('INSERT INTO used_refresh_tokens VALUES ($1,$2)', [hash, s.id]);
      await q('UPDATE sessions SET refresh_hash=$1,csrf_hash=$2 WHERE id=$3', [
        sha256(next),
        sha256(nextCsrf),
        s.id,
      ]);
      return this.credentials(u, s.id, next, nextCsrf);
    });
    if (result.failure) throw fail('Sesión inválida o expirada.', 401);
    return result;
  }
  async authenticate(access) {
    let p;
    try {
      p = jwt.verify(access, jwtSecret, {
        algorithms: ['HS256'],
        issuer: 'farmared',
        audience: 'farmared-app',
      });
    } catch {
      throw fail('Inicia sesión para continuar.', 401);
    }
    const s = (
        await this.db.query('SELECT * FROM sessions WHERE id=$1 AND user_id=$2', [p.sid, p.sub])
      ).rows[0],
      u = await this.user(p.sub);
    if (
      !s ||
      s.revoked ||
      s.expires_at < instant() ||
      Date.now() - Date.parse(s.last_seen) > 15 * 60000 ||
      !u ||
      u.state !== 'Activo' ||
      u.must_change_password ||
      u.branch_id !== p.branch_id ||
      u.role !== p.role
    )
      throw fail('Sesión inválida o expirada.', 401);
    return { user: this.publicUser(u), session: s };
  }
  async logout(s, user) {
    await this.db.transaction(async (q) => {
      await q('UPDATE sessions SET revoked=1 WHERE id=$1', [s.id]);
      await writeAudit(q, user, 'LOGOUT', 'sesion', s.id, {});
    });
  }
  async password(user, { current_password, new_password }) {
    if (!passwordValid(new_password))
      throw fail('Contraseña: mínimo 10 caracteres, mayúscula, número y símbolo.');
    const u = await this.user(user.id);
    if (!(await bcrypt.compare(current_password, u.password_hash)))
      throw fail('Contraseña actual incorrecta.', 401);
    if (current_password === new_password) throw fail('Utiliza una contraseña diferente.');
    await this.db.transaction(async (q) => {
      await q('UPDATE users SET password_hash=$1,must_change_password=0 WHERE id=$2', [
        await bcrypt.hash(new_password, 12),
        user.id,
      ]);
      await q('UPDATE sessions SET revoked=1 WHERE user_id=$1', [user.id]);
      await writeAudit(q, user, 'CAMBIAR_CLAVE', 'usuario', user.id, {});
    });
    return { message: 'Contraseña actualizada. Inicia sesión nuevamente.' };
  }
}
export const authentication = new Authentication();
