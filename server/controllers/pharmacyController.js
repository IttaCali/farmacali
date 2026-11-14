import { db } from '../database/db.js';
import { demoMode } from '../config.js';
import { Pharmacy } from '../models/pharmacy.js';
import { payrollEngine } from '../models/payroll.js';
export const model = new Pharmacy();
export const snapshot = async (req, res) => res.json(await model.snapshot(req.user));
export const health = async (req, res) => {
  await db.query('SELECT 1 AS connected');
  res.json({
    status: 'ok',
    demo: demoMode,
    database: db.cloud ? 'PostgreSQL' : 'SQLite',
    time: new Date().toISOString(),
  });
};
export const mutation = (method) => async (req, res) =>
  res
    .status(201)
    .json(
      await (method === 'payroll'
        ? payrollEngine.pay(req.body, req.user)
        : model[method](req.body, req.user)),
    );
export const quote = async (req, res) => res.json(await model.quote(req.body, req.user));
export const order = async (req, res) =>
  res.status(201).json(await model.order(req.body, req.user));
export const sale = async (req, res) =>
  res.status(201).json(await model.order(req.body, req.user, true));
export const receive = async (req, res) =>
  res.json(await model.receive(req.params.id, req.user, req.body));
export const orderStatus = async (req, res) =>
  res.json(await model.orderStatus(req.params.id, req.body, req.user));
