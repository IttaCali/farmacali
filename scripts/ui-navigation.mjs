import assert from 'node:assert/strict';

const nested = {
  Kardex: ['Inventario', 'Movimientos por lote'],
  Vencimientos: ['Inventario', 'Vencimientos'],
  Catálogo: ['Inventario', 'Catálogo'],
  'Catálogo de medicamentos': ['Inventario', 'Catálogo'],
  Recetas: ['Ventas en mostrador', 'Recetas registradas'],
  'Riesgo y mapa': ['Auditoría', 'Riesgo y mapa'],
  'Planilla detallada': ['Personal y planilla', 'Calcular y pagar'],
  'Coordinación de entregas': ['Pedidos y entregas', 'Reparto'],
  'Avisos simulados': ['Pedidos y entregas', 'Avisos de prueba'],
};
const aliases = {'Caja y ventas':'Caja','Clientes':'Ventas en mostrador'};
const titles = { Catálogo: 'Catálogo de medicamentos' };
export async function navigate(p, label) {
  label = aliases[label] || label;
  const [parent, tab] = nested[label] || [label];
  const originalUrl = p.url(),
    originalPages = p.context().pages().length,
    openedPages = [];
  const onPage = (newPage) => openedPages.push(newPage);
  p.context().on('page', onPage);
  try {
    const toggle = p.getByRole('button', { name: 'Ver módulos', exact: true });
    if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true')
      await toggle.click();
    const nav = p.getByRole('navigation', { name: 'Módulos del sistema', exact: true });
    await nav.getByRole('button', { name: parent, exact: true }).click();
    if (await toggle.isVisible())
      await p.waitForFunction(
        () =>
          document.querySelector('[aria-label="Ver módulos"]')?.getAttribute('aria-expanded') ===
          'false',
      );
    if (tab)
      await p
        .getByRole('navigation', { name: 'Secciones del módulo', exact: true })
        .getByRole('button', { name: tab, exact: true })
        .click();
    await p
      .getByRole('heading', {
        name: label === 'Resumen general' ? /^Bienvenido,/ : titles[label] || label,
        exact: label !== 'Resumen general',
        level: 1,
      })
      .waitFor();
    assert.equal(p.url(), originalUrl, `${label}: el módulo debe abrir en el panel central`);
    assert.equal(openedPages.length, 0, `${label}: no debe abrir otra pestaña o ventana`);
    assert.equal(p.context().pages().length, originalPages, `${label}: conserva las pestañas`);
  } finally {
    p.context().off('page', onPage);
  }
}
