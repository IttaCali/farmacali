import ReportPeriod from './ReportPeriod.jsx';
import React, { useEffect, useState } from 'react';
import { api, money, datetime, downloadReport } from '../lib/api';
import { Panel } from './ui';
export default function HistoricalTable({
  kind,
  userId = '',
  productId = '',
  inventoryId = '',
  branch = 'all',
  search = '',
  onDetail,
  refreshKey,
  canExport = true,
  action,
}) {
  const [result, setResult] = useState(null),
    [pageSize, setPageSize] = useState(() =>
      window.matchMedia('(max-width:600px)').matches ? 10 : 50,
    ),
    [page, setPage] = useState(1),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    const screen = window.matchMedia('(max-width:600px)');
    const adapt = () => setPageSize(screen.matches ? 10 : 50);
    screen.addEventListener('change', adapt);
    return () => screen.removeEventListener('change', adapt);
  }, []);
  useEffect(() => setPage(1), [branch, search, from, to, pageSize, productId, inventoryId, userId]);
  useEffect(() => {
    let active = true;
    setError('');
    const timer = setTimeout(
      () =>
        api(
          '/history/' +
            kind +
            '?' +
            new URLSearchParams({
              branch_id: branch,
              search,
              page: String(page),
              page_size: String(pageSize),
              ...(from ? { from } : {}),
              ...(productId ? { product_id: productId } : {}),
              ...(userId ? { user_id: userId } : {}),
              ...(inventoryId ? { inventory_id: inventoryId } : {}),
              ...(to ? { to } : {}),
            }),
        )
          .then((r) => active && setResult(r))
          .catch((e) => active && setError(e.message)),
      180,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [kind, branch, search, page, from, to, refreshKey, pageSize, productId, inventoryId, userId]);
  const titles = {
    cash: 'Libro histórico de caja',
    kardex: 'Kardex histórico por lote',
    audit: 'Bitácora histórica completa',
    history: 'Cambios históricos',
  };
  const columns =
    kind === 'cash'
      ? [
          ['Fecha', (r) => datetime(r.created_at)],
          ['Sucursal', (r) => r.branch_name],
          ['Tipo', (r) => r.kind],
          ['Concepto', (r) => r.description],
          ['Método', (r) => r.method],
          ['Monto', (r) => money(r.amount_cents)],
        ]
      : kind === 'kardex'
        ? [
            ['Fecha', (r) => datetime(r.created_at)],
            ['Sucursal', (r) => r.branch_name],
            ['Medicamento', (r) => r.product_name],
            ['Lote', (r) => r.lot],
            ['Movimiento', (r) => r.type],
            ['Unidades', (r) => r.quantity],
            ['Motivo', (r) => r.reason],
          ]
        : [
            ['Fecha', (r) => datetime(r.created_at)],
            ['Usuario', (r) => r.user_name],
            ['Acción', (r) => r.action || r.event],
            ['Entidad', (r) => r.entity],
            ['Referencia', (r) => r.entity_id],
            [
              'Detalle',
              (r) => (
                <button className="table-button" onClick={() => onDetail?.(r)}>
                  Ver detalle
                </button>
              ),
            ],
          ];
  return (
    <Panel
      title={titles[kind]}
      action={action}
      subtitle="Todas las fechas disponibles · paginación en el servidor, sin corte de registros antiguos"
    >
      <div className="exp-history-filters">
        <ReportPeriod
          from={from}
          to={to}
          onChange={(a, b) => {
            setFrom(a);
            setTo(b);
          }}
        />
        <span>{result?.total ?? '…'} registros encontrados</span>
        {canExport &&
          kind !== 'history' &&
          ['xlsx', 'pdf', 'csv'].map((format) => (
            <button
              key={format}
              className="secondary-button"
              onClick={async () => {
                try {
                  await downloadReport(kind, format, branch, {
                    from,
                    to,
                    search,
                    user_id: userId,
                    product_id: productId,
                    inventory_id: inventoryId,
                  });
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Exportar filtro {format.toUpperCase()}
            </button>
          ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {result?.totals && (
        <p className="exp-history-totals">
          Ingresos: <strong>{money(result.totals.income)}</strong> · Egresos:{' '}
          <strong>{money(result.totals.expense)}</strong> · Saldo del filtro:{' '}
          <strong>{money(result.totals.balance)}</strong>
        </p>
      )}
      <div className="table-scroll">
        <table className="data-table record-table" role="table">
          <thead>
            <tr>
              {columns.map(([label]) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result?.rows.map((r) => (
              <tr key={r.id}>
                {columns.map(([label, render]) => (
                  <td key={label} role="cell">
                    <span className="record-field-label" aria-hidden="true">
                      {label}
                    </span>
                    <div className="record-field-value">{render(r)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {result && !result.rows.length && (
          <p className="exp-empty">No hay movimientos en este filtro.</p>
        )}
      </div>
      <div className="exp-pagination">
        <button
          className="secondary-button"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </button>
        <span>
          Página {page} de {Math.max(1, Math.ceil((result?.total || 0) / pageSize))}
        </span>
        <button
          className="secondary-button"
          disabled={!result || page * pageSize >= result.total}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </button>
      </div>
    </Panel>
  );
}
