import { portal } from '../models/portal.js';
export async function catalog(req, res) {
  res.json(await portal.catalog());
}
export async function options(req, res) {
  res.json(await portal.options(req.body));
}
export async function create(req, res) {
  res.status(201).json(await portal.create(req.body, req.ip));
}
export async function lookup(req, res) {
  res.json(await portal.lookup(req.body));
}
export async function prescription(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await portal.prescription(req.params.id, req.user));
}
export async function review(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await portal.reviewPrescription(req.params.id, req.body, req.user));
}

export const cancelOrder = data => portal.cancel(data);
