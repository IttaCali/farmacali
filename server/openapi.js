import { z } from 'zod';
import { schemas } from './middleware/validation.js';
const definitions = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => {
    const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
    delete json.$schema;
    return [name, json];
  }),
);
const paths = {};
function add(method, path, summary, schema, permission, publicRoute = false) {
  const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
    name: m[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
  if (!publicRoute && method !== 'get')
    parameters.push({
      name: 'X-CSRF-Token',
      in: 'header',
      required: true,
      description: 'Valor de la cookie csrf entregada al iniciar sesión.',
      schema: { type: 'string' },
    });
  const op = {
    summary,
    tags: [path.split('/')[1]],
    description: permission
      ? `Permiso requerido: ${permission}. La sucursal del operador se toma de su sesión.`
      : 'Sesión propia.',
    security: publicRoute ? [] : [{ cookieAuth: [] }],
    parameters,
    responses: {
      200: { description: 'Operación completada' },
      201: { description: 'Registro creado' },
      400: { description: 'Validación: error y fields por campo' },
      401: { description: 'Sesión o credenciales no válidas' },
      403: { description: 'Permiso, sucursal, CSRF u origen no autorizado' },
      409: { description: 'Conflicto de estado, unicidad o concurrencia' },
    },
  };
  if (schema)
    op.requestBody = {
      required: true,
      content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } },
    };
  paths[path] ??= {};
  paths[path][method] = op;
}
add('get', '/health', 'Salud del servidor', null, null, true);
for (const [path, schema, summary] of [
  [
    '/portal/prescription',
    'replaceRecipe',
    'Reemplazar receta rechazada y conservar versión anterior',
  ],
])
  add('post', path, summary, schema, null, true);
for (const [path, schema, permission] of [
  ['/procurement/suppliers', 'supplier', 'abastecimiento.gestionar'],
  ['/procurement/medicines', 'medicineRegistration', 'abastecimiento.gestionar'],
  ['/procurement/orders', 'purchase', 'abastecimiento.gestionar'],
  ['/procurement/orders/{id}/action', 'purchaseAction', 'abastecimiento.gestionar'],
  ['/procurement/orders/{id}/receive', 'purchaseReceive', 'abastecimiento.gestionar'],
  ['/procurement/returns', 'supplierReturn', 'abastecimiento.gestionar'],
  ['/procurement/returns/{id}/refund', 'empty', 'abastecimiento.gestionar'],
  ['/payroll-detail/rules', 'payrollRules', 'planilla.pagar'],
  ['/payroll-detail/inputs', 'payrollInputs', 'planilla.pagar'],
  ['/payroll-detail/pay', 'payroll', 'planilla.pagar'],
  ['/payroll-detail/benefits', 'payrollBenefit', 'planilla.pagar'],
  ['/deliveries/{id}/assign', 'deliveryAssign', 'entrega.gestionar'],
  [
    '/deliveries/{id}/location',
    'deliveryLocation',
    'entrega.propia o entrega.gestionar (solo simulación)',
  ],
  ['/deliveries/{id}/finish', 'deliveryFinish', 'entrega.propia o entrega.gestionar'],
])
  add(
    'post',
    path,
    path === '/procurement/medicines'
      ? 'Registrar medicamento con proveedor e ingreso inicial a inventario'
      : path,
    schema,
    permission,
  );
for (const [path, permission] of [
  ['/procurement', 'abastecimiento.ver'],
  ['/payroll-detail', 'planilla.ver'],
  ['/deliveries', 'entrega.ver o entrega.propia'],
  ['/messages', 'mensajes.ver'],
  ['/history/{kind}', 'Según historial: caja.ver, kardex.ver o auditoria.ver'],
])
  add('get', path, path, null, permission);
paths['/payroll-detail'].get.parameters.push({
  name: 'period',
  in: 'query',
  required: true,
  schema: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
});
for (const name of ['branch_id', 'from', 'to', 'search', 'page', 'page_size'])
  paths['/history/{kind}'].get.parameters.push({
    name,
    in: 'query',
    schema: { type: 'string' },
    description:
      'Fechas YYYY-MM-DD en Guatemala; página desde 1; page_size de 1 a 200. kind: cash, kardex, audit, history.',
  });
add(
  'get',
  '/orders/{id}/prescription',
  'Ver foto de receta del pedido (privada, con alcance por sucursal)',
  null,
  'pedido.ver',
);
add(
  'post',
  '/orders/{id}/prescription-review',
  'Revisar receta: solo call center o administrador',
  'prescriptionReview',
  'receta.gestionar',
);
add(
  'get',
  '/portal/catalog',
  'Catálogo público y sucursales, sin datos de clientes',
  null,
  null,
  true,
);
add(
  'post',
  '/portal/options',
  'Disponibilidad para retiro o domicilio',
  'portalOptions',
  null,
  true,
);
add(
  'post',
  '/portal/orders',
  'Confirmar pedido público con DPI opcional e idempotencia',
  'portalOrder',
  null,
  true,
);
add(
  'post',
  '/portal/lookup',
  'Consultar estado mediante ticket y código privado',
  'portalLookup',
  null,
  true,
);
add(
  'post',
  '/auth/login',
  'Validar contraseña; obtener paso password, enroll, totp o sesión',
  'login',
  null,
  true,
);
add('post', '/auth/complete', 'Completar clave temporal o segundo factor', 'complete', null, true);
add('get', '/auth/security', 'Estado del autenticador y cantidad de códigos disponibles', null);
add(
  'post',
  '/auth/security',
  'Preparar cambio de app, desvincular o renovar códigos con verificación de identidad',
  'securityAction',
);
add(
  'post',
  '/auth/security/confirm',
  'Confirmar la nueva app y emitir códigos de recuperación de un solo uso',
  'securityConfirm',
);
add('post', '/auth/refresh', 'Rotar refresh: se lee únicamente de la cookie', null, null, true);
for (const [method, path, summary, schema] of [
  ['get', 'me', 'Consultar perfil'],
  ['post', 'logout', 'Revocar sesión y borrar cookies'],
  ['post', 'activity', 'Renovar actividad explícita'],
  ['post', 'password', 'Cambiar clave y revocar todas las sesiones', 'password'],
])
  add(method, `/auth/${path}`, summary, schema);
add('get', '/snapshot', 'Consultar módulos visibles y datos de la sucursal', null, 'resumen.ver');
add(
  'post',
  '/sales/cart',
  'Venta en mostrador con cesta y cobro unico',
  'counterSale',
  'venta.crear',
);
add(
  'post',
  '/portal/cancel',
  'Cancelacion del cliente con ticket y autorizacion',
  'portalCancel',
  null,
  true,
);
add('post', '/orders', 'Ruta de creacion interna deshabilitada; usar portal', null, 'pedido.crear');
add('get', '/asset-incidents', 'Consultar fallas de activos', null, 'activo.ver');
add('post', '/asset-incidents', 'Reportar falla de activo', 'assetIncident', 'activo.reportar');
add(
  'post',
  '/asset-incidents/{id}/resolve',
  'Registrar solucion de una falla',
  'resolveIncident',
  'activo.gestionar',
);
add(
  'post',
  '/roles/{id}/mfa',
  'Exigir MFA por rol y revocar sesiones',
  'roleMfa',
  'usuario.gestionar',
);
const creates = {
  branches: ['branches', 'sucursal.gestionar'],
  inventory: ['stock', 'inventario.ingresar'],
  cash: ['cash', 'caja.gestionar'],
  assets: ['assets', 'activo.gestionar'],
  employees: ['employees', 'planilla.pagar'],
  payroll: ['payroll', 'planilla.pagar'],
  transfers: ['transfer', 'traslado.crear'],

  sales: ['sale', 'venta.crear'],
  users: ['user', 'usuario.gestionar'],
  roles: ['role', 'usuario.gestionar'],
  clients: ['client', 'cliente.gestionar'],
  prescriptions: ['prescription', 'receta.gestionar'],
  'transfer-drafts': ['transfer', 'traslado.crear'],
  shifts: ['openShift', 'caja.gestionar'],
  requests: ['request', 'Según tipo de solicitud'],
};
for (const [route, [schema, permission]] of Object.entries(creates))
  add('post', `/${route}`, `Crear ${route}`, schema, permission);
for (const [method, path, schema, permission] of [
  ['post', '/delivery/quote', 'quote', 'inventario.ver'],
  ['post', '/transfers/{id}/receive', 'receive', 'traslado.recibir'],
  ['patch', '/orders/{id}/status', 'status', 'pedido.gestionar'],
  [
    'post',
    '/manage/{entity}/{id}',
    'edit',
    'Según entidad: usuario, sucursal, activo, planilla, cliente o pedido',
  ],
  ['post', '/requests/{id}/decision', 'decision', 'venta.anular.aprobar'],
  ['post', '/shifts/{id}/close', 'closeShift', 'caja.gestionar'],
  ['post', '/transfer-drafts/{id}/action', 'draftAction', 'traslado.crear'],
  ['post', '/clients/{id}/addresses', 'address', 'cliente.gestionar'],
  ['post', '/assets/{id}/depreciation', 'depreciation', 'activo.gestionar'],
  ['post', '/audit/simulation', null, 'auditoria.verificar'],
])
  add(method, path, path, schema, permission);
for (const [path, permission] of [
  ['/audit/integrity', 'auditoria.verificar'],
  ['/risk', 'riesgo.ver'],
  ['/reports/{name}/{format}', 'Según informe; auditoría solo auditor'],
  ['/openapi.json', 'resumen.ver'],
])
  add('get', path, path, null, permission);
paths['/reports/{name}/{format}'].get.parameters.push({
  name: 'branch_id',
  in: 'query',
  schema: { type: 'string' },
  description: 'all o ID. No amplía el alcance del operador.',
});
paths['/reports/{name}/{format}'].get.description +=
  ' name: sales, orders, inventory, kardex, cash, payroll, audit, branches, transfers, assets, clients, users, requests, prescriptions. format: csv, xlsx, pdf.';
for (const name of ['from', 'to', 'search'])
  paths['/reports/{name}/{format}'].get.parameters.push({
    name,
    in: 'query',
    schema: { type: 'string' },
    description:
      'Filtro para cash, kardex y audit. Exporta todas las coincidencias sin límite de página.',
  });
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'FarmaCali API MVC',
    version: '2.0.0',
    description:
      'Prototipo académico. Cookies HttpOnly, refresh rotativo y CSRF. Pedidos: Pendiente → Preparando → En ruta → Entregado; cancelación requiere motivo. NIT y canal permiten preparar integraciones futuras, sin emitir FEL.',
  },
  servers: [{ url: '/api' }],
  paths,
  components: {
    schemas: definitions,
    securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'access' } },
  },
};
