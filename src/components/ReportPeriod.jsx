import React, { useState } from 'react';

const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const currentWeek = () => {
  const d = new Date(today() + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - new Date(Date.UTC(year, 0, 1))) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
};
export default function ReportPeriod({ from, to, onChange }) {
  const [mode, setMode] = useState(from || to ? 'custom' : 'all');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [week, setWeek] = useState('');
  const applyMonth = (v) => {
    if (!v) return;
    setMonth(v);
    const [y, m] = v.split('-').map(Number);
    onChange(`${v}-01`, `${v}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`);
  };
  const applyWeek = (v) => {
    if (!v) return;
    setWeek(v);
    const [y, w] = v.split('-W').map(Number),
      d = new Date(Date.UTC(y, 0, 4));
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() || 7) + 1 + (w - 1) * 7);
    const first = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 6);
    onChange(first, d.toISOString().slice(0, 10));
  };
  return (
    <div className="report-period">
      <label>
        Período
        <select
          aria-label="Período del reporte"
          value={mode}
          onChange={(e) => {
            const v = e.target.value;
            setMode(v);
            if (v === 'all') onChange('', '');
            if (v === 'month') applyMonth(month);
            if (v === 'week') applyWeek(currentWeek());
          }}
        >
          <option value="all">Todas las fechas</option>
          <option value="month">Un mes</option>
          <option value="week">Una semana</option>
          <option value="custom">Fechas específicas</option>
        </select>
      </label>
      {mode === 'month' && (
        <label>
          Mes
          <input
            aria-label="Mes del reporte"
            type="month"
            value={month}
            onChange={(e) => applyMonth(e.target.value)}
            required
          />
        </label>
      )}
      {mode === 'week' && (
        <label>
          Semana
          <input
            aria-label="Semana del reporte"
            type="week"
            value={week}
            onChange={(e) => applyWeek(e.target.value)}
            required
          />
        </label>
      )}
      {mode === 'custom' && (
        <>
          <label>
            Desde
            <input
              type="date"
              aria-label="Desde"
              value={from}
              onChange={(e) => onChange(e.target.value, to)}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              aria-label="Hasta"
              value={to}
              min={from || undefined}
              onChange={(e) => onChange(from, e.target.value)}
            />
          </label>
        </>
      )}
      <small>
        {from || to
          ? `${from || 'Inicio'} al ${to || 'Hoy'} · hora de Guatemala`
          : 'Incluye todos los registros disponibles'}
      </small>
    </div>
  );
}
