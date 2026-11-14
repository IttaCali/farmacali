// A module owns its related views; permissions still apply to each view.
export const moduleViews = {
  inventory: [
    ['inventory', 'Existencias'],
    ['kardex', 'Movimientos por lote'],
    ['alerts', 'Vencimientos'],
    ['catalog', 'Catálogo'],
  ],
  orders: [
    ['orders', 'Pedidos'],
    ['deliveries', 'Reparto'],
    ['messages', 'Avisos de prueba'],
  ],
  payroll: [
    ['payroll', 'Personal e historial'],
    ['payrollPlus', 'Calcular y pagar'],
  ],
  counter: [
    ['counter', 'Venta en mostrador'],
    ['prescriptions', 'Recetas registradas'],
  ],
  audit: [
    ['audit', 'Bitácora'],
    ['risk', 'Riesgo y mapa'],
  ],
};
export const parentView = (view) =>
  Object.entries(moduleViews).find(([, views]) => views.some(([key]) => key === view))?.[0] || view;
export const menuSections = [
  [
    'OPERACIÓN',
    [
      'dashboard',
      'orders',
      'inventory',
      'transfers',
      'procurement',
      'cash',
      'counter',
      'myDeliveries',
    ],
  ],
  ['ADMINISTRACIÓN', ['branches', 'payroll', 'assets', 'users']],
  ['SUPERVISIÓN', ['audit', 'requests']],
];
export const moduleInfo = {
  dashboard: ['Resumen general', 'El estado de tu operación', 'blue'],
  orders: ['Pedidos y entregas', 'Atender, preparar y entregar', 'amber'],
  inventory: ['Inventario', 'Medicamentos, lotes y stock', 'green'],
  transfers: ['Traslados', 'Mover entre sucursales', 'cyan'],
  procurement: ['Abastecimiento', 'Proveedores y compras', 'violet'],
  cash: ['Caja', 'Movimientos y control del dinero', 'rose'],
  counter: ['Ventas en mostrador', 'Atender en farmacia y cobrar', 'sky'],
  branches: ['Sucursales', 'Farmacias y stands de la red', 'emerald'],
  payroll: ['Personal y planilla', 'Colaboradores y pagos', 'indigo'],
  assets: ['Activos fijos', 'Equipos y su valor', 'sand'],
  users: ['Usuarios y roles', 'Accesos y permisos', 'slate'],
  audit: ['Auditoría', 'Historial y trazabilidad', 'plum'],
  requests: ['Anulaciones y ajustes', 'Revisar correcciones', 'orange'],
  myDeliveries: ['Mis entregas', 'Pedidos asignados a mi cuenta', 'amber'],
};
