export async function addInventoryCost(
  q,
  inventoryId,
  oldQuantity,
  incomingQuantity,
  unitCost,
  known = true,
) {
  const prior = (await q('SELECT * FROM inventory_costs WHERE inventory_id=$1', [inventoryId]))
    .rows[0];
  const valid = known && (oldQuantity === 0 || prior?.known === 1);
  const cost = valid
    ? Math.round(
        (oldQuantity * (prior?.unit_cost_cents || 0) + incomingQuantity * unitCost) /
          (oldQuantity + incomingQuantity),
      )
    : 0;
  await q(
    'INSERT INTO inventory_costs (inventory_id,unit_cost_cents,known) VALUES ($1,$2,$3) ON CONFLICT(inventory_id) DO UPDATE SET unit_cost_cents=$2,known=$3',
    [inventoryId, cost, valid ? 1 : 0],
  );
}
export async function recordOrderCost(q, itemId, inventoryId) {
  const c = (await q('SELECT * FROM inventory_costs WHERE inventory_id=$1', [inventoryId])).rows[0];
  await q('INSERT INTO order_item_costs VALUES ($1,$2,$3)', [
    itemId,
    c?.unit_cost_cents || 0,
    c?.known || 0,
  ]);
}
