import MapTiles from './MapTiles.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from 'react-leaflet';
import { api, money, datetime } from '../lib/api';
import { Panel, Table, Modal, RecordForm } from './ui';
import OrderQrReader from './OrderQrReader';
import { parseOrderTicket } from '../../shared/order-ticket.js';
import '../expansion.css';
const options = (rows) => rows.map((r) => ({ value: r.id, label: r.name }));
const number = (name, label, defaultValue = 0) => ({
  name,
  label,
  type: 'number',
  min: 0,
  step: '0.01',
  default: defaultValue,
});
const text = (name, label) => ({ name, label });
function useResource(path) {
  const [value, setValue] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function reload() {
    try {
      setValue(await api(path));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    reload();
  }, [path]);
  async function run(url, body, method) {
    setBusy(true);
    setError('');
    try {
      const result = await api(url, body, method);
      await reload();
      return result;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { value, error, busy, reload, run, setError };
}
export function ProcurementPage({ data, user, refresh }) {
  const { value, error, busy, run } = useResource('/procurement'),
    [modal, setModal] = useState(null),
    [items, setItems] = useState([]),
    [line, setLine] = useState({ product_id: data.products[0]?.id, quantity: 1, unit_cost: '' }),
    [header, setHeader] = useState({
      supplier_id: '',
      branch_id: user.branch_id || data.branches[0]?.id,
      payment: 'Transferencia',
      notes: '',
    }),
    [receiving, setReceiving] = useState({}),
    [document, setDocument] = useState(''),
    [completion, setCompletion] = useState(null);
  const attempt = useRef(crypto.randomUUID()),
    write = user.permissions.includes('abastecimiento.gestionar');
  async function act(path, body) {
    const result = await run(path, body);
    if (result) {
      if (path === '/procurement/medicines') {
        setCompletion({ type: 'medicine', ...result });
        setLine({ product_id: result.product_id, quantity: 1, unit_cost: '' });
      } else if (path.endsWith('/receive')) setCompletion({ type: 'receipt', ...result });
      setModal(null);
      setItems([]);
      await refresh();
    }
    return result;
  }
  function manage(order) {
    setModal({ type: 'order', order });
    setReceiving({});
    setDocument('');
    attempt.current = crypto.randomUUID();
  }
  if (!value) return <p>{error || 'Cargando abastecimiento…'}</p>;
  return (
    <div className="expansion">
      <div className="exp-toolbar">
        <p>Compra → recepción por lote → costo → devolución y reembolso.</p>
        {write && (
          <>
            <button className="secondary-button" onClick={() => setModal({ type: 'supplier' })}>
              Nuevo proveedor
            </button>
            <button
              className="secondary-button"
              disabled={!value.suppliers.length}
              onClick={() => {
                setCompletion(null);
                setModal({ type: 'medicine' });
              }}
            >
              Registrar medicamento
            </button>
            <button
              className="primary-button"
              disabled={!value.suppliers.length || !data.products.length}
              onClick={() => {
                setHeader({ ...header, supplier_id: value.suppliers[0]?.id });
                setModal({ type: 'purchase' });
              }}
            >
              Nueva orden de compra
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!value.suppliers.length && write && (
        <p className="exp-notice">
          Registra un proveedor antes de agregar medicamentos o crear compras.
        </p>
      )}
      {completion?.type === 'medicine' && (
        <p className="exp-notice" role="status">
          {completion.name} agregado al inventario. Lote generado:{' '}
          <strong>{completion.lot}</strong>
        </p>
      )}
      {completion?.type === 'receipt' && completion.lots?.length > 0 && (
        <p className="exp-notice" role="status">
          Recepción registrada. Lotes generados:{' '}
          {completion.lots
            .map(
              (item) =>
                `${data.products.find((product) => product.id === item.product_id)?.name || 'Medicamento'}: ${item.lot}`,
            )
            .join(' · ')}
        </p>
      )}
      <Panel title="Órdenes de compra">
        <Table
          rows={value.orders}
          columns={[
            { label: 'Proveedor', key: 'supplier_name' },
            { label: 'Sucursal', key: 'branch_name' },
            { label: 'Estado', key: 'status' },
            { label: 'Creada', render: (r) => datetime(r.created_at) },
            {
              label: 'Detalle',
              render: (r) => (
                <button className="table-button" onClick={() => manage(r)}>
                  Gestionar compra
                </button>
              ),
            },
          ]}
        />
      </Panel>
      <Panel title="Recepciones y devoluciones">
        <Table
          rows={value.receipts}
          columns={[
            { label: 'Medicamento', key: 'product_name' },
            { label: 'Lote', key: 'lot' },
            { label: 'Recibido / devuelto', render: (r) => `${r.quantity} / ${r.returned}` },
            { label: 'Costo unitario', render: (r) => money(r.unit_cost_cents) },
            { label: 'Documento', key: 'document' },
            {
              label: 'Acción',
              render: (r) =>
                write && r.returned < r.quantity ? (
                  <button
                    className="table-button"
                    onClick={() => setModal({ type: 'return', receipt: r })}
                  >
                    Devolver a proveedor
                  </button>
                ) : (
                  '—'
                ),
            },
          ]}
        />
        <Table
          rows={value.returns}
          columns={[
            { label: 'Proveedor', key: 'supplier_name' },
            { label: 'Nota de crédito', key: 'credit_note' },
            { label: 'Importe', render: (r) => money(r.amount_cents) },
            { label: 'Estado', key: 'status' },
            {
              label: 'Acción',
              render: (r) =>
                write && r.status === 'Pendiente de reembolso' ? (
                  <button
                    className="table-button"
                    disabled={busy}
                    onClick={() => act('/procurement/returns/' + r.id + '/refund', {})}
                  >
                    Confirmar reembolso recibido
                  </button>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </Panel>
      <Panel
        title="Margen bruto de ventas entregadas"
        subtitle="Ingresos reales menos costo registrado. Los lotes antiguos sin costo no se consideran gratuitos."
      >
        <Table
          rows={value.margins}
          rowKey="branch_id"
          columns={[
            {
              label: 'Sucursal',
              render: (r) => data.branches.find((b) => b.id === r.branch_id)?.name,
            },
            { label: 'Ventas', render: (r) => money(r.revenue) },
            { label: 'Costo conocido', render: (r) => money(r.known_cost) },
            {
              label: 'Margen bruto',
              render: (r) =>
                r.gross_margin === null
                  ? `Incompleto: ${r.unknown_units} unidades sin costo`
                  : money(r.gross_margin),
            },
          ]}
        />
      </Panel>
      <Panel title="Proveedores">
        <Table
          rows={value.suppliers}
          columns={[
            { label: 'Nombre', key: 'name' },
            { label: 'NIT', key: 'nit' },
            { label: 'Teléfono', key: 'phone' },
            { label: 'Correo', key: 'email' },
          ]}
        />
      </Panel>
      {modal && (
        <Modal
          title={
            modal.type === 'supplier'
              ? 'Nuevo proveedor'
              : modal.type === 'medicine'
                ? 'Registrar medicamento con proveedor'
              : modal.type === 'purchase'
                ? 'Nueva orden de compra'
                : modal.type === 'return'
                  ? 'Devolución a proveedor'
                  : 'Gestionar compra'
          }
          onClose={() => !busy && setModal(null)}
        >
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {modal.type === 'supplier' && (
            <RecordForm
              busy={busy}
              fields={[
                text('name', 'Nombre del proveedor'),
                text('nit', 'NIT'),
                text('phone', 'Teléfono'),
                { name: 'email', label: 'Correo', required: false },
                { name: 'address', label: 'Dirección', required: false },
              ]}
              onSubmit={(v) => act('/procurement/suppliers', v)}
            />
          )}
          {modal.type === 'medicine' && (
            <>
              <p className="exp-notice">
                El lote se genera automáticamente al registrar el medicamento y su ingreso.
              </p>
              <RecordForm
                busy={busy}
                submit="Registrar y agregar al inventario"
                fields={[
                  {
                    name: 'supplier_id',
                    label: 'Proveedor',
                    options: [
                      { value: '', label: 'Selecciona un proveedor' },
                      ...options(value.suppliers),
                    ],
                  },
                  { name: 'name', label: 'Nombre del medicamento', wide: true },
                  { name: 'component', label: 'Componente o principio activo', wide: true },
                  { name: 'sku', label: 'SKU' },
                  { name: 'category', label: 'Clasificación', default: 'General' },
                  {
                    name: 'price',
                    label: 'Precio de venta Q',
                    type: 'number',
                    min: 0.01,
                    step: '0.01',
                  },
                  {
                    name: 'unit_cost',
                    label: 'Costo unitario Q',
                    type: 'number',
                    min: 0.01,
                    step: '0.01',
                  },
                  {
                    name: 'quantity',
                    label: 'Cantidad inicial',
                    type: 'number',
                    min: 1,
                    default: 1,
                  },
                  { name: 'expires_on', label: 'Vencimiento', type: 'date' },
                  { name: 'document', label: 'Documento del proveedor' },
                  {
                    name: 'payment',
                    label: 'Método de pago',
                    options: ['Transferencia', 'Efectivo', 'Tarjeta'].map((value) => ({
                      value,
                      label: value,
                    })),
                  },
                  {
                    name: 'minimum',
                    label: 'Mínimo de alerta',
                    type: 'number',
                    min: 0,
                    default: 20,
                    required: false,
                  },
                  {
                    name: 'prescription',
                    label: 'Requiere receta',
                    type: 'checkbox',
                    help: 'Solicitar receta al vender',
                  },
                  {
                    name: 'controlled',
                    label: 'Medicamento controlado',
                    type: 'checkbox',
                    help: 'Marcar si requiere control especial',
                  },
                  ...(user.scope === 'branch'
                    ? []
                    : [
                        {
                          name: 'branch_id',
                          label: 'Sucursal de ingreso',
                          options: options(data.branches),
                        },
                      ]),
                ]}
                onSubmit={(values) =>
                  act('/procurement/medicines', {
                    ...values,
                    branch_id: user.scope === 'branch' ? user.branch_id : values.branch_id,
                  })
                }
              />
            </>
          )}
          {modal.type === 'purchase' && (
            <form
              className="exp-form"
              onSubmit={(e) => {
                e.preventDefault();
                act('/procurement/orders', { ...header, items });
              }}
            >
              <label>
                Proveedor
                <select
                  value={header.supplier_id}
                  aria-label="Proveedor"
                  onChange={(e) => setHeader({ ...header, supplier_id: e.target.value })}
                >
                  {value.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sucursal
                <select
                  value={header.branch_id}
                  aria-label="Sucursal"
                  onChange={(e) => setHeader({ ...header, branch_id: e.target.value })}
                >
                  {data.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pago al recibir al proveedor
                <select
                  value={header.payment}
                  aria-label="Pago al recibir al proveedor"
                  onChange={(e) => setHeader({ ...header, payment: e.target.value })}
                >
                  {['Transferencia', 'Efectivo', 'Tarjeta'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <div className="exp-line">
                <label>
                  Medicamento
                  <select
                    value={line.product_id}
                    aria-label="Medicamento"
                    onChange={(e) => setLine({ ...line, product_id: e.target.value })}
                  >
                    {data.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cantidad
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => setLine({ ...line, quantity: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Costo unitario Q
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={line.unit_cost}
                    onChange={(e) => setLine({ ...line, unit_cost: e.target.value })}
                  />
                </label>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    if (
                      line.unit_cost > 0 &&
                      line.quantity > 0 &&
                      !items.some((i) => i.product_id === line.product_id)
                    )
                      setItems([...items, { ...line }]);
                  }}
                >
                  Agregar línea
                </button>
              </div>
              {items.map((i) => (
                <p key={i.product_id}>
                  {data.products.find((p) => p.id === i.product_id)?.name} × {i.quantity} ·{' '}
                  {money(i.quantity * i.unit_cost * 100)}{' '}
                  <button
                    type="button"
                    className="table-button"
                    onClick={() => setItems(items.filter((v) => v !== i))}
                  >
                    Quitar
                  </button>
                </p>
              ))}
              <p>
                Total previsto:{' '}
                <strong>
                  {money(items.reduce((n, i) => n + i.quantity * i.unit_cost * 100, 0))}
                </strong>
              </p>
              <button className="primary-button" disabled={busy || !items.length}>
                Guardar borrador de compra
              </button>
            </form>
          )}
          {modal.type === 'order' && (
            <>
              <p>
                {modal.order.supplier_name} · {modal.order.branch_name} ·{' '}
                {value.orders.find((o) => o.id === modal.order.id)?.status}
              </p>
              <Table
                rows={value.lines.filter((l) => l.purchase_id === modal.order.id)}
                columns={[
                  { label: 'Medicamento', key: 'product_name' },
                  { label: 'Solicitado', key: 'quantity' },
                  { label: 'Recibido', key: 'received' },
                  { label: 'Costo', render: (r) => money(r.unit_cost_cents) },
                ]}
              />
              {write && modal.order.status === 'Borrador' && (
                <div className="exp-toolbar">
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      act('/procurement/orders/' + modal.order.id + '/action', {
                        action: 'confirm',
                      })
                    }
                  >
                    Confirmar compra
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      act('/procurement/orders/' + modal.order.id + '/action', { action: 'cancel' })
                    }
                  >
                    Cancelar borrador
                  </button>
                </div>
              )}
              {write && ['Confirmada', 'Parcial'].includes(modal.order.status) && (
                <form
                  className="exp-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act('/procurement/orders/' + modal.order.id + '/receive', {
                      request_id: attempt.current,
                      document,
                      items: Object.entries(receiving)
                        .filter(([, v]) => v.quantity > 0)
                        .map(([line_id, v]) => ({ line_id, ...v })),
                    });
                  }}
                >
                  <label>
                    Documento del proveedor
                    <input
                      required
                      value={document}
                      onChange={(e) => setDocument(e.target.value)}
                    />
                  </label>
                  {value.lines
                    .filter((l) => l.purchase_id === modal.order.id && l.received < l.quantity)
                    .map((l) => (
                      <fieldset key={l.id}>
                        <legend>
                          {l.product_name} · pendientes {l.quantity - l.received} · lote automático
                        </legend>
                        <div className="exp-line">
                          {[
                            ['quantity', 'Recibir unidades', 'number'],
                            ['expires_on', 'Vencimiento', 'date'],
                          ].map(([key, label, type]) => (
                            <label key={key}>
                              {label}
                              <input
                                type={type}
                                min={type === 'number' ? 0 : undefined}
                                max={type === 'number' ? l.quantity - l.received : undefined}
                                value={receiving[l.id]?.[key] || ''}
                                onChange={(e) =>
                                  setReceiving({
                                    ...receiving,
                                    [l.id]: {
                                      ...receiving[l.id],
                                      [key]:
                                        key === 'quantity'
                                          ? Number(e.target.value)
                                          : e.target.value,
                                    },
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  <button
                    className="primary-button"
                    disabled={busy || !Object.values(receiving).some((v) => v.quantity > 0)}
                  >
                    Registrar recepción y egreso
                  </button>
                </form>
              )}
            </>
          )}
          {modal.type === 'return' && (
            <RecordForm
              busy={busy}
              fields={[
                number('quantity', 'Cantidad a devolver', 1),
                text('reason', 'Motivo'),
                text('credit_note', 'Número de nota de crédito'),
              ]}
              onSubmit={(v) => act('/procurement/returns', { ...v, receipt_id: modal.receipt.id })}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

export function PayrollPage({ data, user, refresh }) {
  const [period, setPeriod] = useState(
      new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' }).slice(0, 7),
    ),
    { value, error, busy, run } = useResource('/payroll-detail?period=' + period),
    [modal, setModal] = useState(null);
  const write = user.permissions.includes('planilla.pagar');
  async function act(path, body) {
    const r = await run(path, body);
    if (r) {
      setModal(null);
      await refresh();
    }
    return r;
  }
  if (!value) return <p>{error || 'Cargando planilla…'}</p>;
  const ruleFields = [
    {
      name: 'enabled',
      label: 'Activar planilla detallada',
      type: 'checkbox',
      help: 'Los pagos usarán las novedades y deducciones configuradas.',
    },
    number('employee_igss_percent', 'IGSS laboral %'),
    number('employer_igss_percent', 'IGSS patronal %'),
    number('irtra_percent', 'IRTRA %'),
    number('intecap_percent', 'INTECAP %'),
    number('aguinaldo_months', 'Meses para provisión de aguinaldo'),
    number('bono14_months', 'Meses para provisión de bono 14'),
    number('vacation_days_year', 'Días anuales de provisión de vacaciones'),
  ];
  return (
    <div className="expansion">
      <div className="exp-toolbar">
        <label>
          Período
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </label>
        {write && (
          <>
            <button className="secondary-button" onClick={() => setModal({ type: 'rules' })}>
              Parámetros de planilla
            </button>
            <button className="secondary-button" onClick={() => setModal({ type: 'benefit' })}>
              Registrar prestación o aporte
            </button>
            <button
              className="primary-button"
              disabled={busy || !value.rules.enabled || value.lines.every((l) => l.paid)}
              onClick={() => setModal({ type: 'pay' })}
            >
              Revisar pago de planilla
            </button>
          </>
        )}
      </div>
      <p className="exp-notice">
        Parámetros configurables. El ISR y otros descuentos se ingresan tras su revisión; las
        provisiones son estimaciones y no se pagan automáticamente.{' '}
        {value.rules.enabled
          ? 'Motor detallado activo.'
          : 'Activa los parámetros antes de pagar con el motor detallado.'}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Panel title="Desglose por colaborador">
        <Table
          rows={value.lines}
          rowKey="employee_id"
          columns={[
            { label: 'Empleado', key: 'name' },
            { label: 'Bruto', render: (r) => money(r.breakdown.gross) },
            { label: 'Deducciones', render: (r) => money(r.breakdown.deductions) },
            { label: 'Neto', render: (r) => money(r.breakdown.net) },
            { label: 'Estado', render: (r) => (r.paid ? 'Pagada' : 'Pendiente') },
            {
              label: 'Acciones',
              render: (r) => (
                <>
                  <button
                    className="table-button"
                    onClick={() => setModal({ type: 'detail', line: r })}
                  >
                    Ver desglose
                  </button>
                  {write && !r.paid && (
                    <button
                      className="table-button"
                      onClick={() => setModal({ type: 'input', line: r })}
                    >
                      Novedades
                    </button>
                  )}
                </>
              ),
            },
          ]}
        />
      </Panel>
      <Panel title="Prestaciones y aportes registrados">
        <Table
          rows={value.benefits || []}
          columns={[
            { label: 'Empleado', key: 'employee_name' },
            { label: 'Concepto', key: 'kind' },
            { label: 'Importe', render: (r) => money(r.amount_cents) },
            { label: 'Justificación', key: 'reason' },
            { label: 'Fecha', render: (r) => datetime(r.created_at) },
          ]}
        />
      </Panel>
      {modal && (
        <Modal
          title={
            modal.type === 'rules'
              ? 'Parámetros de planilla'
              : modal.type === 'input'
                ? 'Novedades del colaborador'
                : modal.type === 'benefit'
                  ? 'Prestación o aporte'
                  : modal.type === 'pay'
                    ? 'Confirmar planilla detallada'
                    : 'Desglose de planilla'
          }
          onClose={() => !busy && setModal(null)}
        >
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {modal.type === 'rules' && (
            <RecordForm
              busy={busy}
              fields={ruleFields}
              initial={value.rules}
              onSubmit={(v) => act('/payroll-detail/rules', v)}
            />
          )}
          {modal.type === 'input' && (
            <RecordForm
              busy={busy}
              fields={[
                number('days', 'Días trabajados (0 a 30)', 30),
                number('bonus', 'Bonificación Q'),
                number('overtime', 'Horas extra Q'),
                number('isr', 'ISR revisado Q'),
                number('other', 'Otras deducciones Q'),
                { name: 'other_reason', label: 'Motivo de otras deducciones', required: false },
                {
                  name: 'social_security',
                  label: 'Aplicar IGSS',
                  type: 'checkbox',
                  help: 'Aplicar las cuotas laboral y patronal configuradas.',
                },
              ]}
              initial={{
                days: modal.line.input.days ?? 30,
                bonus: (modal.line.input.bonus_cents || 0) / 100,
                overtime: (modal.line.input.overtime_cents || 0) / 100,
                isr: (modal.line.input.isr_cents || 0) / 100,
                other: (modal.line.input.other_cents || 0) / 100,
                other_reason: modal.line.input.other_reason || '',
                social_security: Boolean(modal.line.input.social_security),
              }}
              onSubmit={(v) =>
                act('/payroll-detail/inputs', { ...v, employee_id: modal.line.employee_id, period })
              }
            />
          )}
          {modal.type === 'benefit' && (
            <RecordForm
              busy={busy}
              fields={[
                { name: 'employee_id', label: 'Colaborador', options: options(data.employees) },
                {
                  name: 'kind',
                  label: 'Concepto',
                  options: [
                    'Aguinaldo',
                    'Bono 14',
                    'Vacaciones',
                    'Indemnización',
                    'Pago de aportes',
                  ].map((v) => ({ value: v, label: v })),
                },
                number('amount', 'Importe revisado Q'),
                text('reason', 'Justificación del cálculo'),
              ]}
              onSubmit={(v) => act('/payroll-detail/benefits', { ...v, period })}
            />
          )}
          {modal.type === 'detail' && (
            <div className="exp-breakdown">
              {modal.line.breakdown.legacy && (
                <p>
                  Pago anterior al motor detallado. Se conservan bruto, deducciones y neto
                  originales; no existe desglose de aportes o provisiones.
                </p>
              )}
              <p>
                {modal.line.name} · {period} ·{' '}
                {modal.line.paid
                  ? 'Documento pagado, cálculo conservado'
                  : 'Proyección pendiente de pago'}
              </p>
              {Object.entries({
                base: 'Salario proporcional',
                bonus: 'Bonificación',
                overtime: 'Horas extra',
                gross: 'Bruto',
                igss: 'IGSS laboral',
                isr: 'ISR',
                other: 'Otras deducciones',
                net: 'Neto',
                employer_igss: 'IGSS patronal (aporte)',
                irtra: 'IRTRA (aporte)',
                intecap: 'INTECAP (aporte)',
                aguinaldo_provision: 'Provisión aguinaldo',
                bono14_provision: 'Provisión bono 14',
                vacation_provision: 'Provisión vacaciones',
              })
                .filter(([key]) => !modal.line.breakdown.legacy || ['gross', 'net'].includes(key))
                .map(([key, label]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <strong>{money(modal.line.breakdown[key])}</strong>
                  </div>
                ))}
            </div>
          )}
          {modal.type === 'pay' && (
            <>
              <p>
                Se pagarán los colaboradores pendientes del período {period}. Total neto:{' '}
                <strong>
                  {money(
                    value.lines.filter((l) => !l.paid).reduce((n, l) => n + l.breakdown.net, 0),
                  )}
                </strong>
                . Las provisiones y aportes no se incluyen en ese pago.
              </p>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => act('/payroll-detail/pay', { period })}
              >
                Confirmar pago neto
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

export function DeliveryPage({ user }) {
  const { value, error, busy, run, reload } = useResource('/deliveries'),
    [selected, setSelected] = useState(null),
    [courier, setCourier] = useState(''),
    [progress, setProgress] = useState(0),
    [code, setCode] = useState(''),
    [qr, setQr] = useState(''),
    [note, setNote] = useState(''),
    [watching, setWatching] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const watch = useRef(null),
    last = useRef(0),
    own = user.permissions.includes('entrega.propia'),
    canManage = user.permissions.includes('entrega.gestionar');
  useEffect(() => {
    const timer = setInterval(reload, 15000);
    return () => clearInterval(timer);
  }, []);
  function stop() {
    if (watch.current != null) navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    setWatching(false);
  }
  useEffect(
    () => () => {
      if (watch.current != null) navigator.geolocation?.clearWatch(watch.current);
    },
    [],
  );
  const order = value?.orders.find((o) => o.id === selected);
  useEffect(() => {
    if (!order || ['Entregado', 'Cancelado'].includes(order.order_status)) stop();
  }, [selected, order?.order_status]);
  async function location(simulated) {
    if (!order) return;
    if (simulated) {
      await run(`/deliveries/${order.id}/location`, {
        lat: order.branch_lat + ((order.destination_lat - order.branch_lat) * progress) / 100,
        lng: order.branch_lng + ((order.destination_lng - order.branch_lng) * progress) / 100,
        simulated: true,
      });
      return;
    }
    setNote('');
    if (!navigator.geolocation) {
      setNote('Este navegador no ofrece GPS.');
      return;
    }
    setWatching(true);
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - last.current < 10000) return;
        last.current = Date.now();
        run(`/deliveries/${order.id}/location`, {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          simulated: false,
        });
      },
      () => {
        setNote('No se pudo obtener la ubicación. Revisa el permiso del navegador.');
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }
  if (!value) return <p>{error || 'Cargando entregas…'}</p>;
  return (
    <div className="expansion">
      <p className="exp-notice">
        El repartidor solo ve sus entregas. El recorrido simulado es ilustrativo y no representa
        calles ni tráfico real. El GPS se comparte únicamente al activarlo desde su cuenta.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Panel title={own ? 'Mis entregas asignadas' : 'Coordinación de entregas'}>
        <Table
          rows={value.orders}
          columns={[
            {
              label: 'Ticket / cliente',
              render: (r) => (r.ticket || r.id.slice(0, 8)) + ' · ' + r.customer,
            },
            { label: 'Registró', render: (r) => r.created_by_name || 'Portal del cliente' },
            { label: 'Asignó', render: (r) => r.assigned_by_name || 'Sin asignación' },
            { label: 'Sucursal', key: 'branch_name' },
            {
              label: 'Estado',
              render: (r) =>
                r.delivery_status && r.order_status === 'Preparando'
                  ? r.delivery_status
                  : r.order_status,
            },
            { label: 'Repartidor', render: (r) => r.courier_name || 'Sin asignar' },
            { label: 'Fecha', render: (r) => datetime(r.created_at) },
            {
              label: 'Última ubicación',
              render: (r) =>
                r.location_at
                  ? datetime(r.location_at) + ' · ' + r.location_source
                  : 'Sin compartir',
            },
            {
              label: 'Acción',
              render: (r) => (
                <button
                  className="table-button"
                  onClick={() => {
                    setSelected(r.id);
                    setCourier(r.courier_id || value.couriers[0]?.id || '');
                    setQr('');
                    setCode('');
                    setNote('');
                    setMapUnavailable(false);
                  }}
                >
                  {canManage ? 'Gestionar entrega' : own ? 'Abrir entrega' : 'Ver entrega'}
                </button>
              ),
            },
          ]}
        />
      </Panel>
      {order && (
        <Modal
          title={canManage ? 'Gestionar entrega' : own ? 'Entrega asignada' : 'Ver entrega'}
          subtitle={`${order.ticket || order.id.slice(0, 8)} · ${order.customer}`}
          onClose={() => {
            stop();
            setSelected(null);
          }}
        >
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p>
            {order.address} · {order.payment} · {money(order.total_cents)}
          </p>
          {!own &&
            user.permissions.includes('entrega.gestionar') &&
            !['Entregado', 'Cancelado'].includes(order.order_status) && (
              <form
                className="exp-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(`/deliveries/${order.id}/assign`, { courier_id: courier });
                }}
              >
                <label>
                  Repartidor
                  <select
                    required
                    aria-label="Repartidor"
                    value={courier}
                    onChange={(e) => setCourier(e.target.value)}
                  >
                    <option value="">Selecciona repartidor</option>
                    {value.couriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" disabled={busy || !courier}>
                  Guardar asignación
                </button>
              </form>
            )}
          <div className="exp-map">
            <MapContainer
              center={[order.branch_lat, order.branch_lng]}
              zoom={12}
              zoomAnimation={false}
              fadeAnimation={false}
              markerZoomAnimation={false}
              style={{ height: '100%', width: '100%' }}
            >
              <MapTiles />
              <CircleMarker center={[order.branch_lat, order.branch_lng]} radius={7}>
                <Popup>Sucursal</Popup>
              </CircleMarker>
              <CircleMarker
                center={[order.destination_lat, order.destination_lng]}
                radius={7}
                pathOptions={{ color: '#c99437' }}
              >
                <Popup>Entrega</Popup>
              </CircleMarker>
              <Polyline
                positions={[
                  [order.branch_lat, order.branch_lng],
                  [order.destination_lat, order.destination_lng],
                ]}
                pathOptions={{ color: '#a38bc0', dashArray: '6' }}
              />
              {order.lat != null && (
                <CircleMarker
                  center={[order.lat, order.lng]}
                  radius={10}
                  pathOptions={{ color: '#1caf87' }}
                >
                  <Popup>{order.location_source}</Popup>
                </CircleMarker>
              )}
              {['GPS del dispositivo', 'Simulación'].map((source) => (
                <Polyline
                  key={source}
                  positions={(value.points || [])
                    .filter((p) => p.order_id === order.id && p.source === source)
                    .map((p) => [p.lat, p.lng])}
                  pathOptions={{
                    color: source === 'Simulación' ? '#9a70d5' : '#1caf87',
                    dashArray: source === 'Simulación' ? '4' : undefined,
                  }}
                >
                  <Popup>Recorrido registrado: {source}</Popup>
                </Polyline>
              ))}
            </MapContainer>
          </div>
          {mapUnavailable && (
            <p className="exp-notice" role="status">
              No se pudo cargar el mapa. Puedes coordinar la entrega con la dirección, el estado y
              la ubicación compartida que aparecen aquí.
            </p>
          )}
          {order.location_at && (
            <p>
              Ubicación: {order.location_source} · {datetime(order.location_at)} · precisión{' '}
              {order.accuracy || 0} m.
            </p>
          )}
          {own && order.order_status === 'Preparando' && order.delivery_status === 'Asignado' && (
            <div className="exp-form">
              <p>La sucursal tiene listo este pedido. Confirma cuando recibas la bolsa.</p>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => run(`/deliveries/${order.id}/progress`, { action: 'pickup' })}
              >
                Recoger pedido en sucursal
              </button>
            </div>
          )}
          {own && order.order_status === 'Preparando' && order.delivery_status === 'Recogido' && (
            <div className="exp-form">
              <p>Pedido recogido. Inicia la ruta cuando salgas hacia el domicilio del cliente.</p>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => run(`/deliveries/${order.id}/progress`, { action: 'route' })}
              >
                Iniciar ruta de entrega
              </button>
            </div>
          )}
          {order.courier_id &&
            (own || user.permissions.includes('entrega.gestionar')) &&
            order.order_status === 'En ruta' && (
              <div className="exp-form">
                <label>
                  Avance de la simulación: {progress}%
                  <input
                    aria-label="Avance simulado"
                    type="range"
                    min="0"
                    max="100"
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                  />
                </label>
                <button className="secondary-button" disabled={busy} onClick={() => location(true)}>
                  Simular avance del repartidor
                </button>
                {own && (
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => (watching ? stop() : location(false))}
                  >
                    {watching ? 'Detener GPS' : 'Compartir mi GPS'}
                  </button>
                )}
              </div>
            )}
          {note && <p role="status">{note}</p>}
          {own && order.order_status === 'En ruta' && (
            <form
              className="exp-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await run(
                    `/deliveries/${order.id}/finish`,
                    qr ? { qr_payload: qr } : { pickup_code: code },
                  )
                ) {
                  stop();
                  setNote('Entrega y cobro registrados.');
                }
              }}
            >
              <label>
                Número de ticket
                <input
                  value={code}
                  required={!qr}
                  maxLength={24}
                  onChange={(e) => {
                    setCode(e.target.value.trim().toUpperCase());
                    setQr('');
                  }}
                  placeholder="Ej. FC-8B0E96"
                />
              </label>
              <OrderQrReader
                disabled={busy}
                onRead={(raw) => {
                  try {
                    if (parseOrderTicket(raw).ticket !== order.ticket)
                      throw new Error('QR de otro pedido.');
                    setQr(raw);
                    setNote('QR leído.');
                  } catch (e) {
                    setNote(e.message);
                  }
                }}
              />
              <label className="exp-check">
                <input type="checkbox" required />
                Confirmo que entregué los medicamentos al cliente y recibí el cobro.
              </label>
              <button className="primary-button" disabled={busy}>
                Finalizar entrega
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
export function MessagesPage() {
  const { value, error } = useResource('/messages');
  return (
    <div className="expansion">
      <p className="exp-notice">
        Bandeja de demostración universitaria. Los mensajes se generan automáticamente al cambiar el
        estado, pero no se envía ningún SMS ni WhatsApp.
      </p>
      {error && <p role="alert">{error}</p>}
      <Panel title="Avisos simulados">
        <Table
          rows={value?.messages || []}
          columns={[
            { label: 'Fecha', render: (r) => datetime(r.created_at) },
            { label: 'Celular', key: 'phone' },
            { label: 'Evento', key: 'kind' },
            { label: 'Mensaje simulado', key: 'message' },
          ]}
        />
      </Panel>
    </div>
  );
}
