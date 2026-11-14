import { permissionLabels } from './permissions.js';

export const rolePolicy = {
  admin: [
    'resumen.ver',
    'sucursal.ver',
    'sucursal.gestionar',
    'usuario.ver',
    'usuario.gestionar',
    'planilla.ver',
    'planilla.pagar',
    'auditoria.ver',
    'auditoria.exportar',
  ],
  branch: [
    'resumen.ver',
    'sucursal.ver',
    'inventario.ver',
    'inventario.ajustar',
    'producto.gestionar',
    'traslado.ver',
    'traslado.crear',
    'traslado.recibir',
    'caja.ver',
    'caja.gestionar',
    'venta.ver',
    'activo.ver',
    'planilla.ver',
    'planilla.pagar',
    'pedido.ver',
    'solicitud.ver',
    'kardex.ver',
    'receta.ver',
    'abastecimiento.ver',
    'abastecimiento.gestionar',
    'entrega.ver',
    'mensajes.ver',
    'riesgo.ver',
    'auditoria.ver',
  ],
  callcenter: [
    'resumen.ver',
    'sucursal.ver',
    'inventario.ver',
    'pedido.ver',
    'pedido.gestionar',
    'venta.crear',
    'venta.ver',
    'receta.ver',
    'receta.gestionar',
    'entrega.ver',
    'entrega.gestionar',
    'mensajes.ver',
  ],
  auditor: [
    'resumen.ver',
    'sucursal.ver',
    'inventario.ver',
    'traslado.ver',
    'caja.ver',
    'venta.ver',
    'activo.ver',
    'planilla.ver',
    'pedido.ver',
    'usuario.ver',
    'auditoria.ver',
    'auditoria.exportar',
    'auditoria.verificar',
    'solicitud.ver',
    'kardex.ver',
    'receta.ver',
    'riesgo.ver',
    'abastecimiento.ver',
    'entrega.ver',
    'mensajes.ver',
  ],
};
export async function upgradeRolePolicy(database) {
  if (!(await database.query('SELECT version FROM schema_migrations WHERE version=8')).rows.length) {
    await database.transaction(async (q) => {
      await q(
        "INSERT INTO permissions VALUES ('venta.ver','Consultar reportes de ventas') ON CONFLICT(code) DO NOTHING",
      );
      await q(
        "INSERT INTO permissions VALUES ('producto.gestionar','Gestionar catálogo de medicamentos') ON CONFLICT(code) DO NOTHING",
      );
      await q(
        "INSERT INTO permissions VALUES ('activo.reportar','Reportar fallas de activos') ON CONFLICT(code) DO NOTHING",
      );
      await q(
        "CREATE TABLE IF NOT EXISTS asset_incidents (id TEXT PRIMARY KEY,asset_id TEXT NOT NULL REFERENCES assets(id),branch_id TEXT NOT NULL REFERENCES branches(id),description TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Reportada',resolution TEXT,created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),resolved_at TEXT,resolved_by TEXT REFERENCES users(id))",
      );
      for (const [role, permissions] of Object.entries(rolePolicy)) {
        const row = (await q('SELECT id FROM roles WHERE code=$1', [role])).rows[0];
        if (!row) continue;
        await q('DELETE FROM role_permissions WHERE role_id=$1', [row.id]);
        for (const permission of permissions)
          await q('INSERT INTO role_permissions VALUES ($1,$2)', [row.id, permission]);
      }
      await q("UPDATE roles SET name='Gerente de sucursal' WHERE code='branch'");
      await q("UPDATE roles SET require_totp=1 WHERE code IN ('admin','auditor')");
      await q(
        "UPDATE sessions SET revoked=1 WHERE user_id IN (SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code IN ('admin','branch','callcenter','auditor'))",
      );
      await q('INSERT INTO schema_migrations VALUES ($1,$2)', [8, new Date().toISOString()]);
    });
  }
  await upgradeBranchManagerAccess(database);
  await upgradeBranchManagerRestrictions(database);
}

async function upgradeBranchManagerAccess(database) {
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=9')).rows.length)
    return;
  const permissions = [
    'inventario.ver',
    'inventario.ingresar',
    'producto.gestionar',
    'abastecimiento.ver',
    'abastecimiento.gestionar',
    'venta.ver',
    'venta.crear',
  ];
  await database.transaction(async (q) => {
    for (const permission of permissions) {
      await q(
        'INSERT INTO permissions (code,description) VALUES ($1,$2) ON CONFLICT(code) DO NOTHING',
        [permission, permissionLabels[permission]],
      );
      await q('UPDATE permissions SET description=$2 WHERE code=$1', [
        permission,
        permissionLabels[permission],
      ]);
      await q(
        'INSERT INTO role_permissions (role_id,permission_code) SELECT id,$1 FROM roles WHERE code=$2 ON CONFLICT(role_id,permission_code) DO NOTHING',
        [permission, 'branch'],
      );
    }
    await q("UPDATE roles SET name='Gerente de sucursal' WHERE code='branch'");
    await q('INSERT INTO schema_migrations VALUES ($1,$2)', [9, new Date().toISOString()]);
  });
}

async function upgradeBranchManagerRestrictions(database) {
  if ((await database.query('SELECT version FROM schema_migrations WHERE version=10')).rows.length)
    return;
  const revokedPermissions = [
    'inventario.ingresar',
    'pedido.gestionar',
    'entrega.gestionar',
    'venta.crear',
    'venta.anular.solicitar',
    'venta.anular.aprobar',
    'activo.gestionar',
    'activo.reportar',
    'receta.gestionar',
  ];
  await database.transaction(async (q) => {
    for (const permission of ['auditoria.ver', 'planilla.pagar']) {
      await q(
        'INSERT INTO permissions (code,description) VALUES ($1,$2) ON CONFLICT(code) DO NOTHING',
        [permission, permissionLabels[permission]],
      );
      await q(
        'INSERT INTO role_permissions (role_id,permission_code) SELECT id,$1 FROM roles WHERE code=$2 ON CONFLICT(role_id,permission_code) DO NOTHING',
        [permission, 'branch'],
      );
    }
    for (const permission of revokedPermissions)
      await q(
        'DELETE FROM role_permissions WHERE role_id=(SELECT id FROM roles WHERE code=$1) AND permission_code=$2',
        ['branch', permission],
      );
    await q(
      "UPDATE sessions SET revoked=1 WHERE user_id IN (SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='branch')",
    );
    await q("UPDATE roles SET name='Gerente de sucursal' WHERE code='branch'");
    await q('INSERT INTO schema_migrations VALUES ($1,$2)', [10, new Date().toISOString()]);
  });
}
