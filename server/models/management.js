import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../database/db.js';
import { Authentication } from './authentication.js';
import { passwordValid, temporaryPassword } from '../security/passwords.js';
import { writeAudit, verifyRecords } from './audit.js';
import { AppError, ledgerEntry, Pharmacy } from './pharmacy.js';
import { encrypt, decrypt, privateHash } from '../security/crypto.js';
import { scopedBranch, can } from '../security/permissions.js';
import { deliveryEstimate, pickupEstimate } from '../security/delivery.js';
import { businessClock } from '../config.js';
import { recordOrderCost } from './costs.js';
const id = () => randomUUID(),
  now = () => new Date().toISOString();
const clean = (v, label, max = 200) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw new AppError(`${label} no vÃ¡lido.`);
  return v.trim();
};
const num = (v, min = 0, max = 100000000) => {
  if (
    v === '' ||
    v == null ||
    typeof v === 'boolean' ||
    !Number.isFinite(Number(v)) ||
    Number(v) < min ||
    Number(v) > max
  )
    throw new AppError('NÃºmero fuera de rango.');
  return Number(v);
};
const cents = (v) => Math.round(num(v, 0.01, 1000000) * 100);
const date = (v) => {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    Number.isNaN(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw new AppError('Fecha no vÃ¡lida.');
  return v;
};
const redact = (row) =>
  Object.fromEntries(
    Object.entries(row).filter(
      ([k]) =>
        !['password_hash', 'totp_cipher', 'last_totp_step', 'salary_cents', 'cui_cipher'].includes(
          k,
        ),
    ),
  );
export const managePermissions = {
  branches: 'sucursal.gestionar',
  products: 'producto.gestionar',
  employees: 'planilla.pagar',
  assets: 'activo.gestionar',
  clients: 'cliente.gestionar',
  users: 'usuario.gestionar',
  orders: 'pedido.gestionar',
};
const editable = {
  branches: ['name', 'department', 'municipality', 'address', 'type', 'opens_at', 'closes_at'],
  products: ['name', 'sku', 'component', 'category', 'price', 'prescription', 'controlled'],
  employees: ['name', 'position', 'branch_id', 'salary', 'state', 'user_id'],
  assets: ['name', 'branch_id', 'value', 'acquired_on', 'useful_life_months'],
  clients: ['name', 'nit', 'cui', 'phone', 'address', 'lat', 'lng'],
  users: ['name', 'surname', 'dpi', 'phone', 'birth_date', 'address', 'email', 'role_id', 'branch_id'],
  orders: ['branch_id', 'customer', 'phone', 'address', 'lat', 'lng', 'payment'],
};
export class Management {
  constructor(database = db, clock = businessClock) {
    this.db = database;
    this.clock = clock;
    this.auth = new Authentication(database);
  }
  async critical(user, password) {
    const u = await this.auth.user(user.id);
    if (typeof password !== 'string' || !(await bcrypt.compare(password, u.password_hash)))
      throw new AppError('Confirma tu contraseÃ±a para realizar esta operaciÃ³n.', 401);
  }
  async createUser(data, user) {
    return this.db.transaction(async (q) => {
      const role = (await q('SELECT * FROM roles WHERE id=$1', [data.role_id])).rows[0];
      if (!role) throw new AppError('Rol inexistente.');
      const branchId = data.branch_id || null;
      const requiresBranch = role.scope === 'branch' || role.code === 'callcenter';
      if (requiresBranch && !branchId)
        throw new AppError('Asigna una sucursal a esta cuenta.');
      if (
        branchId &&
        !(await q("SELECT id FROM branches WHERE id=$1 AND active=1 AND state='Activo'", [branchId]))
          .rows.length
      )
        throw new AppError('La sucursal asignada no está activa.');
      const key = id();
      const clean = (value) =>
        String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '.')
          .replace(/^\.|\.$/g, '');
      const base = clean(`${data.name}.${data.surname}`) || `usuario.${key.slice(0, 6)}`;
      let email = data.email?.trim().toLowerCase() || `${base}@farmacali.com`;
      let suffix = 1;
      while ((await q('SELECT id FROM users WHERE email=$1', [email])).rows.length)
        email = `${base}${suffix++}@farmacali.com`;
      const generatedPassword = data.password || temporaryPassword();
      if (!passwordValid(generatedPassword))
        throw new AppError(
          'La contraseña temporal requiere 10 caracteres, mayúscula, número y símbolo.',
        );
      await q(
        'INSERT INTO users (id,name,surname,dpi,phone,birth_date,address,position,email,password_hash,role,role_id,branch_id,must_change_password) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
        [
          key,
          data.name,
          data.surname,
          data.dpi,
          data.phone,
          data.birth_date,
          data.address,
          role.name,
          email,
          await bcrypt.hash(generatedPassword, 12),
          role.code === 'admin' ? 'admin' : role.code === 'auditor' ? 'auditor' : 'operator',
          role.id,
          branchId,
          1,
        ],
      );
      await writeAudit(q, user, 'CREAR', 'usuario', key, { email, role: role.code });
      return { id: key, credentials: { email, password: generatedPassword } };
    });
  }

  async roleMfa(key, data, user) {
    if (!user.permissions.includes('usuario.gestionar'))
      throw new AppError('No tienes permiso.', 403);
    await this.critical(user, data.password);
    if (typeof data.enabled !== 'boolean') throw new AppError('Selecciona el requisito MFA.');
    const reason = clean(data.reason, 'Motivo', 500);
    return this.db.transaction(async (q) => {
      const role = (await q('SELECT * FROM roles WHERE id=$1', [key])).rows[0];
      if (!role) throw new AppError('Rol no encontrado.', 404);
      await q('UPDATE roles SET require_totp=$1 WHERE id=$2', [data.enabled ? 1 : 0, key]);
      await q(
        'UPDATE sessions SET revoked=1 WHERE user_id IN (SELECT id FROM users WHERE role_id=$1)',
        [key],
      );
      await writeAudit(q, user, 'CONFIGURAR_MFA', 'rol', key, { enabled: data.enabled, reason });
      return { id: key };
    });
  }
  async createRole(data, user) {
    return this.db.transaction(async (q) => {
      const valid = new Set((await q('SELECT code FROM permissions')).rows.map((p) => p.code));
      if (!data.permissions.includes('resumen.ver'))
        throw new AppError('Todo rol debe tener permiso para ingresar al resumen.');
      if (data.permissions.some((p) => !valid.has(p))) throw new AppError('Permiso desconocido.');
      const key = id();
      await q('INSERT INTO roles (id,code,name,scope,require_totp) VALUES ($1,$2,$3,$4,$5)', [
        key,
        data.code,
        data.name,
        data.scope,
        data.require_totp ? 1 : 0,
      ]);
      for (const p of [...new Set(data.permissions)])
        await q('INSERT INTO role_permissions VALUES ($1,$2)', [key, p]);
      await writeAudit(q, user, 'CREAR', 'rol', key, { ...data });
      return { id: key };
    });
  }
  async client(data, user) {
    return this.db.transaction(async (q) => {
      const key = id();
      if (
        data.cui &&
        (
          await q('SELECT client_id FROM portal_clients WHERE dpi_hash=$1', [
            privateHash(`dpi:${data.cui}`),
          ])
        ).rows.length
      )
        throw new AppError(
          'Ya existe un cliente con ese DPI. Busca su registro para continuar.',
          409,
        );
      await q(
        'INSERT INTO clients (id,name,nit,cui_cipher,phone,address,lat,lng) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          key,
          data.name,
          data.nit || 'CF',
          data.cui ? encrypt(data.cui) : null,
          data.phone,
          data.address,
          data.lat,
          data.lng,
        ],
      );
      if (data.cui)
        await q('INSERT INTO portal_clients VALUES ($1,$2)', [privateHash(`dpi:${data.cui}`), key]);
      await q('INSERT INTO client_addresses VALUES ($1,$2,$3,$4,$5,$6)', [
        id(),
        key,
        'Principal',
        data.address,
        data.lat,
        data.lng,
      ]);
      await writeAudit(q, user, 'CREAR', 'cliente', key, { name: data.name, nit: data.nit });
      return { id: key };
    });
  }
  async prescription(data, user) {
    if (date(data.issued_on) > now().slice(0, 10))
      throw new AppError('La receta no puede tener una fecha futura.');
    return this.db.transaction(async (q) => {
      const key = id();
      await q('INSERT INTO prescriptions VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
        key,
        data.customer_name,
        data.doctor,
        data.license,
        data.issued_on,
        data.product_id,
        data.notes || '',
        user.id,
        now(),
      ]);
      await writeAudit(q, user, 'CREAR', 'receta', key, {
        doctor: data.doctor,
        product_id: data.product_id,
      });
      return { id: key };
    });
  }
  async edit(entity, key, data, user) {
    if (!editable[entity]) throw new AppError('Entidad no vÃ¡lida.', 404);
    const action = data.values.action || 'update';
    if (['deactivate', 'reset_password', 'reset_mfa', 'void'].includes(action))
      await this.critical(user, data.password);
    return this.db.transaction(async (q) => {
      const before = (await q(`SELECT * FROM ${entity} WHERE id=$1`, [key])).rows[0];
      if (!before) throw new AppError('Registro no encontrado.', 404);
      if (
        user.scope === 'branch' &&
        data.values.branch_id &&
        data.values.branch_id !== user.branch_id
      )
        throw new AppError('No puedes mover registros a otra sucursal.', 403);
      if (
        user.scope === 'branch' &&
        !(
          (entity === 'products' && can(user, 'producto.gestionar')) ||
          (['assets', 'orders'].includes(entity) && before.branch_id === user.branch_id)
        )
      )
        throw new AppError('Esta modificaciÃ³n requiere administraciÃ³n central.', 403);
      if (entity === 'users' && key === 'u-system')
        throw new AppError('El usuario de sistema estÃ¡ protegido.');
      const updates = {};
      if (action === 'deactivate') {
        if (entity === 'users' && key === user.id)
          throw new AppError('No puedes desactivar tu propia cuenta.');
        if (entity === 'orders')
          throw new AppError('Cancela los pedidos mediante su flujo de estados.');
        if (entity === 'branches') {
          const stocks = Number(
              (
                await q('SELECT COALESCE(SUM(quantity),0) AS n FROM inventory WHERE branch_id=$1', [
                  key,
                ])
              ).rows[0].n,
            ),
            pending = (
              await q(
                "SELECT id FROM orders WHERE branch_id=$1 AND status IN ('Pendiente','Preparando','En ruta','Listo para recoger')",
                [key],
              )
            ).rows.length,
            inTransit = (
              await q(
                "SELECT id FROM transfers WHERE (source_id=$1 OR destination_id=$1) AND status='En trÃ¡nsito'",
                [key],
              )
            ).rows.length,
            shifts = (
              await q("SELECT id FROM cash_shifts WHERE branch_id=$1 AND state='Abierto'", [key])
            ).rows.length;
          if (stocks || pending || inTransit || shifts)
            throw new AppError(
              'No se puede cerrar: hay existencias, pedidos, traslados o turnos abiertos.',
            );
          updates.active = 0;
        }
        updates[entity === 'assets' ? 'status' : 'state'] =
          entity === 'employees' ? 'Retirado' : 'Inactivo';
        updates.deactivated_at = now();
        updates.deactivated_by = user.id;
        updates.deactivation_reason = data.reason;
        if (entity === 'employees') updates.active = 0;
      } else if (action === 'activate') {
        if (['branches', 'employees'].includes(entity)) updates.active = 1;
        updates[entity === 'assets' ? 'status' : 'state'] = 'Activo';
        updates.deactivated_at = null;
        updates.deactivated_by = null;
        updates.deactivation_reason = null;
      } else if (action === 'reset_password') {
        if (entity !== 'users') throw new AppError('AcciÃ³n no vÃ¡lida.');
        if (!passwordValid(data.values.password))
          throw new AppError('ContraseÃ±a temporal no vÃ¡lida.');
        updates.password_hash = await bcrypt.hash(data.values.password, 12);
        updates.must_change_password = 1;
        updates.failed_attempts = 0;
        updates.locked_until = null;
      } else if (action === 'reset_mfa') {
        if (entity !== 'users') throw new AppError('AcciÃƒÂ³n no vÃƒÂ¡lida.');
        updates.totp_cipher = null;
        updates.totp_enabled = 0;
        updates.last_totp_step = -1;
        updates.failed_attempts = 0;
        updates.locked_until = null;
        await q('UPDATE sessions SET revoked=1 WHERE user_id=$1', [key]);
      } else if (action === 'revoke_sessions') {
        if (entity !== 'users') throw new AppError('AcciÃ³n no vÃ¡lida.');
      } else if (action === 'update') {
        for (const [field, value] of Object.entries(data.values)) {
          if (field === 'action') continue;
          if (!editable[entity].includes(field))
            throw new AppError(`No se permite editar ${field}.`);
          if (field === 'salary') {
            updates.salary_cipher = encrypt(cents(value));
            updates.salary_cents = 1;
            await q('INSERT INTO salary_history VALUES ($1,$2,$3,$4,$5,$6)', [
              id(),
              key,
              updates.salary_cipher,
              data.reason,
              now(),
              user.id,
            ]);
          } else if (field === 'cui') {
            if (value && !/^\d{13}$/.test(value)) throw new AppError('CUI: 13 dÃ­gitos.');
            updates.cui_cipher = value ? encrypt(value) : null;
          } else if (field === 'price' || field === 'value')
            updates[field === 'price' ? 'price_cents' : 'value_cents'] = cents(value);
          else if (['lat', 'lng'].includes(field))
            updates[field] = num(value, field === 'lat' ? 13 : -93, field === 'lat' ? 18.5 : -88);
          else if (field === 'useful_life_months') {
            updates[field] = num(value, 1, 600);
            if (!Number.isInteger(updates[field]))
              throw new AppError('Vida Ãºtil en meses enteros.');
          } else if (['controlled', 'prescription'].includes(field))
            updates[field] = value === true ? 1 : 0;
          else if (['branch_id', 'user_id'].includes(field)) updates[field] = value || null;
          else if (field === 'acquired_on') updates[field] = date(value);
          else if (['opens_at', 'closes_at'].includes(field)) {
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new AppError('Horario no vÃ¡lido.');
            updates[field] = value;
          } else updates[field] = clean(value, field, field === 'name' ? 100 : 200);
        }
        if (entity === 'employees' && updates.state) {
          if (!['Activo', 'Suspendido', 'Retirado'].includes(updates.state))
            throw new AppError('Estado de empleado no vÃ¡lido.');
          updates.active = updates.state === 'Activo' ? 1 : 0;
        }
        if (entity === 'users') {
          if (updates.email) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email))
              throw new AppError('Correo no vÃ¡lido.');
            updates.email = updates.email.toLowerCase();
          }
          const role = (
            await q('SELECT * FROM roles WHERE id=$1', [updates.role_id || before.role_id])
          ).rows[0];
          if (!role) throw new AppError('Rol no vÃ¡lido.');
          const branchId = Object.hasOwn(updates, 'branch_id')
              ? updates.branch_id
              : before.branch_id || null,
            requiresBranch = role.scope === 'branch' || role.code === 'callcenter';
          if (requiresBranch && !branchId)
            throw new AppError('Asigna una sucursal a esta cuenta.');
          if (
            branchId &&
            !(await q(
              "SELECT id FROM branches WHERE id=$1 AND active=1 AND state='Activo'",
              [branchId],
            )).rows.length
          )
            throw new AppError('La sucursal asignada no está activa.');
          updates.branch_id = branchId;
          updates.role =
            role.code === 'admin' ? 'admin' : role.code === 'auditor' ? 'auditor' : 'operator';
          updates.position = role.name;
          if (key === user.id && updates.role_id && updates.role_id !== before.role_id)
            throw new AppError('No cambies tu propio rol; utiliza otro administrador.');
        }
        if (entity === 'products' && updates.controlled) updates.prescription = 1;
        if (entity === 'orders') {
          if (before.status !== 'Pendiente' || before.channel === 'mostrador')
            throw new AppError('Solo se puede editar o reasignar antes de iniciar la preparaciÃ³n.');
          const target = { ...before, ...updates };
          const branch = (
            await q('SELECT * FROM branches WHERE id=$1 AND active=1', [target.branch_id])
          ).rows[0];
          if (!branch) throw new AppError('Sucursal cerrada o inexistente.');
          const { distance } = await import('./pharmacy.js');
          const queued = Number(
            (
              await q(
                "SELECT COUNT(*) AS n FROM orders WHERE branch_id=$1 AND id<>$2 AND status IN ('Pendiente','Preparando','En ruta')",
                [branch.id, key],
              )
            ).rows[0].n,
          );
          const estimate =
            before.fulfillment === 'pickup'
              ? { ...pickupEstimate(branch, queued, this.clock()), serviceable: true }
              : deliveryEstimate(
                  branch,
                  distance(target.lat, target.lng, branch.lat, branch.lng),
                  queued,
                  this.clock(),
                );
          if (!estimate.serviceable) throw new AppError(estimate.unavailable_reason);
          if (updates.phone && !/^[+\d\s()-]{8,25}$/.test(updates.phone))
            throw new AppError('TelÃ©fono no vÃ¡lido.');
          if (
            updates.payment &&
            !['Efectivo', 'Tarjeta', 'Transferencia'].includes(updates.payment)
          )
            throw new AppError('Forma de pago no vÃ¡lida.');
          if (updates.branch_id && updates.branch_id !== before.branch_id)
            await this.reassign(q, target, updates.branch_id, user);
          updates.eta_minutes = estimate.eta_minutes;
          if (before.fulfillment === 'pickup') {
            updates.lat = branch.lat;
            updates.lng = branch.lng;
            updates.address = `Retiro en ${branch.name}`;
          }
          if (before.channel === 'portal')
            await q('UPDATE portal_orders SET ready_estimate=$1 WHERE order_id=$2', [
              new Date(Date.now() + estimate.eta_minutes * 60000).toISOString(),
              key,
            ]);
        }
      } else throw new AppError('AcciÃ³n no vÃ¡lida.');
      if (
        entity === 'users' &&
        (action === 'deactivate' || (updates.role_id && updates.role_id !== before.role_id)) &&
        before.role_id === 'r-admin'
      ) {
        const others = (
          await q("SELECT id FROM users WHERE role_id='r-admin' AND state='Activo' AND id<>$1", [
            key,
          ])
        ).rows.length;
        if (!others) throw new AppError('Debe existir al menos un administrador activo.');
      }
      if (Object.keys(updates).length) {
        const fields = Object.keys(updates);
        await q(
          `UPDATE ${entity} SET ${fields.map((f, i) => `${f}=$${i + 1}`).join(',')} WHERE id=$${fields.length + 1}`,
          [...fields.map((f) => updates[f]), key],
        );
      }
      if (entity === 'users') await q('UPDATE sessions SET revoked=1 WHERE user_id=$1', [key]);
      if (entity === 'clients' && Object.hasOwn(updates, 'cui_cipher')) {
        await q('DELETE FROM portal_clients WHERE client_id=$1', [key]);
        if (updates.cui_cipher)
          await q('INSERT INTO portal_clients VALUES ($1,$2)', [
            privateHash(`dpi:${decrypt(updates.cui_cipher)}`),
            key,
          ]);
      }
      const after = (await q(`SELECT * FROM ${entity} WHERE id=$1`, [key])).rows[0];
      await q('INSERT INTO entity_history VALUES ($1,$2,$3,$4,$5,$6,$7)', [
        id(),
        entity,
        key,
        action,
        JSON.stringify({ reason: data.reason, before: redact(before), after: redact(after) }),
        now(),
        user.id,
      ]);
      await writeAudit(
        q,
        user,
        action.toUpperCase(),
        entity,
        key,
        { reason: data.reason },
        redact(before),
        redact(after),
      );
      return { id: key };
    });
  }
  async reassign(q, order, branchId, user) {
    const items = (await q('SELECT * FROM order_items WHERE order_id=$1', [order.id])).rows;
    if (!items.length) throw new AppError('Pedido sin lÃ­neas.');
    const branch = (await q('SELECT * FROM branches WHERE id=$1 AND active=1', [branchId])).rows[0];
    if (!branch) throw new AppError('Sucursal cerrada o inexistente.');
    const { distance } = await import('./pharmacy.js');
    if (
      order.fulfillment !== 'pickup' &&
      distance(order.lat, order.lng, branch.lat, branch.lng) > 30
    )
      throw new AppError('La nueva sucursal estÃ¡ fuera de cobertura.');
    for (const item of items) {
      const old = (await q('SELECT * FROM inventory WHERE id=$1', [item.inventory_id])).rows[0];
      await q('UPDATE inventory SET quantity=quantity+$1 WHERE id=$2', [item.quantity, old.id]);
      await ledgerEntry(q, user, old, item.quantity, 'LIBERAR_RESERVA', order.id, 'ReasignaciÃ³n');
    }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(
      new Date(),
    );
    const groups = [];
    for (const item of items) {
      const prior = groups.find(
        (g) => g.product_id === item.product_id && g.unit_price_cents === item.unit_price_cents,
      );
      if (prior) prior.quantity += item.quantity;
      else groups.push({ ...item });
    }
    await q('DELETE FROM order_items WHERE order_id=$1', [order.id]);
    for (const group of groups) {
      const qty = group.quantity,
        p = group.product_id;
      const stocks = (
        await q(
          'SELECT * FROM inventory WHERE branch_id=$1 AND product_id=$2 AND expires_on>$3 AND quantity>0 ORDER BY expires_on' +
            (this.db.cloud ? ' FOR UPDATE' : ''),
          [branchId, p, today],
        )
      ).rows;
      if (stocks.reduce((s, i) => s + i.quantity, 0) < qty)
        throw new AppError('La nueva sucursal no tiene stock suficiente.');
      let left = qty;
      for (const s of stocks) {
        const take = Math.min(left, s.quantity);
        if (!take) continue;
        await q('UPDATE inventory SET quantity=quantity-$1 WHERE id=$2 AND quantity>=$1', [
          take,
          s.id,
        ]);
        const itemKey = id();
        await q('INSERT INTO order_items VALUES ($1,$2,$3,$4,$5,$6)', [
          itemKey,
          order.id,
          s.id,
          p,
          take,
          group.unit_price_cents,
        ]);
        await recordOrderCost(q, itemKey, s.id);
        await ledgerEntry(q, user, s, -take, 'RESERVA', order.id, 'ReasignaciÃ³n');
        left -= take;
      }
    }
  }
  async request(data, user) {
    return this.db.transaction(async (q) => {
      const key = id(),
        table = {
          sale_void: 'orders',
          cash_void: 'cash_movements',
          stock_adjust: 'inventory',
          payroll_void: 'payroll',
        }[data.type];
      const row = (await q(`SELECT * FROM ${table} WHERE id=$1`, [data.entity_id])).rows[0];
      if (!row) throw new AppError('Registro no encontrado.', 404);
      if (user.scope === 'branch' && row.branch_id !== user.branch_id)
        throw new AppError('Registro de otra sucursal.', 403);
      if (data.type === 'stock_adjust' && (!Number.isInteger(data.quantity) || data.quantity === 0))
        throw new AppError('El ajuste debe ser una cantidad entera distinta de cero.');
      await q(
        'INSERT INTO requests (id,type,entity_id,payload,requester_id,reason,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [
          key,
          data.type,
          data.entity_id,
          JSON.stringify({ quantity: data.quantity }),
          user.id,
          data.reason,
          now(),
        ],
      );
      await writeAudit(q, user, 'SOLICITAR', data.type, key, {
        reason: data.reason,
        entity_id: data.entity_id,
      });
      return { id: key };
    });
  }
  async decision(key, data, user) {
    await this.critical(user, data.password);
    return this.db.transaction(async (q) => {
      const r = (await q('SELECT * FROM requests WHERE id=$1', [key])).rows[0];
      if (!r || r.status !== 'Pendiente')
        throw new AppError('Solicitud inexistente o ya resuelta.', 409);
      if (user.scope === 'branch') {
        const table = {
          sale_void: 'orders',
          cash_void: 'cash_movements',
          stock_adjust: 'inventory',
          payroll_void: 'payroll',
        }[r.type];
        const target = (await q(`SELECT branch_id FROM ${table} WHERE id=$1`, [r.entity_id]))
          .rows[0];
        if (!target || target.branch_id !== user.branch_id)
          throw new AppError('Solicitud de otra sucursal.', 403);
      }
      if (r.requester_id === user.id)
        throw new AppError('Nadie puede aprobar o rechazar su propia solicitud.', 403);
      if (data.approve) {
        const payload = JSON.parse(r.payload);
        if (r.type === 'stock_adjust') {
          const s = (
            await q('SELECT * FROM inventory WHERE id=$1' + (this.db.cloud ? ' FOR UPDATE' : ''), [
              r.entity_id,
            ])
          ).rows[0];
          if (s.quantity + payload.quantity < 0)
            throw new AppError('El ajuste dejarÃ­a inventario negativo.');
          await q('UPDATE inventory SET quantity=quantity+$1 WHERE id=$2', [
            payload.quantity,
            s.id,
          ]);
          await ledgerEntry(q, user, s, payload.quantity, 'AJUSTE', r.id, r.reason);
        } else await this.reverse(q, r, user);
      }
      await q(
        'UPDATE requests SET status=$1,approver_id=$2,decision_reason=$3,resolved_at=$4 WHERE id=$5',
        [data.approve ? 'Aprobada' : 'Rechazada', user.id, data.reason, now(), key],
      );
      await writeAudit(q, user, data.approve ? 'APROBAR' : 'RECHAZAR', 'solicitud', key, {
        type: r.type,
        reason: r.reason,
        decision: data.reason,
      });
      return { id: key };
    });
  }
  async reverse(q, request, user) {
    const type = request.type,
      entity = { sale_void: 'orders', cash_void: 'cash_movements', payroll_void: 'payroll' }[type];
    if (
      (await q('SELECT id FROM voided_records WHERE entity_id=$1', [request.entity_id])).rows.length
    )
      throw new AppError('El registro ya fue anulado.', 409);
    const row = (await q(`SELECT * FROM ${entity} WHERE id=$1`, [request.entity_id])).rows[0];
    if (!row) throw new AppError('Registro no encontrado.');
    let branch, amount, kind, method;
    if (type === 'sale_void') {
      if (row.status !== 'Entregado' || row.channel !== 'mostrador')
        throw new AppError('Solo se anulan ventas de mostrador entregadas.');
      for (const item of (await q('SELECT * FROM order_items WHERE order_id=$1', [row.id])).rows) {
        const s = (await q('SELECT * FROM inventory WHERE id=$1', [item.inventory_id])).rows[0];
        await q('UPDATE inventory SET quantity=quantity+$1 WHERE id=$2', [item.quantity, s.id]);
        await ledgerEntry(q, user, s, item.quantity, 'ANULACION_VENTA', row.id, request.reason);
      }
      await q("UPDATE orders SET status='Cancelado' WHERE id=$1", [row.id]);
      branch = row.branch_id;
      amount = row.total_cents;
      kind = 'Egreso';
      method = row.payment;
    } else if (type === 'cash_void') {
      if (
        [
          'Planilla',
          'Venta en mostrador',
          'Entrega a domicilio',
          'Contra-asiento',
          'Diferencia de caja',
        ].includes(row.category)
      )
        throw new AppError('Usa la anulaciÃ³n del documento de origen para este movimiento.');
      branch = row.branch_id;
      amount = row.amount_cents;
      kind = row.kind === 'Ingreso' ? 'Egreso' : 'Ingreso';
      method = row.method;
    } else {
      if (row.state !== 'Pagado') throw new AppError('El pago ya fue anulado.');
      branch = row.branch_id;
      amount = row.net_cents;
      kind = 'Ingreso';
      method = 'Transferencia';
      await q("UPDATE payroll SET state='Anulado' WHERE id=$1", [row.id]);
      await q('INSERT INTO entity_history VALUES ($1,$2,$3,$4,$5,$6,$7)', [
        id(),
        'payroll',
        row.id,
        'ANULADO',
        JSON.stringify({ payment: row, reason: request.reason }),
        now(),
        user.id,
      ]);
    }
    await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
      id(),
      branch,
      kind,
      'Contra-asiento',
      amount,
      method,
      `AnulaciÃ³n ${type} ${row.id.slice(0, 8)} Â· ${request.reason}`,
      now(),
      user.id,
    ]);
    await q('INSERT INTO voided_records VALUES ($1,$2,$3,$4,$5,$6)', [
      id(),
      entity,
      row.id,
      request.reason,
      now(),
      user.id,
    ]);
    await writeAudit(q, user, 'ANULAR', entity, row.id, { reason: request.reason }, redact(row), {
      anulado: true,
    });
  }
  async openShift(data, user) {
    return this.db.transaction(async (q) => {
      const branch = scopedBranch(user, data.branch_id);
      if (!branch) throw new AppError('Selecciona sucursal.');
      if (
        (await q("SELECT id FROM cash_shifts WHERE branch_id=$1 AND state='Abierto'", [branch]))
          .rows.length
      )
        throw new AppError('Ya existe un turno abierto en esa sucursal.', 409);
      const key = id();
      await q(
        'INSERT INTO cash_shifts (id,branch_id,user_id,opening_cents,opened_at,notes) VALUES ($1,$2,$3,$4,$5,$6)',
        [key, branch, user.id, Math.round(data.opening * 100), now(), data.notes || ''],
      );
      await writeAudit(q, user, 'ABRIR', 'turno', key, {
        branch_id: branch,
        opening: data.opening,
      });
      return { id: key };
    });
  }
  async closeShift(key, data, user) {
    return this.db.transaction(async (q) => {
      const s = (await q('SELECT * FROM cash_shifts WHERE id=$1', [key])).rows[0];
      if (!s || s.state !== 'Abierto') throw new AppError('Turno ya cerrado o inexistente.', 409);
      if (user.scope === 'branch' && s.branch_id !== user.branch_id)
        throw new AppError('Turno de otra sucursal.', 403);
      const rows = (
        await q(
          "SELECT * FROM cash_movements WHERE branch_id=$1 AND created_at>=$2 AND method='Efectivo'",
          [s.branch_id, s.opened_at],
        )
      ).rows;
      const expected =
          s.opening_cents +
          rows.reduce((n, c) => n + (c.kind === 'Ingreso' ? c.amount_cents : -c.amount_cents), 0),
        counted = Math.round(data.counted * 100),
        difference = counted - expected;
      if (difference && !data.notes) throw new AppError('Explica el faltante o sobrante de caja.');
      await q(
        "UPDATE cash_shifts SET closed_at=$1,expected_cents=$2,counted_cents=$3,difference_cents=$4,state='Cerrado',notes=$5 WHERE id=$6",
        [now(), expected, counted, difference, data.notes || '', key],
      );
      if (difference)
        await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
          id(),
          s.branch_id,
          difference > 0 ? 'Ingreso' : 'Egreso',
          'Diferencia de caja',
          Math.abs(difference),
          'Efectivo',
          data.notes,
          now(),
          user.id,
        ]);
      await writeAudit(q, user, 'CERRAR', 'turno', key, {
        branch_id: s.branch_id,
        expected_cents: expected,
        counted_cents: counted,
        difference_cents: difference,
      });
      return { id: key, expected_cents: expected, difference_cents: difference };
    });
  }
  async integrity() {
    return this.db.transaction(async (q) => {
      const records = (await q('SELECT * FROM audit_log ORDER BY sequence')).rows,
        head = (await q("SELECT * FROM audit_head WHERE id='main'")).rows[0];
      return verifyRecords(records, head);
    });
  }
  async simulation(user) {
    return this.db.transaction(async (q) => {
      const records = (await q('SELECT * FROM audit_log ORDER BY sequence')).rows,
        head = (await q("SELECT * FROM audit_head WHERE id='main'")).rows[0];
      const before = verifyRecords(records, head),
        copy = structuredClone(records);
      if (!copy.length) throw new AppError('Registra una operaciÃ³n antes de simular.');
      copy[Math.floor(copy.length / 2)].details = '{"alterado":true}';
      const changed = verifyRecords(copy, head);
      await writeAudit(q, user, 'SIMULAR_INTEGRIDAD', 'auditoria', 'copia', {
        original_valid: before.valid,
        simulation_valid: changed.valid,
      });
      return {
        original: before,
        simulation: changed,
        note: 'AlteraciÃ³n de una copia en memoria. La bitÃ¡cora real no se modifica.',
      };
    });
  }
  async depreciation(key, data, user) {
    return this.db.transaction(async (q) => {
      const asset = (await q("SELECT * FROM assets WHERE id=$1 AND status='Activo'", [key]))
        .rows[0];
      if (!asset) throw new AppError('Activo inexistente o dado de baja.');
      const period = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Guatemala',
        year: 'numeric',
        month: '2-digit',
      })
        .format(new Date())
        .slice(0, 7);
      if (
        (
          await q('SELECT id FROM asset_depreciation WHERE asset_id=$1 AND period=$2', [
            key,
            period,
          ])
        ).rows.length
      )
        throw new AppError('El valor de este mes ya fue registrado.', 409);
      const [y, m] = period.split('-').map(Number),
        [ay, am] = asset.acquired_on.split('-').map(Number),
        months = Math.max(0, (y - ay) * 12 + m - am);
      const depreciation = Math.min(
          asset.value_cents,
          Math.round((asset.value_cents / asset.useful_life_months) * months),
        ),
        net = asset.value_cents - depreciation;
      const record = id();
      await q('INSERT INTO asset_depreciation VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
        record,
        key,
        period,
        asset.value_cents,
        depreciation,
        net,
        now(),
        user.id,
      ]);
      await writeAudit(q, user, 'REGISTRAR_DEPRECIACION', 'activo', key, {
        period,
        original_cents: asset.value_cents,
        depreciation_cents: depreciation,
        net_cents: net,
        reason: data.reason,
      });
      return { id: record, period, net_cents: net };
    });
  }
  async draft(data, user) {
    return this.db.transaction(async (q) => {
      const stock = (await q('SELECT * FROM inventory WHERE id=$1', [data.inventory_id])).rows[0];
      if (!stock) throw new AppError('Lote no encontrado.');
      if (user.scope === 'branch' && stock.branch_id !== user.branch_id)
        throw new AppError('Lote de otra sucursal.', 403);
      if (stock.branch_id === data.destination_id)
        throw new AppError('El destino debe ser otra sucursal.');
      const key = id();
      await q(
        'INSERT INTO transfer_drafts (id,inventory_id,destination_id,quantity,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [key, stock.id, data.destination_id, data.quantity, user.id, now()],
      );
      await writeAudit(q, user, 'CREAR_BORRADOR', 'traslado', key, { ...data });
      return { id: key };
    });
  }
  async draftAction(key, data, user) {
    return this.db.transaction(async (q) => {
      const draft = (await q('SELECT * FROM transfer_drafts WHERE id=$1', [key])).rows[0];
      if (!draft || draft.state !== 'Borrador')
        throw new AppError('El traslado ya se despachÃ³ o cancelÃ³.', 409);
      const stock = (
        await q('SELECT * FROM inventory WHERE id=$1' + (this.db.cloud ? ' FOR UPDATE' : ''), [
          draft.inventory_id,
        ])
      ).rows[0];
      if (user.scope === 'branch' && stock.branch_id !== user.branch_id)
        throw new AppError('Lote de otra sucursal.', 403);
      if (data.action === 'cancel') {
        await q("UPDATE transfer_drafts SET state='Cancelado',reason=$1 WHERE id=$2", [
          data.reason,
          key,
        ]);
        await writeAudit(q, user, 'CANCELAR_BORRADOR', 'traslado', key, { reason: data.reason });
        return { id: key };
      }
      const destination = (
        await q('SELECT * FROM branches WHERE id=$1 AND active=1', [draft.destination_id])
      ).rows[0];
      if (!destination) throw new AppError('Destino cerrado.');
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(
        new Date(),
      );
      if (stock.expires_on <= day) throw new AppError('El lote estÃ¡ vencido.');
      if (
        !(
          await q('UPDATE inventory SET quantity=quantity-$1 WHERE id=$2 AND quantity>=$1', [
            draft.quantity,
            stock.id,
          ])
        ).rowCount
      )
        throw new AppError('Stock insuficiente.', 409);
      const transferId = id();
      await q(
        'INSERT INTO transfers (id,source_id,destination_id,product_id,lot,expires_on,quantity,status,created_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          transferId,
          stock.branch_id,
          destination.id,
          stock.product_id,
          stock.lot,
          stock.expires_on,
          draft.quantity,
          'En trÃ¡nsito',
          now(),
          user.id,
        ],
      );
      await q("UPDATE transfer_drafts SET state='Despachado' WHERE id=$1", [key]);
      await ledgerEntry(
        q,
        user,
        stock,
        -draft.quantity,
        'TRASLADO_SALIDA',
        transferId,
        'Despacho de borrador',
      );
      await writeAudit(q, user, 'DESPACHAR', 'traslado', transferId, {
        draft_id: key,
        quantity: draft.quantity,
      });
      return { id: transferId };
    });
  }
  async addAddress(key, data, user) {
    return this.db.transaction(async (q) => {
      if (!(await q("SELECT id FROM clients WHERE id=$1 AND state='Activo'", [key])).rows.length)
        throw new AppError('Cliente inexistente o inactivo.');
      const addressId = id();
      await q('INSERT INTO client_addresses VALUES ($1,$2,$3,$4,$5,$6)', [
        addressId,
        key,
        data.label,
        data.address,
        data.lat,
        data.lng,
      ]);
      await writeAudit(q, user, 'AGREGAR_DIRECCION', 'cliente', key, {
        address_id: addressId,
        label: data.label,
      });
      return { id: addressId };
    });
  }
  async risk(user) {
    const data = await new Pharmacy(this.db).snapshot(user);
    return data.branches.map((b) => {
      const shifts = data.shifts.filter((s) => s.branch_id === b.id && s.difference_cents < 0),
        adjustments = data.ledger.filter((k) => k.branch_id === b.id && k.type === 'AJUSTE');
      const nowDate = Date.now() - 30 * 86400000,
        recent = adjustments.filter((a) => Date.parse(a.created_at) > nowDate);
      const counts = {};
      recent.forEach((a) => {
        const requester =
          data.requests.find((r) => r.id === a.reference_id)?.requester_id || a.user_id;
        counts[requester] = (counts[requester] || 0) + 1;
      });
      const repeated = Object.values(counts).some((n) => n >= 3);
      const differences = data.transfers.filter(
        (t) =>
          t.destination_id === b.id &&
          t.received_quantity !== null &&
          t.received_quantity < t.quantity,
      ).length;
      const outside = data.orders
        .filter((o) => o.branch_id === b.id && o.channel === 'mostrador')
        .filter((o) => {
          const h = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/Guatemala',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(new Date(o.created_at));
          return h < b.opens_at || h >= b.closes_at;
        }).length;
      const discounts = data.orders.filter(
        (o) => o.branch_id === b.id && o.status === 'Entregado' && o.discount_percent >= 15,
      ).length;
      const points =
        discounts * 2 + shifts.length * 2 + (repeated ? 3 : 0) + differences * 2 + outside;
      return {
        ...b,
        risk: points >= 6 ? 'rojo' : points >= 2 ? 'ambar' : 'verde',
        points,
        reasons: [
          `${discounts} ventas con descuento de 15% o mÃ¡s`,
          `${shifts.length} cierres con faltante`,
          `${recent.length} ajustes en 30 dÃ­as${repeated ? ' Â· usuario repetido' : ''}`,
          `${differences} recepciones con diferencia`,
          `${outside} ventas fuera de horario`,
        ],
      };
    });
  }
}
export const management = new Management();
