import ExcelJS from 'exceljs';

export function reportWorkbook({
  title,
  columns,
  keys,
  values,
  from,
  to,
  branch,
  search,
  author,
  cashTotals,
}) {
  const book = new ExcelJS.Workbook();
  book.creator = 'FarmaCali';
  book.created = new Date();
  const sheet = book.addWorksheet('Reporte', { properties: { tabColor: { argb: 'FF7050A4' } } });
  sheet.columns = keys.map((k) => ({
    key: k,
    width: k.includes('hash')
      ? 38
      : /description|reason|address/.test(k)
        ? 44
        : /name|customer/.test(k)
          ? 30
          : 23,
  }));
  const end = keys.length;
  const banner = (row, text, fill, size, color = 'FFFFFFFF') => {
    sheet.mergeCells(row, 1, row, end);
    const cell = sheet.getCell(row, 1);
    cell.value = text;
    cell.font = { name: 'Aptos', size, bold: true, color: { argb: color } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    sheet.getRow(row).height = row === 1 ? 38 : 28;
  };
  banner(1, `FarmaCali | ${title}`, 'FF342346', 18);
  banner(
    2,
    `Período: ${from || 'Inicio'} — ${to || 'Todas las fechas'} · Sucursal: ${branch}`,
    'FFF0EBF7',
    11,
    'FF493563',
  );
  banner(
    3,
    `Generado: ${new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'medium', timeStyle: 'short' }).format(new Date())} · ${values.length} registros · ${author}`,
    'FFF0EBF7',
    10,
    'FF493563',
  );
  banner(
    4,
    search ? `Búsqueda aplicada: ${search}` : 'Moneda: quetzales (GTQ) · Fechas: hora de Guatemala',
    'FFF8F6FB',
    10,
    'FF685A77',
  );
  sheet.getRow(6).values = keys.map((k) => columns[k]);
  sheet.getRow(6).height = 30;
  sheet.getRow(6).eachCell((cell) => {
    cell.font = { name: 'Aptos', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7050A4' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  values.forEach((values, i) => {
    const row = sheet.addRow(values);
    row.height = 32;
    row.eachCell({ includeEmpty: true }, (cell, n) => {
      const key = keys[n - 1];
      cell.font = { name: 'Aptos', size: 11, color: { argb: 'FF332C40' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: i % 2 ? 'FFF3EFF8' : 'FFFFFFFF' },
      };
      if (key.endsWith('_cents') || key === 'valuation')
        cell.numFmt = '"Q "#,##0.00;[Red]("Q "#,##0.00)';
      else if (typeof cell.value === 'number') cell.numFmt = '#,##0';
    });
  });
  if (!values.length)
    banner(7, 'No hay registros para los filtros seleccionados.', 'FFF8F6FB', 11, 'FF685A77');
  const last = 6 + values.length;
  if (values.length)
    sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: last, column: end } };
  if (cashTotals) {
    let row = Math.max(9, last + 3);
    for (const [label, amount] of [
      ['Ingresos del filtro', cashTotals.income],
      ['Egresos del filtro', cashTotals.expense],
      ['Saldo del filtro', cashTotals.income - cashTotals.expense],
    ]) {
      sheet.getCell(row, 1).value = label;
      sheet.getCell(row, 2).value = amount;
      sheet.getCell(row, 2).numFmt = '"Q "#,##0.00;[Red]("Q "#,##0.00)';
      sheet.getRow(row).font = { name: 'Aptos', bold: true, color: { argb: 'FF493563' } };
      row++;
    }
  } else if (
    values.length &&
    keys.some((k) => (k.endsWith('_cents') && !k.includes('price')) || k === 'valuation')
  ) {
    const totalRow = last + 2;
    sheet.getCell(totalRow, 1).value = 'TOTALES DEL FILTRO';
    keys.forEach((k, i) => {
      if ((k.endsWith('_cents') && !k.includes('price')) || k === 'valuation') {
        sheet.getCell(totalRow, i + 1).value = {
          formula: `SUM(${sheet.getColumn(i + 1).letter}7:${sheet.getColumn(i + 1).letter}${last})`,
          result: values.reduce((s, v) => s + (Number(v[i]) || 0), 0),
        };
        sheet.getCell(totalRow, i + 1).numFmt = '"Q "#,##0.00';
      }
    });
    sheet.getRow(totalRow).font = { name: 'Aptos', bold: true, color: { argb: 'FF493563' } };
  }
  sheet.views = [{ state: 'frozen', ySplit: 6 }];
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '1:6',
  };
  sheet.headerFooter.oddFooter = '&LFarmaCali · Reporte de gestión&R Página &P de &N';
  return book;
}
