import { management } from '../models/management.js';
import { assetIncidents, resolveIncident } from '../models/asset-incidents.js';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/pharmacyController.js';
import { authenticate, requirePermission, csrf } from '../middleware/auth.js';
import * as auth from '../controllers/authController.js';
import { model } from '../controllers/pharmacyController.js';
import * as portal from '../controllers/portalController.js';
import * as manage from '../controllers/managementController.js';
import { validate } from '../middleware/validation.js';
import { report } from '../controllers/reportController.js';
import swaggerUi from 'swagger-ui-express';
import { openapi } from '../openapi.js';
import { history } from '../models/history.js';
import { procurement } from '../models/procurement.js';
import { payrollEngine } from '../models/payroll.js';
import { portalSupport } from '../models/portal-support.js';
import { delivery } from '../models/delivery.js';
const router = Router();
router.use('/auth', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.get('/health', c.health);
router.use('/portal', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
const publicLimit = rateLimit({
  windowMs: 60000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Hay muchas consultas. Espera un minuto e intenta nuevamente.' },
});
router.get('/portal/catalog', publicLimit, portal.catalog);
router.post('/portal/prescription', publicLimit, validate('replaceRecipe'), async (req, res) =>
  res.json(await portalSupport.replacePrescription(req.body)),
);
router.post('/portal/options', publicLimit, validate('portalOptions'), portal.options);
router.post('/portal/cancel', publicLimit, validate('portalCancel'), async (req, res) =>
  res.json(await portal.cancelOrder(req.body)),
);
router.post('/portal/lookup', publicLimit, validate('portalLookup'), portal.lookup);
router.post(
  '/portal/orders',
  rateLimit({
    windowMs: 3600000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: 'Alcanzaste el límite de pedidos. Intenta más tarde o comunícate con una sucursal.',
    },
  }),
  validate('portalOrder'),
  portal.create,
);
router.post(
  '/auth/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Intenta en 15 minutos.' },
  }),
  validate('login'),
  auth.login,
);
const challengeLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de autenticación.' },
});
router.post('/auth/complete', challengeLimit, validate('complete'), auth.complete);
router.post('/auth/refresh', challengeLimit, auth.refresh);
router.use(authenticate);
router.use(csrf);
router.get('/auth/me', (req, res) => res.json(req.user));
router.post('/auth/logout', auth.logout);
router.post('/auth/activity', auth.activity);
router.post('/auth/password', validate('password'), auth.password);
router.get('/auth/security', auth.securityStatus);
router.post('/auth/security', challengeLimit, validate('securityAction'), auth.securityAction);
router.post(
  '/auth/security/confirm',
  challengeLimit,
  validate('securityConfirm'),
  auth.securityConfirm,
);
router.get('/asset-incidents', async (req, res) => res.json(await assetIncidents(req.user)));
router.post('/asset-incidents', validate('assetIncident'), async (req, res) =>
  res.status(201).json(await assetIncidents(req.user, req.body)),
);
router.post('/asset-incidents/:id/resolve', validate('resolveIncident'), async (req, res) =>
  res.json(await resolveIncident(req.user, req.params.id, req.body.resolution)),
);
router.post(
  '/roles/:id/mfa',
  requirePermission('usuario.gestionar'),
  validate('roleMfa'),
  async (req, res) => res.json(await management.roleMfa(req.params.id, req.body, req.user)),
);
router.get('/snapshot', requirePermission('resumen.ver'), c.snapshot);
router.get('/deliveries', async (req, res) => res.json(await delivery.list(req.user)));
router.post('/deliveries/:id/assign', validate('deliveryAssign'), async (req, res) =>
  res.json(await delivery.assign(req.params.id, req.body, req.user)),
);
router.post('/deliveries/:id/location', validate('deliveryLocation'), async (req, res) =>
  res.json(await delivery.location(req.params.id, req.body, req.user)),
);
router.post('/deliveries/:id/finish', validate('deliveryFinish'), async (req, res) =>
  res.json(await delivery.finish(req.params.id, req.body, req.user)),
);
router.get('/messages', async (req, res) => res.json(await portalSupport.messages(req.user)));
router.get('/history/:kind', async (req, res) =>
  res.json(await history.list(req.params.kind, req.query, req.user)),
);
router.get('/procurement', async (req, res) => res.json(await procurement.snapshot(req.user)));
router.get('/payroll-detail', async (req, res) =>
  res.json(await payrollEngine.preview(req.query.period, req.user)),
);
router.post('/payroll-detail/rules', validate('payrollRules'), async (req, res) =>
  res.json(await payrollEngine.saveRules(req.body, req.user)),
);
router.post('/payroll-detail/inputs', validate('payrollInputs'), async (req, res) =>
  res.json(await payrollEngine.input(req.body, req.user)),
);
router.post('/payroll-detail/pay', validate('payroll'), async (req, res) =>
  res.json(await payrollEngine.pay(req.body, req.user)),
);
router.post('/payroll-detail/benefits', validate('payrollBenefit'), async (req, res) =>
  res.json(await payrollEngine.benefit(req.body, req.user)),
);
router.post('/procurement/suppliers', validate('supplier'), async (req, res) =>
  res.status(201).json(await procurement.supplier(req.body, req.user)),
);
router.post('/procurement/medicines', validate('medicineRegistration'), async (req, res) =>
  res.status(201).json(await procurement.registerMedicine(req.body, req.user)),
);
router.post('/procurement/orders', validate('purchase'), async (req, res) =>
  res.status(201).json(await procurement.create(req.body, req.user)),
);
router.post('/procurement/orders/:id/action', validate('purchaseAction'), async (req, res) =>
  res.json(await procurement.action(req.params.id, req.body, req.user)),
);
router.post('/procurement/orders/:id/receive', validate('purchaseReceive'), async (req, res) =>
  res.json(await procurement.receive(req.params.id, req.body, req.user)),
);
router.post('/procurement/returns', validate('supplierReturn'), async (req, res) =>
  res.status(201).json(await procurement.returnGoods(req.body, req.user)),
);
router.post('/procurement/returns/:id/refund', async (req, res) =>
  res.json(await procurement.refund(req.params.id, req.user)),
);
router.get('/openapi.json', requirePermission('resumen.ver'), (req, res) => res.json(openapi));
router.use(
  '/docs',
  requirePermission('resumen.ver'),
  swaggerUi.serve,
  swaggerUi.setup(openapi, {
    swaggerOptions: { withCredentials: true, persistAuthorization: false },
    customSiteTitle: 'FarmaCali · API',
  }),
);
router.post('/delivery/quote', requirePermission('inventario.ver'), validate('quote'), c.quote);
for (const [name, permission] of Object.entries({
  branches: 'sucursal.gestionar',
  assets: 'activo.gestionar',
  employees: 'planilla.pagar',
  payroll: 'planilla.pagar',
}))
  router.post(`/${name}`, requirePermission(permission), validate(name), c.mutation(name));
router.post(
  '/inventory',
  requirePermission('inventario.ingresar'),
  validate('stock'),
  c.mutation('stock'),
);
router.post('/cash', requirePermission('caja.gestionar'), validate('cash'), c.mutation('cash'));
router.post(
  '/transfers',
  requirePermission('traslado.crear'),
  validate('transfer'),
  c.mutation('transfer'),
);
router.post(
  '/transfers/:id/receive',
  requirePermission('traslado.recibir'),
  validate('receive'),
  c.receive,
);
router.post('/orders', requirePermission('pedido.crear'), (req, res) =>
  res.status(403).json({ error: 'Los pedidos se crean desde el portal del cliente.' }),
);
router.get('/orders/:id/prescription', requirePermission('pedido.ver'), portal.prescription);
router.post(
  '/orders/:id/prescription-review',
  requirePermission('receta.gestionar'),
  validate('prescriptionReview'),
  portal.review,
);
router.post(
  '/sales/cart',
  requirePermission('venta.crear'),
  validate('counterSale'),
  async (req, res) => res.status(201).json(await model.counterSale(req.body, req.user)),
);
router.post('/sales', requirePermission('venta.crear'), validate('sale'), c.sale);
router.patch(
  '/orders/:id/status',
  requirePermission('pedido.gestionar'),
  validate('status'),
  c.orderStatus,
);
router.post('/users', requirePermission('usuario.gestionar'), validate('user'), manage.createUser);
router.post('/roles', requirePermission('usuario.gestionar'), validate('role'), manage.createRole);
router.post('/clients', requirePermission('cliente.gestionar'), validate('client'), manage.client);
router.post(
  '/prescriptions',
  requirePermission('receta.gestionar'),
  validate('prescription'),
  manage.prescription,
);
router.post('/manage/:entity/:id', validate('edit'), manage.edit);
router.post('/requests', validate('request'), manage.request);
router.post(
  '/requests/:id/decision',
  requirePermission('venta.anular.aprobar'),
  validate('decision'),
  manage.decision,
);
router.post(
  '/shifts',
  requirePermission('caja.gestionar'),
  validate('openShift'),
  manage.openShift,
);
router.post(
  '/shifts/:id/close',
  requirePermission('caja.gestionar'),
  validate('closeShift'),
  manage.closeShift,
);
router.get('/audit/integrity', requirePermission('auditoria.verificar'), manage.integrity);
router.post(
  '/audit/simulation',
  requirePermission('auditoria.verificar'),
  validate('empty'),
  manage.simulation,
);
router.post(
  '/assets/:id/depreciation',
  requirePermission('activo.gestionar'),
  validate('depreciation'),
  manage.depreciation,
);
router.get('/risk', requirePermission('riesgo.ver'), manage.risk);
router.get('/reports/:name/:format', report);
router.post(
  '/transfer-drafts',
  requirePermission('traslado.crear'),
  validate('transfer'),
  manage.draft,
);
router.post(
  '/transfer-drafts/:id/action',
  requirePermission('traslado.crear'),
  validate('draftAction'),
  manage.draftAction,
);
router.post(
  '/clients/:id/addresses',
  requirePermission('cliente.gestionar'),
  validate('address'),
  manage.address,
);
export default router;
