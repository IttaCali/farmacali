import React, { useState } from 'react';
import { api, money, datetime } from '../lib/api';
import { Panel, Table } from './ui';
export default function CounterSales({ data, user, branch, refresh }) {
  const [query, setQuery] = useState(''),
    [cart, setCart] = useState([]),
    [branchId, setBranchId] = useState(user.branch_id || (branch === 'all' ? '' : branch)),
    [payment, setPayment] = useState('Efectivo'),
    [receivedAmount, setReceivedAmount] = useState(''),
    [nit, setNit] = useState('CF'),
    [customer, setCustomer] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [receipt, setReceipt] = useState(null),
    [requestId, setRequestId] = useState(crypto.randomUUID());
  const branchLocked = user.scope === 'branch' || user.role === 'callcenter' || Boolean(user.branch_id),
    selected = branchLocked ? user.branch_id : branchId,
    canChooseBranch = !branchLocked;
  const available = (p) =>
    data.inventory
      .filter((i) => i.product_id === p.id && i.branch_id === selected && i.expires_on > data.date)
      .reduce((s, i) => s + i.quantity, 0);
  const normalize = (v) =>
    v
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
  const products = query.trim()
    ? data.products
        .filter(
          (p) =>
            p.state === 'Activo' &&
            normalize(p.name + ' ' + (p.component || '')).includes(normalize(query)),
        )
        .slice(0, 15)
    : [];
  const total = cart.reduce((sum, i) => sum + i.quantity * i.price_cents, 0);
  const receivedCents = Number.isFinite(Number(receivedAmount))
      ? Math.round(Number(receivedAmount) * 100)
      : 0,
    changeCents = receivedCents - total,
    canConfirm =
      Boolean(selected) &&
      cart.length > 0 &&
      (payment !== 'Efectivo' || receivedCents >= total);
  function change(id, fields) {
    setCart((c) => c.map((i) => (i.id === id ? { ...i, ...fields } : i)));
    setRequestId(crypto.randomUUID());
    setReceipt(null);
  }
  async function sell(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api('/sales/cart', {
        request_id: requestId,
        branch_id: selected,
        payment,
        ...(payment === 'Efectivo' ? { amount_received: Number(receivedAmount) } : {}),
        nit,
        customer: customer.trim() || undefined,
        items: cart.map((i) => ({
          product_id: i.id,
          quantity: i.quantity,
          prescription_confirmed: i.confirmed || false,
          prescription_id: i.prescription_id || '',
        })),
      });
      setReceipt({ ...result, items: [...cart], payment });
      setCart([]);
      setReceivedAmount('');
      setCustomer('');
      setNit('CF');
      setRequestId(crypto.randomUUID());
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="counter-sales">
      {user.permissions.includes('venta.crear') && (
        <Panel
          title="Venta en mostrador"
          subtitle="Atiende al cliente en farmacia, agrega sus medicamentos y registra el cobro en una sola venta."
        >
          <form onSubmit={sell} className="counter-form">
            {branchLocked && selected && (
              <p className="counter-branch-note">
                Sucursal asignada: {data.branches.find((item) => item.id === selected)?.name}
              </p>
            )}
            {user.role === 'callcenter' && !user.branch_id && (
              <p className="form-error" role="alert">
                Esta cuenta aún no tiene sucursal asignada. Solicita al administrador que la configure.
              </p>
            )}
            <div className="counter-controls">
              {canChooseBranch && (
                <label>
                  Sucursal
                  <select
                    aria-label="Sucursal de venta"
                    required
                    value={selected}
                    disabled={busy || cart.length > 0}
                    onChange={(e) => {
                      setBranchId(e.target.value);
                      setQuery('');
                      setRequestId(crypto.randomUUID());
                    }}
                  >
                    <option value="">Selecciona una sucursal</option>
                    {data.branches
                      .filter((b) => b.active && b.state === 'Activo')
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                Buscar por nombre o componente
                <input
                  aria-label="Buscar para venta"
                  placeholder="Escribe el medicamento o componente"
                  value={query}
                  disabled={!selected || busy}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            {products.length > 0 && (
              <div className="counter-results">
                {products.map((p) => (
                  <div key={p.id}>
                    <div>
                      <strong>{p.name}</strong>
                      <small>
                        {p.component || 'Componente sin registrar'} · {money(p.price_cents)} ·{' '}
                        {available(p)} unidades
                      </small>
                    </div>
                    <button
                      type="button"
                      className="table-button"
                      disabled={busy || available(p) < 1 || cart.some((i) => i.id === p.id)}
                      onClick={() => {
                        setCart([...cart, { ...p, quantity: 1 }]);
                        setRequestId(crypto.randomUUID());
                        setReceipt(null);
                      }}
                    >
                      Agregar
                    </button>
                  </div>
                ))}
              </div>
            )}
            {query && selected && !products.length && (
              <p>No encontramos medicamentos con ese nombre o componente.</p>
            )}
            <div className="counter-lines">
              {cart.map((i) => (
                <div className="counter-line" key={i.id}>
                  <div>
                    <strong>{i.name}</strong>
                    <small>{money(i.price_cents)} por unidad</small>
                  </div>
                  <label>
                    Cantidad
                    <input
                      aria-label={`Cantidad de ${i.name}`}
                      type="number"
                      min="1"
                      max={Math.min(100, available(i))}
                      required
                      value={i.quantity}
                      disabled={busy}
                      onChange={(e) =>
                        change(i.id, {
                          quantity: e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <strong>{money(i.quantity * i.price_cents)}</strong>
                  <button
                    type="button"
                    className="table-button"
                    disabled={busy}
                    onClick={() => {
                      setCart((c) => c.filter((p) => p.id !== i.id));
                      setRequestId(crypto.randomUUID());
                    }}
                  >
                    Quitar
                  </button>
                  {Boolean(i.prescription) && (
                    <label className="counter-rx">
                      <input
                        type="checkbox"
                        required
                        checked={i.confirmed || false}
                        disabled={busy}
                        onChange={(e) => change(i.id, { confirmed: e.target.checked })}
                      />
                      Receta revisada por el farmacéutico
                    </label>
                  )}
                  {Boolean(i.controlled) && (
                    <label>
                      Receta registrada
                      <select
                        required
                        value={i.prescription_id || ''}
                        onChange={(e) => change(i.id, { prescription_id: e.target.value })}
                      >
                        <option value="">Selecciona la receta</option>
                        {data.prescriptions
                          .filter((r) => r.product_id === i.id)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.customer_name} · {r.doctor}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </div>
              ))}
            </div>
            {!cart.length && (
              <p className="muted">Busca y agrega medicamentos para comenzar la venta.</p>
            )}
            <div className="counter-controls">
              <label>
                Nombre (opcional)
                <input
                  value={customer}
                  maxLength={100}
                  disabled={busy}
                  onChange={(e) => {
                    setCustomer(e.target.value);
                    setRequestId(crypto.randomUUID());
                  }}
                />
              </label>
              <label>
                NIT
                <input
                  required
                  value={nit}
                  maxLength={30}
                  disabled={busy}
                  onChange={(e) => {
                    setNit(e.target.value);
                    setRequestId(crypto.randomUUID());
                  }}
                />
              </label>
              <label>
                Pago
                <select
                  value={payment}
                  disabled={busy}
                  onChange={(e) => {
                    setPayment(e.target.value);
                    if (e.target.value !== 'Efectivo') setReceivedAmount('');
                    setRequestId(crypto.randomUUID());
                  }}
                >
                  <option>Efectivo</option>
                  <option>Tarjeta</option>
                </select>
              </label>
              {payment === 'Efectivo' && cart.length > 0 && (
                <label>
                  Efectivo recibido Q
                  <input
                    aria-label="Efectivo recibido Q"
                    type="number"
                    min="0"
                    step="0.01"
                    value={receivedAmount}
                    disabled={busy}
                    onChange={(e) => {
                      setReceivedAmount(e.target.value);
                      setRequestId(crypto.randomUUID());
                    }}
                  />
                </label>
              )}
            </div>
            {payment === 'Efectivo' && cart.length > 0 && (
              <div className="counter-cash-summary" aria-live="polite">
                <span>Recibido</span>
                <strong>{money(receivedCents)}</strong>
                <span>{changeCents >= 0 ? 'Cambio' : 'Pendiente'}</span>
                <strong>{money(Math.abs(changeCents))}</strong>
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="counter-total">
              <div>
                <small>Total de la venta</small>
                <strong>{money(total)}</strong>
              </div>
              <button className="primary-button" disabled={busy || !canConfirm}>
                {busy ? 'Registrando…' : 'Confirmar venta y cobro'}
              </button>
            </div>
          </form>
          {receipt && (
            <div className="counter-receipt" role="status">
              <strong>Venta registrada · {money(receipt.total_cents)}</strong>
              <p>
                Referencia: {receipt.id} · {receipt.payment}
              </p>
              {receipt.payment === 'Efectivo' && (
                <>
                  <p>Efectivo recibido: {money(receipt.amount_received_cents)}</p>
                  <p>Cambio: {money(receipt.change_cents)}</p>
                </>
              )}
              {receipt.items.map((i) => (
                <p key={i.id}>
                  {i.name} × {i.quantity}
                </p>
              ))}
              <small>Comprobante interno del proyecto. No es una factura FEL.</small>
            </div>
          )}
        </Panel>
      )}
      <Panel
        title="Ventas de mostrador"
        subtitle="Las anulaciones se solicitan en Caja y conservan su historial."
      >
        <Table
          rows={data.orders.filter(
            (o) =>
              o.channel === 'mostrador' &&
              (user.branch_id
                ? o.branch_id === user.branch_id
                : user.role === 'callcenter'
                  ? false
                  : branch === 'all' || o.branch_id === branch),
          )}
          columns={[
            { label: 'Referencia', key: 'id' },
            { label: 'Fecha', render: (r) => datetime(r.created_at) },
            { label: 'Sucursal', key: 'branch_name' },
            { label: 'Atendió', key: 'created_by_name' },
            { label: 'Cliente', key: 'customer' },
            { label: 'Pago', key: 'payment' },
            { label: 'Total', render: (r) => money(r.total_cents) },
            { label: 'Estado', key: 'status' },
          ]}
        />
      </Panel>
    </div>
  );
}
