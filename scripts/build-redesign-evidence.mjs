import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const dir = 'evidencia/rediseno',
  result = JSON.parse(readFileSync(dir + '/resultados.json', 'utf8'));
const pictures = [
  ['01-acceso-escritorio', 'Acceso del personal'],
  ['03-admin-escritorio', 'Resumen del administrador y módulos superiores'],
  ['03-callcenter-escritorio', 'Accesos del call center'],
  ['05-admin-menu-390', 'Módulos en celular'],
  ['05-callcenter-menu-390', 'Atención de pedidos en celular'],
  ['08-inventario-tarjetas-movil', 'Inventario como tarjetas con acciones'],
  ['09-activos-tarjetas-movil', 'Activos e importes legibles'],
  ['07-portal-movil', 'Portal público'],
];
const escape = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
writeFileSync(
  dir + '/index.html',
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FarmaCali · Navegación superior</title><style>body{font:15px/1.7 system-ui;margin:auto;padding:30px;max-width:1200px;color:#264b35;background:#edf3ef}h1{letter-spacing:-1px}article{padding:22px;border:1px solid #d7e3da;border-radius:14px;margin:25px 0;background:white}img{display:block;max-width:100%;max-height:900px;object-fit:contain;margin:auto}a{color:#245987}small{color:#738477}</style><h1>FarmaCali · Un espacio de trabajo</h1><p>Navegación superior, contenido central, fondo verde y resumen azul. Sin barra lateral ni ventanas nuevas al elegir módulos.</p><p><a href="../../docs/FLUJO-PARA-PRESENTAR.md">Flujo para presentar</a> · <a href="../../docs/REDISENO-INTERFAZ.md">Cambios y verificación</a> · <a href="resultados.json">Resultados</a></p><small>Pruebas con datos ficticios y base aislada · ${escape(result.date)}</small><article><h2>Comprobaciones</h2><ul>${result.results.map((s) => '<li>' + escape(s) + '</li>').join('')}</ul></article>${pictures
    .filter(([name]) => existsSync(dir + '/' + name + '.png'))
    .map(
      ([name, title]) =>
        '<article><h2>' +
        escape(title) +
        '</h2><a href="' +
        name +
        '.png"><img loading="lazy" src="' +
        name +
        '.png" alt="' +
        escape(title) +
        '"></a></article>',
    )
    .join('')}</html>`,
);
console.log('Galería del rediseño actualizada.');
