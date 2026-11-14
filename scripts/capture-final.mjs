import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://localhost:3001');
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  await page.getByRole('heading', { name: 'Resumen general', level: 1 }).waitFor();
  await page.screenshot({
    path: 'evidencia/capturas/23-resumen-final.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'evidencia/capturas/22-resumen-movil-final.png',
    fullPage: true,
    animations: 'disabled',
  });
  console.log('Capturas finales guardadas. Vista compilada en puerto 3001 verificada.');
} finally {
  await browser.close();
}
