import { randomUUID } from 'node:crypto';
import { sha256 } from '../security/crypto.js';
export const auditDigest = (row) =>
  sha256(
    JSON.stringify([
      row.sequence,
      row.previous_hash,
      row.user_id,
      row.role_code,
      row.branch_id,
      row.action,
      row.entity,
      row.entity_id,
      row.before_value,
      row.after_value,
      row.ip,
      row.created_at,
      row.details,
    ]),
  );
export async function writeAudit(
  q,
  user,
  action,
  entity,
  entityId,
  details = {},
  before = null,
  after = details,
) {
  const head = (await q("SELECT * FROM audit_head WHERE id='main'")).rows[0];
  const row = {
    id: randomUUID(),
    sequence: head.sequence + 1,
    previous_hash: head.last_hash,
    user_id: user?.id || 'u-system',
    role_code: user?.role || 'system',
    branch_id: user?.branch_id || details.branch_id || null,
    action,
    entity,
    entity_id: String(entityId),
    before_value: JSON.stringify(before),
    after_value: JSON.stringify(after),
    ip: user?.ip || 'local',
    created_at: new Date().toISOString(),
    details: JSON.stringify(details),
  };
  row.current_hash = auditDigest(row);
  await q(
    'INSERT INTO audit_log (id,user_id,action,entity,entity_id,details,created_at,sequence,previous_hash,current_hash,role_code,branch_id,before_value,after_value,ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
    [
      row.id,
      row.user_id,
      row.action,
      row.entity,
      row.entity_id,
      row.details,
      row.created_at,
      row.sequence,
      row.previous_hash,
      row.current_hash,
      row.role_code,
      row.branch_id,
      row.before_value,
      row.after_value,
      row.ip,
    ],
  );
  const updated = await q(
    "UPDATE audit_head SET sequence=$1,last_hash=$2 WHERE id='main' AND sequence=$3",
    [row.sequence, row.current_hash, head.sequence],
  );
  if (!updated.rowCount)
    throw Object.assign(new Error('Conflicto de secuencia en auditoría'), { status: 409 });
  return row;
}
export function verifyRecords(records, head) {
  let previous = '0'.repeat(64),
    sequence = 0;
  for (const row of records) {
    sequence++;
    if (
      row.sequence !== sequence ||
      row.previous_hash !== previous ||
      row.current_hash !== auditDigest(row)
    )
      return {
        valid: false,
        checked: sequence,
        record_id: row.id,
        sequence,
        reason: 'La secuencia o el hash no coincide.',
      };
    previous = row.current_hash;
  }
  if (head && (head.sequence !== sequence || head.last_hash !== previous))
    return {
      valid: false,
      checked: sequence,
      reason: 'El ancla de auditoría no coincide; puede faltar un registro.',
    };
  return { valid: true, checked: sequence, head_hash: previous };
}
