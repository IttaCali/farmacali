import { randomUUID } from 'node:crypto';
import { db } from '../database/db.js';
import { AppError } from './pharmacy.js';
import { encrypt, decrypt, sha256 } from '../security/crypto.js';
import { writeAudit } from './audit.js';
import { text, permit } from './domain.js';
import { Portal } from './portal.js';
import { businessClock } from '../config.js';
export class PortalSupport {
  constructor(database = db, clock = businessClock) {
    this.db = database;
    this.clock = clock;
  }
  async messages(user) {
    permit(user, 'mensajes.ver');
    return {
      simulation: true,
      messages: (
        await this.db.query('SELECT * FROM simulated_messages ORDER BY created_at DESC')
      ).rows.map((r) => ({
        id: r.id,
        order_id: r.order_id,
        kind: r.kind,
        phone: decrypt(r.phone_cipher),
        message: decrypt(r.text_cipher),
        created_at: r.created_at,
      })),
    };
  }
  async replacePrescription(data) {
    text(data.ticket, 'Ticket', 30);
    text(data.access_code, 'Código', 30);
    await new Portal(this.db, this.clock).lookup(data);
    const value = String(data.prescription_image || ''),
      m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!m) throw new AppError('Adjunta una foto JPG, PNG o WebP.');
    const b = Buffer.from(m[2], 'base64'),
      valid =
        m[1] === 'png'
          ? b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
          : m[1] === 'jpeg'
            ? b.subarray(0, 3).toString('hex') === 'ffd8ff'
            : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
    if (!valid || b.length > 2 * 1024 * 1024 || b.length < 12)
      throw new AppError('La foto no es válida o supera 2 MB.');
    return this.db.transaction(async (q) => {
      const o = (
        await q(
          'SELECT o.id,o.status,po.access_hash FROM orders o JOIN portal_orders po ON po.order_id=o.id WHERE po.ticket=$1' +
            (this.db.cloud ? ' FOR UPDATE' : ''),
          [data.ticket.toUpperCase().trim()],
        )
      ).rows[0];
      if (!o || o.access_hash !== sha256(String(data.access_code).trim().toUpperCase()))
        throw new AppError('Verifica el ticket y su código.', 403);
      const rx = (await q('SELECT * FROM portal_prescriptions WHERE order_id=$1', [o.id])).rows[0];
      if (o.status !== 'Pendiente' || rx?.review_status !== 'Rechazada')
        throw new AppError(
          'Solo puedes reemplazar una receta rechazada antes de la preparación.',
          409,
        );
      await q('INSERT INTO prescription_versions VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
        randomUUID(),
        o.id,
        rx.image_cipher,
        rx.mime,
        rx.review_status,
        rx.reviewed_by,
        rx.reviewed_at,
        rx.notes,
        new Date().toISOString(),
      ]);
      await q(
        "UPDATE portal_prescriptions SET image_cipher=$1,mime=$2,review_status='Pendiente',reviewed_by=NULL,reviewed_at=NULL,notes='' WHERE order_id=$3",
        [encrypt(value), 'image/' + m[1], o.id],
      );
      await q('UPDATE orders SET prescription_confirmed=0 WHERE id=$1', [o.id]);
      await writeAudit(q, { id: 'u-system', role: 'portal' }, 'REEMPLAZAR_RECETA', 'pedido', o.id, {
        previous_status: 'Rechazada',
      });
      return { status: 'Pendiente' };
    });
  }
}
export const portalSupport = new PortalSupport();
