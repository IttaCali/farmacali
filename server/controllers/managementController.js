import { management, managePermissions } from '../models/management.js';
import { db } from '../database/db.js';
import { AppError } from '../models/pharmacy.js';
export const createUser = async (req, res) =>
  res.status(201).json(await management.createUser(req.body, req.user));
export const createRole = async (req, res) =>
  res.status(201).json(await management.createRole(req.body, req.user));
export const client = async (req, res) =>
  res.status(201).json(await management.client(req.body, req.user));
export const prescription = async (req, res) =>
  res.status(201).json(await management.prescription(req.body, req.user));
export const edit = async (req, res) => {
  const permission = managePermissions[req.params.entity];
  if (!permission || !req.user.permissions.includes(permission))
    throw new AppError('Tu rol no permite esta operación.', 403);
  res.json(await management.edit(req.params.entity, req.params.id, req.body, req.user));
};
export const request = async (req, res) => {
  const permission =
    req.body.type === 'stock_adjust'
      ? 'inventario.ajustar'
      : req.body.type === 'payroll_void'
        ? 'planilla.pagar'
        : 'venta.anular.solicitar';
  if (!req.user.permissions.includes(permission))
    throw new AppError('Tu rol no permite esta solicitud.', 403);
  res.status(201).json(await management.request(req.body, req.user));
};
export const decision = async (req, res) =>
  res.json(await management.decision(req.params.id, req.body, req.user));
export const integrity = async (req, res) => res.json(await management.integrity());
export const risk = async (req, res) => res.json(await management.risk(req.user));
export const openShift = async (req, res) =>
  res.status(201).json(await management.openShift(req.body, req.user));
export const closeShift = async (req, res) =>
  res.json(await management.closeShift(req.params.id, req.body, req.user));
export const draft = async (req, res) =>
  res.status(201).json(await management.draft(req.body, req.user));
export const draftAction = async (req, res) =>
  res.json(await management.draftAction(req.params.id, req.body, req.user));
export const address = async (req, res) =>
  res.status(201).json(await management.addAddress(req.params.id, req.body, req.user));
export const simulation = async (req, res) => res.json(await management.simulation(req.user));
export const depreciation = async (req, res) =>
  res.json(await management.depreciation(req.params.id, req.body, req.user));
