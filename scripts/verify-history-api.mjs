import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { Database, db } from '../server/database/db.js';
import { writeAudit } from '../server/models/audit.js';
import { startQa, Client } from './qa-server.mjs';
import { totpFor } from '../server/models/authentication.js';
const qa = await startQa(),
  results = [];
const fixture = new Database('', qa.file),
  q = fixture.query.bind(fixture);
try {
  await fixture.transaction(async (tx) => {
    const stock = (
      await tx("SELECT * FROM inventory WHERE branch_id='b1' AND product_id='p1' LIMIT 1")
    ).rows[0];
    for (let n = 0; n < 1051; n++) {
      await tx('INSERT INTO cash_movements VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
        'histqa-' + n,
        'b1',
        'Ingreso',
        'Prueba QA',
        100,
        'Efectivo',
        'Histórico QA ' + n,
        '2025-01-01T07:00:00.000Z',
        'u-admin',
      ]);
      await tx('INSERT INTO stock_ledger VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
        'histqa-' + n,
        'b1',
        'p1',
        stock.id,
        1,
        'PRUEBA_QA',
        'QA-' + n,
        'Histórico QA',
        '2025-01-01T07:00:00.000Z',
        'u-admin',
      ]);
    }
    for (let n = 0; n < 551; n++)
      await writeAudit(
        tx,
        { id: 'u-admin', role: 'admin', branch_id: 'b1' },
        'HISTORICO_QA',
        'prueba',
        n,
        { reason: 'Prueba histórica' },
      );
  });
  const auditor = new Client(qa.base);
  let r = await auditor.request('/auth/login', {
    email: 'auditor@farmacia.gt',
    password: 'Auditor2026!',
  });
  r = await auditor.request('/auth/complete', {
    challenge: r.data.challenge,
    code: totpFor(r.data.secret).generate(),
  });
  assert.equal(r.status, 200);
  for (const kind of ['cash', 'kardex', 'audit']) {
    const filter = new URLSearchParams(
      kind === 'audit' ? { search: 'HISTORICO_QA' } : { from: '2025-01-01', to: '2025-01-01' },
    ).toString();
    const expected = kind === 'audit' ? 551 : 1051;
    const list = await auditor.request(`/history/${kind}?${filter}&page_size=50`);
    assert.equal(list.status, 200);
    assert.equal(list.data.total, expected);
    assert.equal(list.data.rows.length, 50);
    if (kind === 'cash') assert.equal(list.data.totals.balance, 105100);
    for (const format of ['csv', 'xlsx']) {
      const response = await fetch(`${qa.base}/api/reports/${kind}/${format}?${filter}`, {
        headers: { Cookie: [...auditor.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      });
      assert.equal(response.status, 200);
      if (format === 'csv')
        assert.equal((await response.text()).trim().split(/\r?\n/).length, expected + 1);
      else {
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
        assert.equal(
          Number(String(book.worksheets[0].autoFilter).match(/:(?:[A-Z]+)(\d+)$/)[1]) - 6,
          expected,
        );
        assert.equal(book.worksheets[0].getRow(6).getCell(1).font.bold, true);
        assert.equal(book.worksheets[0].views[0].ySplit, 6);
      }
    }
    results.push(
      `${kind}: ${expected} filas recuperables y exportadas completas en CSV y XLSX: PASS`,
    );
  }
  mkdirSync('evidencia/operacion-integral', { recursive: true });
  writeFileSync(
    'evidencia/operacion-integral/historicos-api.json',
    JSON.stringify({ date: new Date().toISOString(), results }, null, 2),
  );
  console.log(results.join('\n'));
} finally {
  await fixture.close();
  await db.close();
  qa.stop();
}
