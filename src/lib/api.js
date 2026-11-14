let refreshPromise;
export const csrfToken = () =>
  decodeURIComponent(
    document.cookie
      .split('; ')
      .find((c) => c.startsWith('csrf='))
      ?.split('=')[1] || '',
  );
export async function api(path, body, method = body ? 'POST' : 'GET', retry = true) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    credentials: 'same-origin',
  });
  const result = await response.json();
  if (!response.ok) {
    if (
      response.status === 401 &&
      retry &&
      !['/auth/login', '/auth/complete', '/auth/refresh'].includes(path)
    ) {
      try {
        if (!refreshPromise)
          refreshPromise = api('/auth/refresh', {}, 'POST', false).finally(() => {
            refreshPromise = null;
          });
        await refreshPromise;
        return api(path, body, method, false);
      } catch {
        window.dispatchEvent(new Event('farmacali-expired'));
      }
    }
    const error = new Error(result.error || 'No se pudo conectar con el servidor.');
    error.status = response.status;
    error.fields = result.fields;
    throw error;
  }
  return result;
}
export async function downloadReport(name, format, branch = 'all', filters = {}) {
  await api('/auth/me');
  const response = await fetch(
    `/api/reports/${encodeURIComponent(name)}/${format}?${new URLSearchParams({ ...filters, branch_id: branch })}`,
    { credentials: 'same-origin' },
  );
  if (!response.ok)
    throw new Error((await response.json()).error || 'No se pudo generar el reporte.');
  const blob = await response.blob(),
    url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  const period =
    filters.from || filters.to ? `-${filters.from || 'inicio'}-a-${filters.to || 'hoy'}` : '';
  link.download = `farmacali-${name}${period}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const money = (cents) =>
  new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    minimumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100);
export const count = (n) => new Intl.NumberFormat('es-GT').format(Number(n) || 0);
export const datetime = (v) =>
  new Intl.DateTimeFormat('es-GT', {
    timeZone: 'America/Guatemala',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(v));
export const day = (v) =>
  new Intl.DateTimeFormat('es-GT', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${v}T12:00:00Z`));
export function csv(rows, name) {
  if (!rows.length) return;
  const fields = Object.keys(rows[0]);
  const cell = (v) =>
    `"${String(v ?? '')
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""')}"`;
  const blob = new Blob(
    [
      '\ufeff' +
        [
          fields.map(cell).join(','),
          ...rows.map((r) => fields.map((f) => cell(r[f])).join(',')),
        ].join('\r\n'),
    ],
    { type: 'text/csv;charset=utf-8;' },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `farmacali-${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
