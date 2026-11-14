import { randomUUID } from 'node:crypto';
import { db } from '../database/db.js';
import { AppError, Pharmacy } from './pharmacy.js';
import { writeAudit } from './audit.js';
import { num, permit, scope } from './domain.js';
export class Delivery {
  constructor(database = db) {
    this.db = database;
  }
  async list(user) {
    const own = user.permissions.includes('entrega.propia');
    if (!own) permit(user, 'entrega.ver');
    const args = [],
      where = [];
    if (own) {
      args.push(user.id);
      where.push('a.courier_id=$' + args.length);
    } else if (user.scope === 'branch') {
      args.push(user.branch_id);
      where.push('o.branch_id=$' + args.length);
    }
    return {
      simulation_available: true,
      points: (
        await this.db.query(
          'SELECT d.* FROM delivery_points d JOIN orders o ON o.id=d.order_id JOIN delivery_assignments a ON a.order_id=o.id' +
            (where.length ? ' WHERE ' + where.join(' AND ') : '') +
            ' ORDER BY d.created_at,d.id',
          args,
        )
      ).rows,
      orders: (
        await this.db.query(
          "SELECT o.id,o.branch_id,o.customer,o.phone,o.address,o.lat AS destination_lat,o.lng AS destination_lng,o.status AS order_status,o.total_cents,o.payment,o.created_at,creator.name AS created_by_name,b.name AS branch_name,b.lat AS branch_lat,b.lng AS branch_lng,po.ticket,a.courier_id,a.status AS delivery_status,a.lat,a.lng,a.accuracy,a.location_at,a.location_source,courier.name AS courier_name,assigned_by.name AS assigned_by_name FROM orders o JOIN branches b ON b.id=o.branch_id LEFT JOIN users creator ON creator.id=o.created_by LEFT JOIN portal_orders po ON po.order_id=o.id LEFT JOIN delivery_assignments a ON a.order_id=o.id LEFT JOIN users courier ON courier.id=a.courier_id LEFT JOIN users assigned_by ON assigned_by.id=a.assigned_by WHERE o.fulfillment='delivery' AND o.channel<>'mostrador'" +
            (where.length ? ' AND ' + where.join(' AND ') : '') +
            ' ORDER BY o.created_at DESC',
          args,
        )
      ).rows,
      couriers: own || !user.permissions.includes('entrega.gestionar')
        ? []
        : (
            await this.db.query(
              "SELECT u.id,u.name FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='courier' AND u.state='Activo' ORDER BY u.name",
            )
          ).rows,
    };
  }
  async assign(id, data, user) {
    permit(user, 'entrega.gestionar');
    return this.db.transaction(async (q) => {
      const order = (
        await q('SELECT * FROM orders WHERE id=$1' + (this.db.cloud ? ' FOR UPDATE' : ''), [id])
      ).rows[0];
      if (!order) throw new AppError('Pedido no encontrado.', 404);
      scope(user, order.branch_id);
      if (order.fulfillment !== 'delivery' || ['Entregado', 'Cancelado'].includes(order.status))
        throw new AppError('Solo se asignan pedidos a domicilio activos.', 409);
      if (
        !(
          await q(
            "SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND r.code='courier' AND u.state='Activo'",
            [data.courier_id],
          )
        ).rows.length
      )
        throw new AppError('Repartidor no disponible.');
      await q(
        "INSERT INTO delivery_assignments (order_id,courier_id,status,assigned_at,assigned_by) VALUES ($1,$2,'Asignado',$3,$4) ON CONFLICT(order_id) DO UPDATE SET courier_id=$2,status='Asignado',lat=NULL,lng=NULL,accuracy=NULL,location_at=NULL,location_source=NULL,assigned_at=$3,assigned_by=$4",
        [id, data.courier_id, new Date().toISOString(), user.id],
      );
      await writeAudit(q, user, 'ASIGNAR_REPARTIDOR', 'pedido', id, {
        branch_id: order.branch_id,
        courier_id: data.courier_id,
      });
      return { id };
    });
  }
  async owned(q, id, user) {
    const a = (
      await q(
        'SELECT a.*,o.branch_id,o.status AS order_status,o.fulfillment FROM delivery_assignments a JOIN orders o ON o.id=a.order_id WHERE a.order_id=$1',
        [id],
      )
    ).rows[0];
    if (!a) throw new AppError('Entrega no asignada.', 404);
    const own = user.permissions.includes('entrega.propia');
    if (own && a.courier_id !== user.id)
      throw new AppError('Esta entrega no te está asignada.', 403);
    if (!own) {
      permit(user, 'entrega.gestionar');
      scope(user, a.branch_id);
    }
    return a;
  }
  async location(id, data, user) {
    return this.db.transaction(async (q) => {
      const a = await this.owned(q, id, user);
      if (['Entregado', 'Cancelado'].includes(a.order_status))
        throw new AppError('La entrega ya terminó.', 409);
      const lat = num(data.lat, 'Latitud', 13, 18.5),
        lng = num(data.lng, 'Longitud', -93, -88),
        accuracy = num(data.accuracy ?? 0, 'Precisión', 0, 100000),
        source = data.simulated === true ? 'Simulación' : 'GPS del dispositivo';
      if (!data.simulated && !user.permissions.includes('entrega.propia'))
        throw new AppError(
          'El GPS real debe compartirse desde la cuenta del repartidor asignado.',
          403,
        );
      const now = new Date().toISOString();
      await q(
        'UPDATE delivery_assignments SET lat=$1,lng=$2,accuracy=$3,location_at=$4,location_source=$5 WHERE order_id=$6',
        [lat, lng, accuracy, now, source, id],
      );
      await q('INSERT INTO delivery_points VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
        randomUUID(),
        id,
        lat,
        lng,
        accuracy,
        source,
        now,
        user.id,
      ]);
      return { source, at: now };
    });
  }
  async finish(id, data, user) {
    await this.db.transaction((q) => this.owned(q, id, user));
    const scopedUser = user.permissions.includes('entrega.propia')
      ? {
          ...user,
          scope: 'branch',
          branch_id: (await this.db.query('SELECT branch_id FROM orders WHERE id=$1', [id])).rows[0]
            ?.branch_id,
        }
      : user;
    await new Pharmacy(this.db).orderStatus(
      id,
      { status: 'Entregado', pickup_code: data.pickup_code, qr_payload: data.qr_payload },
      scopedUser,
    );
    return { id };
  }
}
export const delivery = new Delivery();
