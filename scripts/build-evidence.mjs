import { readdirSync, writeFileSync } from 'node:fs';
const files = readdirSync('evidencia/capturas')
  .filter((f) => f.endsWith('.png'))
  .sort();
const captions = {
  '01': 'Acceso al sistema',
  '02': 'Resumen inicial',
  '03': 'Sucursales de la red',
  '04': 'Inventario por lote',
  '05': 'Registro de traslados',
  '06': 'Libro de caja',
  '07': 'Activos fijos',
  '08': 'Personal y planilla',
  '09': 'Pedidos y entregas',
  10: 'Bitácora de auditoría',
  11: 'Venta registrada',
  12: 'Cotización para call center',
  13: 'Reserva y pedido creado',
  14: 'Detalle de auditoría',
  15: 'Resumen móvil',
  16: 'Traslado en tránsito',
  17: 'Traslado recibido',
  18: 'Activo registrado',
  19: 'Planilla pagada',
  20: 'Pedido entregado y cobrado',
  21: 'Auditoría de operaciones',
  22: 'Resumen móvil final',
  23: 'Resumen final con operaciones',
};
writeFileSync(
  'evidencia/index.html',
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FarmaCali · Evidencia de desarrollo</title><style>body{font-family:Segoe UI,Arial,sans-serif;background:#f5f8f7;color:#2c4640;margin:0;padding:35px;max-width:1300px;margin:auto}h1{font-size:30px}p{line-height:1.8;color:#7d9288}a{color:#258676}nav{display:flex;gap:20px;flex-wrap:wrap;margin:25px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}.card{background:white;border:1px solid #dfeae5;border-radius:10px;overflow:hidden;text-decoration:none;color:inherit}.card img{width:100%;height:240px;object-fit:cover;object-position:top;display:block;border-bottom:1px solid #e6eee9}.card h2{font-size:14px;margin:16px}.card small{display:block;font-size:10px;margin:0 16px 16px;color:#97a69e}.notice{background:#e8f3ec;padding:17px;border-radius:8px}footer{margin-top:30px;font-size:11px;color:#91a198}</style></head><body><h1>FarmaCali · Evidencia de desarrollo</h1><p>React + Node.js · Arquitectura modelo–vista–controlador · 4 de octubre de 2026</p><div class="notice">Capturas reales de la demostración local. Datos ficticios. La publicación en nube está pendiente de acceso al proveedor.</div><nav><a href="../docs/EVIDENCIA-DESARROLLO.md">Registro de desarrollo</a><a href="pruebas-modelo.tap">22 pruebas de modelo</a><a href="pruebas-api.json">10 pruebas API</a><a href="pruebas-interfaz.json">15 pruebas de interfaz</a><a href="pruebas-flujos.json">7 pruebas de flujos</a><a href="auditoria-demostracion.csv">CSV de auditoría</a></nav><div class="grid">${files.map((file) => `<a class="card" href="capturas/${file}" target="_blank" rel="noopener"><img src="capturas/${file}" alt="${captions[file.slice(0, 2)]}" loading="lazy"><h2>${file.slice(0, 2)} · ${captions[file.slice(0, 2)]}</h2><small>Abrir captura completa</small></a>`).join('')}</div><footer>Las capturas documentan operaciones efectuadas. SQLite local y PostgreSQL embebido no constituyen un despliegue en nube.</footer></body></html>`,
);
console.log(`Galería generada con ${files.length} capturas.`);
