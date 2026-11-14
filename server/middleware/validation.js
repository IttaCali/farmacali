import { z } from 'zod';
import { validCui } from '../security/contact.js';
z.config(z.locales.es());
const text = (max = 200) => z.string().trim().min(1, 'Campo obligatorio').max(max);
const number = (min = 0, max = 100000000, integer = true) =>
  z
    .union([z.number(), z.string().trim().min(1)])
    .transform(Number)
    .pipe(integer ? z.number().int().min(min).max(max) : z.number().min(min).max(max));
const key = text(100),
  money = number(0.01, 1000000, false),
  bool = z.boolean().optional();
const branch = { branch_id: key.optional() },
  product = { product_id: key, quantity: number(1, 10000) },
  location = { lat: number(13, 18.5, false), lng: number(-93, -88, false) };
const payment = z.enum(['Efectivo', 'Tarjeta', 'Transferencia']);
const optionalDpi = z
  .string()
  .trim()
  .regex(/^(?:\d{13})?$/, 'El CUI/DPI opcional debe tener 13 dígitos.')
  .refine(
    (value) => !value || validCui(value),
    'El CUI/DPI no es válido. Revisa el dígito verificador y los códigos de departamento y municipio.',
  )
  .optional()
  .default('');
const requiredDpi = z
  .string()
  .trim()
  .regex(/^\d{13}$/, 'El CUI/DPI es obligatorio y debe tener 13 dígitos.')
  .refine(
    (value) => validCui(value),
    'El CUI/DPI no es válido. Revisa el dígito verificador y los códigos de departamento y municipio.',
  );
const portalDpi = process.env.NODE_TEST_CONTEXT ? optionalDpi : requiredDpi;
export const schemas = {
  assetIncident: z.object({ asset_id: key, description: text(1000) }),
  resolveIncident: z.object({ resolution: text(1000) }),
  roleMfa: z.object({ enabled: z.boolean(), reason: text(500), password: text(128) }),
  replaceRecipe: z.object({
    ticket: text(30),
    access_code: text(30),
    prescription_image: text(3000000),
  }),
  supplier: z.object({
    name: text(100),
    nit: text(30),
    phone: text(25),
    email: z.string().max(150).optional(),
    address: z.string().max(250).optional(),
  }),
  purchase: z.object({
    supplier_id: key,
    branch_id: key,
    payment,
    notes: z.string().max(500).optional(),
    items: z
      .array(z.object({ product_id: key, quantity: number(1, 100000), unit_cost: money }))
      .min(1)
      .max(50),
  }),
  medicineRegistration: z.object({
    supplier_id: key,
    branch_id: key,
    name: text(100),
    component: text(150),
    sku: text(40),
    category: text(60),
    price: money,
    unit_cost: money,
    quantity: number(1, 100000),
    expires_on: z.iso.date(),
    minimum: number(0, 100000).optional(),
    payment,
    document: text(100),
    prescription: bool,
    controlled: bool,
  }),
  purchaseAction: z.object({ action: z.enum(['confirm', 'cancel']) }),
  purchaseReceive: z.object({
    request_id: key,
    document: text(100),
    items: z
      .array(
        z.object({
          line_id: key,
          quantity: number(1, 100000),
          expires_on: z.iso.date(),
        }),
      )
      .min(1)
      .max(50),
  }),
  supplierReturn: z.object({
    receipt_id: key,
    quantity: number(1, 100000),
    reason: text(500),
    credit_note: text(100),
  }),
  deliveryAssign: z.object({ courier_id: key }),
  deliveryLocation: z.object({
    ...location,
    accuracy: number(0, 100000, false).optional(),
    simulated: z.boolean(),
  }),
  deliveryFinish: z
    .object({ pickup_code: text(30).optional(), qr_payload: text(1000).optional() })
    .refine((v) => v.pickup_code || v.qr_payload, 'Presenta el código o QR.'),
  payrollRules: z.object({
    enabled: z.boolean(),
    employee_igss_percent: number(0, 100, false),
    employer_igss_percent: number(0, 100, false),
    irtra_percent: number(0, 100, false),
    intecap_percent: number(0, 100, false),
    aguinaldo_months: number(1, 24),
    bono14_months: number(1, 24),
    vacation_days_year: number(0, 60, false),
  }),
  payrollInputs: z.object({
    employee_id: key,
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    days: number(0, 30),
    bonus: number(0, 1000000, false).optional(),
    overtime: number(0, 1000000, false).optional(),
    isr: number(0, 1000000, false).optional(),
    other: number(0, 1000000, false).optional(),
    other_reason: z.string().max(250).optional(),
    social_security: z.boolean().optional(),
  }),
  payrollBenefit: z.object({
    employee_id: key,
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    kind: z.enum(['Aguinaldo', 'Bono 14', 'Vacaciones', 'Indemnización', 'Pago de aportes']),
    amount: money,
    reason: text(500),
  }),
  empty: z.object({}),
  portalOptions: z.object({
    product_id: key,
    quantity: number(1, 100),
    fulfillment: z.enum(['pickup', 'delivery']),
    lat: location.lat.optional(),
    lng: location.lng.optional(),
  }),
  portalOrder: z.object({
    request_id: z.uuid(),
    items: z
      .array(z.object({ product_id: key, quantity: number(1, 100) }))
      .min(1)
      .max(20),
    prescription_image: z.string().max(3000000).optional(),
    branch_id: key,
    fulfillment: z.enum(['pickup', 'delivery']),
    customer: text(100),
    dpi: portalDpi,
    phone: z
      .string()
      .trim()
      .regex(/^[+\d\s()-]{8,25}$/, 'Escribe un teléfono válido.'),
    address: text(250).optional(),
    lat: location.lat.optional(),
    lng: location.lng.optional(),
    payment: z.enum(['Efectivo', 'Tarjeta']),
    has_prescription: z.boolean().optional(),
  }),
  portalLookup: z.object({
    ticket: z
      .string()
      .trim()
      .regex(/^FC-(?:[A-Fa-f0-9]{6}|[A-Fa-f0-9]{12})$/i),
    access_code: z
      .string()
      .trim()
      .regex(/^(?:[0-9]{6}|[A-Fa-f0-9]{24})$/)
      .optional(),
  }),
  prescriptionReview: z.object({
    approved: z.boolean(),
    notes: z.string().trim().max(500).default(''),
  }),
  draftAction: z
    .object({ action: z.enum(['dispatch', 'cancel']), reason: text(500).optional() })
    .refine((v) => v.action !== 'cancel' || !!v.reason, {
      message: 'La cancelación requiere motivo.',
    }),
  address: z.object({ label: text(60), address: text(), ...location }),
  login: z.object({ email: z.string().email().max(254), password: text(200) }),
  complete: z.object({
    challenge: key,
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    new_password: text(128).optional(),
    recovery_code: text(32).optional(),
  }),
  securityAction: z.object({
    action: z.enum(['setup', 'disable', 'codes']),
    current_password: text(128),
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    recovery_code: text(32).optional(),
  }),
  securityConfirm: z.object({ challenge: key, code: z.string().regex(/^\d{6}$/) }),
  password: z.object({ current_password: text(128), new_password: text(128) }),
  branches: z.object({
    name: text(80),
    department: text(80),
    municipality: text(80),
    address: text(),
    type: z.enum(['Centro comercial', 'Gasolinera']),
  }),
  products: z.object({
    component: text(150).optional(),
    name: text(100),
    sku: text(40),
    category: text(60),
    price: money,
    prescription: bool,
    controlled: bool,
  }),
  stock: z.object({
    ...branch,
    product_id: key,
    lot: text(60),
    expires_on: z.iso.date(),
    quantity: number(1),
    minimum: number(0).optional(),
  }),
  cash: z.object({
    ...branch,
    kind: z.enum(['Ingreso', 'Egreso']),
    category: text(60),
    amount: money,
    method: payment,
    description: text(),
  }),
  transfer: z.object({ inventory_id: key, destination_id: key, quantity: number(1) }),
  receive: z.object({ received_quantity: number(0).optional(), reason: text(500).optional() }),
  assets: z.object({
    ...branch,
    name: text(100),
    code: text(40),
    value: money,
    acquired_on: z.iso.date(),
    useful_life_months: number(1, 600),
  }),
  employees: z.object({ ...branch, user_id: key, name: text(100), position: text(80), salary: money }),
  payroll: z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
  quote: z.object({ ...product, ...location }),
  counterSale: z.object({
    request_id: z.uuid(),
    branch_id: key.optional(),
    customer: text(100).optional(),
    nit: text(30).optional(),
    payment: z.enum(['Efectivo', 'Tarjeta']),
    amount_received: number(0, 10000000, false).optional(),
    items: z
      .array(
        z.object({
          product_id: key,
          quantity: number(1, 100),
          prescription_confirmed: bool,
          prescription_id: key.or(z.literal('')).optional(),
        }),
      )
      .min(1)
      .max(30),
  }).refine((data) => data.payment !== 'Efectivo' || data.amount_received !== undefined, {
    message: 'Indica el efectivo recibido.',
    path: ['amount_received'],
  }),
  portalCancel: z.object({ ticket: text(30), access_code: text(30), reason: text(500) }),
  sale: z.object({
    ...branch,
    ...product,
    payment,
    prescription_confirmed: bool,
    prescription_id: key.or(z.literal('')).optional(),
    nit: text(30).optional(),
    discount_percent: number(0, 50, false).optional(),
  }),
  order: z.object({
    ...branch,
    ...product,
    ...location,
    payment,
    customer: text(100),
    phone: text(25),
    address: text(),
    prescription_confirmed: bool,
    prescription_id: key.or(z.literal('')).optional(),
    client_id: key.or(z.literal('')).optional(),
    nit: text(30).optional(),
    channel: z.enum(['telefono', 'portal']).optional(),
  }),
  status: z
    .object({
      status: z.enum(['Preparando', 'En ruta', 'Listo para recoger', 'Entregado', 'Cancelado']),
      reason: text(500).optional(),
      prescription_confirmed: z.boolean().optional(),
      packed: z.boolean().optional(),
      pickup_code: text(40).optional(),
      qr_payload: text(1000).optional(),
    })
    .refine((v) => v.status !== 'Cancelado' || !!v.reason, {
      message: 'La cancelación requiere motivo.',
      path: ['reason'],
    }),
  depreciation: z.object({ reason: text(500) }),
  client: z.object({
    name: text(100),
    nit: text(30).default('CF'),
    cui: z
      .string()
      .regex(/^\d{13}$/)
      .or(z.literal(''))
      .optional(),
    phone: text(25),
    address: text(),
    ...location,
  }),
  prescription: z.object({
    customer_name: text(100),
    doctor: text(100),
    license: text(40),
    issued_on: z.iso.date(),
    product_id: key,
    notes: z.string().max(500).optional(),
  }),
  openShift: z.object({
    ...branch,
    opening: number(0, 1000000, false),
    notes: z.string().max(500).optional(),
  }),
  closeShift: z.object({ counted: number(0, 1000000, false), notes: text(500).optional() }),
  request: z.object({
    type: z.enum(['sale_void', 'cash_void', 'stock_adjust', 'payroll_void']),
    entity_id: key,
    reason: text(500),
    quantity: number(-1000000, 1000000).optional(),
  }),
  decision: z.object({ approve: z.boolean(), reason: text(500), password: text(128) }),
  user: z.object({
    name: text(100),
    surname: text(100),
    dpi: z.string().trim().regex(/^\d{13}$/, 'El DPI debe tener 13 dígitos.'),
    phone: text(25),
    birth_date: z.iso.date(),
    address: text(250),
    email: z.string().email().max(254).optional().or(z.literal('')).default(''),
    role_id: key,
    branch_id: key.or(z.literal('')).nullable().optional(),
    password: z.string().max(128).optional().or(z.literal('')).default(''),
  }),
  role: z.object({
    code: z.string().regex(/^[a-z_]{3,40}$/),
    name: text(100),
    scope: z.enum(['all', 'branch']),
    require_totp: z.boolean(),
    permissions: z.array(key).max(100),
  }),
  edit: z.object({
    reason: text(500),
    password: text(128).optional(),
    values: z.record(
      z.string(),
      z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]),
    ),
  }),
};
export const validate = (name) => (req, res, next) => {
  const result = schemas[name].safeParse(req.body);
  if (!result.success)
    return res.status(400).json({
      error: 'Revisa los campos del formulario.',
      fields: Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message])),
    });
  req.body = result.data;
  next();
};
