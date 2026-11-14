import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = 'evidencia/operacion-integral';
const images = readdirSync(dir)
  .filter((n) => /^\d.*\.png$/.test(n))
  .sort();
const ui = JSON.parse(readFileSync(dir + '/resultados.json', 'utf8'));
const history = JSON.parse(readFileSync(dir + '/historicos-api.json', 'utf8'));
const escape = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
writeFileSync(
  dir + '/index.html',
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FarmaCali · Operación integral</title><style>body{font:16px/1.6 system-ui;margin:auto;max-width:1100px;padding:32px;background:#f7f3fb;color:#30273d}h1{color:#7137c8}article{padding:24px;border:1px solid #e3d7ef;border-radius:18px;margin:24px 0;background:white}img{display:block;max-width:100%;max-height:850px;object-fit:contain;margin:auto}a{color:#7137c8}li{margin:12px 0}small{color:#73677e}</style><h1>FarmaCali · Operación integral</h1><p>Evidencia de pruebas locales con datos ficticios. No representa una publicación en nube ni envíos reales de SMS.</p><p><a href="../../docs/OPERACION-INTEGRAL.md">Guía técnica y límites</a> · <a href="resultados.json">Resultados de interfaz</a> · <a href="historicos-api.json">Exportaciones históricas</a></p><small>Interfaz: ${escape(ui.date)}. Históricos: ${escape(history.date)}.</small><article><h2>Comprobaciones ejecutadas</h2><ul>${[...ui.results, ...history.results].map((s) => '<li>' + escape(s) + '</li>').join('')}</ul></article>${images.map((n) => `<article><h2>${escape(n.replace('.png', '').replaceAll('-', ' '))}</h2><a href="${escape(n)}"><img loading="lazy" src="${escape(n)}" alt="${escape(n)}"></a></article>`).join('')}</html>`,
);
console.log(`Galería actualizada: ${images.length} capturas.`);
