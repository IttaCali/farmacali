import React from 'react';
import { Users, ShieldCheck, Building2, Briefcase } from 'lucide-react';
import { Stat, Panel, Table } from './ui';
import { datetime } from '../lib/api';
export default function SystemDashboard({ data, onNavigate }) {
  return (
    <>
      <div className="stats-grid">
        <Stat
          label="Usuarios del sistema"
          value={data.users.length}
          detail="Cuentas y accesos del personal"
          icon={Users}
        />
        <Stat
          label="Seguridad MFA"
          value={data.users.filter((u) => u.totp_enabled).length}
          detail="Cuentas con autenticador configurado"
          icon={ShieldCheck}
          tone="violet"
        />
        <Stat
          label="Sucursales"
          value={data.branches.length}
          detail="Configuración de la red"
          icon={Building2}
          tone="blue"
        />
        <Stat
          label="Personal"
          value={data.employees.length}
          detail="Colaboradores registrados"
          icon={Briefcase}
          tone="orange"
        />
      </div>
      <div className="system-shortcuts">
        {[
          ['users', 'Usuarios, roles y seguridad'],
          ['branches', 'Configurar sucursales'],
          ['payroll', 'Personal y planilla'],
          ['audit', 'Historial de actividad'],
        ].map(([key, label]) => (
          <button key={key} className="secondary-button" onClick={() => onNavigate(key)}>
            {label}
          </button>
        ))}
      </div>
      <Panel
        title="Actividad reciente del sistema"
        subtitle="Consulta el historial completo para filtrar por fechas y exportar."
      >
        <Table
          rows={data.audit.slice(0, 20)}
          columns={[
            { label: 'Fecha', render: (r) => datetime(r.created_at) },
            { label: 'Usuario', key: 'user_name' },
            { label: 'Acción', key: 'action' },
            { label: 'Entidad', key: 'entity' },
            { label: 'Referencia', key: 'entity_id' },
          ]}
        />
      </Panel>
    </>
  );
}
