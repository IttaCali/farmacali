import React from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowUpRight, Inbox, LoaderCircle } from 'lucide-react';
export function Badge({ children, tone = 'green' }) {
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  );
}
export function Stat({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'teal',
  chart,
  chartLabel,
  chartType = 'bars',
}) {
  return (
    <div className={`stat stat-${tone} ${chart ? 'has-chart' : ''}`}>
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}>
          <Icon size={19} />
        </span>
      </div>
      <strong>{value}</strong>
      <div className="stat-detail">{detail}</div>
      {chart && <MiniChart values={chart} label={chartLabel} type={chartType} />}
    </div>
  );
}
function MiniChart({ values, label, type }) {
  const data = values.length ? values : [0],
    max = Math.max(1, ...data),
    points = data.map((v, i) => [
      8 + (i * 224) / Math.max(1, data.length - 1),
      49 - (v / max) * 38,
    ]);
  return (
    <figure className="stat-chart">
      <svg viewBox="0 0 240 58" role="img" aria-label={label}>
        <title>{label}</title>
        <path d="M0 50H240" stroke="currentColor" opacity=".16" />
        {type === 'line' ? (
          <>
            <polygon
              points={[[8, 50], ...points, [232, 50]].map((p) => p.join(',')).join(' ')}
              fill="currentColor"
              opacity=".12"
            />
            <polyline
              points={points.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {points.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="2.5" fill="currentColor" />
            ))}
          </>
        ) : (
          data.map((v, i) => (
            <rect
              key={i}
              x={(i * 240) / data.length + 5}
              y={49 - (v / max) * 38}
              width={Math.max(2, 240 / data.length - 10)}
              height={Math.max(2, (v / max) * 38)}
              rx="3"
              fill="currentColor"
              opacity={0.45 + (i / data.length) * 0.5}
            />
          ))
        )}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
export function Empty({ text = 'No hay registros para estos filtros.' }) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <strong>{text}</strong>
      <span>Los registros aparecerán aquí al completar una operación.</span>
    </div>
  );
}
export function Table({
  columns,
  rows,
  rowKey = 'id',
  empty,
  compact = false,
  searchPlaceholder = 'Filtrar registros...',
}) {
  const [page, setPage] = React.useState(1),
    [pageSize, setPageSize] = React.useState(() =>
      window.matchMedia('(max-width:600px)').matches ? 5 : 25,
    ),
    [sort, setSort] = React.useState(null);
  const [query, setQuery] = React.useState('');
  React.useEffect(() => {
    const screen = window.matchMedia('(max-width:600px)');
    const adapt = () =>
      setPageSize((current) =>
        screen.matches ? (current === 25 ? 5 : current) : current === 5 ? 25 : current,
      );
    adapt();
    screen.addEventListener('change', adapt);
    return () => screen.removeEventListener('change', adapt);
  }, []);
  const filtered = rows.filter((row) =>
    Object.values(row).some((value) =>
      String(value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .includes(
          query
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, ''),
        ),
    ),
  );
  React.useEffect(() => setPage(1), [query]);
  React.useEffect(() => setPage(1), [rows.length, pageSize]);
  const readable = (node) =>
    typeof node === 'string' || typeof node === 'number'
      ? String(node)
      : Array.isArray(node)
        ? node.map(readable).join(' ')
        : node?.props
          ? readable(node.props.children)
          : '';
  const value = (row, column) => (column.key ? row[column.key] : readable(column.render?.(row)));
  const sorted = sort
    ? [...filtered].sort(
        (a, b) =>
          String(value(a, columns[sort.index]) ?? '').localeCompare(
            String(value(b, columns[sort.index]) ?? ''),
            'es',
            { numeric: true },
          ) * sort.direction,
      )
    : filtered;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    current = Math.min(page, pages),
    visible = sorted.slice((current - 1) * pageSize, current * pageSize);
  return (
    <div className={`table-wrap ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="table-tools">
          <input
            aria-label="Buscar en esta tabla"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span>{filtered.length} registros</span>
        </div>
      )}
      <div
        className="records-viewport"
        tabIndex={0}
        role="region"
        aria-label="Registros con desplazamiento vertical"
      >
        <table className="record-table" role="table">
          <thead role="rowgroup">
            <tr role="row">
              {columns.map((c) => (
                <th key={c.label} role="columnheader" scope="col">
                  <button
                    className="sort-button"
                    onClick={() =>
                      setSort({
                        index: columns.indexOf(c),
                        direction: sort?.index === columns.indexOf(c) ? -sort.direction : 1,
                      })
                    }
                  >
                    {c.label}
                    {sort?.index === columns.indexOf(c) ? (sort.direction === 1 ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {visible.map((r, i) => (
              <tr key={r[rowKey] || i} role="row">
                {columns.map((c) => (
                  <td key={c.label} role="cell">
                    <span className="record-field-label" aria-hidden="true">
                      {c.label}
                    </span>
                    <div className="record-field-value">{c.render ? c.render(r) : r[c.key]}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && <Empty text={empty} />}
      {!!filtered.length && (
        <div className="pagination">
          <span>
            {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, filtered.length)} de{' '}
            {filtered.length}
          </span>
          <label>
            Filas{' '}
            <select
              aria-label="Filas por página"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option>5</option>
              <option>12</option>
              <option>25</option>
              <option>50</option>
            </select>
          </label>
          <button disabled={current === 1} onClick={() => setPage(current - 1)}>
            Anterior
          </button>
          <span>
            {current} / {pages}
          </span>
          <button disabled={current === pages} onClick={() => setPage(current + 1)}>
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
export function Panel({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function LinkButton({ children, onClick }) {
  return (
    <button className="link-button" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
export function Modal({ title, subtitle, onClose, children, className = '' }) {
  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    const previous = document.activeElement;
    document.querySelector('.modal input,.modal select,.modal button')?.focus();
    return () => {
      document.removeEventListener('keydown', handler);
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
export function RecordForm({
  fields,
  initial = {},
  onSubmit,
  busy,
  submit = 'Guardar registro',
  children,
  fieldErrors = {},
}) {
  const fieldOptions = (field, source) =>
    typeof field.options === 'function' ? field.options(source) : field.options || [];
  const [values, setValues] = React.useState(() => {
    const next = {};
    for (const field of fields) {
      const options = fieldOptions(field, { ...initial, ...next });
      const value =
        initial[field.name] ??
        field.default ??
        (field.type === 'checkbox' ? false : (options[0]?.value ?? ''));
      next[field.name] =
        field.dependsOn && !options.some((option) => option.value === value)
          ? (options[0]?.value ?? '')
          : value;
    }
    return next;
  });
  const [localErrors, setLocalErrors] = React.useState({});
  function liveCheck(event, name) {
    const input = event.currentTarget;
    setLocalErrors((current) => ({
      ...current,
      [name]: input.validity.valid ? '' : input.validationMessage,
    }));
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="form-grid">
        {fields.map((f) => (
          <label className={f.wide ? 'wide' : ''} key={f.name}>
            <span>
              {f.label}
              {f.required !== false && f.type !== 'checkbox' && <em> *</em>}
            </span>
            {f.options ? (
              <select
                aria-label={f.label}
                value={values[f.name]}
                onChange={(e) => {
                  const next = { ...values, [f.name]: e.target.value };
                  for (const dependent of fields.filter((field) => field.dependsOn === f.name)) {
                    const options = fieldOptions(dependent, next);
                    if (!options.some((option) => option.value === next[dependent.name]))
                      next[dependent.name] = options[0]?.value ?? '';
                  }
                  setValues(next);
                  liveCheck(e, f.name);
                }}
                onBlur={(e) => liveCheck(e, f.name)}
                required={f.required !== false}
              >
                {fieldOptions(f, values).map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'checkbox' ? (
              <div className="checkbox-line">
                <input
                  aria-label={f.label}
                  type="checkbox"
                  checked={values[f.name]}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.checked })}
                />
                <span>{f.help}</span>
              </div>
            ) : (
              <input
                aria-label={f.label}
                type={f.type || 'text'}
                value={values[f.name]}
                min={f.min}
                max={f.max}
                maxLength={f.maxLength || 200}
                step={f.step || (f.type === 'number' ? '1' : undefined)}
                placeholder={f.placeholder}
                inputMode={f.inputMode}
                required={f.required !== false}
                onChange={(e) => {
                  setValues({ ...values, [f.name]: e.target.value });
                  liveCheck(e, f.name);
                }}
                onBlur={(e) => liveCheck(e, f.name)}
              />
            )}
            {f.help && f.type !== 'checkbox' && <small className="field-help">{f.help}</small>}
            {(localErrors[f.name] || fieldErrors[f.name]) && (
              <small className="field-error">{localErrors[f.name] || fieldErrors[f.name]}</small>
            )}
          </label>
        ))}
      </div>
      {children}
      <div className="form-footer">
        <span>La operación quedará registrada en auditoría.</span>
        <button className="primary-button" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={17} /> : null}
          {busy ? 'Guardando…' : submit}
        </button>
      </div>
    </form>
  );
}
