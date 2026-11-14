import React, { useState } from 'react';
import { Pill } from 'lucide-react';
import { Table, Panel, Modal, Badge } from './ui';
import HistoricalTable from './HistoricalTable';
import { money, count, day } from '../lib/api';

export default function InventorySummary({ inventory, date, branch, user, onAdjust }) {
  const [selected, setSelected] = useState(null),
    [lotId, setLotId] = useState('');
  const grouped = [
    ...inventory
      .reduce((map, lot) => {
        if (!map.has(lot.product_id))
          map.set(lot.product_id, {
            ...lot,
            id: lot.product_id,
            quantity: 0,
            expired: 0,
            lots: 0,
            branches: new Set(),
          });
        const product = map.get(lot.product_id);
        if (lot.expires_on > date) product.quantity += Number(lot.quantity);
        else product.expired += Number(lot.quantity);
        product.lots++;
        product.branches.add(lot.branch_name);
        return map;
      }, new Map())
      .values(),
  ].sort((a, b) => a.product_name.localeCompare(b.product_name, 'es'));
  const lots = inventory
    .filter((i) => i.product_id === selected)
    .sort(
      (a, b) =>
        a.expires_on.localeCompare(b.expires_on) || a.branch_name.localeCompare(b.branch_name),
    );
  const product = grouped.find((p) => p.id === selected);
  return (
    <>
      <Panel
        title="Inventario por medicamento"
        subtitle="Un registro por medicamento. Consulta sus lotes para ver sucursales, vencimientos y trazabilidad."
      >
        <Table
          searchPlaceholder="Buscar por nombre o componente..."
          rows={grouped}
          columns={[
            {
              label: 'Medicamento',
              render: (r) => (
                <div className="cell-title">
                  <span className="product-icon">
                    <Pill size={18} />
                  </span>
                  <div>
                    <strong>{r.product_name}</strong>
                    <small>
                      {r.sku}
                      {r.prescription ? ' · Requiere receta' : ''}
                    </small>
                  </div>
                </div>
              ),
            },
            { label: 'Componente', render: (r) => r.component || 'Sin registrar' },
            { label: 'Precio', render: (r) => money(r.price_cents) },
            {
              label: 'Cantidad vigente',
              render: (r) => (
                <div>
                  <strong>{count(r.quantity)} unidades</strong>
                  {r.expired > 0 && (
                    <small className="muted">{count(r.expired)} vencidas, excluidas</small>
                  )}
                </div>
              ),
            },
            {
              label: 'Ubicación',
              render: (r) =>
                r.branches.size === 1 ? [...r.branches][0] : `${r.branches.size} sucursales`,
            },
            {
              label: 'Detalle',
              render: (r) => (
                <button
                  className="table-button"
                  onClick={() => {
                    setSelected(r.id);
                    setLotId('');
                  }}
                >
                  Ver lotes y movimientos
                </button>
              ),
            },
          ]}
        />
      </Panel>
      {product && (
        <Modal
          title={`Lotes de ${product.product_name}`}
          subtitle={`${product.sku} · ${count(product.quantity)} unidades vigentes · ${product.lots} registros de lote`}
          onClose={() => setSelected(null)}
          className="inventory-lots-modal"
        >
          <p>
            Las ventas mantienen FEFO: se utiliza primero el lote vigente que vence antes. Los
            vencidos se conservan para control y auditoría.
          </p>
          <Table
            rows={lots}
            columns={[
              { label: 'Sucursal', key: 'branch_name' },
              { label: 'Lote', render: (r) => <code>{r.lot}</code> },
              {
                label: 'Primer ingreso registrado',
                render: (r) =>
                  r.first_received_at
                    ? new Intl.DateTimeFormat('es-GT', {
                        timeZone: 'America/Guatemala',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(r.first_received_at))
                    : 'Sin fecha histórica registrada',
              },
              { label: 'Vencimiento', render: (r) => day(r.expires_on) },
              {
                label: 'Cantidad / mínimo',
                render: (r) => `${count(r.quantity)} / ${count(r.minimum)}`,
              },
              {
                label: 'Estado',
                render: (r) => (
                  <Badge
                    tone={
                      r.expires_on <= date ? 'red' : r.quantity < r.minimum ? 'orange' : 'green'
                    }
                  >
                    {r.expires_on <= date
                      ? 'Vencido'
                      : r.quantity < r.minimum
                        ? 'Stock bajo'
                        : 'Vigente'}
                  </Badge>
                ),
              },
              ...(user.permissions.includes('inventario.ajustar')
                ? [
                    {
                      label: 'Acción',
                      render: (r) => (
                        <button
                          className="table-button"
                          onClick={() => {
                            setSelected(null);
                            onAdjust(r);
                          }}
                        >
                          Solicitar ajuste
                        </button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
          {user.permissions.includes('kardex.ver') && (
            <div className="inventory-lot-history">
              <label>
                Movimientos del lote
                <select
                  aria-label="Movimientos del lote"
                  value={lotId}
                  onChange={(e) => setLotId(e.target.value)}
                >
                  <option value="">Todos los lotes de este medicamento</option>
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.branch_name} · {l.lot}
                    </option>
                  ))}
                </select>
              </label>
              <HistoricalTable
                key={`${selected}-${lotId}`}
                kind="kardex"
                branch={branch}
                productId={selected}
                inventoryId={lotId}
              />
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
