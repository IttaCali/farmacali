import { randomUUID } from 'node:crypto';
import { db } from '../database/db.js';
import { AppError } from './pharmacy.js';
import { decrypt, encrypt } from '../security/crypto.js';
import { writeAudit } from './audit.js';
import { text, num, permit, scope } from './domain.js';
const period = (value) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value || ''))
    throw new AppError('Período inválido (AAAA-MM).');
  return value;
};
const money = (v, label) => Math.round(num(v ?? 0, label, 0, 1000000) * 100);
export function calculatePayroll(salary, input, rules) {
  const days = Number(input?.days ?? 30),
    base = Math.round((salary * days) / 30),
    bonus = Number(input?.bonus_cents || 0),
    overtime = Number(input?.overtime_cents || 0),
    igssBase = base + overtime;
  const igss = input?.social_security
    ? Math.round((igssBase * rules.employee_igss_percent) / 100)
    : 0;
  const employer = input?.social_security
    ? Math.round((igssBase * rules.employer_igss_percent) / 100)
    : 0;
  const isr = Number(input?.isr_cents || 0),
    other = Number(input?.other_cents || 0),
    gross = base + bonus + overtime,
    deductions = igss + isr + other;
  return {
    days,
    base,
    bonus,
    overtime,
    gross,
    igss_base: igssBase,
    igss,
    isr,
    other,
    other_reason: input?.other_reason || '',
    deductions,
    net: gross - deductions,
    employer_igss: employer,
    irtra: Math.round((igssBase * rules.irtra_percent) / 100),
    intecap: Math.round((igssBase * rules.intecap_percent) / 100),
    aguinaldo_provision: Math.round(base / rules.aguinaldo_months),
    bono14_provision: Math.round(base / rules.bono14_months),
    vacation_provision: Math.round((base * rules.vacation_days_year) / 360),
    rules,
  };
}
export class PayrollEngine {
  constructor(database = db) {
    this.db = database;
  }
  async rules() {
    return JSON.parse(
      (await this.db.query("SELECT settings FROM payroll_rules WHERE id='main'")).rows[0].settings,
    );
  }
  async saveRules(data, user) {
    permit(user, 'planilla.pagar');
    const rules = { enabled: data.enabled === true };
    for (const key of [
      'employee_igss_percent',
      'employer_igss_percent',
      'irtra_percent',
      'intecap_percent',
    ])
      rules[key] = num(data[key], key, 0, 100);
    for (const key of ['aguinaldo_months', 'bono14_months'])
      rules[key] = num(data[key], key, 1, 24, true);
    rules.vacation_days_year = num(
      data.vacation_days_year,
      'Días de provisión de vacaciones',
      0,
      60,
    );
    await this.db.transaction(async (q) => {
      await q("UPDATE payroll_rules SET settings=$1,updated_at=$2,updated_by=$3 WHERE id='main'", [
        JSON.stringify(rules),
        new Date().toISOString(),
        user.id,
      ]);
      await writeAudit(q, user, 'CONFIGURAR', 'planilla', 'main', rules);
    });
    return rules;
  }
  async input(data, user) {
    permit(user, 'planilla.pagar');
    const p = period(data.period);
    return this.db.transaction(async (q) => {
      const employee = (
        await q('SELECT * FROM employees WHERE id=$1 AND active=1', [data.employee_id])
      ).rows[0];
      if (!employee) throw new AppError('Empleado inactivo o inexistente.');
      scope(user, employee.branch_id);
      if (
        (
          await q("SELECT id FROM payroll WHERE employee_id=$1 AND period=$2 AND state='Pagado'", [
            data.employee_id,
            p,
          ])
        ).rows.length
      )
        throw new AppError('La planilla de ese empleado ya fue pagada.', 409);
      const days = num(data.days, 'Días trabajados', 0, 30, true),
        bonus = money(data.bonus, 'Bonificación'),
        overtime = money(data.overtime, 'Horas extra'),
        isr = money(data.isr, 'ISR'),
        other = money(data.other, 'Otras deducciones'),
        reason = other ? text(data.other_reason, 'Motivo de deducción', 250) : '';
      await q(
        'INSERT INTO payroll_inputs (employee_id,period,days,bonus_cents,overtime_cents,isr_cents,other_cents,other_reason,social_security) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(employee_id,period) DO UPDATE SET days=$3,bonus_cents=$4,overtime_cents=$5,isr_cents=$6,other_cents=$7,other_reason=$8,social_security=$9',
        [
          data.employee_id,
          p,
          days,
          bonus,
          overtime,
          isr,
          other,
          reason,
          data.social_security === true ? 1 : 0,
        ],
      );
      await writeAudit(q, user, 'NOVEDADES', 'planilla', data.employee_id, { period: p, days });
      return { period: p };
    });
  }
  async preview(p, user) {
    permit(user, 'planilla.ver');
    period(p);
    const rules = await this.rules();
    return this.db.transaction(async (q) => {
      const employees = (await q('SELECT * FROM employees WHERE active=1 ORDER BY name')).rows;
      const inputs = (await q('SELECT * FROM payroll_inputs WHERE period=$1', [p])).rows;
      const pays = (
        await q(
          'SELECT p.*,d.breakdown_cipher FROM payroll p LEFT JOIN payroll_details d ON d.payroll_id=p.id WHERE p.period=$1',
          [p],
        )
      ).rows;
      return {
        period: p,
        rules,
        benefits: (
          await q(
            'SELECT p.*,e.name AS employee_name,e.branch_id FROM payroll_benefits p JOIN employees e ON e.id=p.employee_id WHERE p.period=$1 ORDER BY p.created_at DESC',
            [p],
          )
        ).rows.filter((r) => user.scope !== 'branch' || r.branch_id === user.branch_id),
        lines: employees
          .filter((e) => user.scope !== 'branch' || e.branch_id === user.branch_id)
          .map((e) => {
            const existing = pays.find((r) => r.employee_id === e.id && r.state === 'Pagado');
            return {
              employee_id: e.id,
              name: e.name,
              branch_id: e.branch_id,
              input: inputs.find((i) => i.employee_id === e.id) || { days: 30 },
              paid: Boolean(existing),
              payroll_id: existing?.id,
              breakdown:
                existing && !existing.breakdown_cipher
                  ? {
                      legacy: true,
                      gross: existing.gross_cents,
                      deductions: existing.deductions_cents,
                      net: existing.net_cents,
                    }
                  : existing?.breakdown_cipher
                    ? JSON.parse(decrypt(existing.breakdown_cipher))
                    : calculatePayroll(
                        Number(e.salary_cipher ? decrypt(e.salary_cipher) : e.salary_cents),
                        inputs.find((i) => i.employee_id === e.id),
                        rules,
                      ),
            };
          }),
      };
    });
  }
  async pay(data, user) {
    permit(user, 'planilla.pagar');
    const p = period(data.period);
    return this.db.transaction(async (q) => {
      const rules = JSON.parse(
        (await q("SELECT settings FROM payroll_rules WHERE id='main'")).rows[0].settings,
      );
      if (!rules.enabled)
        throw new AppError(
          'Activa y revisa los parámetros de la planilla detallada antes de pagar.',
        );
      const employees = (
        await q('SELECT * FROM employees WHERE active=1' + (this.db.cloud ? ' FOR UPDATE' : ''))
      ).rows;
      let total = 0,
        count = 0;
      for (const e of employees) {
        if (user.scope === 'branch' && e.branch_id !== user.branch_id) continue;
        if (
          (
            await q(
              "SELECT id FROM payroll WHERE employee_id=$1 AND period=$2 AND state='Pagado'",
              [e.id, p],
            )
          ).rows.length
        )
          continue;
        const input = (
          await q('SELECT * FROM payroll_inputs WHERE employee_id=$1 AND period=$2', [e.id, p])
        ).rows[0];
        const breakdown = calculatePayroll(
          Number(e.salary_cipher ? decrypt(e.salary_cipher) : e.salary_cents),
          input,
          rules,
        );
        if (breakdown.gross === 0) continue;
        if (breakdown.net <= 0)
          throw new AppError('Las deducciones superan el salario neto de ' + e.name + '.');
        const id = randomUUID(),
          now = new Date().toISOString();
        await q(
          'INSERT INTO payroll (id,employee_id,period,gross_cents,deductions_cents,net_cents,created_at,branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [id, e.id, p, breakdown.gross, breakdown.deductions, breakdown.net, now, e.branch_id],
        );
        await q('INSERT INTO payroll_details VALUES ($1,$2)', [
          id,
          encrypt(JSON.stringify(breakdown)),
        ]);
        await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
          randomUUID(),
          e.branch_id,
          'Egreso',
          'Planilla',
          breakdown.net,
          'Transferencia',
          `Planilla ${p} · ${e.name}`,
          now,
          user.id,
        ]);
        total += breakdown.net;
        count++;
      }
      if (!count)
        throw new AppError('La planilla ya está pagada o no hay importes pendientes.', 409);
      await writeAudit(q, user, 'PAGAR_DETALLADA', 'planilla', p, {
        employees: count,
        total_cents: total,
      });
      return { count, total_cents: total };
    });
  }
  async benefit(data, user) {
    permit(user, 'planilla.pagar');
    const p = period(data.period);
    if (
      !['Aguinaldo', 'Bono 14', 'Vacaciones', 'Indemnización', 'Pago de aportes'].includes(
        data.kind,
      )
    )
      throw new AppError('Prestación inválida.');
    const amount = money(data.amount, 'Prestación');
    if (!amount) throw new AppError('La prestación debe ser mayor que cero.');
    return this.db.transaction(async (q) => {
      const e = (await q('SELECT * FROM employees WHERE id=$1', [data.employee_id])).rows[0];
      if (!e) throw new AppError('Empleado no encontrado.');
      scope(user, e.branch_id);
      if (
        (
          await q(
            'SELECT id FROM payroll_benefits WHERE employee_id=$1 AND kind=$2 AND period=$3',
            [e.id, data.kind, p],
          )
        ).rows.length
      )
        throw new AppError('Esta prestación ya fue registrada para el empleado y período.', 409);
      const id = randomUUID(),
        reason = text(data.reason, 'Justificación del cálculo', 500),
        now = new Date().toISOString();
      await q('INSERT INTO payroll_benefits VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
        id,
        e.id,
        data.kind,
        p,
        amount,
        reason,
        now,
        user.id,
      ]);
      await q('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
        randomUUID(),
        e.branch_id,
        'Egreso',
        data.kind,
        amount,
        'Transferencia',
        data.kind + ' ' + p + ' · ' + e.name,
        now,
        user.id,
      ]);
      await writeAudit(q, user, 'PAGAR_PRESTACION', 'planilla', id, {
        employee_id: e.id,
        period: p,
        kind: data.kind,
        amount_cents: amount,
      });
      return { id };
    });
  }
}
export const payrollEngine = new PayrollEngine();
