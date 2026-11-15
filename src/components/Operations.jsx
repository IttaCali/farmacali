import MapTiles from './MapTiles.jsx';
import ReportPeriod from './ReportPeriod.jsx';
import HistoricalTable from './HistoricalTable';
import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  Download,
  ShieldCheck,
  Wallet,
  MapPin,
  ArrowUpRight,
  Sun,
  Moon,
  Search,
  Truck,
  Building2,
  ShoppingBag,
  TrendingUp,
  Activity,
} from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api, money, datetime, day, downloadReport } from '../lib/api';
import { municipalityOptions } from '../lib/guatemala.js';
import { validGuatemalanCui } from '../../shared/guatemalan-cui.js';
import { Table, Panel, Modal, RecordForm, Badge, Empty, Stat } from './ui';
const select = (items, labelKey = 'name') =>
  items.map((i) => ({ value: i.id, label: i[labelKey] }));
const guatemalaDepartments = [
  'Alta Verapaz', 'Baja Verapaz', 'Chimaltenango', 'Chiquimula', 'El Progreso',
  'Escuintla', 'Guatemala', 'Huehuetenango', 'Izabal', 'Jalapa', 'Jutiapa',
  'Petén', 'Quetzaltenango', 'Quiché', 'Retalhuleu', 'Sacatepéquez',
  'San Marcos', 'Santa Rosa', 'Sololá', 'Suchitepéquez', 'Totonicapán', 'Zacapa',
].map((value) => ({ value, label: value }));
const text = (name, label, wide = false) => ({ name, label, wide });
const number = (name, label, defaultValue) => ({
  name,
  label,
  type: 'number',
  step: 'any',
  min: 0,
  default: defaultValue,
});
export const moduleNav = [
  ['procurement', 'Abastecimiento', Building2, 'abastecimiento.ver'],
  ['payrollPlus', 'Planilla detallada', Wallet, 'planilla.ver'],
  ['deliveries', 'Coordinación de entregas', Truck, 'entrega.ver'],
  ['myDeliveries', 'Mis entregas', Truck, 'entrega.propia'],
  ['messages', 'Avisos de pedidos', Wallet, 'mensajes.ver'],
  ['counter', 'Ventas en mostrador', Wallet, 'venta.ver'],
  ['users', 'Usuarios y roles', ShieldCheck, 'usuario.ver'],
  ['requests', 'Anulaciones y ajustes', CheckCircle2, 'solicitud.ver'],
  ['kardex', 'Kardex', Wallet, 'kardex.ver'],
  ['alerts', 'Vencimientos', Building2, 'inventario.ver'],
  ['catalog', 'Catálogo de medicamentos', Building2, 'producto.gestionar'],
  ['prescriptions', 'Recetas', ShieldCheck, 'receta.ver'],
  ['risk', 'Riesgo y mapa', MapPin, 'riesgo.ver'],
];
export function ReportButtons({ page, user, branch }) {
  const [open, setOpen] = useState(false),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const map = {
    dashboard: user.role === 'admin' ? ['audit', 'auditoria.exportar'] : ['cash', 'caja.ver'],
    inventory: ['inventory', 'inventario.ver'],
    cash: ['cash', 'caja.ver'],
    payroll: ['payroll', 'planilla.ver'],
    orders: ['orders', 'pedido.ver'],
    counter: ['sales', 'venta.ver'],
    audit: ['audit', 'auditoria.exportar'],
    kardex: ['kardex', 'kardex.ver'],
    branches: ['branches', 'sucursal.ver'],
    transfers: ['transfers', 'traslado.ver'],
    assets: ['assets', 'activo.ver'],
    clients: ['clients', 'cliente.ver'],
    users: ['users', 'usuario.ver'],
    requests: ['requests', 'solicitud.ver'],
    prescriptions: ['prescriptions', 'receta.ver'],
  };
  const item = map[page];
  if (!item || !user.permissions.includes(item[1])) return null;
  const dated = [
    'cash',
    'kardex',
    'audit',
    'sales',
    'orders',
    'payroll',
    'transfers',
    'assets',
    'requests',
    'prescriptions',
  ].includes(item[0]);
  return (
    <>
      <button
        className="secondary-button"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        <Download size={16} />
        Exportar reporte
      </button>
      {open && (
        <Modal
          title="Descargar reporte"
          subtitle="Selecciona el período y el formato del archivo."
          onClose={() => setOpen(false)}
        >
          {dated ? (
            <ReportPeriod
              from={from}
              to={to}
              onChange={(a, b) => {
                setFrom(a);
                setTo(b);
              }}
            />
          ) : (
            <p>
              Este reporte muestra el estado actual de los registros de la sucursal seleccionada.
            </p>
          )}
          {item[0] === 'payroll' && (
            <p>
              La planilla se organiza por mes: las fechas seleccionadas incluyen los períodos
              mensuales correspondientes, sin prorratear salarios.
            </p>
          )}
          <p>Excel incluye título, filtros aplicados, encabezados fijos y cifras con formato.</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="report-buttons">
            {['xlsx', 'pdf', 'csv'].map((format) => (
              <button
                className={format === 'xlsx' ? 'primary-button' : 'secondary-button'}
                disabled={busy}
                key={format}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await downloadReport(
                      item[0],
                      format,
                      branch,
                      dated
                        ? { from, to, ...(page === 'counter' ? { channel: 'mostrador' } : {}) }
                        : {},
                    );
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Download size={15} />
                {format === 'xlsx' ? 'Descargar Excel' : format.toUpperCase()}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
export function Operations({
  page,
  data,
  user,
  refresh,
  branch = 'all',
  search = '',
  actionRequest,
}) {
  const [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [fieldsError, setFieldsError] = useState({}),
    [integrity, setIntegrity] = useState(null),
    [risk, setRisk] = useState([]),
    [tab, setTab] = useState('');
  const can = (p) => user.permissions.includes(p),
    branches = select(data.branches),
    products = select(data.products),
    scope = (rows) => rows.filter((r) => branch === 'all' || r.branch_id === branch),
    filter = (rows) =>
      scope(rows).filter((r) =>
        Object.values(r).some((v) => String(v).toLowerCase().includes(search.toLowerCase())),
      );
  const branchField = {
      name: 'branch_id',
      label: 'Sucursal',
      options: branches,
      default: user.branch_id || data.branches[0]?.id,
    },
    reason = { name: 'reason', label: 'Motivo obligatorio', wide: true },
    password = { name: 'password', label: 'Confirma tu contraseña', type: 'password', wide: true };
  async function run(path, body, method) {
    setBusy(true);
    setError('');
    setFieldsError({});
    try {
      const out = await api(path, body, method);
      await refresh();
      if (out?.credentials) setModal({ title: 'Acceso creado', credentials: out.credentials });
      else setModal(null);
      return out;
    } catch (e) {
      setError(e.message);
      setFieldsError(e.fields || {});
      return null;
    } finally {
      setBusy(false);
    }
  }
  function form(title, path, fields, initial = {}, transform = (v) => v) {
    setError('');
    setFieldsError({});
    setModal({ title, path, fields, initial, transform });
  }
  async function verify() {
    setBusy(true);
    setError('');
    try {
      setIntegrity(await api('/audit/integrity'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function simulate() {
    setBusy(true);
    setError('');
    try {
      const r = await api('/audit/simulation', {});
      setModal({ title: 'Simulación de alteración', simulation: r });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (page === 'risk')
      api('/risk')
        .then(setRisk)
        .catch((e) => setError(e.message));
  }, [page, data]);
  const editFields = {
    branches: [
      text('name', 'Nombre'),
      { name: 'department', label: 'Departamento', options: guatemalaDepartments },
      {
        name: 'municipality',
        label: 'Municipio',
        dependsOn: 'department',
        options: (values) => municipalityOptions(values.department),
      },
      text('address', 'Dirección exacta y referencia', true),
      {
        name: 'type',
        label: 'Tipo',
        options: ['Centro comercial', 'Gasolinera'].map((t) => ({ value: t, label: t })),
      },
      { name: 'opens_at', label: 'Hora de apertura', type: 'time' },
      { name: 'closes_at', label: 'Hora de cierre', type: 'time' },
    ],
    products: [
      text('name', 'Medicamento'),
      text('sku', 'SKU'),
      text('component', 'Componente o principio activo'),
      text('category', 'Clasificación'),
      number('price', 'Precio Q'),
      {
        name: 'prescription',
        label: 'Requiere receta',
        type: 'checkbox',
        help: 'Receta requerida',
      },
      {
        name: 'controlled',
        label: 'Controlado',
        type: 'checkbox',
        help: 'Exigir receta registrada',
      },
    ],
    employees: [
      text('name', 'Nombre completo'),
      text('position', 'Puesto / función'),
      { ...branchField, label: 'Sucursal asignada' },
      number('salary', 'Salario mensual Q'),
      {
        name: 'user_id',
        label: 'Cuenta de usuario vinculada',
        required: false,
        help: 'Selecciona la cuenta creada previamente en «Usuarios y roles».',
        options: [{ value: '', label: 'Sin vínculo por ahora' }, ...select(data.users)],
      },
      {
        name: 'state',
        label: 'Estado',
        options: ['Activo', 'Suspendido', 'Retirado'].map((v) => ({ value: v, label: v })),
      },
    ],
    assets: [
      text('name', 'Nombre'),
      branchField,
      number('value', 'Valor Q'),
      { name: 'acquired_on', label: 'Adquisición', type: 'date' },
      number('useful_life_months', 'Vida útil en meses'),
    ],
    users: [
      text('name', 'Nombres'),
      { ...text('surname', 'Apellidos'), required: false },
      {
        name: 'dpi',
        label: 'DPI / CUI',
        required: false,
        maxLength: 13,
        inputMode: 'numeric',
        placeholder: '13 dígitos',
        normalize: (value) => value.replace(/\D/g, '').slice(0, 13),
        validate: (value) =>
          !value || validGuatemalanCui(value)
            ? ''
            : value.length !== 13
              ? 'El DPI debe contener exactamente 13 dígitos.'
              : 'El DPI no es válido. Revisa el dígito verificador, departamento y municipio.',
        help: '13 dígitos con verificación de CUI de Guatemala.',
      },
      {
        name: 'phone',
        label: 'Teléfono celular',
        required: false,
        type: 'tel',
        default: '+502 ',
        maxLength: 13,
        inputMode: 'numeric',
        placeholder: '+502 55555555',
        pattern: '\\+502 \\d{8}',
        normalize: (value) => {
          let digits = value.replace(/\D/g, '');
          if (digits.length > 8 && digits.startsWith('502')) digits = digits.slice(3);
          return `+502 ${digits.slice(0, 8)}`;
        },
        validate: (value) =>
          /^\+502 \d{8}$/.test(value)
            ? ''
            : 'Escribe los 8 dígitos del celular después de +502.',
        help: 'Código de Guatemala +502 y 8 dígitos.',
      },
      { name: 'birth_date', label: 'Fecha de nacimiento', required: false, type: 'date' },
      { ...text('address', 'Domicilio', true), required: false },
      { name: 'email', label: 'Correo institucional', type: 'email' },
      { name: 'role_id', label: 'Rol', options: select(data.roles) },
      {
        name: 'branch_id',
        label: 'Sucursal asignada',
        default: '',
        required: false,
        help: 'Obligatoria para cuentas de call center y roles de sucursal.',
        options: [{ value: '', label: 'Oficina central / administración' }, ...branches],
      },
    ],
    clients: [
      text('name', 'Nombre'),
      text('nit', 'NIT'),
      { name: 'cui', label: 'CUI (opcional)', required: false, maxLength: 13 },
      text('phone', 'Teléfono'),
      text('address', 'Dirección', true),
      { name: 'lat', label: 'Latitud', type: 'number', step: 'any' },
      { name: 'lng', label: 'Longitud', type: 'number', step: 'any' },
    ],
    orders: [
      branchField,
      text('customer', 'Cliente'),
      text('phone', 'Teléfono'),
      text('address', 'Dirección', true),
      { name: 'lat', label: 'Latitud', type: 'number', step: 'any' },
      { name: 'lng', label: 'Longitud', type: 'number', step: 'any' },
      {
        name: 'payment',
        label: 'Pago',
        options: ['Efectivo', 'Tarjeta', 'Transferencia'].map((v) => ({ value: v, label: v })),
      },
    ],
  };
  const permissions = {
    branches: 'sucursal.gestionar',
    products: 'producto.gestionar',
    employees: 'planilla.pagar',
    assets: 'activo.gestionar',
    users: 'usuario.gestionar',
    clients: 'cliente.gestionar',
    orders: 'pedido.gestionar',
  };
  function edit(entity, r) {
    form(
      `Editar ${entity === 'users' ? 'usuario' : 'registro'}`,
      `/manage/${entity}/${r.id}`,
      [...editFields[entity], reason],
      {
        ...r,
        price: r.price_cents / 100,
        value: r.value_cents / 100,
        salary: r.salary_cents / 100,
        prescription: !!r.prescription,
        controlled: !!r.controlled,
      },
      (v) => {
        const { reason, ...values } = v;
        return { reason, values };
      },
    );
  }
  function state(entity, r) {
    const inactive = (r.state || r.status) === 'Inactivo' || r.state === 'Retirado';
    form(
      inactive ? 'Reactivar registro' : 'Desactivar registro',
      `/manage/${entity}/${r.id}`,
      [reason, ...(inactive ? [] : [password])],
      {},
      (v) => ({ ...v, values: { action: inactive ? 'activate' : 'deactivate' } }),
    );
  }
  const actions = (entity, r) => (
    <div className="table-actions">
      {can(permissions[entity]) && (
        <>
          <button className="table-button" onClick={() => edit(entity, r)}>
            <Edit3 size={12} />
            Editar
          </button>
          {entity !== 'orders' && (
            <button
              className="icon-button danger"
              aria-label="Cambiar estado"
              onClick={() => state(entity, r)}
            >
              <Trash2 size={14} />
            </button>
          )}
        </>
      )}
    </div>
  );
  function request(type, row) {
    form(
      'Solicitar revisión',
      '/requests',
      [
        ...(type === 'stock_adjust'
          ? [
              {
                name: 'quantity',
                label: 'Ajuste de unidades (+ / −)',
                type: 'number',
                min: -1000000,
              },
            ]
          : []),
        reason,
      ],
      {},
      (v) => ({ ...v, type, entity_id: row.id }),
    );
  }
  useEffect(() => {
    if (!actionRequest) return;
    if (actionRequest.type === 'edit') edit(actionRequest.entity, actionRequest.row);
    if (actionRequest.type === 'state') state(actionRequest.entity, actionRequest.row);
    if (actionRequest.type === 'request') request(actionRequest.kind, actionRequest.row);
  }, [actionRequest]);
  const content = [];
  function recordRecipe() {
    form(
      'Registrar receta',
      '/prescriptions',
      [
        text('customer_name', 'Paciente'),
        text('doctor', 'Médico'),
        text('license', 'Colegiado'),
        { name: 'issued_on', label: 'Fecha de emisión', type: 'date' },
        { name: 'product_id', label: 'Medicamento', options: products },
        { name: 'notes', label: 'Observaciones', required: false, wide: true },
      ],
      { issued_on: data.date },
    );
  }
  if (page === 'counter' && can('receta.gestionar'))
    content.push(
      <Panel
        key="clientrecipe"
        title="Recetas del cliente"
        subtitle="Registrar los datos documentales antes de solicitar un medicamento controlado"
        action={
          <button className="secondary-button" onClick={recordRecipe}>
            Registrar receta
          </button>
        }
      />,
    );
  if (page === 'clients')
    content.push(
      <Panel
        key="clients"
        title="Clientes y direcciones"
        subtitle="NIT y CUI protegido con AES-256-GCM; historial vinculado a pedidos"
        action={
          can('cliente.gestionar') && (
            <button
              className="primary-button"
              onClick={() =>
                form('Nuevo cliente', '/clients', editFields.clients, {
                  nit: 'CF',
                  lat: 14.6134,
                  lng: -90.5505,
                })
              }
            >
              <Plus size={15} />
              Nuevo cliente
            </button>
          )
        }
      >
        <Table
          rows={filter(data.clients)}
          columns={[
            { label: 'Cliente', key: 'name' },
            { label: 'NIT', key: 'nit' },
            { label: 'Teléfono', key: 'phone' },
            { label: 'Dirección', key: 'address' },
            {
              label: 'Pedidos',
              render: (r) => data.orders.filter((o) => o.client_id === r.id).length,
            },
            {
              label: 'Estado',
              render: (r) => <Badge tone={r.state === 'Activo' ? 'green' : 'red'}>{r.state}</Badge>,
            },
            {
              label: 'Acciones',
              render: (r) => (
                <>
                  {actions('clients', r)}
                  <button
                    className="link-button"
                    onClick={() => setModal({ title: 'Historial y direcciones', client: r })}
                  >
                    Ver historial
                  </button>
                  {can('cliente.gestionar') && (
                    <button
                      className="link-button"
                      onClick={() =>
                        form(
                          'Agregar dirección',
                          `/clients/${r.id}/addresses`,
                          [
                            text('label', 'Referencia'),
                            text('address', 'Dirección', true),
                            { name: 'lat', label: 'Latitud', type: 'number', step: 'any' },
                            { name: 'lng', label: 'Longitud', type: 'number', step: 'any' },
                          ],
                          { lat: r.lat, lng: r.lng },
                        )
                      }
                    >
                      Otra dirección
                    </button>
                  )}
                </>
              ),
            },
          ]}
        />
      </Panel>,
    );
  if (page === 'users')
    content.push(
      <React.Fragment key="users">
        <Panel
          title="Usuarios y roles"
          subtitle="Busca por usuario, correo, rol o sucursal; cada fila ofrece configuración e información."
          action={
            can('usuario.gestionar') && (
              <button
                className="primary-button"
                onClick={() =>
                  form('Crear usuario', '/users', [
                    ...editFields.users.filter((field) => !['email'].includes(field.name)).map((field) =>
                      ['surname', 'dpi', 'phone', 'birth_date', 'address'].includes(field.name)
                        ? { ...field, required: true }
                        : field,
                    ),
                  ])
                }
              >
                <Plus size={15} />
                Crear usuario
              </button>
            )
          }
        >
          <Table
            rows={filter(data.users)}
            searchPlaceholder="Buscar usuario, correo, rol o sucursal..."
            columns={[
              { label: 'Usuario', key: 'name' },
              { label: 'Correo', key: 'email' },
              { label: 'Rol', key: 'role_name' },
              { label: 'Sucursal', render: (r) => r.branch_name || 'Oficina central' },
              {
                label: '2FA',
                render: (r) => (r.totp_enabled ? 'Activado' : 'Pendiente / no requerido'),
              },
              { label: 'Estado', key: 'state' },
              {
                label: 'Acciones',
                render: (r) => (
                  <div className="table-actions">
                    {can('usuario.gestionar') && (
                      <button
                        className="table-button"
                        onClick={() => setModal({ title: `Configurar ${r.name}`, userConfig: r })}
                      >
                        Configurar usuario
                      </button>
                    )}
                    <button
                      className="table-button"
                      onClick={() => setModal({ title: `Información de ${r.name}`, userInfo: r })}
                    >
                      Información
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </Panel>
      </React.Fragment>,
    );
  if (page === 'requests')
    content.push(
      <Panel
        key="requests"
        title="Solicitudes de anulación y ajuste"
        subtitle="Quien solicita nunca puede aprobar; los reversos conservan el documento original"
      >
        <Table
          rows={filter(data.requests)}
          columns={[
            { label: 'Tipo', key: 'type' },
            { label: 'Solicitante', key: 'requester_name' },
            { label: 'Motivo', key: 'reason' },
            { label: 'Estado', key: 'status' },
            { label: 'Aprobador', key: 'approver_name' },
            { label: 'Fecha', render: (r) => datetime(r.created_at) },
            {
              label: 'Acción',
              render: (r) =>
                r.status === 'Pendiente' &&
                can('venta.anular.aprobar') &&
                r.requester_id !== user.id ? (
                  <button
                    className="table-button"
                    onClick={() =>
                      form(
                        'Resolver solicitud',
                        `/requests/${r.id}/decision`,
                        [
                          {
                            name: 'approve',
                            label: 'Decisión',
                            options: [
                              { value: 'true', label: 'Aprobar' },
                              { value: 'false', label: 'Rechazar' },
                            ],
                          },
                          reason,
                          password,
                        ],
                        {},
                        (v) => ({ ...v, approve: v.approve === 'true' }),
                      )
                    }
                  >
                    Resolver
                  </button>
                ) : r.requester_id === user.id ? (
                  'Esperando otra persona'
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </Panel>,
    );
  if (page === 'assets')
    content.push(
      <React.Fragment key="asset-history">
        <Panel
          title="Registrar valoración mensual"
          subtitle="Depreciación lineal estimada; se conserva una valoración por activo y mes"
        >
          <Table
            rows={filter(data.assets.filter((a) => a.status === 'Activo'))}
            columns={[
              { label: 'Activo', key: 'name' },
              { label: 'Código', key: 'code' },
              {
                label: 'Acción',
                render: (r) =>
                  can('activo.gestionar') ? (
                    <button
                      className="table-button"
                      onClick={() =>
                        form('Registrar depreciación', `/assets/${r.id}/depreciation`, [reason])
                      }
                    >
                      Registrar este mes
                    </button>
                  ) : (
                    'Solo lectura'
                  ),
              },
            ]}
          />
        </Panel>
        <Panel title="Historial de depreciación">
          <Table
            rows={data.depreciation}
            columns={[
              { label: 'Activo', key: 'asset_name' },
              { label: 'Período', key: 'period' },
              { label: 'Valor', render: (r) => money(r.original_cents) },
              { label: 'Depreciación', render: (r) => money(r.depreciation_cents) },
              { label: 'Valor neto', render: (r) => money(r.net_cents) },
            ]}
          />
        </Panel>
      </React.Fragment>,
    );
  if (page === 'payroll')
    content.push(
      <Panel
        key="salaryhistory"
        title="Historial de salarios"
        subtitle="Las modificaciones registran importe, motivo y responsable; el almacenamiento es cifrado"
      >
        <Table
          rows={data.salary_history}
          columns={[
            { label: 'Empleado', key: 'employee_name' },
            { label: 'Salario', render: (r) => money(r.salary_cents) },
            { label: 'Motivo', key: 'reason' },
            { label: 'Fecha', render: (r) => datetime(r.created_at) },
          ]}
        />
      </Panel>,
    );
  if (page === 'audit' && can('auditoria.verificar'))
    content.push(
      <Panel
        key="simulation"
        title="Verificación de integridad"
        subtitle="Se altera una copia en memoria, sin cambiar los registros reales"
        action={
          <button disabled={busy} className="secondary-button" onClick={simulate}>
            Simular alteración en copia
          </button>
        }
      />,
    );
  if (page === 'kardex')
    content.push(
      <HistoricalTable
        key="kardex"
        kind="kardex"
        branch={branch}
        search={search}
        refreshKey={data}
      />,
    );
  if (page === 'prescriptions')
    content.push(
      <Panel
        key="prescriptions"
        title="Recetas registradas"
        subtitle="Validación documental por el operador; no consulta automáticamente registros médicos"
        action={
          can('receta.gestionar') && (
            <button
              className="primary-button"
              onClick={() =>
                form(
                  'Registrar receta',
                  '/prescriptions',
                  [
                    text('customer_name', 'Paciente'),
                    text('doctor', 'Médico'),
                    text('license', 'Colegiado'),
                    { name: 'issued_on', label: 'Fecha de emisión', type: 'date' },
                    { name: 'product_id', label: 'Medicamento', options: products },
                    { name: 'notes', label: 'Observaciones', required: false, wide: true },
                  ],
                  { issued_on: data.date },
                )
              }
            >
              <Plus size={15} />
              Registrar receta
            </button>
          )
        }
      >
        <Table
          rows={filter(data.prescriptions)}
          columns={[
            { label: 'Paciente', key: 'customer_name' },
            { label: 'Médico', key: 'doctor' },
            { label: 'Colegiado', key: 'license' },
            { label: 'Medicamento', key: 'product_name' },
            { label: 'Emisión', render: (r) => day(r.issued_on) },
          ]}
        />
      </Panel>,
    );
  if (page === 'audit' && can('auditoria.verificar'))
    content.push(
      <Panel
        key="integrity"
        title="Integridad de la bitácora"
        subtitle="Verifica secuencia, hashes encadenados y ancla de la cadena"
        action={
          <button className="primary-button" disabled={busy} onClick={verify}>
            <ShieldCheck size={16} />
            Verificar integridad
          </button>
        }
      >
        {integrity && (
          <div className={`integrity-result ${integrity.valid ? 'ok' : 'bad'}`}>
            <strong>{integrity.valid ? 'Cadena íntegra' : 'Alteración detectada'}</strong>
            <span>
              {integrity.checked} registros comprobados
              {integrity.record_id ? ` · registro ${integrity.record_id}` : ''}
            </span>
            {integrity.reason && <p>{integrity.reason}</p>}
            <code>{integrity.head_hash}</code>
          </div>
        )}
      </Panel>,
    );
  if (page === 'cash')
    content.push(
      <React.Fragment key="shifts">
        <Panel
          title="Turnos y cierre de caja"
          subtitle="El esperado considera apertura y movimientos en efectivo del turno"
          action={
            can('caja.gestionar') && (
              <button
                className="secondary-button"
                onClick={() =>
                  form('Abrir turno', '/shifts', [
                    branchField,
                    number('opening', 'Efectivo inicial Q', 0),
                    { name: 'notes', label: 'Observación', required: false, wide: true },
                  ])
                }
              >
                <Plus size={15} />
                Abrir turno
              </button>
            )
          }
        >
          <Table
            rows={filter(data.shifts)}
            columns={[
              { label: 'Sucursal', key: 'branch_name' },
              { label: 'Cajero', key: 'user_name' },
              { label: 'Inicio', render: (r) => datetime(r.opened_at) },
              { label: 'Apertura', render: (r) => money(r.opening_cents) },
              {
                label: 'Esperado',
                render: (r) => (r.expected_cents === null ? '—' : money(r.expected_cents)),
              },
              {
                label: 'Contado',
                render: (r) => (r.counted_cents === null ? '—' : money(r.counted_cents)),
              },
              {
                label: 'Diferencia',
                render: (r) => (r.difference_cents === null ? '—' : money(r.difference_cents)),
              },
              { label: 'Estado', key: 'state' },
              {
                label: 'Acción',
                render: (r) =>
                  r.state === 'Abierto' && can('caja.gestionar') ? (
                    <button
                      className="table-button"
                      onClick={() =>
                        form('Cerrar turno', `/shifts/${r.id}/close`, [
                          number('counted', 'Efectivo contado Q', 0),
                          {
                            name: 'notes',
                            label: 'Motivo de diferencia / nota',
                            required: false,
                            wide: true,
                          },
                        ])
                      }
                    >
                      Cerrar turno
                    </button>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        </Panel>
        {can('venta.anular.solicitar') && (
          <Panel
            title="Documentos para solicitar anulación"
            subtitle="La solicitud no cambia caja ni inventario hasta ser aprobada"
          >
            <Table
              rows={filter(
                data.orders.filter((o) => o.channel === 'mostrador' && o.status === 'Entregado'),
              )}
              columns={[
                { label: 'Venta', render: (r) => r.id.slice(0, 8) },
                { label: 'Sucursal', key: 'branch_name' },
                { label: 'Total', render: (r) => money(r.total_cents) },
                {
                  label: 'Acción',
                  render: (r) => (
                    <button className="table-button" onClick={() => request('sale_void', r)}>
                      Solicitar anulación
                    </button>
                  ),
                },
              ]}
            />
            <Table
              rows={filter(
                data.cash.filter(
                  (c) =>
                    ![
                      'Planilla',
                      'Venta en mostrador',
                      'Entrega a domicilio',
                      'Contra-asiento',
                      'Diferencia de caja',
                    ].includes(c.category),
                ),
              )}
              columns={[
                { label: 'Movimiento', key: 'description' },
                { label: 'Tipo', key: 'kind' },
                { label: 'Monto', render: (r) => money(r.amount_cents) },
                {
                  label: 'Acción',
                  render: (r) => (
                    <button className="table-button" onClick={() => request('cash_void', r)}>
                      Solicitar reverso
                    </button>
                  ),
                },
              ]}
            />
          </Panel>
        )}
      </React.Fragment>,
    );
  if (page === 'payroll' && can('planilla.ver'))
    content.push(
      <Panel
        key="voidpay"
        title="Historial de planilla"
        subtitle="Una anulación aprobada conserva el pago y permite volver a pagar el período"
      >
        <Table
          rows={filter(data.payroll)}
          columns={[
            { label: 'Empleado', key: 'employee_name' },
            { label: 'Período', key: 'period' },
            { label: 'Sucursal', key: 'branch_name' },
            { label: 'Bruto', render: (r) => money(r.gross_cents) },
            { label: 'Deducciones', render: (r) => money(r.deductions_cents) },
            { label: 'Neto', render: (r) => money(r.net_cents) },
            { label: 'Estado', key: 'state' },
            { label: 'Fecha', render: (r) => datetime(r.created_at) },
            {
              label: 'Acción',
              render: (r) =>
                can('planilla.pagar') && r.state === 'Pagado' ? (
                  <button className="table-button" onClick={() => request('payroll_void', r)}>
                    Solicitar anulación
                  </button>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </Panel>,
    );
  if (page === 'transfers')
    content.push(
      <React.Fragment key="drafts">
        <Panel
          title="Traslados pendientes de despacho"
          subtitle="Los borradores todavía no descuentan inventario; pueden cancelarse"
        >
          <Table
            rows={data.drafts || []}
            columns={[
              { label: 'Medicamento', key: 'product_name' },
              { label: 'Origen', key: 'source_name' },
              { label: 'Destino', key: 'destination_name' },
              { label: 'Unidades', key: 'quantity' },
              { label: 'Estado', key: 'state' },
              {
                label: 'Acciones',
                render: (r) =>
                  r.state === 'Borrador' && can('traslado.crear') ? (
                    <div className="table-actions">
                      <button
                        className="table-button"
                        onClick={() =>
                          form(
                            'Despachar traslado',
                            `/transfer-drafts/${r.id}/action`,
                            [reason],
                            {},
                            (v) => ({ ...v, action: 'dispatch' }),
                          )
                        }
                      >
                        Despachar
                      </button>
                      <button
                        className="table-button"
                        onClick={() =>
                          form(
                            'Cancelar borrador',
                            `/transfer-drafts/${r.id}/action`,
                            [reason],
                            {},
                            (v) => ({ ...v, action: 'cancel' }),
                          )
                        }
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        </Panel>
        {can('traslado.recibir') && (
          <Panel
            title="Recepción con diferencia"
            subtitle="Registrar unidades reales y motivo deja una alerta para auditoría"
          >
            <Table
              rows={data.transfers.filter(
                (t) =>
                  t.status === 'En tránsito' &&
                  (user.scope !== 'branch' || t.destination_id === user.branch_id),
              )}
              columns={[
                { label: 'Medicamento', key: 'product_name' },
                { label: 'Destino', key: 'destination_name' },
                { label: 'Despachado', key: 'quantity' },
                {
                  label: 'Acción',
                  render: (r) => (
                    <button
                      className="table-button"
                      onClick={() =>
                        form(
                          'Registrar recepción real',
                          `/transfers/${r.id}/receive`,
                          [
                            {
                              name: 'received_quantity',
                              label: 'Unidades recibidas',
                              type: 'number',
                              min: 0,
                              max: r.quantity,
                            },
                            reason,
                          ],
                          { received_quantity: r.quantity },
                        )
                      }
                    >
                      Recibir y registrar diferencia
                    </button>
                  ),
                },
              ]}
            />
          </Panel>
        )}
      </React.Fragment>,
    );
  if (page === 'catalog' && can(permissions.products))
    content.push(
      <Panel
        key="maintenance"
        title="Catálogo de medicamentos"
        subtitle="Datos comerciales y de receta del medicamento. El stock por sucursal se consulta en Existencias."
      >
        <Table
          rows={data.products}
          columns={[
            { label: 'Medicamento', key: 'name' },
            {
              label: 'Componente',
              render: (r) => r.branch_name || r.department || r.component || '—',
            },
            { label: 'Estado', render: (r) => r.state || r.status || 'Activo' },
            { label: 'Precio', render: (r) => money(r.price_cents) },
            { label: 'Receta', render: (r) => (r.prescription ? 'Requerida' : 'Sin receta') },
            { label: 'Acciones', render: (r) => actions('products', r) },
          ]}
        />
      </Panel>,
    );
  if (page === 'risk')
    content.push(
      <React.Fragment key="risk">
        <div className="risk-grid">
          {risk.map((b) => (
            <section className={`risk-card ${b.risk}`} key={b.id}>
              <Badge tone={b.risk === 'rojo' ? 'red' : b.risk === 'ambar' ? 'amber' : 'green'}>
                {b.risk === 'ambar' ? 'Ámbar' : b.risk === 'rojo' ? 'Rojo' : 'Verde'}
              </Badge>
              <h3>{b.name}</h3>
              <p>{b.points} puntos de riesgo</p>
              {b.reasons.map((r) => (
                <small key={r}>{r}</small>
              ))}
            </section>
          ))}
        </div>
        <Panel
          title="Mapa de la red en Guatemala"
          subtitle="Actualización al refrescar datos; ubicaciones de entrega declaradas, sin GPS del repartidor"
        >
          <div className="map-holder">
            <MapContainer center={[15.5, -90.3]} zoom={7} scrollWheelZoom={false}>
              <MapTiles />
              {data.branches.map((b) => (
                <CircleMarker
                  center={[b.lat, b.lng]}
                  radius={9}
                  pathOptions={{
                    color: risk.find((r) => r.id === b.id)?.risk === 'rojo' ? '#be6262' : '#0e8277',
                  }}
                  key={b.id}
                >
                  <Popup>
                    <strong>{b.name}</strong>
                    <br />
                    {b.department}
                    <br />
                    {b.opens_at}–{b.closes_at}
                  </Popup>
                </CircleMarker>
              ))}
              {data.orders
                .filter((o) => o.status === 'En ruta')
                .map((o) => (
                  <CircleMarker
                    center={[o.lat, o.lng]}
                    radius={6}
                    pathOptions={{ color: '#c79955' }}
                    key={o.id}
                  >
                    <Popup>Pedido #{o.id.slice(0, 8)} · En ruta</Popup>
                  </CircleMarker>
                ))}
            </MapContainer>
          </div>
        </Panel>
      </React.Fragment>,
    );
  return (
    <>
      {error && !modal && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {content}
      {modal && (
        <Modal title={modal.title} onClose={() => !busy && setModal(null)}>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {modal.credentials ? (
            <div className="credentials-card">
              <p>Guarda estas credenciales y entrégalas al colaborador.</p>
              <strong>Correo institucional</strong><code>{modal.credentials.email}</code>
              <strong>Contraseña temporal</strong><code>{modal.credentials.password}</code>
              <small>La contraseña deberá cambiarse en el primer ingreso.</small>
            </div>
          ) : modal.simulation ? (
            <>
              <div className="integrity-result">
                <strong>Original: cadena válida</strong>
                <span>{modal.simulation.original.checked} registros comprobados</span>
              </div>
              <div className="integrity-result bad">
                <strong>Copia alterada: inconsistencia detectada</strong>
                <span>Secuencia {modal.simulation.simulation.sequence}</span>
                <code>{modal.simulation.simulation.record_id}</code>
              </div>
              <p className="confirm-text">{modal.simulation.note}</p>
            </>
          ) : modal.userHistory ? (
            <HistoricalTable kind="audit" userId={modal.userHistory.id} />
          ) : modal.userConfig ? (
            <div className="user-config-card">
              <p className="confirm-text">
                Administra el acceso de {modal.userConfig.name} sin salir del listado.
              </p>
              <div className="user-config-actions">
                <button
                  className="secondary-button"
                  onClick={() =>
                    form(
                      'Restablecer contraseña',
                      `/manage/users/${modal.userConfig.id}`,
                      [
                        {
                          name: 'new_password',
                          label: 'Nueva contraseña temporal',
                          type: 'password',
                          help: 'Debe cumplir los requisitos de contraseña del sistema.',
                        },
                        reason,
                        password,
                      ],
                      {},
                      (v) => ({
                        ...v,
                        values: { action: 'reset_password', password: v.new_password },
                      }),
                    )
                  }
                >
                  Restablecer contraseña
                </button>
                <button
                  className="secondary-button"
                  onClick={() =>
                    form(
                      'Restablecer MFA',
                      `/manage/users/${modal.userConfig.id}`,
                      [reason, password],
                      {},
                      (v) => ({ ...v, values: { action: 'reset_mfa' } }),
                    )
                  }
                >
                  Restablecer MFA
                </button>
                <button
                  className="secondary-button"
                  onClick={() =>
                    form(
                      'Revocar sesiones',
                      `/manage/users/${modal.userConfig.id}`,
                      [reason, password],
                      {},
                      (v) => ({ ...v, values: { action: 'revoke_sessions' } }),
                    )
                  }
                >
                  Revocar sesiones
                </button>
                <button
                  className="secondary-button"
                  onClick={() => state('users', modal.userConfig)}
                >
                  {modal.userConfig.state === 'Activo' ? 'Desactivar usuario' : 'Reactivar usuario'}
                </button>
              </div>
            </div>
          ) : modal.userInfo ? (
            (() => {
              const employee = data.employees.find(
                (record) => record.user_id === modal.userInfo.id,
              );
              return (
                <div className="user-info-card">
                  <div className="user-info-avatar">{modal.userInfo.name[0]}</div>
                  <h3>
                    {modal.userInfo.name} {modal.userInfo.surname || ''}
                  </h3>
                  <p>{modal.userInfo.role_name}</p>
                  <dl>
                    <dt>Correo</dt>
                    <dd>{modal.userInfo.email}</dd>
                    <dt>Rol de acceso</dt>
                    <dd>{modal.userInfo.role_name}</dd>
                    <dt>Sucursal</dt>
                    <dd>{modal.userInfo.branch_name || 'Oficina central'}</dd>
                    <dt>Salario mensual</dt>
                    <dd>{employee ? money(employee.salary_cents) : 'No registrado en planilla'}</dd>
                    <dt>Teléfono</dt>
                    <dd>{modal.userInfo.phone || 'No registrado'}</dd>
                    <dt>Fecha de nacimiento</dt>
                    <dd>{modal.userInfo.birth_date || 'No registrada'}</dd>
                    <dt>DPI / CUI</dt>
                    <dd>{modal.userInfo.dpi || 'No registrado'}</dd>
                    <dt>Dirección</dt>
                    <dd>{modal.userInfo.address || 'No registrada'}</dd>
                    <dt>Estado de usuario</dt>
                    <dd>{modal.userInfo.state}</dd>
                    <dt>MFA</dt>
                    <dd>{modal.userInfo.totp_enabled ? 'Activado' : 'No configurado'}</dd>
                    {employee && (
                      <>
                        <dt>Estado laboral</dt>
                        <dd>{employee.state}</dd>
                      </>
                    )}
                  </dl>
                  {can('usuario.gestionar') && (
                    <button
                      className="secondary-button"
                      onClick={() => edit('users', modal.userInfo)}
                    >
                      Editar información
                    </button>
                  )}
                </div>
              );
            })()
          ) : modal.client ? (
            <>
              <h3>Direcciones guardadas</h3>
              {data.addresses
                .filter((a) => a.client_id === modal.client.id)
                .map((a) => (
                  <p className="confirm-text" key={a.id}>
                    {a.label}: {a.address}
                  </p>
                ))}
              <Table
                rows={data.orders.filter((o) => o.client_id === modal.client.id)}
                columns={[
                  { label: 'Pedido', render: (r) => r.id.slice(0, 8) },
                  { label: 'Estado', key: 'status' },
                  { label: 'Total', render: (r) => money(r.total_cents) },
                ]}
              />
            </>
          ) : (
            <RecordForm
              fields={modal.fields}
              initial={modal.initial}
              fieldErrors={fieldsError}
              busy={busy}
              onSubmit={(v) => run(modal.path, modal.transform(v))}
            />
          )}
        </Modal>
      )}
    </>
  );
}
export function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  return (
    <button
      className="icon-button"
      aria-label="Cambiar tema"
      onClick={() => {
        document.documentElement.dataset.theme = dark ? 'light' : 'dark';
        setDark(!dark);
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
export function RoleDashboard({ data, user, onNavigate }) {
  const [risk, setRisk] = useState([]),
    [employeeRole, setEmployeeRole] = useState('all');
  useEffect(() => {
    if (user.permissions.includes('riesgo.ver'))
      api('/risk')
        .then(setRisk)
        .catch(() => {});
  }, [data, user]);
  if (user.permissions.includes('entrega.propia') && !user.permissions.includes('pedido.ver'))
    return (
      <Panel
        title="Tu jornada de entregas"
        subtitle="Consulta los pedidos que te asignó la farmacia y confirma la entrega con el código o QR del cliente."
      >
        <p className="exp-notice">
          Puedes compartir tu ubicación mientras realizas una entrega y mantener actualizado su avance.
        </p>
        <button className="primary-button" onClick={() => onNavigate('myDeliveries')}>
          <Truck size={18} /> Abrir mis entregas
        </button>
      </Panel>
    );
  const pending = data.orders.filter((o) =>
      ['Pendiente', 'Preparando', 'En ruta'].includes(o.status),
    ),
    low = data.inventory.filter((i) => i.quantity < i.minimum),
    activeShift = data.shifts.find((s) => s.state === 'Abierto');
  const sales = data.orders.filter((o) => o.status === 'Entregado');
  const saleIds = new Set(sales.map((o) => o.id));
  const byBranch = data.branches.map((b) => ({
    label: b.name,
    value: sales.filter((o) => o.branch_id === b.id).reduce((s, o) => s + o.total_cents, 0),
  }));
  const top = data.products
    .map((p) => ({
      label: p.name,
      value: data.order_items
        .filter((i) => i.product_id === p.id && saleIds.has(i.order_id))
        .reduce((s, i) => s + i.quantity, 0),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const chart = (title, rows, formatter) => (
    <Panel title={title} subtitle="Datos registrados en el sistema">
      <div className="bar-list">
        {rows.map((r) => (
          <div key={r.label}>
            <span>{r.label}</span>
            <div>
              <i
                style={{
                  width: `${Math.max(0, (r.value / Math.max(1, ...rows.map((v) => v.value))) * 100)}%`,
                }}
              />
            </div>
            <strong>{formatter(r.value)}</strong>
          </div>
        ))}
      </div>
    </Panel>
  );
  if (user.role === 'branch') {
    const localDate = (value) =>
      value
        ? new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Guatemala',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date(value))
        : '';
    const todaySales = data.orders.filter(
      (order) => order.status === 'Entregado' && localDate(order.delivered_at) === data.date,
    );
    const ticketType = (order) =>
      order.channel === 'mostrador'
        ? 'Venta en mostrador'
        : order.fulfillment === 'delivery'
          ? 'Entrega a domicilio'
          : 'Recoger en tienda';
    const roleOptions = [...new Set(todaySales.map((order) => order.attended_by_role).filter(Boolean))];
    const visibleSales = todaySales.filter(
      (order) => employeeRole === 'all' || order.attended_by_role === employeeRole,
    );
    const totals = Object.fromEntries(
      ['Venta en mostrador', 'Recoger en tienda', 'Entrega a domicilio'].map((type) => [
        type,
        todaySales
          .filter((order) => ticketType(order) === type)
          .reduce((sum, order) => sum + Number(order.total_cents || 0), 0),
      ]),
    );
    const salesTotal = todaySales.reduce(
      (sum, order) => sum + Number(order.total_cents || 0),
      0,
    );
    const cashIncome = data.cash
      .filter(
        (movement) => movement.kind === 'Ingreso' && localDate(movement.created_at) === data.date,
      )
      .reduce((sum, movement) => sum + Number(movement.amount_cents || 0), 0);
    return (
      <>
        <div className="role-banner">
          <Wallet size={23} />
          <div>
            <strong>Ventas de hoy · {user.branch_name}</strong>
            <p>Control de tickets atendidos por el equipo e ingresos registrados durante el día.</p>
          </div>
        </div>
        <div className="stats-grid three">
          <Stat label="Venta en mostrador" value={money(totals['Venta en mostrador'])} icon={Wallet} detail="Cobros presenciales" />
          <Stat label="Recoger en tienda" value={money(totals['Recoger en tienda'])} icon={ShoppingBag} detail="Pedidos retirados" />
          <Stat label="Entrega a domicilio" value={money(totals['Entrega a domicilio'])} icon={Truck} detail="Pedidos entregados" />
        </div>
        <div className="stats-grid three">
          <Stat label="Total vendido hoy" value={money(salesTotal)} icon={TrendingUp} detail={`${todaySales.length} tickets finalizados`} />
          <Stat label="Ingresos en caja" value={money(cashIncome)} icon={Wallet} detail="Movimientos de ingreso del día" />
          <Stat
            label="Cuadre del día"
            value={money(cashIncome - salesTotal)}
            icon={cashIncome === salesTotal ? CheckCircle2 : Activity}
            tone={cashIncome === salesTotal ? 'green' : 'orange'}
            detail={cashIncome === salesTotal ? 'Ventas e ingresos cuadran' : 'Revisar diferencia'}
          />
        </div>
        <Panel
          title="Tickets atendidos hoy"
          subtitle="Mostrador, retiro en tienda y entrega a domicilio con su responsable"
          action={
            <select
              aria-label="Filtrar por rol del empleado"
              value={employeeRole}
              onChange={(event) => setEmployeeRole(event.target.value)}
            >
              <option value="all">Todos los roles</option>
              {roleOptions.map((role) => <option value={role} key={role}>{role}</option>)}
            </select>
          }
        >
          <Table
            rows={visibleSales}
            columns={[
              { label: 'Ticket', render: (row) => row.ticket || row.id.slice(0, 8).toUpperCase() },
              { label: 'Tipo', render: ticketType },
              { label: 'Cliente', key: 'customer' },
              {
                label: 'Call center',
                render: (row) =>
                  row.channel === 'mostrador'
                    ? 'No aplica'
                    : row.callcenter_name || 'Pendiente de identificar',
              },
              {
                label: 'Repartidor',
                render: (row) =>
                  row.fulfillment === 'delivery'
                    ? row.courier_name || 'Sin repartidor'
                    : 'No aplica',
              },
              {
                label: 'Atendido por',
                render: (row) => row.attended_by_name || 'Sin identificar',
              },
              { label: 'Rol', render: (row) => row.attended_by_role || 'Sin identificar' },
              { label: 'Pago', key: 'payment' },
              { label: 'Total', render: (row) => money(row.total_cents) },
              { label: 'Finalizado', render: (row) => datetime(row.delivered_at) },
            ]}
          />
        </Panel>
      </>
    );
  }
  return (
    <>
      {user.role !== 'admin' && (
        <>
          <div className="role-banner">
            <ShieldCheck size={23} />
            <div>
              <strong>
                {user.role === 'branch'
                  ? `Operación de ${user.branch_name}`
                  : user.role === 'callcenter'
                    ? 'Coordinación del call center'
                    : user.role === 'auditor'
                      ? 'Supervisión independiente'
                      : 'Resumen de tu rol'}
              </strong>
              <p>
                {user.role === 'branch'
                  ? 'Tu caja, tus existencias y tus solicitudes.'
                  : user.role === 'callcenter'
                    ? 'Pedidos, clientes y disponibilidad de toda la red.'
                    : user.role === 'auditor'
                      ? 'Anomalías, trazabilidad y evidencia verificable.'
                      : 'Solo aparecen los módulos permitidos.'}
              </p>
            </div>
          </div>
          <div className="stats-grid three">
            <Stat
              label="Pedidos pendientes"
              value={pending.length}
              icon={Truck}
              detail={`${pending.filter((o) => o.status === 'En ruta').length} en ruta`}
            />
            <Stat
              label={user.role === 'branch' ? 'Turno de caja' : 'Sucursales visibles'}
              value={
                user.role === 'branch'
                  ? activeShift
                    ? 'Abierto'
                    : 'Sin turno'
                  : data.branches.length
              }
              icon={Wallet}
              detail={user.branch_name || 'Red nacional'}
            />
            <Stat
              label="Lotes con stock bajo"
              value={low.length}
              icon={Building2}
              detail="Existencias debajo del mínimo"
            />
          </div>
          <Panel
            title={
              user.role === 'callcenter'
                ? 'Pedidos por coordinar'
                : user.role === 'auditor'
                  ? 'Actividad auditada reciente'
                  : 'Pedidos de tu sucursal'
            }
            action={
              <button
                className="secondary-button"
                onClick={() => onNavigate(user.role === 'auditor' ? 'audit' : 'orders')}
              >
                Abrir módulo
              </button>
            }
          >
            <Table
              rows={user.role === 'auditor' ? data.audit.slice(0, 6) : pending.slice(0, 6)}
              columns={
                user.role === 'auditor'
                  ? [
                      { label: 'Acción', key: 'action' },
                      { label: 'Usuario', key: 'user_name' },
                      { label: 'Entidad', key: 'entity' },
                    ]
                  : [
                      { label: 'Cliente', key: 'customer' },
                      { label: 'Sucursal', key: 'branch_name' },
                      { label: 'Estado', key: 'status' },
                      { label: 'ETA', render: (r) => `${r.eta_minutes} min` },
                    ]
              }
            />
          </Panel>
        </>
      )}
      {risk.length > 0 && ['admin', 'auditor'].includes(user.role) && (
        <Panel
          title="Semáforo operativo"
          subtitle="Indicadores basados en diferencias de caja, ajustes, recepciones y horario"
          action={
            <button className="link-button" onClick={() => onNavigate('risk')}>
              Ver riesgo y mapa
            </button>
          }
        >
          <div className="risk-summary">
            {risk.map((b) => (
              <div key={b.id}>
                <Badge tone={b.risk === 'rojo' ? 'red' : b.risk === 'ambar' ? 'amber' : 'green'}>
                  {b.name}
                </Badge>
                <span>{b.points} puntos</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {sales.length > 0 &&
        user.permissions.includes('caja.ver') &&
        chart('Ventas registradas por sucursal', byBranch, money)}
      {sales.length > 0 &&
        user.permissions.includes('pedido.ver') &&
        chart('Medicamentos más vendidos', top, (v) => `${v} unidades`)}
    </>
  );
}
export function InventoryAlerts({ data }) {
  const [days, setDays] = useState(30);
  const cutoff = new Date(Date.parse(data.date) + days * 86400000).toISOString().slice(0, 10);
  return (
    <Panel
      title="Vencimientos y alertas"
      subtitle="Solo lotes con unidades; las alertas se calculan a partir de su fecha"
      action={
        <select
          aria-label="Horizonte de vencimientos"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {[30, 60, 90].map((d) => (
            <option value={d} key={d}>
              {d} días
            </option>
          ))}
        </select>
      }
    >
      <Table
        rows={data.inventory.filter((i) => i.quantity > 0 && i.expires_on <= cutoff)}
        columns={[
          { label: 'Medicamento', key: 'product_name' },
          { label: 'Sucursal', key: 'branch_name' },
          { label: 'Lote', key: 'lot' },
          { label: 'Unidades', key: 'quantity' },
          { label: 'Vencimiento', render: (r) => day(r.expires_on) },
          {
            label: 'Alerta',
            render: (r) => (
              <Badge tone={r.expires_on <= data.date ? 'red' : 'amber'}>
                {r.expires_on <= data.date ? 'Vencido' : `Próximo a vencer (${days} días)`}
              </Badge>
            ),
          },
        ]}
      />
    </Panel>
  );
}
export function GlobalSearch({ data, user, onNavigate }) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('');
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const resources = [
    ['branches', 'Sucursal'],
    ['products', 'Medicamento'],
    ['clients', 'Cliente'],
    ['orders', 'Pedido'],
  ];
  const matches = resources.flatMap(([type, label]) =>
    (data[type] || [])
      .filter((r) => query && JSON.stringify(r).toLowerCase().includes(query.toLowerCase()))
      .slice(0, 6)
      .map((r) => ({ type, label, row: r })),
  );
  return (
    <>
      <button className="secondary-button global-search-button" onClick={() => setOpen(true)}>
        <Search size={15} />
        Buscar <kbd>Ctrl K</kbd>
      </button>
      {open && (
        <Modal title="Búsqueda global" onClose={() => setOpen(false)}>
          <input
            aria-label="Buscar en la red"
            className="global-search-input"
            autoFocus
            placeholder="Sucursal, medicamento, cliente o pedido…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.map(({ type, label, row }) => (
            <button
              className="global-result"
              key={row.id}
              onClick={() => {
                onNavigate(
                  type === 'products' ? 'inventory' : type,
                  row.name || row.customer || row.id,
                );
                setOpen(false);
              }}
            >
              <span>{label}</span>
              <strong>{row.name || row.customer || row.id.slice(0, 8)}</strong>
            </button>
          ))}
          {query && !matches.length && (
            <Empty text="Sin coincidencias en tus módulos permitidos." />
          )}
        </Modal>
      )}
    </>
  );
}


