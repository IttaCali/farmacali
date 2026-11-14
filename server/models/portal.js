import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '../database/db.js';
import { Pharmacy, AppError, distance } from './pharmacy.js';
import { encrypt, decrypt, sha256, privateHash, legacyPrivateHash } from '../security/crypto.js';
import { writeAudit } from './audit.js';
import QRCode from 'qrcode';
import { businessClock } from '../config.js';
import { deliveryEstimate, pickupEstimate } from '../security/delivery.js';
import { phoneNumber, dpi as optionalDpi, portalContactKey } from '../security/contact.js';

export class Portal {
  constructor(database = db, clock = businessClock) {
    this.db = database;
    this.clock = clock;
    this.pharmacy = new Pharmacy(database, clock);
  }
  async checkCancellationBlock(q, data) {
    const phoneHash = privateHash('phone:' + phoneNumber(data.phone));
    const dpiHash = data.dpi ? privateHash('dpi:' + optionalDpi(data.dpi)) : null;
    const count = Number(
      (
        await q(
          'SELECT COUNT(*) AS n FROM portal_cancellations WHERE phone_hash=$1' +
            (dpiHash ? ' OR dpi_hash=$2' : ''),
          dpiHash ? [phoneHash, dpiHash] : [phoneHash],
        )
      ).rows[0].n,
    );
    if (count > 5)
      throw new AppError(
        'No puedes realizar nuevos pedidos por cancelaciones repetidas. Comunícate con la sucursal para revisar tu caso.',
        403,
      );
  }
  async cancel(data) {
    await this.lookup(data);
    return this.db.transaction(async (q) => {
      const o = (
        await q(
          'SELECT o.*,po.access_hash FROM orders o JOIN portal_orders po ON po.order_id=o.id WHERE po.ticket=$1' +
            (this.db.cloud ? ' FOR UPDATE OF o' : ''),
          [data.ticket.toUpperCase()],
        )
      ).rows[0];
      if (!o || o.access_hash !== sha256(data.access_code))
        throw new AppError('Ticket o código incorrecto.', 403);
      if (o.status === 'Cancelado') return { status: 'Cancelado' };
      if (!['Pendiente', 'Preparando'].includes(o.status))
        throw new AppError('El pedido ya está listo o en reparto. Contacta a la sucursal.', 409);
      const reason = String(data.reason || '').trim();
      if (!reason) throw new AppError('Indica el motivo de cancelación.');
      await this.pharmacy.orderStatus(
        o.id,
        { status: 'Cancelado', reason },
        { id: 'u-system', role: 'portal', scope: 'all' },
        q,
      );
      const client = (await q('SELECT cui_cipher FROM clients WHERE id=$1', [o.client_id])).rows[0];
      const cui = client?.cui_cipher ? decrypt(client.cui_cipher) : '';
      await q('INSERT INTO portal_cancellations VALUES ($1,$2,$3,$4,$5)', [
        o.id,
        privateHash('phone:' + phoneNumber(o.phone)),
        cui ? privateHash('dpi:' + cui) : null,
        reason,
        new Date().toISOString(),
      ]);
      await writeAudit(q, { id: 'u-system', role: 'portal' }, 'CANCELAR_CLIENTE', 'pedido', o.id, {
        reason,
      });
      return {
        status: 'Cancelado',
        message: 'Pedido cancelado. Las unidades reservadas fueron liberadas.',
      };
    });
  }
  async catalog() {
    await this.expire();
    const products = (
      await this.db.query(
        "SELECT id,name,category,component,sku,price_cents,prescription,controlled FROM products WHERE state='Activo' ORDER BY name LIMIT 500",
      )
    ).rows;
    const branches = (
      await this.db.query(
        "SELECT id,name,department,address,type,lat,lng,opens_at,closes_at FROM branches WHERE active=1 AND state='Activo' ORDER BY name",
      )
    ).rows;
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
    const availability = (
      await this.db.query(
        'SELECT branch_id,product_id,SUM(quantity) AS quantity FROM inventory WHERE expires_on>$1 AND quantity>0 GROUP BY branch_id,product_id',
        [date],
      )
    ).rows;
    return {
      products,
      branches,
      availability: availability.map(({ branch_id, product_id }) => ({
        branch_id,
        product_id,
        available: true,
      })),
    };
  }
  async options(data) {
    await this.expire();
    const p = (
      await this.db.query(
        "SELECT id,name,price_cents,prescription,controlled FROM products WHERE id=$1 AND state='Activo'",
        [data.product_id],
      )
    ).rows[0];
    if (!p) throw new AppError('El medicamento ya no está disponible.', 404);
    const branches = (
      await this.db.query(
        "SELECT id,name,department,address,type,lat,lng,opens_at,closes_at FROM branches WHERE active=1 AND state='Activo' ORDER BY name",
      )
    ).rows;
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
    const inventory = (
      await this.db.query(
        'SELECT branch_id,COALESCE(SUM(quantity),0) AS n FROM inventory WHERE product_id=$1 AND expires_on>$2 GROUP BY branch_id',
        [p.id, date],
      )
    ).rows;
    const queue = (
      await this.db.query(
        "SELECT branch_id,COUNT(*) AS n FROM orders WHERE status IN ('Pendiente','Preparando','En ruta','Listo para recoger') GROUP BY branch_id",
      )
    ).rows;
    return {
      product: p,
      options: branches
        .map((b) => {
          const available = Number(inventory.find((i) => i.branch_id === b.id)?.n || 0);
          const queued = Number(queue.find((i) => i.branch_id === b.id)?.n || 0);
          const km =
            data.lat != null && data.lng != null
              ? distance(data.lat, data.lng, b.lat, b.lng)
              : null;
          const pickup = pickupEstimate(b, queued, this.clock());
          const delivery = km == null ? null : deliveryEstimate(b, km, queued, this.clock());
          const stock = available >= data.quantity;
          const serviceable =
            stock && !p.controlled && (data.fulfillment === 'pickup' || !!delivery?.serviceable);
          return {
            ...b,
            available: stock,
            distance_km: km == null ? null : Math.round(km * 10) / 10,
            serviceable,
            reason: p.controlled
              ? 'Atención presencial con receta'
              : !stock
                ? 'Sin existencias suficientes'
                : data.fulfillment === 'delivery'
                  ? delivery?.unavailable_reason ||
                    (!delivery ? 'Indica tu ubicación de entrega' : '')
                  : '',
            ready_at:
              data.fulfillment === 'pickup'
                ? pickup.ready_at
                : new Date(
                    this.clock().getTime() + (delivery?.eta_minutes || 0) * 60000,
                  ).toISOString(),
            eta_minutes: data.fulfillment === 'pickup' ? pickup.eta_minutes : delivery?.eta_minutes,
          };
        })
        .sort(
          (a, b) =>
            Number(b.serviceable) - Number(a.serviceable) ||
            (a.distance_km ?? 999) - (b.distance_km ?? 999) ||
            a.name.localeCompare(b.name),
        ),
    };
  }
  async create(data, ip = 'public') {
    if (data.items) return this.createCart(data, ip);
    const dpi = optionalDpi(data.dpi);
    if (!['pickup', 'delivery'].includes(data.fulfillment))
      throw new AppError('Selecciona la forma de recibir tu pedido.');
    await this.expire();
    const requestHash = privateHash(`request:${data.request_id}`);
    const legacyRequestHash = legacyPrivateHash(`request:${data.request_id}`);
    const accessCode = privateHash(`ticket:${data.request_id}`).slice(0, 24).toUpperCase();
    const payload = JSON.stringify(
      Object.fromEntries(Object.entries({ ...data, dpi }).sort(([a], [b]) => a.localeCompare(b))),
    );
    const payloadHash = privateHash(payload);
    const legacyPayloadHash = legacyPrivateHash(payload);
    return this.db.transaction(async (q) => {
      const prior = (
        await q('SELECT * FROM portal_orders WHERE request_hash IN ($1,$2)', [
          requestHash,
          legacyRequestHash,
        ])
      ).rows[0];
      if (prior) {
        if (prior.payload_hash !== payloadHash && prior.payload_hash !== legacyPayloadHash)
          throw new AppError('Este intento ya se utilizó. Inicia un pedido nuevo.', 409);
        const currentCode = (
          await q('SELECT code_cipher FROM portal_credentials WHERE order_id=$1', [prior.order_id])
        ).rows[0];
        return {
          ...(await this.receipt(q, prior.order_id)),
          access_code: currentCode ? decrypt(currentCode.code_cipher) : accessCode,
        };
      }
      await this.checkCancellationBlock(q, data);
      const branch = (
        await q("SELECT * FROM branches WHERE id=$1 AND active=1 AND state='Activo'", [
          data.branch_id,
        ])
      ).rows[0];
      const product = (
        await q("SELECT * FROM products WHERE id=$1 AND state='Activo'", [data.product_id])
      ).rows[0];
      if (!branch || !product)
        throw new AppError('Selecciona un medicamento y una sucursal disponibles.');
      if (product.controlled)
        throw new AppError('Este medicamento requiere atención presencial con receta.');
      if (product.prescription && !data.has_prescription)
        throw new AppError('Para solicitar este medicamento debes contar con receta.');
      if (
        data.fulfillment === 'delivery' &&
        (!data.address?.trim() || data.lat == null || data.lng == null)
      )
        throw new AppError('Completa la dirección y ubícala en el mapa.');
      const dpiHash = portalContactKey(dpi, data.phone, data.customer);
      const existing = (
        await q(
          'SELECT c.id,c.state FROM portal_clients p JOIN clients c ON c.id=p.client_id WHERE p.dpi_hash=$1',
          [dpiHash],
        )
      ).rows[0];
      if (existing && existing.state !== 'Activo')
        throw new AppError('No fue posible confirmar el pedido. Comunícate con una sucursal.', 409);
      let clientId = existing?.id;
      if (!clientId) {
        clientId = randomUUID();
        await q(
          'INSERT INTO clients (id,name,nit,cui_cipher,phone,address,lat,lng) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            clientId,
            data.customer,
            'CF',
            dpi ? encrypt(dpi) : null,
            data.phone,
            data.fulfillment === 'pickup' ? 'Retiro en sucursal' : data.address,
            data.lat ?? branch.lat,
            data.lng ?? branch.lng,
          ],
        );
        await q('INSERT INTO portal_clients VALUES ($1,$2)', [dpiHash, clientId]);
      }
      const result = await this.pharmacy.order(
        {
          product_id: product.id,
          quantity: data.quantity,
          branch_id: branch.id,
          payment: data.payment,
          customer: data.customer,
          phone: data.phone,
          address: data.fulfillment === 'pickup' ? `Retiro en ${branch.name}` : data.address,
          lat: data.fulfillment === 'pickup' ? branch.lat : data.lat,
          lng: data.fulfillment === 'pickup' ? branch.lng : data.lng,
          client_id: clientId,
          channel: 'portal',
          fulfillment: data.fulfillment,
        },
        { id: 'u-system', role: 'portal', scope: 'all', ip },
        false,
        q,
      );
      const created = new Date().toISOString();
      const estimate = new Date(Date.now() + result.eta_minutes * 60000).toISOString();
      const expiry =
        data.fulfillment === 'pickup' ? new Date(Date.now() + 48 * 3600000).toISOString() : null;
      const ticket = 'FC-' + randomBytes(6).toString('hex').toUpperCase();
      await q(
        'INSERT INTO portal_orders (order_id,ticket,access_hash,request_hash,payload_hash,ready_estimate,expires_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          result.id,
          ticket,
          sha256(accessCode),
          requestHash,
          payloadHash,
          estimate,
          expiry,
          created,
        ],
      );
      return { ...(await this.receipt(q, result.id)), access_code: accessCode };
    });
  }
  async receipt(q, id) {
    const row = (
      await q(
        'SELECT po.ticket,po.ready_estimate,po.expires_at,o.status,o.fulfillment,o.total_cents,o.payment,o.created_at,o.prescription_confirmed,b.name AS branch_name,b.address AS branch_address,b.department,b.opens_at,b.closes_at FROM portal_orders po JOIN orders o ON o.id=po.order_id JOIN branches b ON b.id=o.branch_id WHERE o.id=$1',
        [id],
      )
    ).rows[0];
    const items = (
      await q(
        'SELECT p.name,p.prescription,SUM(i.quantity) AS quantity,i.unit_price_cents FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=$1 GROUP BY p.name,p.prescription,i.unit_price_cents',
        [id],
      )
    ).rows;
    const rx = (
      await q('SELECT review_status,notes FROM portal_prescriptions WHERE order_id=$1', [id])
    ).rows[0];
    const tracking = (
      await q(
        'SELECT a.lat,a.lng,a.location_at,a.location_source,u.name FROM delivery_assignments a JOIN users u ON u.id=a.courier_id WHERE a.order_id=$1',
        [id],
      )
    ).rows[0];
    return {
      ...row,
      items,
      delivery_tracking: tracking
        ? {
            lat: tracking.lat,
            lng: tracking.lng,
            updated_at: tracking.location_at,
            source: tracking.location_source,
            courier: tracking.name.split(' ')[0],
          }
        : null,
      prescription_status: rx?.review_status || (row.prescription_confirmed ? 'Revisada' : null),
      prescription_notes: rx?.notes || '',
    };
  }
  async createCart(data, ip) {
    data = { ...data, dpi: optionalDpi(data.dpi) };
    if (!['Efectivo', 'Tarjeta'].includes(data.payment))
      throw new AppError('Selecciona efectivo o tarjeta.');
    if (!['pickup', 'delivery'].includes(data.fulfillment))
      throw new AppError('Selecciona cómo recibir tu pedido.');
    if (
      !Array.isArray(data.items) ||
      !data.items.length ||
      data.items.length > 20 ||
      new Set(data.items.map((i) => i.product_id)).size !== data.items.length ||
      data.items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 100)
    )
      throw new AppError('Revisa los medicamentos y sus cantidades (1 a 100 por medicamento).');
    await this.expire();
    const requestHash = privateHash(`request:${data.request_id}`),
      legacyRequestHash = legacyPrivateHash(`request:${data.request_id}`),
      accessCode = String(
        parseInt(privateHash(`cart-ticket:${data.request_id}`).slice(0, 8), 16) % 1000000,
      ).padStart(6, '0');
    const payload = JSON.stringify(
      Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b))),
    );
    const payloadHash = privateHash(payload),
      legacyPayloadHash = legacyPrivateHash(payload);
    const result = await this.db.transaction(async (q) => {
      const prior = (
        await q('SELECT * FROM portal_orders WHERE request_hash IN ($1,$2)', [
          requestHash,
          legacyRequestHash,
        ])
      ).rows[0];
      if (prior) {
        if (prior.payload_hash !== payloadHash && prior.payload_hash !== legacyPayloadHash)
          throw new AppError('Este intento ya se utilizó. Inicia un pedido nuevo.', 409);
        const currentCode = (
          await q('SELECT code_cipher FROM portal_credentials WHERE order_id=$1', [prior.order_id])
        ).rows[0];
        return {
          ...(await this.receipt(q, prior.order_id)),
          access_code: currentCode ? decrypt(currentCode.code_cipher) : accessCode,
        };
      }
      await this.checkCancellationBlock(q, data);
      const branch = (
        await q("SELECT * FROM branches WHERE id=$1 AND active=1 AND state='Activo'", [
          data.branch_id,
        ])
      ).rows[0];
      if (!branch) throw new AppError('Selecciona una sucursal disponible.');
      const products = [];
      for (const item of data.items) {
        const product = (
          await q("SELECT * FROM products WHERE id=$1 AND state='Activo'", [item.product_id])
        ).rows[0];
        if (!product)
          throw new AppError('Un medicamento ya no está disponible. Actualiza tu cesta.');
        if (product.controlled)
          throw new AppError('Los medicamentos controlados requieren atención presencial.');
        products.push(product);
      }
      let photo = null;
      if (products.some((p) => p.prescription)) {
        const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
          data.prescription_image || '',
        );
        if (!match) throw new AppError('Adjunta una foto de tu receta en JPG, PNG o WebP.');
        const bytes = Buffer.from(match[2], 'base64');
        const valid =
          match[1] === 'png'
            ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
            : match[1] === 'jpeg'
              ? bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
              : bytes.subarray(0, 4).toString() === 'RIFF' &&
                bytes.subarray(8, 12).toString() === 'WEBP';
        if (!valid || bytes.length > 2 * 1024 * 1024 || bytes.length < 12)
          throw new AppError('La foto no es válida o supera 2 MB.');
        photo = { cipher: encrypt(data.prescription_image), mime: `image/${match[1]}` };
      }
      if (
        data.fulfillment === 'delivery' &&
        (!data.address?.trim() || data.lat == null || data.lng == null)
      )
        throw new AppError('Completa la dirección y marca tu ubicación.');
      const dpiHash = portalContactKey(data.dpi, data.phone, data.customer);
      const existing = (
        await q(
          'SELECT c.id,c.state FROM portal_clients p JOIN clients c ON c.id=p.client_id WHERE p.dpi_hash=$1',
          [dpiHash],
        )
      ).rows[0];
      if (existing && existing.state !== 'Activo')
        throw new AppError('Comunícate con una sucursal para confirmar tu pedido.', 409);
      let clientId = existing?.id;
      if (!clientId) {
        clientId = randomUUID();
        await q(
          'INSERT INTO clients (id,name,nit,cui_cipher,phone,address,lat,lng) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            clientId,
            data.customer,
            'CF',
            data.dpi ? encrypt(data.dpi) : null,
            data.phone,
            data.fulfillment === 'pickup' ? 'Retiro en sucursal' : data.address,
            data.lat ?? branch.lat,
            data.lng ?? branch.lng,
          ],
        );
        await q('INSERT INTO portal_clients VALUES ($1,$2)', [dpiHash, clientId]);
      }
      let order = null;
      for (const item of data.items) {
        const line = await this.pharmacy.order(
          {
            ...item,
            branch_id: branch.id,
            payment: data.payment,
            customer: data.customer,
            phone: data.phone,
            address: data.fulfillment === 'pickup' ? `Retiro en ${branch.name}` : data.address,
            lat: data.fulfillment === 'pickup' ? branch.lat : data.lat,
            lng: data.fulfillment === 'pickup' ? branch.lng : data.lng,
            client_id: clientId,
            channel: 'portal',
            fulfillment: data.fulfillment,
          },
          { id: 'u-system', role: 'portal', scope: 'all', ip },
          false,
          q,
          order,
        );
        if (!order) order = line;
      }
      let ticket;
      do {
        ticket = 'FC-' + randomBytes(3).toString('hex').toUpperCase();
      } while (
        (await q('SELECT order_id FROM portal_orders WHERE ticket=$1', [ticket])).rows.length
      );
      const created = new Date().toISOString(),
        estimate = new Date(Date.now() + order.eta_minutes * 60000).toISOString(),
        expiry =
          data.fulfillment === 'pickup' ? new Date(Date.now() + 48 * 3600000).toISOString() : null;
      await q(
        'INSERT INTO portal_orders (order_id,ticket,access_hash,request_hash,payload_hash,ready_estimate,expires_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [order.id, ticket, sha256(accessCode), requestHash, payloadHash, estimate, expiry, created],
      );
      if (photo)
        await q('INSERT INTO portal_prescriptions (order_id,image_cipher,mime) VALUES ($1,$2,$3)', [
          order.id,
          photo.cipher,
          photo.mime,
        ]);
      await q('INSERT INTO portal_credentials VALUES ($1,$2)', [order.id, encrypt(accessCode)]);
      return { ...(await this.receipt(q, order.id)), access_code: accessCode };
    });
    return {
      ...result,
      qr: await QRCode.toDataURL(
        JSON.stringify({ ticket: result.ticket, access_code: result.access_code }),
        { width: 200, margin: 2 },
      ),
    };
  }
  async prescription(id, user) {
    const o = (await this.db.query('SELECT branch_id FROM orders WHERE id=$1', [id])).rows[0];
    if (!o) throw new AppError('Pedido no encontrado.', 404);
    if (user.scope === 'branch' && user.branch_id !== o.branch_id)
      throw new AppError('Pedido de otra sucursal.', 403);
    const rx = (await this.db.query('SELECT * FROM portal_prescriptions WHERE order_id=$1', [id]))
      .rows[0];
    return rx
      ? {
          image: decrypt(rx.image_cipher),
          status: rx.review_status,
          notes: rx.notes,
          reviewed_at: rx.reviewed_at,
        }
      : { image: null, status: 'Sin foto adjunta', notes: '' };
  }
  async reviewPrescription(id, data, user) {
    if (!['admin', 'callcenter'].includes(user.role) || user.scope === 'branch')
      throw new AppError('La revisión corresponde al call center o administrador.', 403);
    if (!data.approved && !data.notes.trim())
      throw new AppError('Explica por qué no se aprobó la receta.');
    return this.db.transaction(async (q) => {
      const order = (
        await q('SELECT status FROM orders WHERE id=$1' + (this.db.cloud ? ' FOR UPDATE' : ''), [
          id,
        ])
      ).rows[0];
      if (!order) throw new AppError('Pedido no encontrado.', 404);
      if (order.status !== 'Pendiente')
        throw new AppError('Solo puedes revisar recetas de pedidos pendientes.', 409);
      if (
        !(await q('SELECT order_id FROM portal_prescriptions WHERE order_id=$1', [id])).rows.length
      )
        throw new AppError('Este pedido no tiene foto de receta.', 404);
      const status = data.approved ? 'Revisada' : 'Rechazada';
      await q(
        'UPDATE portal_prescriptions SET review_status=$1,reviewed_by=$2,reviewed_at=$3,notes=$4 WHERE order_id=$5',
        [status, user.id, new Date().toISOString(), data.notes, id],
      );
      await q('UPDATE orders SET prescription_confirmed=$1 WHERE id=$2', [
        data.approved ? 1 : 0,
        id,
      ]);
      await writeAudit(q, user, 'REVISAR_RECETA', 'pedido', id, { status, notes: data.notes });
      return { status };
    });
  }
  async lookup({ ticket, access_code }) {
    await this.expire();
    ticket = ticket.toUpperCase().trim();
    const lookupCode = String(access_code || '')
      .replace(/\s/g, '')
      .toUpperCase();
    const result = await this.db.transaction(async (q) => {
      const guard = (await q('SELECT * FROM portal_access_guards WHERE ticket=$1', [ticket]))
        .rows[0];
      if (guard?.locked_until && guard.locked_until > new Date().toISOString())
        return { locked: true };
      const row = (
        await q(
          'SELECT po.order_id,po.access_hash,pc.code_cipher FROM portal_orders po LEFT JOIN portal_credentials pc ON pc.order_id=po.order_id WHERE po.ticket=$1',
          [ticket.toUpperCase().trim()],
        )
      ).rows[0];
      const normalizedCode = String(access_code || '')
        .replace(/\s/g, '')
        .toUpperCase();
      const given = Buffer.from(sha256(normalizedCode || ''));
      const expected = Buffer.from(row?.access_hash || sha256('invalid'));
      const authorized = !normalizedCode || (row && timingSafeEqual(given, expected));
      if (!row || !authorized) {
        if (row) {
          const attempts = (guard?.locked_until ? 0 : Number(guard?.attempts || 0)) + 1;
          const until = attempts >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
          await q(
            'INSERT INTO portal_access_guards (ticket,attempts,locked_until) VALUES ($1,$2,$3) ON CONFLICT(ticket) DO UPDATE SET attempts=$2,locked_until=$3',
            [ticket, attempts, until],
          );
        }
        return { invalid: true };
      }
      await q('DELETE FROM portal_access_guards WHERE ticket=$1', [ticket]);
      return this.receipt(q, row.order_id);
    });
    if (result.locked)
      throw new AppError('Demasiados códigos incorrectos. Intenta en 15 minutos.', 429);
    if (result.invalid)
      throw new AppError(
        'No encontramos un pedido con ese ticket y código. Revisa ambos datos.',
        404,
      );
    return {
      ...result,
      qr: await QRCode.toDataURL(
        JSON.stringify({
          ticket: result.ticket,
          access_code:
            lookupCode ||
            decrypt(
              (
                await this.db.query(
                  'SELECT pc.code_cipher FROM portal_orders po JOIN portal_credentials pc ON pc.order_id=po.order_id WHERE po.ticket=$1',
                  [result.ticket],
                )
              ).rows[0].code_cipher,
            ),
        }),
        { width: 220, margin: 2 },
      ),
    };
  }
  async expire() {
    const expired = (
      await this.db.query(
        "SELECT o.id FROM portal_orders po JOIN orders o ON o.id=po.order_id WHERE po.expires_at IS NOT NULL AND po.expires_at<=$1 AND o.status IN ('Pendiente','Preparando','Listo para recoger')",
        [new Date().toISOString()],
      )
    ).rows;
    for (const order of expired) {
      try {
        await this.pharmacy.orderStatus(
          order.id,
          { status: 'Cancelado', reason: 'Reserva de retiro vencida (48 horas)' },
          { id: 'u-system', role: 'portal', scope: 'all' },
        );
      } catch (error) {
        if (error.status !== 409) throw error;
      }
    }
  }
}
export const portal = new Portal();
