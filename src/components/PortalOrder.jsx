import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Clock, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { api, money, datetime } from '../lib/api';
import { Modal } from './ui';
import OrderQrReader from './OrderQrReader';
import { parseOrderTicket } from '../../shared/order-ticket.js';

export function OrderItems({ order, data }) {
  const items = [];
  for (const line of data.order_items.filter((i) => i.order_id === order.id)) {
    const found = items.find(
      (i) => i.product_id === line.product_id && i.unit_price_cents === line.unit_price_cents,
    );
    if (found) found.quantity += Number(line.quantity);
    else
      items.push({
        ...line,
        quantity: Number(line.quantity),
        name: data.products.find((p) => p.id === line.product_id)?.name || line.product_id,
      });
  }
  return (
    <div className="portal-order-items">
      <h3>Medicamentos a preparar / entregar</h3>
      <table>
        <thead>
          <tr>
            <th>Medicamento</th>
            <th>Cantidad</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.product_id + ':' + i.unit_price_cents}>
              <td>
                {i.name}
                <small>{money(i.unit_price_cents)} por unidad</small>
              </td>
              <td>
                <strong>{i.quantity}</strong>
              </td>
              <td>{money(i.quantity * i.unit_price_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="portal-order-total">
        <span>Total del pedido · {order.payment}</span>
        <strong>{money(order.total_cents)}</strong>
      </div>
    </div>
  );
}

export function PortalOrderDetail({ order, data, user, onClose, onChanged }) {
  const [rx, setRx] = useState(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [notes, setNotes] = useState(''),
    [delivery, setDelivery] = useState(null),
    [courier, setCourier] = useState(order.courier_id || '');
  const [packed, setPacked] = useState(false),
    [legacyRx, setLegacyRx] = useState(false),
    [paid, setPaid] = useState(false),
    [method, setMethod] = useState('code'),
    [code, setCode] = useState(''),
    [qr, setQr] = useState(''),
    [reason, setReason] = useState('');
  const [edit, setEdit] = useState({
    customer: order.customer,
    phone: order.phone,
    address: order.address,
    payment: order.payment,
    branch_id: order.branch_id,
    lat: order.lat,
    lng: order.lng,
    reason: '',
  });
  const recipe = useRef(null);
  const canManage = user.permissions.includes('pedido.gestionar'),
    pickup = order.fulfillment === 'pickup',
    portal = order.channel === 'portal',
    done = ['Entregado', 'Cancelado'].includes(order.status);
  const couriers = (delivery?.couriers || []).filter(
    (candidate) => candidate.branch_id === order.branch_id,
  );
  useEffect(() => {
    let active = true;
    api(`/orders/${order.id}/prescription`)
      .then((r) => {
        if (active) {
          setRx(r);
          setNotes(r.notes || '');
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [order.id, order.uploaded_rx_status]);
  useEffect(() => {
    setPacked(false);
    setPaid(false);
    setCode(portal ? String(order.ticket || '') : '');
    setQr('');
  }, [order.status, order.ticket, portal]);
  useEffect(() => setCourier(order.courier_id || ''), [order.courier_id]);
  useEffect(() => {
    if (pickup || !canManage) return undefined;
    let active = true;
    api('/deliveries')
      .then((result) => active && setDelivery(result))
      .catch((requestError) => active && setError(requestError.message));
    return () => {
      active = false;
    };
  }, [pickup, canManage, order.id]);
  async function run(path, body, method = 'POST', success = 'Operación registrada.') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(path, body, method);
      await onChanged();
      setMessage(success);
      return true;
    } catch (e) {
      setError(e.message);
      if (e.status === 409) await onChanged();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function review(approved) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/orders/${order.id}/prescription-review`, { approved, notes });
      setRx(await api(`/orders/${order.id}/prescription`));
      await onChanged();
      setMessage(
        approved
          ? 'Receta revisada y aprobada. Ya puedes iniciar la preparación.'
          : 'Receta rechazada. Contacta al cliente antes de continuar.',
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const readQr = useCallback(
    (raw) => {
      setError('');
      setQr('');
      try {
        const parsed = parseOrderTicket(raw);
        if (parsed.ticket !== order.ticket)
          throw new Error(
            'Este QR pertenece a otro pedido. Abre el pedido correcto o solicita su ticket.',
          );
        setQr(raw);
        setMessage('QR leído. Confirma la entrega y el cobro para finalizar.');
      } catch (e) {
        setError(e.message);
      }
    },
    [order.ticket],
  );
  const needsReview = Boolean(order.needs_prescription) && !order.prescription_confirmed;
  const pendingPhoto = Boolean(rx?.image) && rx.status !== 'Revisada';
  const blocked =
    order.status === 'Pendiente' &&
    needsReview &&
    (rx === null || pendingPhoto || (!rx.image && !legacyRx));
  const steps = ['Pendiente', 'Preparando', pickup ? 'Listo para recoger' : 'En ruta', 'Entregado'],
    step = steps.indexOf(order.status);
  const next =
    order.status === 'Pendiente'
      ? 'Preparando'
      : order.status === 'Preparando'
        ? pickup
          ? 'Listo para recoger'
          : 'En ruta'
        : 'Entregado';
  const nextLabel =
    order.status === 'Pendiente'
      ? 'Confirmar y preparar'
      : order.status === 'Preparando'
        ? pickup
          ? 'Marcar listo para recoger'
          : order.courier_id
            ? 'Pedido asignado al repartidor'
            : 'Entregar pedido al repartidor'
        : 'Confirmar entrega y cobro';
  const canReview =
    ['admin', 'callcenter'].includes(user.role) &&
    user.permissions.includes('receta.gestionar') &&
    order.status === 'Pendiente';
  async function advance(e) {
    e.preventDefault();
    if (blocked) {
      setError('Revisa y aprueba la receta antes de preparar este pedido.');
      return;
    }
    if (!pickup && order.status === 'Preparando') {
      if (!packed) {
        setError('Confirma que revisaste y empacaste todos los medicamentos.');
        return;
      }
      if (!courier) {
        setError('Selecciona un repartidor de la sucursal.');
        return;
      }
      await run(
        `/deliveries/${order.id}/assign`,
        { courier_id: courier },
        'POST',
        'Pedido entregado al repartidor. Ya aparece en su bandeja.',
      );
      return;
    }
    if (!pickup && order.status === 'En ruta') {
      if (!order.courier_id && courier) {
        await run(
          `/deliveries/${order.id}/assign`,
          { courier_id: courier },
          'POST',
          'Repartidor asignado. El pedido ya aparece en su bandeja.',
        );
        return;
      }
      setError('El repartidor asignado debe validar el ticket o QR para finalizar la entrega.');
      return;
    }
    if (next === 'Listo para recoger' && !packed) {
      setError('Confirma que todos los medicamentos ya están en la bolsa.');
      return;
    }
    if (next === 'Entregado' && portal && method === 'qr' && !qr) {
      setError('Lee el QR de este pedido antes de confirmar la entrega.');
      return;
    }
    await run(
      `/orders/${order.id}/status`,
      {
        status: next,
        ...(next === 'Preparando' && legacyRx ? { prescription_confirmed: true } : {}),
        ...(next === 'Listo para recoger' ? { packed } : {}),
        ...(next === 'Entregado' && portal
          ? method === 'qr'
            ? { qr_payload: qr }
            : { pickup_code: code }
          : {}),
      },
      'PATCH',
      next === 'Entregado'
        ? 'Pedido entregado. El cobro quedó registrado una sola vez.'
        : `Pedido actualizado: ${next}.`,
    );
  }
  return (
    <Modal
      title={canManage ? 'Gestionar pedido' : 'Detalle del pedido'}
      subtitle={`${order.ticket || '#' + order.id.slice(0, 8)} · ${order.customer}`}
      className="order-workspace"
      onClose={() => !busy && onClose()}
    >
      <div className="order-workspace-status">
        <span className={'order-status-pill ' + (done ? 'finished' : '')}>
          <PackageCheck size={16} />
          <strong>{order.status}</strong>
        </span>
        <span>
          {portal
            ? 'Portal público'
            : order.channel === 'telefono'
              ? 'Pedido por teléfono'
              : 'Pedido interno'}{' '}
          · {pickup ? 'Retiro en sucursal' : 'Entrega a domicilio'}
        </span>
      </div>
      {order.status !== 'Cancelado' && (
        <ol className="order-progress" aria-label="Seguimiento del pedido">
          {steps.map((s, i) => (
            <li
              key={s}
              aria-current={step === i ? 'step' : undefined}
              className={i <= step ? 'complete' : ''}
            >
              <span>{i < step ? <Check size={13} /> : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <p className="order-success" role="status">
          {message}
        </p>
      )}
      <div className="order-workspace-grid">
        <div className="order-workspace-main">
          <dl className="order-customer-details">
            <div>
              <dt>Cliente y contacto</dt>
              <dd>
                {order.customer}
                <small>{order.phone || 'Sin teléfono registrado'}</small>
              </dd>
            </div>
            <div>
              <dt>Sucursal</dt>
              <dd>
                {order.branch_name}
                <small>{order.address}</small>
              </dd>
            </div>
            <div>
              <dt>Pago al recibir</dt>
              <dd>
                {order.payment} · {money(order.total_cents)}
              </dd>
            </div>
            <div>
              <dt>Creado / estimación</dt>
              <dd>
                {datetime(order.created_at)}
                <small>{order.eta_minutes} min de estimación inicial</small>
              </dd>
            </div>
            {order.reservation_expires_at && (
              <div>
                <dt>Reserva hasta</dt>
                <dd>{datetime(order.reservation_expires_at)}</dd>
              </div>
            )}
            {order.delivered_at && (
              <div>
                <dt>Entregado</dt>
                <dd>{datetime(order.delivered_at)}</dd>
              </div>
            )}
          </dl>
          <OrderItems order={order} data={data} />
          <section className="portal-rx-detail" ref={recipe}>
            <h3>
              <ShieldCheck size={18} />
              Receta del cliente
            </h3>
            {!rx ? (
              <p>Cargando receta…</p>
            ) : (
              <>
                <p className="order-rx-status">
                  <strong>
                    {order.needs_prescription
                      ? rx.image
                        ? rx.status
                        : order.prescription_confirmed
                          ? 'Revisada'
                          : 'Revisión presencial'
                      : 'No requiere receta'}
                  </strong>
                  {rx.reviewed_at && ' · ' + datetime(rx.reviewed_at)}
                </p>
                {rx.image ? (
                  <>
                    <a
                      href={rx.image}
                      download={`${order.ticket || order.id}-receta`}
                      className="table-button"
                    >
                      Descargar foto
                    </a>
                    <img
                      className="portal-rx-image"
                      src={rx.image}
                      alt="Receta adjunta por el cliente"
                    />
                    {canReview ? (
                      <>
                        <label className="portal-review-notes">
                          Observaciones de revisión
                          <textarea
                            maxLength={500}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Si rechazas la receta, explica el motivo"
                          />
                        </label>
                        <div className="order-review-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busy}
                            onClick={() => review(false)}
                          >
                            Rechazar receta
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            disabled={busy}
                            onClick={() => review(true)}
                          >
                            Marcar receta revisada y aprobada
                          </button>
                        </div>
                      </>
                    ) : (
                      rx.notes && <p>{rx.notes}</p>
                    )}
                  </>
                ) : (
                  <p>
                    {order.needs_prescription
                      ? 'Este pedido no tiene foto. Revisa la receta presentada por el cliente antes de preparar.'
                      : 'Puedes continuar con la preparación sin solicitar una receta.'}
                  </p>
                )}
              </>
            )}
          </section>
          {canManage && user.scope !== 'branch' && order.status === 'Pendiente' && (
            <details className="order-edit">
              <summary>Corregir datos o reasignar sucursal</summary>
              <form
                className="order-inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const { reason, ...values } = edit;
                  run(
                    `/manage/orders/${order.id}`,
                    { reason, values },
                    'POST',
                    'Datos del pedido actualizados.',
                  );
                }}
              >
                <label>
                  Nombre del cliente
                  <input
                    required
                    maxLength={100}
                    value={edit.customer}
                    onChange={(e) => setEdit({ ...edit, customer: e.target.value })}
                  />
                </label>
                <label>
                  Teléfono
                  <input
                    required
                    maxLength={25}
                    value={edit.phone}
                    onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                  />
                </label>
                <label>
                  Sucursal
                  <select
                    value={edit.branch_id}
                    onChange={(e) => setEdit({ ...edit, branch_id: e.target.value })}
                  >
                    {data.branches
                      .filter((b) => b.active && b.state === 'Activo')
                      .map((b) => (
                        <option value={b.id} key={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Método de pago
                  <select
                    value={edit.payment}
                    onChange={(e) => setEdit({ ...edit, payment: e.target.value })}
                  >
                    <option>Efectivo</option>
                    <option>Tarjeta</option>
                    {edit.payment === 'Transferencia' && <option>Transferencia</option>}
                  </select>
                </label>
                {!pickup && (
                  <>
                    <label>
                      Dirección
                      <input
                        required
                        maxLength={200}
                        value={edit.address}
                        onChange={(e) => setEdit({ ...edit, address: e.target.value })}
                      />
                    </label>
                    <label>
                      Latitud
                      <input
                        required
                        type="number"
                        step="any"
                        value={edit.lat}
                        onChange={(e) => setEdit({ ...edit, lat: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Longitud
                      <input
                        required
                        type="number"
                        step="any"
                        value={edit.lng}
                        onChange={(e) => setEdit({ ...edit, lng: Number(e.target.value) })}
                      />
                    </label>
                  </>
                )}
                <label>
                  Motivo del cambio
                  <textarea
                    required
                    maxLength={500}
                    value={edit.reason}
                    onChange={(e) => setEdit({ ...edit, reason: e.target.value })}
                  />
                </label>
                <button className="secondary-button" disabled={busy}>
                  Guardar cambios del pedido
                </button>
              </form>
            </details>
          )}
        </div>
        <aside className="order-action-card">
          <h3>
            <Truck size={18} />
            Seguimiento y entrega
          </h3>
          {!canManage ? (
            <p>Tu rol permite consultar este pedido. Las acciones requieren permiso de gestión.</p>
          ) : done ? (
            <div className="order-completed">
              <PackageCheck size={28} />
              <strong>
                {order.status === 'Entregado' ? 'Entrega completada' : 'Pedido cancelado'}
              </strong>
              <p>
                {order.status === 'Entregado'
                  ? `El pedido y su cobro ya quedaron registrados${order.courier_name ? ` por ${order.courier_name}` : ''}.`
                  : 'Las existencias reservadas se liberaron.'}
              </p>
            </div>
          ) : (
            <>
              <form className="order-inline-form" onSubmit={advance}>
                <p>
                  {order.status === 'Pendiente'
                    ? 'Revisa la solicitud e inicia la preparación.'
                    : order.status === 'Preparando'
                      ? pickup
                        ? 'Marca listo solo cuando todos los medicamentos estén en la bolsa, verificados e identificados con el ticket.'
                        : order.courier_id
                          ? `El pedido fue asignado a ${order.courier_name}. Espera que confirme la recogida e inicie la ruta.`
                          : 'Confirma el empaque y entrégalo a un repartidor activo de esta sucursal.'
                      : !pickup
                        ? order.courier_name
                          ? `${order.courier_name} lleva el pedido. El repartidor validará el ticket o QR al entregarlo.`
                          : 'Este pedido todavía necesita un repartidor asignado.'
                        : 'Verifica que el cliente reciba su pedido y confirma el cobro.'}
                </p>
                {order.status === 'Pendiente' &&
                  needsReview &&
                  rx?.image &&
                  rx.status !== 'Revisada' && (
                    <div className="order-action-notice">
                      <ShieldCheck size={18} />
                      <p>Primero se debe revisar y aprobar la receta.</p>
                      <button
                        type="button"
                        className="table-button"
                        onClick={() =>
                          recipe.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                      >
                        Ir a la receta
                      </button>
                    </div>
                  )}
                {order.status === 'Pendiente' && needsReview && rx && !rx.image && (
                  <label className="order-checkbox">
                    <input
                      type="checkbox"
                      required
                      checked={legacyRx}
                      onChange={(e) => setLegacyRx(e.target.checked)}
                    />
                    Revisé la receta presentada por el cliente y es válida.
                  </label>
                )}
                {(next === 'Listo para recoger' ||
                  (!pickup && order.status === 'Preparando' && !order.courier_id)) && (
                  <label className="order-checkbox">
                    <input
                      aria-label="Pedido empacado"
                      type="checkbox"
                      required
                      checked={packed}
                      onChange={(e) => setPacked(e.target.checked)}
                    />
                    Confirmo que revisé las cantidades y todos los medicamentos ya están en la
                    bolsa.
                  </label>
                )}
                {!pickup &&
                  ['Preparando', 'En ruta'].includes(order.status) &&
                  !order.courier_id && (
                    <label>
                      Repartidor de {order.branch_name}
                      <select
                        required
                        value={courier}
                        onChange={(e) => setCourier(e.target.value)}
                      >
                        <option value="">Selecciona un repartidor</option>
                        {couriers.map((candidate) => (
                          <option value={candidate.id} key={candidate.id}>
                            {[candidate.name, candidate.surname].filter(Boolean).join(' ')}
                          </option>
                        ))}
                      </select>
                      {!couriers.length && (
                        <small>No hay repartidores activos asignados a esta sucursal.</small>
                      )}
                    </label>
                  )}
                {next === 'Entregado' && portal && pickup && (
                  <fieldset className="order-delivery-proof">
                    <legend>Confirmar entrega con ticket o QR</legend>
                    <div className="order-proof-tabs">
                      <button
                        type="button"
                        aria-pressed={method === 'code'}
                        onClick={() => setMethod('code')}
                      >
                        Ingresar ticket
                      </button>
                      <button
                        type="button"
                        aria-pressed={method === 'qr'}
                        onClick={() => setMethod('qr')}
                      >
                        Leer QR
                      </button>
                    </div>
                    {method === 'code' ? (
                      <label>
                        Número de ticket
                        <input
                          aria-label="Número de ticket del pedido"
                          required
                          autoComplete="off"
                          maxLength={24}
                          value={code}
                          onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
                          placeholder="Ej. FC-8B0E96"
                        />
                      </label>
                    ) : (
                      <>
                        <OrderQrReader onRead={readQr} disabled={busy} />
                        {qr && (
                          <p className="order-qr-verified">
                            <Check size={16} />
                            QR de este pedido leído
                          </p>
                        )}
                      </>
                    )}
                  </fieldset>
                )}
                {next === 'Entregado' && pickup && (
                  <label className="order-checkbox">
                    <input
                      aria-label="Entrega y cobro confirmados"
                      required
                      type="checkbox"
                      checked={paid}
                      onChange={(e) => setPaid(e.target.checked)}
                    />
                    Confirmo la entrega de los medicamentos y el cobro de {money(order.total_cents)}{' '}
                    mediante {order.payment}.
                  </label>
                )}
                {!(!pickup && order.courier_id && ['Preparando', 'En ruta'].includes(order.status)) && (
                  <button
                    className="primary-button order-next-action"
                    disabled={
                      busy ||
                      blocked ||
                      (!pickup && ['Preparando', 'En ruta'].includes(order.status) && !courier) ||
                      (next === 'Entregado' && portal && pickup && method === 'qr' && !qr)
                    }
                  >
                    {busy
                      ? 'Guardando…'
                      : !pickup && order.status === 'En ruta' && !order.courier_id
                        ? 'Asignar repartidor'
                        : nextLabel}
                    <ChevronRight size={17} />
                  </button>
                )}
              </form>
              <details className="order-cancel">
                <summary>Cancelar pedido</summary>
                <form
                  className="order-inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      await run(
                        `/orders/${order.id}/status`,
                        { status: 'Cancelado', reason },
                        'PATCH',
                        'Pedido cancelado y existencias liberadas.',
                      )
                    )
                      setReason('');
                  }}
                >
                  <label>
                    Motivo de cancelación
                    <textarea
                      required
                      maxLength={500}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <button className="secondary-button" disabled={busy}>
                    Cancelar y liberar existencias
                  </button>
                </form>
              </details>
            </>
          )}
          <small className="order-audit-note">
            <Clock size={13} />
            Cada operación queda registrada con usuario y fecha.
          </small>
        </aside>
      </div>
    </Modal>
  );
}
