import SystemDashboard from './components/SystemDashboard.jsx';
import AssetIncidents from './components/AssetIncidents.jsx';
import CounterSales from './components/CounterSales.jsx';
import InventorySummary from './components/InventorySummary.jsx';
import BrandMark from './components/BrandMark.jsx';
import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Building2,
  Package,
  ArrowLeftRight,
  Wallet,
  Monitor,
  Users,
  Truck,
  ShieldCheck,
  Plus,
  Search,
  Bell,
  ChevronDown,
  Download,
  RefreshCw,
  LogOut,
  ArrowUpRight,
  ArrowDownLeft,
  Activity,
  MapPin,
  Clock,
  Check,
  X,
  CircleHelp,
  ShoppingBag,
  Pill,
  Menu,
  FileText,
  TrendingUp,
  ChevronRight,
  LoaderCircle,
  Eye,
  LockKeyhole,
  CheckCircle2,
  Edit3,
} from 'lucide-react';
import { api, money, count, datetime, day, downloadReport } from './lib/api';
import { municipalityOptions } from './lib/guatemala';
import { SecureLogin, AccountMenu, useInactivity } from './components/Security';
import HistoricalTable from './components/HistoricalTable';
import { moduleViews, parentView, menuSections, moduleInfo } from './lib/navigation';
import { ProcurementPage, PayrollPage, DeliveryPage, MessagesPage } from './components/Expansion';
import { PortalOrderDetail } from './components/PortalOrder';
import {
  Operations,
  moduleNav,
  ReportButtons,
  ThemeToggle,
  RoleDashboard,
  InventoryAlerts,
  GlobalSearch,
} from './components/Operations';
import { Badge, Stat, Table, Panel, LinkButton, Modal, RecordForm, Empty } from './components/ui';

const nav = [
  ['dashboard', 'Resumen general', LayoutDashboard],
  ['branches', 'Sucursales', Building2],
  ['inventory', 'Inventario', Package],
  ['transfers', 'Traslados', ArrowLeftRight],
  ['cash', 'Caja', Wallet],
  ['assets', 'Activos fijos', Monitor],
  ['payroll', 'Personal y planilla', Users],
  ['orders', 'Pedidos y entregas', Truck],
  ['audit', 'Auditoría', ShieldCheck],
  ...moduleNav.map(([key, label, icon]) => [key, label, icon]),
];
const navPermissions = {
  dashboard: 'resumen.ver',
  branches: 'sucursal.ver',
  inventory: 'inventario.ver',
  transfers: 'traslado.ver',
  cash: 'caja.ver',
  assets: 'activo.ver',
  payroll: 'planilla.ver',
  orders: 'pedido.ver',
  audit: 'auditoria.ver',
  ...Object.fromEntries(moduleNav.map(([key, label, icon, permission]) => [key, permission])),
};
const descriptions = {
  alerts:
    'Lotes próximos a vencer y vencidos. Revisa el horizonte antes de disponer del medicamento.',
  procurement: 'Proveedores, compras, costos y devoluciones.',
  payrollPlus: 'Novedades, deducciones, provisiones y pagos detallados.',
  deliveries: 'Asignación, ubicación y coordinación de entregas.',
  myDeliveries: 'Entregas asignadas a tu cuenta y ubicación compartida.',
  messages: 'Notificaciones automáticas generadas durante la gestión de pedidos.',
  dashboard: 'Una mirada a toda tu operación, en un solo lugar.',
  branches: 'Conecta y supervisa cada punto de venta de la red.',
  inventory: 'Control de medicamentos, lotes y fechas de vencimiento.',
  transfers: 'Trazabilidad de medicamentos entre tus sucursales.',
  cash: 'Ventas y movimientos financieros de toda la empresa.',
  assets: 'Control patrimonial y depreciación de equipos.',
  payroll: 'Personal, salarios y pagos por período.',
  orders: 'Disponibilidad en tiempo real para el call center.',
  audit: 'Evidencia de cada operación, con usuario, fecha y detalle.',
  counter: 'Ventas presenciales de farmacia, medicamentos y cobro.',
  users: 'Usuarios, roles, permisos y sesiones.',
  requests: 'Revisión independiente de anulaciones y ajustes.',
  kardex: 'Entradas y salidas por lote.',
  prescriptions: 'Registro de recetas.',
  risk: 'Riesgo operativo y mapa de la red.',
};
const paymentOptions = ['Efectivo', 'Tarjeta', 'Transferencia'].map((v) => ({
  value: v,
  label: v,
}));
const departments = [
  'Guatemala',
  'Alta Verapaz',
  'Baja Verapaz',
  'Chimaltenango',
  'Chiquimula',
  'El Progreso',
  'Escuintla',
  'Huehuetenango',
  'Izabal',
  'Jalapa',
  'Jutiapa',
  'Petén',
  'Quetzaltenango',
  'Quiché',
  'Retalhuleu',
  'Sacatepéquez',
  'San Marcos',
  'Santa Rosa',
  'Sololá',
  'Suchitepéquez',
  'Totonicapán',
  'Zacapa',
];
const tone = (s) =>
  ['Entregado', 'Recibido', 'Activo'].includes(s)
    ? 'green'
    : ['En ruta', 'En tránsito'].includes(s)
      ? 'blue'
      : s === 'Cancelado'
        ? 'red'
        : 'amber';

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <BrandMark />
      </span>
      <div>
        Farma<span>Cali</span>
        <small>GESTIÓN DE FARMACIAS</small>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null),
    [checking, setChecking] = useState(true),
    [data, setData] = useState(null),
    [page, setPage] = useState('dashboard'),
    [branch, setBranch] = useState('all'),
    [search, setSearch] = useState(''),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null),
    [mobile, setMobile] = useState(false),
    [notifications, setNotifications] = useState(false),
    [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [recordAction, setRecordAction] = useState(null);
  useEffect(() => {
    if (!mobile) return;
    const onEscape = (e) => {
      if (e.key === 'Escape') setMobile(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('keydown', onEscape);
    };
  }, [mobile]);
  async function exportFile(name, format = 'csv') {
    try {
      await downloadReport(name, format, branch);
      setToast({ type: 'success', text: 'Reporte descargado y registrado en auditoría.' });
    } catch (e) {
      setToast({ type: 'error', text: e.message });
    }
  }
  useEffect(() => {
    const reportError = (e) => setToast({ type: 'error', text: e.detail });
    window.addEventListener('farmacali-report-error', reportError);
    return () => window.removeEventListener('farmacali-report-error', reportError);
  }, []);
  const logout = useCallback(async () => {
    await api('/auth/logout', {}, 'POST', false).catch(() => {});
    setUser(null);
    setData(null);
    setPage('dashboard');
    setModal(null);
    setError('');
  }, []);
  const idleWarning = useInactivity(user, logout);
  useEffect(() => {
    window.addEventListener('farmacali-expired', logout);
    return () => window.removeEventListener('farmacali-expired', logout);
  }, [logout]);
  const refresh = useCallback(async () => {
    try {
      setData(await api('/snapshot'));
      setError('');
    } catch (e) {
      if (e.status === 401) logout();
      else setError(e.message);
    }
  }, [logout]);
  useEffect(() => {
    api('/auth/me')
      .then(setUser)
      .catch(logout)
      .finally(() => setChecking(false));
  }, [logout]);
  useEffect(() => {
    if (user) {
      refresh();
      const interval = setInterval(refresh, 30000);
      return () => clearInterval(interval);
    }
  }, [user, refresh]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  function go(next) {
    if (!user?.permissions.includes(navPermissions[next])) return;
    setPage(next);
    setSearch('');
    setMobile(false);
    setNotifications(false);
  }
  async function mutate(path, payload, method) {
    setBusy(true);
    setFormErrors({});
    try {
      const result = await api(path, payload, method);
      await refresh();
      setModal(null);
      setToast({ type: 'success', text: 'Operación completada y registrada en auditoría.' });
      return result;
    } catch (e) {
      setFormErrors(e.fields || {});
      setToast({ type: 'error', text: e.message });
      return null;
    } finally {
      setBusy(false);
    }
  }
  if (checking)
    return (
      <div className="loading">
        <LoaderCircle className="spin" /> Conectando con FarmaCali…
      </div>
    );
  if (!user) return <SecureLogin onLogin={setUser} />;
  if (!data)
    return (
      <div className="loading">
        {error ? (
          <>
            <p>{error}</p>
            <button className="secondary-button" onClick={refresh}>
              Reintentar
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" /> Cargando operaciones…
            <div
              className="dashboard-skeleton"
              style={{ width: 'min(450px,85vw)' }}
              aria-hidden="true"
            />
          </>
        )}
      </div>
    );
  const scoped = (rows) => rows.filter((r) => branch === 'all' || r.branch_id === branch);
  const filtered = (rows) =>
    rows.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(search.toLowerCase())),
    );
  const inventory = scoped(data.inventory),
    cash = scoped(data.cash),
    orders = scoped(data.orders),
    assets = scoped(data.assets),
    payroll = scoped(data.payroll);
  const transfers = data.transfers.filter(
    (t) => branch === 'all' || t.source_id === branch || t.destination_id === branch,
  );
  const low = inventory.filter((i) => i.quantity < i.minimum),
    expiring = inventory.filter(
      (i) =>
        i.quantity > 0 &&
        i.expires_on <=
          new Date(new Date(`${data.date}T12:00:00Z`).getTime() + 30 * 86400000)
            .toISOString()
            .slice(0, 10),
    ),
    counterSales = orders.filter(
      (o) => o.channel === 'mostrador' && o.status !== 'Cancelado',
    ),
    todayOrders = orders.filter(
      (o) =>
        o.created_at &&
        new Date(o.created_at).toLocaleDateString('en-CA', {
          timeZone: 'America/Guatemala',
        }) === data.date,
    );
  const admin = user.role === 'admin',
    canManageOrders = user.permissions.includes('pedido.gestionar'),
    write = ['admin', 'branch', 'callcenter'].includes(user.role),
    branchOptions = data.branches
      .filter((b) => b.active)
      .map((b) => ({
        value: b.id,
        label: `${b.name} · ${b.department}`,
      })),
    productOptions = data.products
      .filter((p) => p.state === 'Activo')
      .map((p) => ({ value: p.id, label: p.name }));
  const branchField = {
    name: 'branch_id',
    label: 'Sucursal',
    options: branchOptions,
    default: branch === 'all' ? data.branches[0]?.id : branch,
    wide: true,
  };
  const stockStatus = (i) =>
    i.expires_on <= data.date
      ? ['Vencido', 'red']
      : i.quantity === 0
        ? ['Sin existencias', 'red']
        : i.quantity < i.minimum
          ? ['Stock bajo', 'amber']
          : expiring.some((e) => e.id === i.id)
            ? ['Por vencer', 'amber']
            : ['Disponible', 'green'];
  const fullCash = scoped(data.cash_summary || []);
  const totalIn = fullCash.reduce((n, r) => n + Number(r.income), 0),
    totalOut = fullCash.reduce((n, r) => n + Number(r.expense), 0);
  const exportMap = {
    branches: data.branches,
    inventory,
    transfers,
    cash,
    assets,
    payroll,
    orders,
    clients: data.clients,
    users: data.users,
    requests: data.requests,
    kardex: data.ledger,
    prescriptions: data.prescriptions,
    ...(user.permissions.includes('auditoria.exportar') ? { audit: data.audit } : {}),
  };
  const add = (type) => setModal({ type });
  const recordActions = (entity, row, permission) =>
    user.permissions.includes(permission) ? (
      <div className="table-actions">
        <button
          className="table-button"
          onClick={() => setRecordAction({ type: 'edit', entity, row })}
        >
          <Edit3 size={13} /> Editar
        </button>
        <button
          className="table-button"
          onClick={() => setRecordAction({ type: 'state', entity, row })}
        >
          {['Inactivo', 'Retirado'].includes(row.state || row.status) ? 'Reactivar' : 'Desactivar'}
        </button>
      </div>
    ) : null;
  const actions = {
    branches: admin && ['Nueva sucursal', () => add('branch')],
    inventory: user.permissions.includes('inventario.ingresar') && [
      'Ingresar existencias',
      () => add('stock'),
    ],
    catalog: user.permissions.includes('abastecimiento.gestionar') && [
      'Registrar medicamento con proveedor',
      () => go('procurement'),
    ],
    transfers: user.permissions.includes('traslado.crear') && [
      'Nuevo traslado',
      () => add('transfer'),
    ],

    assets: user.permissions.includes('activo.gestionar') && [
      'Registrar activo',
      () => add('asset'),
    ],
  };
  const fieldSets = {
    branch: {
      title: 'Nueva sucursal',
      path: '/branches',
      fields: [
        { name: 'name', label: 'Nombre', placeholder: 'Ej. Pradera Zacapa' },
        {
          name: 'department',
          label: 'Departamento',
          options: departments.map((d) => ({ value: d, label: d })),
        },
        {
          name: 'municipality',
          label: 'Municipio',
          dependsOn: 'department',
          options: (values) => municipalityOptions(values.department),
        },
        {
          name: 'type',
          label: 'Punto de venta',
          options: ['Centro comercial', 'Gasolinera'].map((v) => ({ value: v, label: v })),
        },
        { name: 'address', label: 'Dirección', wide: true },
      ],
    },
    stock: {
      title: 'Ingresar existencias',
      path: '/inventory',
      fields: [
        branchField,
        { name: 'product_id', label: 'Medicamento', options: productOptions, wide: true },
        { name: 'lot', label: 'Número de lote' },
        { name: 'expires_on', label: 'Fecha de vencimiento', type: 'date' },
        { name: 'quantity', label: 'Cantidad de unidades', type: 'number', min: 1 },
        { name: 'minimum', label: 'Mínimo de alerta', type: 'number', min: 0, default: 20 },
      ],
    },
    transfer: {
      title: 'Crear borrador de traslado',
      path: '/transfer-drafts',
      fields: [
        {
          name: 'inventory_id',
          label: 'Lote de origen',
          options: inventory
            .filter((i) => i.quantity > 0 && i.expires_on > data.date)
            .map((i) => ({
              value: i.id,
              label: `${i.branch_name} · ${i.product_name} · ${i.lot} (${i.quantity} uds.)`,
            })),
          wide: true,
        },
        {
          name: 'destination_id',
          label: 'Sucursal de destino',
          options: (data.transfer_destinations || data.branches)
            .filter((b) => b.active !== 0)
            .map((b) => ({ value: b.id, label: b.name })),
          wide: true,
        },
        { name: 'quantity', label: 'Unidades a trasladar', type: 'number', min: 1 },
      ],
    },
    cash: {
      title: 'Registrar movimiento de caja',
      path: '/cash',
      fields: [
        branchField,
        {
          name: 'kind',
          label: 'Tipo',
          options: ['Ingreso', 'Egreso'].map((v) => ({ value: v, label: v })),
        },
        { name: 'category', label: 'Categoría', placeholder: 'Ej. Alquiler, servicios, ajuste' },
        { name: 'amount', label: 'Monto (Q)', type: 'number', min: 0.01, step: '0.01' },
        { name: 'method', label: 'Forma de pago', options: paymentOptions },
        { name: 'description', label: 'Descripción / referencia', wide: true },
      ],
    },
    sale: {
      title: 'Venta en mostrador',
      path: '/sales',
      fields: [
        { name: 'nit', label: 'NIT del cliente', default: 'CF' },
        {
          name: 'discount_percent',
          label: 'Descuento %',
          type: 'number',
          min: 0,
          max: 50,
          step: '0.01',
          default: 0,
        },
        {
          name: 'prescription_id',
          label: 'Receta registrada (controlados)',
          required: false,
          options: [
            { value: '', label: 'No aplica' },
            ...data.prescriptions.map((p) => ({
              value: p.id,
              label: p.customer_name + ' · ' + p.product_name,
            })),
          ],
        },
        branchField,
        { name: 'product_id', label: 'Medicamento', options: productOptions, wide: true },
        { name: 'quantity', label: 'Unidades', type: 'number', min: 1, default: 1 },
        { name: 'payment', label: 'Forma de pago', options: paymentOptions },
        {
          name: 'prescription_confirmed',
          label: 'Validación de receta',
          type: 'checkbox',
          help: 'Receta verificada, si el medicamento la requiere',
          wide: true,
        },
      ],
    },
    asset: {
      title: 'Registrar activo fijo',
      path: '/assets',
      fields: [
        branchField,
        { name: 'name', label: 'Nombre del activo' },
        { name: 'code', label: 'Código patrimonial', placeholder: 'AF-001' },
        {
          name: 'value',
          label: 'Valor de adquisición (Q)',
          type: 'number',
          min: 0.01,
          step: '0.01',
        },
        { name: 'acquired_on', label: 'Fecha de adquisición', type: 'date', default: data.date },
        {
          name: 'useful_life_months',
          label: 'Vida útil (meses)',
          type: 'number',
          min: 1,
          max: 600,
          default: 60,
        },
      ],
    },
    payroll: {
      title: 'Pagar planilla',
      path: '/payroll',
      fields: [
        {
          name: 'period',
          label: 'Período',
          type: 'month',
          default: data.date.slice(0, 7),
          wide: true,
        },
      ],
    },
  };
  function assetNet(a) {
    if (a.status !== 'Activo') return 0;
    const start = new Date(a.acquired_on),
      end = new Date(data.date);
    const months = Math.max(
      0,
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        end.getUTCMonth() -
        start.getUTCMonth(),
    );
    return Math.max(0, Math.round(a.value_cents * (1 - months / a.useful_life_months)));
  }
  const visibleModules = menuSections
    .flatMap(([, keys]) => keys)
    .map((key) => nav.find((n) => n[0] === key))
    .filter(Boolean)
    .filter(
      ([key]) =>
        user.role !== 'callcenter' || ['dashboard', 'inventory', 'orders', 'counter'].includes(key),
    )
    .filter(
      ([key]) =>
        user.role !== 'branch' || !['branches', 'audit', 'requests'].includes(key),
    )
    .filter(([key]) =>
      (moduleViews[key] || [[key]]).some(([view]) =>
        user.permissions.includes(navPermissions[view]),
      ),
    );
  return (
    <div className={`app-shell top-navigation ${page === 'dashboard' ? 'dashboard-shell' : ''}`}>
      <div className="main-shell">
        {idleWarning}
        <header className="topbar">
          <div className="header-identity">
            <Brand />
            <div className="header-workspace">
              <span>
                {user.scope === 'branch' ? user.branch_name : 'Red de farmacias de Guatemala'}
              </span>
              <small>
                <i />
                Centro de operaciones
              </small>
            </div>
          </div>
          <div className="topbar-right">
            <GlobalSearch
              data={data}
              user={user}
              onNavigate={(key, query) => {
                go(key);
                setSearch(query);
              }}
            />
            <Badge tone="blue">
              {user.role_name}
              {user.role === 'auditor' ? ' · solo lectura' : ''}
            </Badge>
            <ThemeToggle />
            <span className="today">
              <Clock size={15} />
              {day(data.date)}
            </span>
            <div className="notification-anchor">
              <button
                className="icon-button bell"
                aria-label="Ver alertas"
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={19} />
                {low.length + expiring.length > 0 && <i />}
              </button>
              {notifications && (
                <div className="notification-panel">
                  <h3>Alertas de la red</h3>
                  <button
                    onClick={() => {
                      go('inventory');
                      setSearch('');
                    }}
                  >
                    <Package size={18} />
                    <div>
                      <strong>{low.length} lotes con stock bajo</strong>
                      <span>Revisa el inventario de las sucursales</span>
                    </div>
                  </button>
                  <button onClick={() => go('inventory')}>
                    <Clock size={18} />
                    <div>
                      <strong>{expiring.length} lotes vencidos o por vencer</strong>
                      <span>Vencimiento en los próximos 30 días</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
            <AccountMenu user={user} onLogout={logout} />
          </div>
        </header>
        <section className="module-launcher" aria-label="Accesos de trabajo">
          <div className="launcher-heading">
            <div>
              <span className="launcher-eyebrow">TU ESPACIO DE TRABAJO</span>
              <h2>¿Qué necesitas hacer?</h2>
              <p>Elige un módulo para trabajar aquí mismo.</p>
            </div>
            <div className="launcher-tools">
              <button
                className="launcher-help"
                aria-label="Guía del sistema"
                onClick={() => add('help')}
              >
                <CircleHelp size={18} />
                <span>Guía del sistema</span>
              </button>
              <button
                className="module-toggle"
                aria-label="Ver módulos"
                aria-expanded={mobile}
                aria-controls="workspace-modules"
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={19} />
                {mobile ? 'Ocultar módulos' : 'Ver módulos'}
                <ChevronDown size={15} />
              </button>
            </div>
          </div>
          <nav
            id="workspace-modules"
            aria-label="Módulos del sistema"
            style={{ '--module-columns': Math.min(visibleModules.length, 7) }}
            className={`module-grid ${visibleModules.length <= 4 ? 'compact' : ''} ${mobile ? 'expanded' : ''}`}
          >
            {visibleModules.map(([key, label, Icon]) => {
              const [, detail, color] = moduleInfo[key];
              return (
                <button
                  key={key}
                  aria-label={label}
                  aria-current={parentView(page) === key ? 'page' : undefined}
                  className={`module-card module-${color} ${parentView(page) === key ? 'active' : ''}`}
                  onClick={() =>
                    go(
                      (moduleViews[key] || [[key]]).find(([view]) =>
                        user.permissions.includes(navPermissions[view]),
                      )[0],
                    )
                  }
                >
                  <span className="module-icon">
                    <Icon size={22} strokeWidth={1.7} />
                  </span>
                  <span className="module-copy">
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                  {key === 'orders' &&
                    orders.some((o) => !['Entregado', 'Cancelado'].includes(o.status)) && (
                      <b className="module-count">
                        {
                          orders.filter((o) => !['Entregado', 'Cancelado'].includes(o.status))
                            .length
                        }
                      </b>
                    )}
                  <span className="module-active-indicator" aria-hidden="true">
                    <Check size={12} />
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="mobile-module-current">
            <span>Estás en</span>
            <strong>{nav.find((n) => n[0] === page)?.[1]}</strong>
          </div>
        </section>
        <main>
          <div className={`page-heading ${page === 'dashboard' ? 'dashboard-heading' : ''}`}>
            <div>
              <div className="heading-eyebrow">
                {page === 'dashboard' ? 'TU RED, EN TIEMPO REAL' : 'CENTRO DE OPERACIONES'}
              </div>
              <h1>
                {page === 'dashboard'
                  ? `Bienvenido, ${user.name.split(' ')[0]}`
                  : nav.find((n) => n[0] === page)[1]}
              </h1>
              <p>{descriptions[page]}</p>
            </div>
            <div className="heading-actions">
              {!['cash', 'audit', 'kardex'].includes(page) && (
                <ReportButtons page={page} user={user} branch={branch} />
              )}
              {actions[page] && (
                <button className="primary-button" onClick={actions[page][1]}>
                  <Plus size={17} />
                  {actions[page][0]}
                </button>
              )}
            </div>
            {page === 'dashboard' && (
              <div className="welcome-emblem" aria-hidden="true">
                <BrandMark />
                <span>FarmaCali</span>
              </div>
            )}
          </div>
          {moduleViews[parentView(page)] && (
            <nav className="module-tabs" aria-label="Secciones del módulo">
              {moduleViews[parentView(page)]
                .filter(([key]) => user.permissions.includes(navPermissions[key]))
                .map(([key, label]) => (
                  <button
                    key={key}
                    aria-current={page === key ? 'page' : undefined}
                    className={page === key ? 'active' : ''}
                    onClick={() => go(key)}
                  >
                    {label}
                  </button>
                ))}
            </nav>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
              <button onClick={refresh}>Reintentar conexión</button>
            </div>
          )}
          {![
            'procurement',
            'payrollPlus',
            'deliveries',
            'myDeliveries',
            'messages',
            'users',
            'catalog',
          ].includes(page) && (
            <div className="filter-bar">
              <div className="branch-filter">
                <Building2 size={16} />
                <select
                  aria-label="Filtrar por sucursal"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                >
                  <option value="all">
                    {user.scope === 'branch' ? user.branch_name : 'Todas las sucursales'}
                  </option>
                  {data.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              {['cash', 'audit', 'kardex'].includes(page) && (
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Buscar registros"
                    placeholder={`Buscar ${page === 'inventory' ? 'medicamento, lote o sucursal' : 'en registros'}…`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button aria-label="Limpiar búsqueda" onClick={() => setSearch('')}>
                      <X size={15} />
                    </button>
                  )}
                </div>
              )}
              <div className="live-indicator">
                <span />
                Datos actualizados
                <button className="icon-button" aria-label="Actualizar datos" onClick={refresh}>
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
          )}
          {page === 'dashboard' && user.role === 'branch' && (
            <>
              <div className="system-shortcuts" aria-label="Accesos rápidos de sucursal">
                {user.permissions.includes('abastecimiento.gestionar') && (
                  <button className="primary-button" onClick={() => go('procurement')}>
                    Registrar medicamento con proveedor
                  </button>
                )}
                {user.permissions.includes('abastecimiento.ver') && (
                  <button className="secondary-button" onClick={() => go('procurement')}>
                    Proveedores y compras
                  </button>
                )}
                {user.permissions.includes('venta.ver') && (
                  <button className="secondary-button" onClick={() => go('counter')}>
                    Ver ventas
                  </button>
                )}
              </div>
              <div className="stats-grid">
                <Stat
                  label="Ingresos registrados"
                  chartType="line"
                  chartLabel="Ingresos · últimos 7 días"
                  chart={Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(data.date + 'T12:00:00Z');
                    d.setUTCDate(d.getUTCDate() - 6 + i);
                    return scoped(data.cash_daily || [])
                      .filter((r) => r.day === d.toISOString().slice(0, 10) && r.kind === 'Ingreso')
                      .reduce((sum, r) => sum + Number(r.amount_cents || 0) / 100, 0);
                  })}
                  value={money(totalIn)}
                  icon={Wallet}
                  detail={
                    <>
                      <TrendingUp size={14} />
                      Acumulado de movimientos cargados
                    </>
                  }
                />
                <Stat
                  label="Inventario disponible"
                  chartLabel="Unidades vigentes por sucursal"
                  chart={data.branches
                    .filter((b) => branch === 'all' || String(b.id) === String(branch))
                    .map((b) =>
                      inventory
                        .filter((i) => i.branch_id === b.id && i.expires_on > data.date)
                        .reduce((sum, i) => sum + i.quantity, 0),
                    )}
                  value={count(
                    inventory
                      .filter((i) => i.expires_on > data.date)
                      .reduce((s, i) => s + i.quantity, 0),
                  )}
                  icon={Package}
                  tone="blue"
                  detail={<>{data.products.length} medicamentos en catálogo</>}
                />
                <Stat
                  label="Ventas de mostrador"
                  value={money(
                    counterSales.reduce((sum, sale) => sum + Number(sale.total_cents || 0), 0),
                  )}
                  icon={TrendingUp}
                  tone="violet"
                  detail={`${count(counterSales.length)} ventas registradas`}
                />
                <Stat
                  label="Entregas pendientes"
                  chartLabel="Pendiente · preparación · listo · en ruta"
                  chart={['Pendiente', 'Preparando', 'Listo para recoger', 'En ruta'].map(
                    (status) => orders.filter((o) => o.status === status).length,
                  )}
                  value={
                    orders.filter((o) => !['Entregado', 'Cancelado'].includes(o.status)).length
                  }
                  icon={Truck}
                  tone="orange"
                  detail={
                    <>
                      {orders.filter((o) => o.status === 'En ruta').length} en ruta ·{' '}
                      {orders.filter((o) => o.status === 'Preparando').length} en preparación
                    </>
                  }
                />
              </div>
              <Panel
                title="Pedidos de hoy"
                subtitle="Solo lectura: revisa quién registró cada pedido y quién lo atiende."
                action={<LinkButton onClick={() => go('orders')}>Ver pedidos</LinkButton>}
              >
                <Table
                  rows={todayOrders.slice(0, 10)}
                  empty="No hay pedidos registrados hoy."
                  columns={[
                    {
                      label: 'Pedido / cliente',
                      render: (r) => `${r.ticket || '#' + r.id.slice(0, 8)} · ${r.customer}`,
                    },
                    {
                      label: 'Registró',
                      render: (r) =>
                        r.channel === 'portal'
                          ? 'Portal del cliente'
                          : r.created_by_name || 'Sin registro',
                    },
                    {
                      label: 'Call center',
                      render: (r) => r.callcenter_name || 'Sin atención registrada',
                    },
                    { label: 'Repartidor', render: (r) => r.courier_name || 'Sin asignar' },
                    {
                      label: 'Atendido por',
                      render: (r) => r.attended_by_name || 'Sin identificar',
                    },
                    { label: 'Rol', render: (r) => r.attended_by_role || 'Sin identificar' },
                    {
                      label: 'Estado',
                      render: (r) => <Badge tone={tone(r.status)}>{r.status}</Badge>,
                    },
                  ]}
                />
              </Panel>
              <div className="dashboard-middle">
                <Panel
                  title="Flujo de caja"
                  subtitle="Ingresos y egresos de los últimos 7 días"
                  action={
                    <div className="chart-legend">
                      <span>
                        <i />
                        Ingresos
                      </span>
                      <span>
                        <i />
                        Egresos
                      </span>
                    </div>
                  }
                >
                  <CashChart
                    cash={scoped(data.cash_daily || []).map((r) => ({
                      ...r,
                      created_at: r.day + 'T12:00:00Z',
                      amount_cents: Number(r.amount_cents),
                    }))}
                    date={data.date}
                  />
                  <div className="chart-footer">
                    <div>
                      <span>Saldo registrado</span>
                      <strong>{money(totalIn - totalOut)}</strong>
                    </div>
                    <LinkButton onClick={() => go('cash')}>Ver movimientos</LinkButton>
                  </div>
                </Panel>
                <Panel
                  title="Atención requerida"
                  subtitle="Prioridades de tu operación"
                  className="alert-panel"
                >
                  <div
                    className="attention-item"
                    onClick={() => go('inventory')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && go('inventory')}
                  >
                    <span className="attention-icon orange">
                      <Package size={19} />
                    </span>
                    <div>
                      <strong>Inventario bajo</strong>
                      <p>{low.length} lotes debajo del mínimo</p>
                    </div>
                    <b>{low.length}</b>
                    <ChevronRight size={15} />
                  </div>
                  <div
                    className="attention-item"
                    onClick={() => go('inventory')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && go('inventory')}
                  >
                    <span className="attention-icon red">
                      <Clock size={19} />
                    </span>
                    <div>
                      <strong>Vencimientos cercanos</strong>
                      <p>Lotes vencidos o a 30 días</p>
                    </div>
                    <b>{expiring.length}</b>
                    <ChevronRight size={15} />
                  </div>
                  <div
                    className="attention-item"
                    onClick={() => go('transfers')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && go('transfers')}
                  >
                    <span className="attention-icon blue">
                      <ArrowLeftRight size={19} />
                    </span>
                    <div>
                      <strong>Traslados en tránsito</strong>
                      <p>Pendientes de recepción</p>
                    </div>
                    <b>{transfers.filter((t) => t.status === 'En tránsito').length}</b>
                    <ChevronRight size={15} />
                  </div>
                  <div className="audit-callout">
                    <ShieldCheck size={23} />
                    <div>
                      <strong>Cada operación deja evidencia</strong>
                      <p>Consulta el historial de actividad de tu sucursal.</p>
                      <LinkButton onClick={() => go('audit')}>Abrir auditoría</LinkButton>
                    </div>
                  </div>
                </Panel>
              </div>
              <Panel
                title="Tu sucursal"
                subtitle="Existencias y alertas de inventario"
                action={<LinkButton onClick={() => go('inventory')}>Ver inventario</LinkButton>}
              >
                <div className="branch-overview">
                  {data.branches
                    .filter((b) => branch === 'all' || b.id === branch)
                    .map((b) => {
                      const bi = data.inventory.filter((i) => i.branch_id === b.id);
                      return (
                        <button
                          className="branch-mini"
                          key={b.id}
                          onClick={() => {
                            setBranch(b.id);
                            go('inventory');
                          }}
                        >
                          <span
                            className={`branch-symbol ${b.type === 'Gasolinera' ? 'orange' : 'teal'}`}
                          >
                            <Building2 size={20} />
                          </span>
                          <Badge tone={b.active ? 'green' : 'red'}>
                            {b.active ? 'Activa' : 'Cerrada'}
                          </Badge>
                          <h4>{b.name}</h4>
                          <p>
                            <MapPin size={12} />
                            {b.department}
                          </p>
                          <div>
                            <span>Unidades disponibles</span>
                            <strong>
                              {count(
                                bi
                                  .filter((i) => i.expires_on > data.date)
                                  .reduce((s, i) => s + i.quantity, 0),
                              )}
                            </strong>
                          </div>
                          <small>
                            {bi.filter((i) => i.quantity < i.minimum).length
                              ? `${bi.filter((i) => i.quantity < i.minimum).length} lotes requieren reposición`
                              : 'Inventario dentro del mínimo'}
                          </small>
                        </button>
                      );
                    })}
                </div>
              </Panel>
              <Panel
                title="Actividad reciente"
                subtitle="Últimos movimientos registrados en caja"
                action={<LinkButton onClick={() => go('cash')}>Ver historial</LinkButton>}
              >
                <Table
                  rows={cash.slice(0, 5)}
                  columns={[
                    {
                      label: 'Movimiento',
                      render: (r) => (
                        <div className="cell-title">
                          <span
                            className={`movement-icon ${r.kind === 'Ingreso' ? 'teal' : 'orange'}`}
                          >
                            {r.kind === 'Ingreso' ? (
                              <ArrowDownLeft size={17} />
                            ) : (
                              <ArrowUpRight size={17} />
                            )}
                          </span>
                          <div>
                            <strong>{r.category}</strong>
                            <small>{r.description}</small>
                          </div>
                        </div>
                      ),
                    },
                    { label: 'Sucursal', key: 'branch_name' },
                    { label: 'Fecha', render: (r) => datetime(r.created_at) },
                    { label: 'Método', key: 'method' },
                    {
                      label: 'Monto',
                      render: (r) => (
                        <strong className={r.kind === 'Ingreso' ? 'positive' : 'negative'}>
                          {r.kind === 'Ingreso' ? '+' : '−'}
                          {money(r.amount_cents)}
                        </strong>
                      ),
                    },
                  ]}
                />
              </Panel>
            </>
          )}
          {page === 'branches' && (
            <>
              <div className="section-note">
                <MapPin size={17} />
                Cobertura en centros comerciales y stands de gasolineras. Coordenadas usadas para
                asignar entregas.
              </div>
              <div className="branch-grid">
                {filtered(data.branches.filter((b) => branch === 'all' || b.id === branch)).map(
                  (b) => (
                    <section className="branch-card" key={b.id}>
                      <div className="branch-card-top">
                        <span className="branch-symbol teal">
                          <Building2 size={25} />
                        </span>
                        <Badge tone={b.active ? 'green' : 'red'}>
                          {b.active ? 'Activa' : 'Cerrada'}
                        </Badge>
                      </div>
                      <span className="small-label">{b.type}</span>
                      <h3>{b.name}</h3>
                      <p>
                        <MapPin size={14} />
                        {b.department}
                      </p>
                      <div className="branch-address">{b.address}</div>
                      <div className="branch-card-metrics">
                        <div>
                          <span>Inventario</span>
                          <strong>
                            {count(
                              data.inventory
                                .filter((i) => i.branch_id === b.id && i.expires_on > data.date)
                                .reduce((s, i) => s + i.quantity, 0),
                            )}{' '}
                            uds.
                          </strong>
                        </div>
                        <div>
                          <span>Colaboradores</span>
                          <strong>
                            {data.employees.filter((e) => e.branch_id === b.id).length}
                          </strong>
                        </div>
                      </div>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setBranch(b.id);
                          go('inventory');
                        }}
                      >
                        Ver operación
                        <ArrowUpRight size={16} />
                      </button>
                      {recordActions('branches', b, 'sucursal.gestionar')}
                    </section>
                  ),
                )}
              </div>
              {!filtered(data.branches.filter((b) => branch === 'all' || b.id === branch))
                .length && <Empty />}
            </>
          )}
          {page === 'inventory' && (
            <>
              <div className="stats-grid three">
                <Stat
                  label="Unidades vigentes"
                  value={count(
                    inventory
                      .filter((i) => i.expires_on > data.date)
                      .reduce((s, i) => s + i.quantity, 0),
                  )}
                  icon={Package}
                  detail="Existencias aptas por fecha de vencimiento"
                />
                <Stat
                  label="Valor a precio de venta"
                  value={money(
                    inventory
                      .filter((i) => i.expires_on > data.date)
                      .reduce((s, i) => s + i.quantity * i.price_cents, 0),
                  )}
                  icon={Wallet}
                  tone="blue"
                  detail="Referencia comercial del stock vigente"
                />
                <Stat
                  label="Lotes por atender"
                  value={new Set([...low, ...expiring].map((i) => i.id)).size}
                  icon={Clock}
                  tone="orange"
                  detail="Stock bajo, vencidos o próximos a vencer"
                />
              </div>
              <InventorySummary
                inventory={inventory}
                date={data.date}
                branch={branch}
                user={user}
                onAdjust={(row) => setRecordAction({ type: 'request', kind: 'stock_adjust', row })}
              />
            </>
          )}
          {page === 'transfers' && (
            <>
              <div className="section-note">
                <ArrowLeftRight size={17} />
                El stock sale del origen al despachar y entra al destino al confirmar recepción.
              </div>
              <Panel
                title="Movimientos entre sucursales"
                subtitle="Seguimiento por medicamento, lote y cantidad"
              >
                <Table
                  rows={filtered(transfers)}
                  columns={[
                    {
                      label: 'Medicamento / lote',
                      render: (r) => (
                        <div className="cell-stack">
                          <strong>{r.product_name}</strong>
                          <small>{r.lot}</small>
                        </div>
                      ),
                    },
                    {
                      label: 'Origen → destino',
                      render: (r) => (
                        <div className="cell-stack">
                          <strong>{r.source_name}</strong>
                          <small>→ {r.destination_name}</small>
                        </div>
                      ),
                    },
                    { label: 'Unidades', key: 'quantity' },
                    { label: 'Salida', render: (r) => datetime(r.created_at) },
                    {
                      label: 'Estado',
                      render: (r) => (
                        <Badge
                          tone={
                            r.received_quantity !== null && r.received_quantity < r.quantity
                              ? 'amber'
                              : tone(r.status)
                          }
                        >
                          {r.status === 'Recibido' && r.received_quantity < r.quantity
                            ? 'Recibido con diferencia'
                            : r.status}
                        </Badge>
                      ),
                    },
                    {
                      label: 'Recepción',
                      render: (r) =>
                        r.received_at ? (
                          datetime(r.received_at)
                        ) : user.permissions.includes('traslado.recibir') &&
                          (user.scope !== 'branch' || r.destination_id === user.branch_id) ? (
                          <button
                            disabled={busy}
                            className="table-button"
                            onClick={() =>
                              setModal({
                                type: 'confirm',
                                title: 'Confirmar recepción',
                                text: `Confirma que ${r.quantity} unidades de ${r.product_name}, lote ${r.lot}, llegaron a ${r.destination_name}.`,
                                path: `/transfers/${r.id}/receive`,
                                payload: {},
                              })
                            }
                          >
                            <Check size={14} />
                            Recibir
                          </button>
                        ) : (
                          'Pendiente'
                        ),
                    },
                  ]}
                />
              </Panel>
            </>
          )}
          {page === 'cash' && (
            <>
              <div className="stats-grid three">
                <Stat
                  label="Ingresos"
                  value={money(totalIn)}
                  icon={ArrowDownLeft}
                  detail="Ventas y otros ingresos registrados"
                />
                <Stat
                  label="Egresos"
                  value={money(totalOut)}
                  icon={ArrowUpRight}
                  tone="orange"
                  detail="Operación, planilla y otros gastos"
                />
                <Stat
                  label="Saldo de movimientos"
                  value={money(totalIn - totalOut)}
                  icon={Wallet}
                  tone="blue"
                  detail="Ingresos menos egresos; no saldo bancario"
                />
              </div>
              <HistoricalTable
                action={
                  admin && <LinkButton onClick={() => add('cash')}>Otro movimiento</LinkButton>
                }
                kind="cash"
                branch={branch}
                search={search}
                refreshKey={data}
                onDetail={(r) => setModal({ type: 'detail', record: r })}
              />
            </>
          )}
          {page === 'assets' && (
            <>
              <div className="stats-grid three">
                <Stat
                  label="Activos registrados"
                  value={assets.length}
                  icon={Monitor}
                  detail="Equipos identificados por código"
                />
                <Stat
                  label="Valor de adquisición"
                  value={money(assets.reduce((s, a) => s + a.value_cents, 0))}
                  icon={Wallet}
                  tone="blue"
                  detail="Costo original de los activos"
                />
                <Stat
                  label="Valor contable estimado"
                  value={money(assets.reduce((s, a) => s + assetNet(a), 0))}
                  icon={TrendingUp}
                  tone="violet"
                  detail="Depreciación lineal mensual, residual cero"
                />
              </div>
              <Panel
                title="Registro patrimonial"
                subtitle="Depreciación ilustrativa; sin cálculo fiscal"
              >
                <Table
                  rows={filtered(assets)}
                  columns={[
                    {
                      label: 'Activo',
                      render: (r) => (
                        <div className="cell-stack">
                          <strong>{r.name}</strong>
                          <small>{r.code}</small>
                        </div>
                      ),
                    },
                    { label: 'Sucursal', key: 'branch_name' },
                    { label: 'Adquisición', render: (r) => day(r.acquired_on) },
                    { label: 'Costo', render: (r) => money(r.value_cents) },
                    { label: 'Vida útil', render: (r) => `${r.useful_life_months} meses` },
                    { label: 'Valor actual', render: (r) => <strong>{money(assetNet(r))}</strong> },
                    { label: 'Estado', render: (r) => <Badge>{r.status}</Badge> },
                    {
                      label: 'Acciones',
                      render: (r) => recordActions('assets', r, 'activo.gestionar'),
                    },
                  ]}
                />
              </Panel>
            </>
          )}
          {page === 'payroll' && (
            <Panel
              title="Personal por sucursal"
              subtitle="Elige la sucursal en el menú desplegable de la organización."
              action={
                <button
                  className="primary-button"
                  onClick={() =>
                    setModal({ type: 'organization', branchId: data.branches[0]?.id })
                  }
                >
                  Ver organización
                </button>
              }
            />
          )}
          {page === 'counter' && (
            <CounterSales data={data} user={user} branch={branch} refresh={refresh} />
          )}
          {page === 'orders' && (
            <>
              <div className="callcenter-banner">
                <div className="callcenter-icon">
                  <Truck size={30} />
                </div>
                <div>
                  <span className="small-label">
                    {canManageOrders ? 'ATENCIÓN DE PEDIDOS' : 'SUPERVISIÓN DE PEDIDOS'}
                  </span>
                  <h3>
                    {canManageOrders
                      ? 'Consulta y da seguimiento a los pedidos'
                      : 'Pedidos de tu sucursal'}
                  </h3>
                  <p>
                    {canManageOrders
                      ? 'Comprueba medicamentos, sucursal, pago y tiempo estimado. Después, gestiona su preparación y entrega desde la lista.'
                      : 'Vista de solo lectura para supervisar estado, registro y responsable de cada pedido.'}
                  </p>
                </div>
                {canManageOrders && (
                  <button className="primary-button" onClick={() => add('quote')}>
                    <Search size={16} />
                    Consultar disponibilidad
                  </button>
                )}
              </div>
              <Panel
                title="Pedidos y entregas"
                subtitle="Vista de la sucursal: responsable, repartidor y estado de cada pedido."
              >
                <Table
                  rows={filtered(orders.filter((o) => o.channel !== 'mostrador'))}
                  columns={[
                    {
                      label: 'Pedido / cliente',
                      render: (r) => (
                        <div className="cell-stack">
                          <strong>
                            {r.ticket || '#' + r.id.slice(0, 8)} · {r.customer}
                          </strong>
                          <small>
                            {r.phone || 'Venta en mostrador'}
                            {r.channel === 'portal' ? ' · Portal' : ''}
                          </small>
                          {r.channel === 'portal' && (
                            <>
                              <small>
                                {data.order_items
                                  .filter((i) => i.order_id === r.id)
                                  .map(
                                    (i) =>
                                      `${data.products.find((p) => p.id === i.product_id)?.name || i.product_id} × ${i.quantity}`,
                                  )
                                  .join(' · ')}
                              </small>
                            </>
                          )}
                        </div>
                      ),
                    },
                    {
                      label: 'Registró',
                      render: (r) =>
                        r.channel === 'portal'
                          ? 'Portal del cliente'
                          : r.created_by_name || 'Sin registro',
                    },
                    { label: 'Repartidor', render: (r) => r.courier_name || 'Sin asignar' },
                    { label: 'Fecha', render: (r) => datetime(r.created_at) },
                    {
                      label: 'Sucursal / dirección',
                      render: (r) => (
                        <div className="cell-stack">
                          <strong>{r.branch_name}</strong>
                          <small>{r.address}</small>
                          {r.channel === 'portal' && (
                            <small>
                              {r.fulfillment === 'pickup'
                                ? 'Retiro en sucursal'
                                : 'Entrega a domicilio'}
                              {r.reservation_expires_at
                                ? ' · Reserva hasta ' + datetime(r.reservation_expires_at)
                                : ''}
                            </small>
                          )}
                        </div>
                      ),
                    },
                    {
                      label: 'Pago / total',
                      render: (r) => (
                        <div className="cell-stack">
                          <strong>{money(r.total_cents)}</strong>
                          <small>{r.payment}</small>
                        </div>
                      ),
                    },
                    { label: 'Estimación', render: (r) => `${r.eta_minutes} min` },
                    {
                      label: 'Estado',
                      render: (r) => (
                        <div className="cell-stack">
                          <Badge tone={tone(r.status)}>{r.status}</Badge>
                          {r.uploaded_rx_status && <small>Receta: {r.uploaded_rx_status}</small>}
                        </div>
                      ),
                    },
                    {
                      label: 'Acciones',
                      render: (r) => (
                        <button
                          className="table-button"
                          onClick={() => setModal({ type: 'portalDetail', order: r })}
                        >
                          {user.permissions.includes('pedido.gestionar')
                            ? 'Gestionar pedido'
                            : 'Ver pedido'}
                        </button>
                      ),
                    },
                  ]}
                />
              </Panel>
            </>
          )}
          {page === 'audit' && (
            <>
              <div className="audit-banner">
                <ShieldCheck size={24} />
                <div>
                  <strong>Trazabilidad de la operación</strong>
                  <p>
                    El historial se genera automáticamente. Los roles de la aplicación no pueden
                    editarlo ni eliminarlo.
                  </p>
                </div>
                <Badge tone="blue">Solo lectura</Badge>
              </div>
              <HistoricalTable
                kind="audit"
                canExport={user.permissions.includes('auditoria.exportar')}
                branch={branch}
                search={search}
                refreshKey={data}
                onDetail={(r) => setModal({ type: 'detail', record: r })}
              />
            </>
          )}
          {page === 'dashboard' && user.role === 'admin' && (
            <SystemDashboard data={data} onNavigate={go} />
          )}
          {page === 'dashboard' && !['admin', 'branch'].includes(user.role) && (
            <RoleDashboard data={data} user={user} onNavigate={go} />
          )}
          {page === 'assets' && <AssetIncidents data={data} user={user} />}
          {page === 'procurement' && <ProcurementPage data={data} user={user} refresh={refresh} />}
          {page === 'payrollPlus' && <PayrollPage data={data} user={user} refresh={refresh} />}
          {['deliveries', 'myDeliveries'].includes(page) && <DeliveryPage user={user} />}
          {page === 'messages' && <MessagesPage />}
          {page === 'alerts' && (
            <InventoryAlerts data={{ ...data, inventory: scoped(data.inventory) }} />
          )}
          <Operations
            actionRequest={recordAction}
            page={page}
            data={data}
            user={user}
            branch={branch}
            search={search}
            refresh={refresh}
          />
          <footer className="page-footer">
            <span>FarmaCali © {data.date.slice(0, 4)} · Centro de operaciones</span>
            <span>
              <span className="footer-network">
                <i /> Red conectada · {data.branches.length} sucursales
              </span>
              {data.database.includes('SQLite')
                ? 'Prototipo académico · datos ficticios'
                : data.database}
              <span className="footer-dot" />
              Moneda: GTQ
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.type === 'success' ? <CheckCircle2 size={19} /> : <X size={19} />}
          <span>{toast.text}</span>
          <button aria-label="Cerrar aviso" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal && fieldSets[modal.type] && (
        <Modal
          title={fieldSets[modal.type].title}
          onClose={() => !busy && setModal(null)}
          subtitle={
            modal.type === 'payroll'
              ? 'Se pagará a todos los empleados activos de la red, incluso con filtros de sucursal. Sin deducciones en este prototipo.'
              : undefined
          }
        >
          <RecordForm
            fields={fieldSets[modal.type].fields}
            fieldErrors={formErrors}
            busy={busy}
            onSubmit={(v) => mutate(fieldSets[modal.type].path, v)}
            submit={modal.type === 'payroll' ? 'Confirmar pago' : 'Guardar registro'}
          />
        </Modal>
      )}
      {modal && ['order', 'quote'].includes(modal.type) && (
        <DeliveryModal
          data={data}
          readOnly={modal.type === 'quote'}
          busy={busy}
          onClose={() => !busy && setModal(null)}
          onSubmit={(v) => mutate('/orders', v)}
        />
      )}
      {modal?.type === 'confirm' && (
        <Modal title={modal.title} onClose={() => !busy && setModal(null)}>
          <p className="confirm-text">{modal.text}</p>
          <div className="confirm-actions">
            <button className="secondary-button" disabled={busy} onClick={() => setModal(null)}>
              Volver
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => mutate(modal.path, modal.payload, modal.method)}
            >
              {busy ? 'Procesando…' : 'Confirmar operación'}
            </button>
          </div>
        </Modal>
      )}
      {modal?.type === 'portalDetail' && (
        <PortalOrderDetail
          order={data.orders.find((o) => o.id === modal.order.id) || modal.order}
          data={data}
          user={user}
          onClose={() => setModal(null)}
          onChanged={refresh}
        />
      )}
      {modal?.type === 'detail' && (
        <Modal title="Detalle de auditoría" onClose={() => setModal(null)}>
          <div className="detail-grid">
            <span>Usuario</span>
            <strong>{modal.record.user_name}</strong>
            <span>Fecha</span>
            <strong>{datetime(modal.record.created_at)}</strong>
            <span>Operación</span>
            <strong>{modal.record.action}</strong>
            <span>Entidad</span>
            <strong>{modal.record.entity}</strong>
            <span>Referencia</span>
            <strong>{modal.record.entity_id || 'Operación del sistema'}</strong>
            <span>Rol / IP</span>
            <strong>
              {modal.record.role_code} · {modal.record.ip}
            </strong>
            <span>Secuencia</span>
            <strong>{modal.record.sequence}</strong>
            <span>Integridad</span>
            <strong className="audit-integrity-label">
              <CheckCircle2 size={15} /> Registro encadenado y protegido
            </strong>
          </div>
          <div className="audit-readable-detail">
            <strong>Qué ocurrió</strong>
            <p>{(() => {
              const labels = {
                LOGIN: 'Inicio de sesión',
                LOGOUT: 'Cierre de sesión',
                CREAR: 'Registro creado',
                ACTUALIZAR: 'Registro actualizado',
                ELIMINAR: 'Registro desactivado',
              };
              return labels[modal.record.action] || modal.record.action || 'Operación registrada';
            })()}</p>
            <small>La información técnica completa queda conservada para la revisión del auditor.</small>
          </div>
        </Modal>
      )}
      {modal?.type === 'organization' && (
        <Modal
          title="Organización por sucursal"
          subtitle="Selecciona una persona del diagrama para consultar su información y salario."
          onClose={() => setModal(null)}
        >
          <label className="organization-selector">
            <span>Sucursal</span>
            <select
              value={modal.branchId}
              onChange={(e) => setModal({ ...modal, branchId: e.target.value })}
            >
              {data.branches.map((b) => (
                <option value={b.id} key={b.id}>
                  {b.name} · {b.department}
                </option>
              ))}
            </select>
          </label>
          {(() => {
            const accountsById = new Map((data.users || []).map((account) => [account.id, account]));
            const employees = data.employees.filter((employee) => {
              if (employee.branch_id !== modal.branchId || employee.state !== 'Activo') return false;
              if (!employee.user_id) return true;
              return accountsById.get(employee.user_id)?.state === 'Activo';
            });
            const employeeUserIds = new Set(
              employees.map((employee) => employee.user_id).filter(Boolean),
            );
            const branchUsers = (data.users || [])
              .filter(
                (account) =>
                  account.branch_id === modal.branchId &&
                  account.state === 'Activo' &&
                  !employeeUserIds.has(account.id),
              )
              .map((account) => ({
                id: `user-${account.id}`,
                user_id: account.id,
                name: [account.name, account.surname].filter(Boolean).join(' '),
                position: account.role_name,
                branch_id: account.branch_id,
                branch_name: account.branch_name,
                state: account.state,
                salary_cents: null,
              }));
            const people = [...employees, ...branchUsers];
            const management = people.filter((person) =>
              /gerente|director|jefe|encargad/i.test(person.position || ''),
            );
            const supervisors = people.filter(
              (person) =>
                !management.includes(person) &&
                /supervisor|coordinador|subgerente/i.test(person.position || ''),
            );
            const team = people.filter(
              (person) => !management.includes(person) && !supervisors.includes(person),
            );
            const person = (employee) => (
              <button
                className="organization-person"
                key={employee.id}
                onClick={() => setModal({ type: 'userInfo', employee })}
              >
                <span className="avatar small">{employee.name?.[0] || '?'}</span>
                <span className="organization-person-details">
                  <b>{employee.name}</b>
                  <small>{employee.position || 'Puesto no registrado'}</small>
                </span>
              </button>
            );
            const levels = [
              ['management', 'Gerencia', management],
              ['supervision', 'Supervisión y coordinación', supervisors],
              ['team', 'Equipo de sucursal', team],
            ].filter(([, , members]) => members.length);
            return people.length ? (
              <div className="organization-tree">
                {levels.map(([level, title, members]) => (
                  <section className={`organization-level ${level}`} key={level}>
                    <h3>{title}</h3>
                    <div className="organization-level-people">{members.map(person)}</div>
                  </section>
                ))}
              </div>
            ) : (
              <Empty text="Esta sucursal aún no tiene personal registrado." />
            );
          })()}
        </Modal>
      )}
      {modal?.type === 'userInfo' && (() => {
        const employee = modal.employee;
        const account = (data.users || []).find((user) => user.id === employee.user_id);
        const linkedEmployee = employee.user_id
          ? employee
          : data.employees.find((record) => record.user_id === employee.id);
        const salary = employee.salary_cents ?? linkedEmployee?.salary_cents;
        return (
          <Modal
            title="Información del usuario"
            subtitle="Información personal, laboral y de acceso."
            onClose={() => setModal(null)}
          >
            <div className="user-info-card">
              <div className="user-info-avatar">
                {(account?.name || employee.name)?.[0] || '?'}
              </div>
              <h3>
                {[account?.name || employee.name, account?.surname || employee.surname]
                  .filter(Boolean)
                  .join(' ')}
              </h3>
              <p>{employee.position || account?.role_name}</p>
              <dl>
                <dt>Correo</dt>
                <dd>{account?.email || 'Sin cuenta vinculada'}</dd>
                <dt>Rol de acceso</dt>
                <dd>{account?.role_name || 'Sin rol de acceso'}</dd>
                <dt>Sucursal</dt>
                <dd>{employee.branch_name || account?.branch_name || 'Oficina central'}</dd>
                <dt>Salario mensual</dt>
                <dd>{salary == null ? 'No registrado en planilla' : money(salary)}</dd>
                <dt>Teléfono</dt>
                <dd>{account?.phone || 'No registrado'}</dd>
                <dt>Fecha de nacimiento</dt>
                <dd>{account?.birth_date || 'No registrada'}</dd>
                <dt>DPI / CUI</dt>
                <dd>{account?.dpi || 'No registrado'}</dd>
                <dt>Dirección</dt>
                <dd>{account?.address || 'No registrada'}</dd>
                <dt>Estado de usuario</dt>
                <dd>{account?.state || 'Sin cuenta vinculada'}</dd>
                {employee.state && (
                  <>
                    <dt>Estado laboral</dt>
                    <dd>{employee.state}</dd>
                  </>
                )}
              </dl>
            </div>
          </Modal>
        );
      })()}
      {modal?.type === 'help' && (
        <Modal
          title="Guía del sistema"
          subtitle="Un recorrido breve por el trabajo de la farmacia"
          onClose={() => setModal(null)}
        >
          <div className="help-content">
            <p>
              <strong>1. Inventario.</strong> Registra medicamentos e ingresa existencias por
              sucursal, lote y vencimiento. Las ventas utilizan primero los lotes que vencen antes.
            </p>
            <p>
              <strong>2. Traslados.</strong> Despacha un lote hacia otra sucursal y confirma su
              recepción. El inventario en tránsito se conserva por separado.
            </p>
            <p>
              <strong>3. Caja.</strong> Registra una venta para descontar existencias y generar el
              ingreso. Otros ingresos y egresos se registran por separado.
            </p>
            <p>
              <strong>4. Pedidos y entregas.</strong> Pedidos reúne solicitud, receta y preparación.
              Reparto permite asignar y ubicar al repartidor. Avisos muestra las notificaciones enviadas durante el pedido.
              La entrega se confirma con el código o QR y el cobro.
            </p>
            <p>
              <strong>5. Personal y planilla.</strong> Personal e historial contiene colaboradores y
              pagos. Calcular y pagar permite revisar novedades, deducciones y neto antes de
              confirmar el período.
            </p>
            <p>
              <strong>6. Auditoría.</strong> Revisa o exporta eventos. El auditor puede consultar;
              verifica la cadena y exporta la bitácora. El operador de sucursal gestiona su caja,
              inventario y traslados; el call center coordina clientes y pedidos. El administrador
              mantiene los registros y aprueba solicitudes de otra persona.
            </p>
            <div className="section-note">
              Cuatro roles principales: Administrador, Sucursal, Call center y Auditor. El cliente
              utiliza el portal sin crear cuenta; Repartidor permite gestionar las entregas asignadas.
              Actualización cada 30 segundos. La disponibilidad se valida nuevamente al confirmar.
              Los tiempos de entrega son estimaciones geográficas.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CashChart({ cash, date }) {
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(new Date(`${date}T12:00:00Z`).getTime() - (6 - i) * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const businessDate = (v) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guatemala',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(v));
  const values = days.map((d) => ({
    date: d,
    in: cash
      .filter((c) => c.kind === 'Ingreso' && businessDate(c.created_at) === d)
      .reduce((s, c) => s + c.amount_cents, 0),
    out: cash
      .filter((c) => c.kind === 'Egreso' && businessDate(c.created_at) === d)
      .reduce((s, c) => s + c.amount_cents, 0),
  }));
  const max = Math.max(10000, ...values.flatMap((v) => [v.in, v.out])) * 1.2,
    w = 650,
    h = 200,
    left = 65,
    bottom = 165;
  const points = (key) =>
    values.map((v, i) => `${left + i * 90},${bottom - (v[key] / max) * 130}`).join(' ');
  return (
    <div className="cash-chart">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Gráfica de ingresos y egresos de los últimos siete días"
      >
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#8056b2" stopOpacity=".13" />
            <stop offset="1" stopColor="#8056b2" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1={left}
              y1={bottom - i * 43.33}
              x2="622"
              y2={bottom - i * 43.33}
              className="chart-grid-line"
              strokeDasharray="4 4"
            />
            <text x="0" y={bottom - i * 43.33 + 4} className="chart-label">
              Q {count(Math.round((max * i) / 3 / 100))}
            </text>
          </g>
        ))}
        <polygon points={`${left},${bottom} ${points('in')} 605,${bottom}`} fill="url(#area)" />
        <polyline
          points={points('in')}
          fill="none"
          stroke="#8056b2"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <polyline
          points={points('out')}
          fill="none"
          stroke="#ffb443"
          strokeWidth="2.5"
          strokeDasharray="5 4"
          strokeLinejoin="round"
        />
        {values.map((v, i) => (
          <g key={v.date}>
            <circle
              cx={left + i * 90}
              cy={bottom - (v.in / max) * 130}
              r="4"
              className="chart-point"
              stroke="#8056b2"
              strokeWidth="2"
            >
              <title>
                {day(v.date)}: ingresos {money(v.in)}, egresos {money(v.out)}
              </title>
            </circle>
            <text x={left + i * 90} y="194" textAnchor="middle" className="chart-label">
              {new Intl.DateTimeFormat('es-GT', {
                timeZone: 'UTC',
                weekday: 'short',
                day: 'numeric',
              }).format(new Date(v.date))}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DeliveryModal({ data, onSubmit, onClose, busy, readOnly }) {
  const [values, setValues] = useState({
      product_id: data.products[0]?.id || '',
      quantity: 1,
      lat: 14.6134,
      lng: -90.5505,
      customer: '',
      phone: '',
      address: '',
      payment: 'Efectivo',
      prescription_confirmed: false,
      channel: 'telefono',
      nit: 'CF',
      client_id: '',
      prescription_id: '',
    }),
    [quote, setQuote] = useState(null),
    [branchId, setBranchId] = useState(''),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const change = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (['product_id', 'quantity', 'lat', 'lng'].includes(key)) {
      setQuote(null);
      setBranchId('');
    }
  };
  async function consult(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await api('/delivery/quote', values);
      setQuote(r);
      setBranchId(r.options.find((o) => o.serviceable)?.id || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title={readOnly ? 'Consultar disponibilidad' : 'Nuevo pedido a domicilio'}
      subtitle="Consulta y confirma la disponibilidad antes de prometer una entrega."
      onClose={onClose}
    >
      <form onSubmit={consult}>
        <div className="form-grid">
          <label>
            <span>Unidades</span>
            <input
              required
              type="number"
              min="1"
              max="10000"
              value={values.quantity}
              onChange={(e) => change('quantity', e.target.value)}
            />
          </label>
          <label>
            <span>Ubicación de referencia</span>
            <select
              aria-label="Usar ubicación de una sucursal"
              defaultValue=""
              onChange={(e) => {
                const b = data.branches.find((b) => b.id === e.target.value);
                if (b) {
                  setValues((v) => ({ ...v, lat: b.lat, lng: b.lng }));
                  setQuote(null);
                  setBranchId('');
                }
              }}
            >
              <option value="" disabled>
                Elegir referencia cercana
              </option>
              {data.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Latitud del cliente</span>
            <input
              required
              type="number"
              min="13"
              max="18.5"
              step="any"
              value={values.lat}
              onChange={(e) => change('lat', e.target.value)}
            />
          </label>
          <label>
            <span>Longitud del cliente</span>
            <input
              required
              type="number"
              min="-93"
              max="-88"
              step="any"
              value={values.lng}
              onChange={(e) => change('lng', e.target.value)}
            />
          </label>
        </div>
        <button className="secondary-button quote-button" disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}Consultar
          disponibilidad
        </button>
      </form>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {quote && (
        <div className="quote-results">
          <div className="quote-title">
            <strong>Sucursales con existencias vigentes</strong>
            <span>Total: {money(quote.total_cents)}</span>
          </div>
          {quote.options.length ? (
            quote.options.map((b) => (
              <label
                className={`quote-option ${branchId === b.id ? 'selected' : ''} ${!b.serviceable ? 'disabled' : ''}`}
                key={b.id}
              >
                <input
                  type="radio"
                  name="delivery-branch"
                  disabled={!b.serviceable}
                  checked={branchId === b.id}
                  onChange={() => setBranchId(b.id)}
                />
                <div>
                  <strong>{b.name}</strong>
                  <small>
                    {b.department} · {b.available} unidades · {b.distance_km} km
                  </small>
                  <small>
                    {b.explanation} · score {b.score}
                  </small>
                </div>
                <Badge tone={b.serviceable ? 'green' : 'amber'}>
                  {b.serviceable ? `${b.eta_minutes} min` : b.unavailable_reason}
                </Badge>
              </label>
            ))
          ) : (
            <div className="form-error">
              Ninguna sucursal tiene la cantidad solicitada en lotes vigentes.
            </div>
          )}
          <p className="quote-note">
            {quote.note} Radio de servicio: {quote.radius_km} km. Pago: efectivo, tarjeta o
            transferencia; cobro al entregar.
          </p>
        </div>
      )}
      {quote && branchId && !readOnly && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ ...values, branch_id: branchId });
          }}
        >
          <div className="form-divider">Datos para la entrega</div>
          <div className="form-grid">
            <label>
              <span>Canal de atención</span>
              <select
                aria-label="Canal de atención"
                value={values.channel}
                onChange={(e) => change('channel', e.target.value)}
              >
                <option value="telefono">Teléfono / call center</option>
                <option value="portal">Portal (integración futura)</option>
              </select>
            </label>
            <label>
              <span>NIT</span>
              <input
                aria-label="NIT"
                value={values.nit}
                onChange={(e) => change('nit', e.target.value)}
                required
              />
            </label>
            {values.client_id && (
              <label className="wide">
                <span>Direcciones guardadas</span>
                <select
                  aria-label="Direcciones guardadas"
                  defaultValue=""
                  onChange={(e) => {
                    const a = data.addresses.find((a) => a.id === e.target.value);
                    if (a) {
                      setValues((v) => ({ ...v, address: a.address, lat: a.lat, lng: a.lng }));
                      setQuote(null);
                      setBranchId('');
                    }
                  }}
                >
                  <option value="">Seleccionar dirección y volver a cotizar</option>
                  {data.addresses
                    .filter((a) => a.client_id === values.client_id)
                    .map((a) => (
                      <option value={a.id} key={a.id}>
                        {a.label} · {a.address}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {quote.product.controlled === 1 && (
              <label className="wide">
                <span>Receta registrada obligatoria</span>
                <select
                  aria-label="Receta registrada"
                  required
                  value={values.prescription_id}
                  onChange={(e) => change('prescription_id', e.target.value)}
                >
                  <option value="">Selecciona receta</option>
                  {data.prescriptions
                    .filter((p) => p.product_id === values.product_id)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.customer_name} · {p.doctor}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              <span>Nombre del cliente</span>
              <input
                maxLength="100"
                required
                value={values.customer}
                onChange={(e) => change('customer', e.target.value)}
              />
            </label>
            <label>
              <span>Teléfono</span>
              <input
                type="tel"
                maxLength="25"
                required
                placeholder="Ej. 5555 0101"
                value={values.phone}
                onChange={(e) => change('phone', e.target.value)}
              />
            </label>
            <label className="wide">
              <span>Dirección exacta de entrega</span>
              <input
                maxLength="200"
                required
                value={values.address}
                onChange={(e) => change('address', e.target.value)}
              />
            </label>
            <label>
              <span>Forma de pago</span>
              <select value={values.payment} onChange={(e) => change('payment', e.target.value)}>
                {paymentOptions.map((o) => (
                  <option key={o.value}>{o.value}</option>
                ))}
              </select>
            </label>
            {quote.product.prescription === 1 && (
              <label>
                <span>Receta requerida</span>
                <div className="checkbox-line">
                  <input
                    required
                    type="checkbox"
                    checked={values.prescription_confirmed}
                    onChange={(e) => change('prescription_confirmed', e.target.checked)}
                  />
                  <span>Receta validada por el operador</span>
                </div>
              </label>
            )}
          </div>
          <div className="form-footer">
            <span>El stock se reservará al confirmar.</span>
            <button className="primary-button" disabled={busy}>
              {busy ? 'Reservando…' : 'Confirmar pedido'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
