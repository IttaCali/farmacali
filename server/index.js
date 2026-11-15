import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initialize } from './database/init.js';
import { db } from './database/db.js';
import routes from './routes/api.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { portal } from './models/portal.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await initialize();
const reservationTimer = setInterval(
  () =>
    portal
      .expire()
      .catch((error) => console.error('No se pudieron revisar reservas vencidas:', error.message)),
  60000,
);
reservationTimer.unref();
const app = express();
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          'data:',
          'https://*.tile.openstreetmap.org',
          'https://tile.openstreetmap.org',
        ],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);
app.use('/api/portal/orders', express.json({ limit: '4mb' }));
app.use('/api/portal/prescription', express.json({ limit: '4mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
const allowedOrigins = (
  process.env.APP_ORIGIN ||
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001'
).split(',');
app.use(
  cors({
    credentials: true,
    origin: (origin, done) => done(null, !origin || allowedOrigins.includes(origin)),
  }),
);
app.use('/api', (req, res, next) => {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.get('origin') &&
    !allowedOrigins.includes(req.get('origin'))
  )
    return res.status(403).json({ error: 'Origen no autorizado.' });
  next();
});
app.use('/api', routes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta API no encontrada.' }));
if (existsSync(path.join(root, 'dist'))) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(root, 'dist/index.html')));
}
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.code === '23505' || /UNIQUE constraint failed/.test(err.message))
    return res.status(409).json({ error: 'Ya existe un registro con estos datos.' });
  if (err.code === '40001' || err.code === '40P01')
    return res.status(409).json({ error: 'Otra operación cambió los datos. Intenta nuevamente.' });
  console.error(err);
  res.status(500).json({ error: 'No se pudo completar la operación. Revisa el servidor.' });
});
const server = app.listen(Number(process.env.PORT || 3001), '0.0.0.0', () =>
  console.log(
    `FarmaCali API · http://localhost:${process.env.PORT || 3001} · ${db.cloud ? 'PostgreSQL' : 'SQLite local'}`,
  ),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(async () => {
      clearInterval(reservationTimer);
      await db.close();
      process.exit();
    }),
  );
