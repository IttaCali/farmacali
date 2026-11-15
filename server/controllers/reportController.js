import { reportWorkbook } from './reportWorkbook.js';
import PDFDocument from 'pdfkit';
import { model } from './pharmacyController.js';
import { AppError } from '../models/pharmacy.js';
import { db } from '../database/db.js';
import { writeAudit } from '../models/audit.js';
import { history } from '../models/history.js';
const resources = {
  sales: ['orders', 'venta.ver'],
  orders: ['orders', 'pedido.ver'],
  inventory: ['inventory', 'inventario.ver'],
  kardex: ['ledger', 'kardex.ver'],
  cash: ['cash', 'caja.ver'],
  payroll: ['payroll', 'planilla.ver'],
  audit: ['audit', 'auditoria.exportar'],
  branches: ['branches', 'sucursal.ver'],
  transfers: ['transfers', 'traslado.ver'],
  assets: ['assets', 'activo.ver'],
  clients: ['clients', 'cliente.ver'],
  users: ['users', 'usuario.ver'],
  requests: ['requests', 'solicitud.ver'],
  prescriptions: ['prescriptions', 'receta.ver'],
};
function renderPdfTable(doc, { title, columns, keys, values, rows, query, branch }) {
  const pageWidth = 785.89;
  const weights = keys.map((key) =>
    /description|reason|address|customer|user_name/.test(key)
      ? 1.7
      : /created_at|branch_name/.test(key)
        ? 1.35
        : 1,
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const widths = weights.map((weight) => (pageWidth * weight) / totalWeight);
  const generated = new Intl.DateTimeFormat('es-GT', {
    timeZone: 'America/Guatemala', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date());
  const heading = () => {
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#4f2d75').text(`FarmaCali · ${title}`);
    doc.font('Helvetica').fontSize(8.5).fillColor('#5f5968').text(
      `Período: ${query.from || 'Inicio'} a ${query.to || 'hoy'} · Sucursal: ${branch} · ${rows.length} registros · Generado: ${generated}`,
    );
    doc.moveDown(0.7);
  };
  const header = () => {
    let x = 28;
    const y = doc.y;
    doc.rect(28, y, pageWidth, 26).fill('#7050a4');
    keys.forEach((key, index) => {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff').text(
        columns[key], x + 4, y + 7, { width: widths[index] - 8, height: 16, ellipsis: true },
      );
      x += widths[index];
    });
    doc.y = y + 26;
  };
  heading();
  header();
  values.forEach((row, rowIndex) => {
    if (doc.y + 34 > 555) {
      doc.addPage();
      heading();
      header();
    }
    const y = doc.y;
    doc.rect(28, y, pageWidth, 34).fill(rowIndex % 2 ? '#f4f0f8' : '#ffffff');
    let x = 28;
    row.forEach((value, index) => {
      doc.font('Helvetica').fontSize(7.2).fillColor('#332c40').text(
        String(value ?? ''), x + 4, y + 6, { width: widths[index] - 8, height: 23, ellipsis: true },
      );
      x += widths[index];
    });
    doc.y = y + 34;
  });
  if (!values.length)
    doc.font('Helvetica').fontSize(10).fillColor('#685a77').text(
      'No hay registros para los filtros seleccionados.', 32, doc.y + 12,
    );
}
export async function report(req, res) {
  const resource = resources[req.params.name];
  if (!resource) throw new AppError('Reporte desconocido.', 404);
  if (!req.user.permissions.includes(resource[1]))
    throw new AppError('Tu rol no permite este reporte.', 403);
  if (!['xlsx', 'pdf', 'csv'].includes(req.params.format)) throw new AppError('Formato no válido.');
  for (const key of ['from', 'to'])
    if (
      req.query[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(req.query[key]) ||
        Number.isNaN(Date.parse(req.query[key])) ||
        new Date(req.query[key]).toISOString().slice(0, 10) !== req.query[key])
    )
      throw new AppError('Fecha de reporte invalida.');
  if (req.query.from && req.query.to && req.query.from > req.query.to)
    throw new AppError('El inicio no puede ser posterior al final.');
  const historical = ['cash', 'kardex', 'audit'].includes(req.params.name);
  const data = historical ? null : await model.snapshot(req.user);
  let rows = historical
    ? (await history.list(req.params.name, req.query, req.user, true)).rows
    : data[resource[0]];
  if (req.query.branch_id && req.query.branch_id !== 'all')
    rows = rows.filter((r) =>
      req.params.name === 'branches'
        ? r.id === req.query.branch_id
        : req.params.name === 'transfers'
          ? r.source_id === req.query.branch_id || r.destination_id === req.query.branch_id
          : r.branch_id === req.query.branch_id,
    );
  if (req.params.name === 'sales') rows = rows.filter((o) => o.status === 'Entregado');
  if (req.query.channel === 'mostrador' && ['sales', 'orders'].includes(req.params.name))
    rows = rows.filter((r) => r.channel === 'mostrador');
  const dateFields = {
    sales: 'created_at',
    orders: 'created_at',
    payroll: 'period',
    transfers: 'created_at',
    assets: 'acquired_on',
    requests: 'created_at',
    prescriptions: 'issued_on',
  };
  if (!historical && (req.query.from || req.query.to)) {
    const field = dateFields[req.params.name];
    if (!field) throw new AppError('Este reporte muestra el estado actual y no admite fechas.');
    const localDay = (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v)
        ? v
        : new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Guatemala',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date(v));
    rows = rows.filter((r) => {
      if (!r[field]) return false;
      if (field === 'period') {
        const m = String(r[field]).slice(0, 7);
        return (
          (!req.query.from || m >= req.query.from.slice(0, 7)) &&
          (!req.query.to || m <= req.query.to.slice(0, 7))
        );
      }
      const day = localDay(String(r[field]));
      return (!req.query.from || day >= req.query.from) && (!req.query.to || day <= req.query.to);
    });
  }
  const titles = {
    cash: 'Libro de caja',
    kardex: 'Movimientos de inventario',
    audit: 'Auditoria',
    inventory: 'Inventario actual',
    sales: 'Ventas entregadas',
    orders: 'Pedidos',
    payroll: 'Planilla',
    branches: 'Sucursales',
    transfers: 'Traslados',
    assets: 'Activos fijos',
    clients: 'Clientes',
    users: 'Usuarios',
    requests: 'Anulaciones y ajustes',
    prescriptions: 'Recetas',
  };
  let title = req.query.channel === 'mostrador' ? 'Ventas en mostrador' : titles[req.params.name];

  if (req.params.name === 'audit' && req.query.user_id) {
    const subject = (await db.query('SELECT name FROM users WHERE id=$1', [req.query.user_id]))
      .rows[0];
    title = 'Actividad de usuario: ' + (subject?.name || 'seleccionado');
  }
  const columns = {
    sales: {
      id: 'Pedido',
      customer: 'Cliente',
      nit: 'NIT',
      branch_name: 'Sucursal',
      channel: 'Canal',
      callcenter_name: 'Call center',
      courier_name: 'Repartidor',
      attended_by_name: 'Atendido por',
      attended_by_role: 'Rol',
      payment: 'Pago',
      total_cents: 'Total Q',
      created_at: 'Fecha',
    },
    orders: {
      id: 'Pedido',
      customer: 'Cliente',
      branch_name: 'Sucursal',
      channel: 'Canal',
      callcenter_name: 'Call center',
      courier_name: 'Repartidor',
      attended_by_name: 'Atendido por',
      attended_by_role: 'Rol',
      status: 'Estado',
      payment: 'Pago',
      total_cents: 'Total Q',
      eta_minutes: 'ETA min',
      created_at: 'Fecha',
    },
    inventory: {
      product_name: 'Medicamento',
      component: 'Componente',
      branch_name: 'Sucursal',
      lot: 'Lote',
      expires_on: 'Vence',
      quantity: 'Unidades',
      price_cents: 'Precio Q',
      valuation: 'Valor comercial Q',
    },
    kardex: {
      product_name: 'Medicamento',
      branch_name: 'Sucursal',
      lot: 'Lote',
      type: 'Movimiento',
      quantity: 'Unidades',
      reason: 'Motivo',
      created_at: 'Fecha',
    },
    cash: {
      branch_name: 'Sucursal',
      kind: 'Tipo',
      category: 'Categoría',
      method: 'Método',
      amount_cents: 'Monto Q',
      description: 'Concepto',
      created_at: 'Fecha',
    },
    payroll: {
      employee_name: 'Empleado',
      branch_name: 'Sucursal',
      period: 'Período',
      state: 'Estado',
      gross_cents: 'Bruto Q',
      deductions_cents: 'Deducciones Q',
      net_cents: 'Neto Q',
    },
    audit: {
      created_at: 'Fecha',
      branch_name: 'Sucursal',
      user_name: 'Usuario',
      role_code: 'Rol',
      action: 'Acción',
      entity: 'Entidad',
      entity_id: 'Referencia',
      ip: 'Origen / IP',
    },
    branches: {
      name: 'Sucursal',
      department: 'Departamento',
      address: 'Dirección',
      type: 'Tipo',
      state: 'Estado',
      opens_at: 'Apertura',
      closes_at: 'Cierre',
    },
    transfers: {
      product_name: 'Medicamento',
      source_name: 'Origen',
      destination_name: 'Destino',
      lot: 'Lote',
      quantity: 'Despachado',
      received_quantity: 'Recibido',
      status: 'Estado',
      difference_reason: 'Diferencia',
      created_at: 'Fecha',
    },
    assets: {
      name: 'Activo',
      branch_name: 'Sucursal',
      code: 'Código',
      value_cents: 'Valor Q',
      status: 'Estado',
      acquired_on: 'Adquisición',
      useful_life_months: 'Vida útil',
    },
    clients: {
      name: 'Cliente',
      nit: 'NIT',
      phone: 'Teléfono',
      address: 'Dirección',
      state: 'Estado',
    },
    users: {
      name: 'Usuario',
      email: 'Correo',
      role_name: 'Rol',
      branch_name: 'Sucursal',
      state: 'Estado',
      totp_enabled: '2FA',
    },
    requests: {
      type: 'Tipo',
      requester_name: 'Solicitante',
      approver_name: 'Aprobador',
      reason: 'Motivo',
      status: 'Estado',
      created_at: 'Fecha',
    },
    prescriptions: {
      customer_name: 'Paciente',
      doctor: 'Médico',
      license: 'Colegiado',
      product_name: 'Medicamento',
      issued_on: 'Emisión',
    },
  }[req.params.name];
  const keys = Object.keys(columns);
  const values = rows.map((row) =>
    keys.map((k) =>
      k === 'valuation'
        ? (row.quantity * row.price_cents) / 100
        : k.endsWith('_cents')
          ? row[k] / 100
          : k === 'created_at' && row[k]
            ? new Intl.DateTimeFormat('es-GT', {
                timeZone: 'America/Guatemala',
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(new Date(row[k]))
            : (row[k] ?? ''),
    ),
  );
  await db.transaction((q) =>
    writeAudit(q, req.user, 'EXPORTAR', 'reporte', req.params.name, {
      format: req.params.format,
      rows: rows.length,
      from: req.query.from || null,
      to: req.query.to || null,
      branch: req.query.branch_id || 'all',
      search_applied: Boolean(req.query.search),
    }),
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="farmacali-${req.params.name}.${req.params.format}"`,
  );
  if (req.params.format === 'xlsx') {
    const selectedBranch = req.user.scope === 'branch' ? req.user.branch_id : req.query.branch_id;
    const branchName =
      selectedBranch && selectedBranch !== 'all'
        ? rows.find((r) => r.branch_name)?.branch_name ||
          (await db.query('SELECT name FROM branches WHERE id=$1', [selectedBranch])).rows[0]
            ?.name ||
          selectedBranch
        : 'Todas las sucursales';
    const workbook = reportWorkbook({
      title,
      columns,
      keys,
      values,
      from: req.query.from,
      to: req.query.to,
      branch: branchName,
      search: req.query.search,
      author: req.user.name || 'Personal autorizado',
      cashTotals:
        req.params.name === 'cash'
          ? {
              income: rows
                .filter((r) => r.kind === 'Ingreso')
                .reduce((s, r) => s + Number(r.amount_cents) / 100, 0),
              expense: rows
                .filter((r) => r.kind === 'Egreso')
                .reduce((s, r) => s + Number(r.amount_cents) / 100, 0),
            }
          : null,
    });
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await workbook.xlsx.write(res);
    res.end();
  } else if (req.params.format === 'pdf') {
    res.type('application/pdf');
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 28,
      info: { Title: `FarmaCali · ${req.params.name}`, Author: 'FarmaCali' },
    });
    doc.pipe(res);
    renderPdfTable(doc, {
      title,
      columns,
      keys,
      values,
      rows,
      query: req.query,
      branch:
        req.user.scope === 'branch'
          ? req.user.branch_name
          : rows.find((row) => row.branch_name)?.branch_name ||
            (req.query.branch_id && req.query.branch_id !== 'all'
              ? req.query.branch_id
              : 'Todas las sucursales'),
    });
    doc.end();
    return;
  } else {
    res.type('text/csv');
    const cell = (v) =>
      `"${String(v)
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""')}"`;
    res.send(
      '\ufeff' +
        [
          keys.map((k) => cell(columns[k])).join(','),
          ...values.map((v) => v.map(cell).join(',')),
        ].join('\r\n'),
    );
  }
}
