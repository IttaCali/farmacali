import { db } from '../database/db.js';
import { AppError } from './pharmacy.js';
const sources = {
  cash: {
    permission: 'caja.ver',
    select: 'c.*,b.name AS branch_name,u.name AS user_name',
    from: 'cash_movements c JOIN branches b ON b.id=c.branch_id JOIN users u ON u.id=c.created_by',
    alias: 'c',
    fields: ['description', 'category', 'method', 'kind'],
    date: 'created_at',
  },
  kardex: {
    permission: 'kardex.ver',
    select: 'c.*,p.name AS product_name,b.name AS branch_name,i.lot',
    from: 'stock_ledger c JOIN products p ON p.id=c.product_id JOIN branches b ON b.id=c.branch_id LEFT JOIN inventory i ON i.id=c.inventory_id',
    alias: 'c',
    fields: ['type', 'reason', 'reference_id'],
    date: 'created_at',
  },
  audit: {
    permission: 'auditoria.ver',
    select: 'c.*,u.name AS user_name,b.name AS branch_name',
    from: 'audit_log c JOIN users u ON u.id=c.user_id LEFT JOIN branches b ON b.id=c.branch_id',
    alias: 'c',
    fields: ['action', 'entity', 'entity_id', 'details'],
    date: 'created_at',
  },
  history: {
    permission: 'auditoria.ver',
    select: 'c.*',
    from: 'entity_history c',
    alias: 'c',
    fields: ['entity', 'entity_id', 'event', 'details'],
    date: 'created_at',
  },
};
export class History {
  constructor(database = db) {
    this.db = database;
  }
  async list(kind, filter = {}, user, all = false) {
    const s = sources[kind];
    if (!s) throw new AppError('Historial desconocido.', 404);
    if (user && !user.permissions.includes(s.permission))
      throw new AppError('No tienes permiso para este historial.', 403);
    const params = [],
      clauses = [],
      bind = (v) => {
        params.push(v);
        return '$' + params.length;
      };
    const branch = user?.scope === 'branch' ? user.branch_id : filter.branch_id;
    if (branch && branch !== 'all') {
      if (kind === 'history')
        clauses.push(
          `EXISTS(SELECT 1 FROM orders o WHERE o.id=c.entity_id AND o.branch_id=${bind(branch)})`,
        );
      else clauses.push(`c.branch_id=${bind(branch)}`);
    }
    if (kind === 'audit' && filter.user_id) {
      const p = bind(String(filter.user_id));
      clauses.push('(c.user_id=' + p + " OR (c.entity='usuario' AND c.entity_id=" + p + '))');
    }
    if (kind === 'kardex') {
      if (filter.product_id) clauses.push(`c.product_id=${bind(String(filter.product_id))}`);
      if (filter.inventory_id) clauses.push(`c.inventory_id=${bind(String(filter.inventory_id))}`);
    }
    for (const key of ['from', 'to'])
      if (filter[key]) {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(filter[key]) ||
          Number.isNaN(Date.parse(filter[key])) ||
          new Date(filter[key]).toISOString().slice(0, 10) !== filter[key]
        )
          throw new AppError('Fecha de historial inválida.');
        clauses.push(
          `c.${s.date}${key === 'from' ? '>=' : '<'}${bind(key === 'from' ? filter[key] + 'T06:00:00.000Z' : new Date(Date.parse(filter[key] + 'T06:00:00Z') + 86400000).toISOString())}`,
        );
      }
    if (filter.from && filter.to && filter.from > filter.to)
      throw new AppError('El inicio no puede ser posterior al final.');
    if (filter.search) {
      const p = bind('%' + String(filter.search).slice(0, 200).toLowerCase() + '%');
      clauses.push(
        '(' + s.fields.map((f) => `LOWER(COALESCE(c.${f},'')) LIKE ${p}`).join(' OR ') + ')',
      );
    }
    const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
    const page = Number(filter.page || 1),
      size = Number(filter.page_size || 50);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 10000000 ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > 200
    )
      throw new AppError('Paginación inválida.');
    return this.db.transaction(async (q) => {
      const total = Number(
        (await q(`SELECT COUNT(*) AS n FROM ${s.from}${where}`, params)).rows[0].n,
      );
      const totals =
        kind === 'cash'
          ? (
              await q(
                `SELECT COALESCE(SUM(CASE WHEN c.kind='Ingreso' THEN c.amount_cents ELSE 0 END),0) AS income,COALESCE(SUM(CASE WHEN c.kind='Egreso' THEN c.amount_cents ELSE 0 END),0) AS expense FROM ${s.from}${where}`,
                params,
              )
            ).rows[0]
          : null;
      const limit = all ? '' : ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      const rows = (
        await q(
          `SELECT ${s.select} FROM ${s.from}${where} ORDER BY c.${s.date} DESC,c.id DESC${limit}`,
          all ? params : [...params, size, (page - 1) * size],
        )
      ).rows;
      return {
        rows,
        total,
        page,
        page_size: size,
        totals: totals
          ? {
              income: Number(totals.income),
              expense: Number(totals.expense),
              balance: Number(totals.income) - Number(totals.expense),
            }
          : null,
      };
    });
  }
}
export const history = new History();
