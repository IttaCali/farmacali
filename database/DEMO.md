# Datos ficticios de demostración

En una base demo nueva, la inicialización crea seis sucursales, un catálogo inicial, existencias, movimientos de caja, activos y personal. Este proceso agrega las cuentas por rol en cada sucursal activa con correos de inicio de sesión `@farmacali.com`, vincula el personal a sus cuentas, registra proveedores ficticios y asigna costos de referencia al inventario.

Ejecuta la carga solo en una base PostgreSQL dedicada a demostración:

1. Configura `DEMO_MODE=true` y `DATABASE_URL` con una URL `postgres://` o `postgresql://`.
2. Ejecuta `npm run db:seed-demo`.
3. Abre el archivo `data/demo-credentials-<fecha>.txt` que informa el comando. Las contraseñas aleatorias se generan una sola vez y se guardan localmente; todas exigen cambio al iniciar sesión y el administrador/auditor deben completar MFA.

El comando se niega a ejecutarse sin `DEMO_MODE=true` explícito o sin `DATABASE_URL` PostgreSQL; no usa SQLite. Está diseñado para ejecutarse una sola vez por base demo. Los perfiles, salarios, proveedores y costos generados son ficticios; no son datos operativos.

No uses esta carga como reemplazo de los datos reales requeridos para operar una farmacia ni ejecutes el comando contra producción.

El portal no solicita ni realiza verificación telefónica; el teléfono se usa únicamente como dato de contacto del pedido.

La configuración de producción requiere PostgreSQL, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`, una `DATA_ENCRYPTION_KEY` hexadecimal de 32 bytes y un `APP_ORIGIN` HTTPS. No habilites `DEMO_MODE` en una imagen con `NODE_ENV=production`.
