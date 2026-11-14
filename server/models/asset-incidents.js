import { randomUUID } from 'node:crypto';
import { db } from '../database/db.js';
import { AppError } from './pharmacy.js';
import { writeAudit } from './audit.js';
export async function assetIncidents(user, input, database = db) {
  if (!user.permissions.includes(input ? 'activo.reportar' : 'activo.ver'))
    throw new AppError('No tienes permiso para esta operación.', 403);
  if (!input)
    return (
      await database.query(
        'SELECT i.*,a.name AS asset_name,b.name AS branch_name,u.name AS reporter FROM asset_incidents i JOIN assets a ON a.id=i.asset_id JOIN branches b ON b.id=i.branch_id JOIN users u ON u.id=i.created_by' +
          (user.scope === 'branch' ? ' WHERE i.branch_id=$1' : '') +
          ' ORDER BY i.created_at DESC',
        user.scope === 'branch' ? [user.branch_id] : [],
      )
    ).rows;
  return database.transaction(async (q) => {
    const asset = (await q('SELECT * FROM assets WHERE id=$1', [input.asset_id])).rows[0];
    if (!asset || (user.scope === 'branch' && asset.branch_id !== user.branch_id))
      throw new AppError('Activo no disponible para tu sucursal.', 403);
    const description = String(input.description || '').trim();
    if (description.length < 5 || description.length > 1000)
      throw new AppError('Describe la falla (5 a 1000 caracteres).');
    const id = randomUUID();
    await q(
      'INSERT INTO asset_incidents(id,asset_id,branch_id,description,created_at,created_by) VALUES($1,$2,$3,$4,$5,$6)',
      [id, asset.id, asset.branch_id, description, new Date().toISOString(), user.id],
    );
    await writeAudit(q, user, 'REPORTAR_FALLA', 'activo', asset.id, {
      incident: id,
      branch_id: asset.branch_id,
      description,
    });
    return { id };
  });
}
export async function resolveIncident(user, id, resolution, database = db) {
  if (!user.permissions.includes('activo.gestionar'))
    throw new AppError('No tienes permiso para resolver fallas.', 403);
  const note = String(resolution || '').trim();
  if (note.length < 5 || note.length > 1000)
    throw new AppError('Describe la solución (5 a 1000 caracteres).');
  return database.transaction(async (q) => {
    const row = (await q('SELECT * FROM asset_incidents WHERE id=$1', [id])).rows[0];
    if (!row || (user.scope === 'branch' && row.branch_id !== user.branch_id))
      throw new AppError('Reporte no disponible.', 403);
    if (row.status === 'Resuelta') throw new AppError('La falla ya fue resuelta.', 409);
    await q(
      "UPDATE asset_incidents SET status='Resuelta',resolution=$1,resolved_at=$2,resolved_by=$3 WHERE id=$4",
      [note, new Date().toISOString(), user.id, id],
    );
    await writeAudit(q, user, 'RESOLVER_FALLA', 'activo', row.asset_id, {
      incident: id,
      branch_id: row.branch_id,
      resolution: note,
    });
    return { id };
  });
}
