import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
export const demoMode = process.env.DEMO_MODE === 'true';
export const businessClock = () =>
  demoMode && process.env.QA_CLOCK ? new Date(process.env.QA_CLOCK) : new Date();
export const jwtSecret =
  process.env.JWT_SECRET || (demoMode ? 'local-demo-only-change-before-production-2026' : '');
if (!jwtSecret || jwtSecret.length < 32)
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres.');
if (process.env.NODE_ENV === 'production' && demoMode)
  throw new Error('DEMO_MODE no puede estar habilitado en producción.');
if (
  !demoMode &&
  (!process.env.DATABASE_URL || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
)
  throw new Error('Producción requiere DATABASE_URL, ADMIN_EMAIL y ADMIN_PASSWORD.');
if (
  !demoMode &&
  (process.env.ADMIN_PASSWORD.length < 12 ||
    !/[A-Z]/.test(process.env.ADMIN_PASSWORD) ||
    !/[0-9]/.test(process.env.ADMIN_PASSWORD) ||
    !/[\W_]/.test(process.env.ADMIN_PASSWORD))
)
  throw new Error(
    'ADMIN_PASSWORD requiere 12 caracteres, mayúscula, número y símbolo en producción.',
  );
if (!demoMode && !/^https:\/\//.test(process.env.APP_ORIGIN || ''))
  throw new Error('APP_ORIGIN requiere el dominio HTTPS publicado en producción.');
