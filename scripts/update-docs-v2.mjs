import {writeFileSync} from 'node:fs';
const docs={
'README.md':`# FarmaCali — prototipo MVC, versión 2

Aplicación académica para una cadena de farmacias en Guatemala: **React + Node.js/Express + PostgreSQL para nube**. La demostración local usa SQLite persistente. Se mantiene la excepción de base de datos en nube autorizada por el docente; no se cambió a Oracle por la mención del archivo de mejoras.

## Abrir el sistema

Requiere Node.js 24 y npm. Desde esta carpeta:

\`\`\`powershell
npm.cmd install
npm.cmd run dev
\`\`\`

Abrir **http://localhost:5173**. La API funciona en http://localhost:3001. Estar dentro de XAMPP no cambia que esta aplicación se ejecuta con Node, sin PHP ni Apache. Para ejecutar la versión compilada: npm.cmd run build, luego npm.cmd start y abrir localhost:3001.

| Cuenta ficticia | Correo | Contraseña | Segundo factor |
|---|---|---|---|
| Administrador | admin@farmacia.gt | Farmacia2026! | Obligatorio |
| Operador de sucursal | sucursal@farmacia.gt | Sucursal2026! | No requerido |
| Operador de call center | callcenter@farmacia.gt | Operador2026! | No requerido |
| Auditor | auditor@farmacia.gt | Auditor2026! | Obligatorio |

Los botones del login completan el formulario; debes pulsar Iniciar sesión. En el primer acceso de administrador o auditor, escanea el QR con una aplicación de autenticación, guarda esa configuración y escribe el código de seis dígitos. En los siguientes accesos usa el código de esa misma aplicación. La contraseña por sí sola no completa estos ingresos. El QR y la clave manual son secretos: no incluirlos en la exposición.

El avatar de la esquina superior derecha abre Mi perfil, Cambiar contraseña y Cerrar sesión. Cinco fallos bloquean la cuenta por 15 minutos. La sesión también termina tras 15 minutos sin interacción, con aviso un minuto antes. No hay tokens en localStorage ni sessionStorage.

## Flujo operativo

1. Administrador: configura sucursales, horarios, productos, personal, activos, usuarios y roles. Ingresa lotes y paga la planilla.
2. Sucursal: ve sus existencias y caja, vende con FEFO, abre/cierra turnos y crea borradores de traslado. Despachar descuenta stock; recibir incorpora las unidades reales y registra diferencias.
3. Call center: registra clientes/direcciones y recetas desde Clientes. Consulta medicamento, cantidad y ubicación; compara stock, distancia, cola y horario de las farmacias. Confirma el pedido y reserva los lotes.
4. Pedido: **Pendiente → Preparando → En ruta → Entregado**. Se puede editar y reasignar únicamente mientras está Pendiente. La reasignación libera la reserva anterior. La entrega registra el cobro una sola vez. Cancelar requiere motivo y devuelve las unidades reservadas.
5. Correcciones: quien detecta un error solicita ajuste o anulación. Otro administrador aprueba con motivo y contraseña. Nadie resuelve su propia solicitud. Las anulaciones conservan el documento y generan movimientos inversos.
6. Auditor: consulta sin editar, descarga informes, revisa riesgo y mapa y verifica la cadena de hashes. El botón de simulación modifica una copia en memoria y demuestra la detección sin alterar la bitácora real.

Hay 15 áreas navegables, tablas con búsqueda/ordenamiento/paginación, alertas a 30/60/90 días, kardex, historiales de salarios y depreciación, exportaciones CSV/Excel/PDF, búsqueda Ctrl+K y modo oscuro. El menú y el resumen cambian por rol. El call center tiene cuatro accesos principales: Resumen, Inventario, Pedidos y Clientes.

## Estructura MVC

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Vista | src/App.jsx, src/components | Pantallas y formularios React |
| Controlador | server/controllers, server/routes | HTTP, permisos, validación y respuestas |
| Modelo | server/models | Autenticación, reglas, transacciones, FEFO, aprobaciones y auditoría |
| Persistencia | server/database | PostgreSQL/SQLite, esquema y cuatro migraciones |
| Seguridad | server/security, server/middleware | AES-256-GCM, permisos, CSRF y Zod |

La base real tiene 31 tablas. Consultar database/postgresql.sql y database/estructura-real.json como insumo para tu E-R. No instalar el SQL de referencia manualmente: la aplicación crea y migra la base al iniciar.

## Verificación y evidencia actual

\`\`\`powershell
npm.cmd test
npm.cmd run test:api
npm.cmd run test:ui
npm.cmd run db:schema
npm.cmd run evidence
\`\`\`

Las pruebas nuevas crean bases QA aisladas; no activan el 2FA ni escriben operaciones en tu base habitual. UI requiere Chrome instalado. Los resultados, capturas y archivos de ejemplo están en [la galería de la ampliación](evidencia/ampliacion/index.html). Los informes de la versión inicial se conservan como historial y no sustituyen la verificación actual.

Consulta [lo que se incorporó y lo pendiente](docs/AMPLIACION.md), [arquitectura técnica](docs/ARQUITECTURA-TECNICA.md), [API](docs/API.md), [seguridad](docs/SEGURIDAD.md), [guion de 10 minutos](docs/GUION-DEMO.md) y [despliegue](docs/DESPLIEGUE.md). Después de iniciar sesión, Swagger está en /api/docs/.

## Datos y nube

data/farmacia.sqlite conserva tus operaciones. Se creó un respaldo antes de ampliar el esquema; los respaldos están en data/backups. npm.cmd run backup:local genera otra copia coherente mediante SQLite Backup. No subir data, .env ni claves a GitHub.

La publicación **no se realizó**, porque decidiste hacerla después. render.yaml prepara React y API en un mismo servicio, con PostgreSQL separado. En producción se requieren DATABASE_URL, JWT_SECRET, DATA_ENCRYPTION_KEY, APP_ORIGIN HTTPS, ADMIN_EMAIL, ADMIN_PASSWORD y DEMO_MODE=false. La clave AES debe guardarse para poder recuperar los datos cifrados. Leer la guía antes de publicar: la base gratuita de Render tiene duración limitada.

## Alcance académico y límites

Los documentos de visión, arquitectura del negocio, factibilidad y E-R siguen a tu cargo. Esta entrega incluye desarrollo y documentación técnica para alinearlos.

No incluye publicación efectiva, FEL, bancos/pasarelas, ISR/IGSS, validación médica externa, tráfico real ni GPS. NIT y canal preparan esas integraciones. El mapa usa coordenadas declaradas y refresco cada 30 segundos. La planilla paga el bruto, sin deducciones legales; la depreciación es una estimación lineal.

El snapshot limita caja/kardex a 1,000 filas y bitácora/historial a 500; los reportes usan el mismo conjunto. La paginación de pantalla es cliente. Para gran escala falta paginación SQL, informes históricos completos, monitoreo y pruebas de carga con PostgreSQL externo. PGlite verifica SQL/constraints de PostgreSQL, pero no demuestra conexión TLS, concurrencia entre servidores ni hosting en nube. Los triggers y hashes no protegen contra un propietario de BD que pueda reemplazar todo el historial y su ancla; el despliegue debe separar propietario y usuario de ejecución y guardar anclas externas.
`,
'docs/AMPLIACION.md':`# Ampliación solicitada — estado verificable

Se tomaron las mejoras del archivo "lo que hace falta" y se aplicaron al desarrollo existente. Sus referencias a Oracle y a publicar inmediatamente no reemplazan lo acordado: PostgreSQL en nube y publicación posterior. Las visiones, factibilidades y E-R siguen a cargo del estudiante.

| Etapa | Incorporado | Evidencia / límite |
|---|---|---|
| 1. Roles | Cuatro roles, permisos en tablas, usuarios por sucursal y roles nuevos | permissions.js, migrations.js, Usuarios y roles |
| 2. Sesiones | bcrypt costo 12, clave temporal, TOTP, cookies, refresh rotativo, bloqueo, avatar/logout, inactividad | authentication.js, Security.jsx; Secure activo en HTTPS/producción, no en HTTP local |
| 3. Backend | Permisos, alcance derivado de sesión, parámetros SQL, Zod, CSRF, CORS, Helmet y rate limit | pruebas API de 403, origen, CSRF, sucursal falsificada e inyección tratada como dato |
| 4. Integridad | Transacciones, FEFO, descuentos condicionados, FOR UPDATE PostgreSQL, vencidos bloqueados, planilla única activa | pruebas de última unidad, rollback, PostgreSQL embebido; salarios de empleados/historial y CUI cifrados |
| 5. Bitácora | Cadena SHA-256, secuencia/ancla, triggers sin UPDATE/DELETE, verificar y simular copia | Auditoría; privilegios-runtime.sql preparado para nube, no aplicado a servicio externo |
| 6. Mantenimiento | Editar/desactivar/reactivar usuarios, empleados, sucursales, productos, activos y clientes; sesiones remotas; historial salarial; correcciones con cuatro ojos | No se borran documentos financieros. Cierre de sucursal exige no tener stock, pedidos, traslados ni turnos abiertos |
| 6. Operaciones | Venta/caja/planilla con reversos, borrador cancelable, recepción parcial, pedido editable/reasignable Pendiente | Solicitudes y tests operations.test.js; cuotas de planilla anteriores a la migración usan sucursal conocida en esa fecha |
| 7. Negocio | Clientes y direcciones, turnos, alertas, kardex, recetas, Excel/PDF/CSV, Swagger, canal y NIT | El NIT no significa emisión de FEL. Receta validada documentalmente por el operador |
| 8. Decisión | Ranking con Haversine, stock, cola y cierre; explicación, pago y ETA; riesgo por descuentos, ajustes, faltantes, horario y recepción; mapa | Horarios Guatemala; radio 30 km, 25 km/h y preparación 20 + 8 min/pedido; sin tráfico ni GPS |
| 9. Interfaz | Resúmenes por rol, menú dinámico, campana, Ctrl+K, estados, tablas, validación por campo, skeleton, gráficos, tema oscuro, tablet/móvil | Prueba Chrome de los cuatro roles y recorrido completo |
| 10. Nube | Blueprint, contenedores, variables y guía actualizados | Publicar y configurar respaldos automáticos sigue pendiente por decisión del estudiante |
| 11. Documentos | Arquitectura técnica, API, seguridad, iteraciones, estado y evidencias | Las visiones del negocio/sistema, arquitectura del negocio, tres factibilidades y E-R son del estudiante |
| 12. Presentación | Guion de 10 minutos y pruebas reproducibles | Dos contextos/ventanas independientes permiten roles simultáneos |

## Seguridad de las evidencias

Las pruebas escriben datos ficticios en bases separadas. Las capturas de enrolamiento ocultan el QR. No se entregan cookies ni secretos TOTP. Los rechazos HTTP se capturan desde solicitudes fetch reales, no se presentan como capturas de Postman. El archivo pruebas-modelo.tap registra el resultado de los tests; pruebas-api.json y pruebas-ui.json describen las comprobaciones efectivamente ejecutadas.

## Fase siguiente

Publicación HTTPS real y pruebas PostgreSQL de red, separación de roles de BD, respaldo/recuperación y custodia de claves. Para producción: informes sin límite de historial, paginación SQL, cola de entregas distribuida, carga a 200 sucursales, observabilidad y alertas externas. Integraciones futuras: FEL/SAT, ISR/IGSS, pago electrónico, portal/call center externo, gerente/repartidor, proveedores/compras y operación offline de stands. Las funciones opcionales de predicción, recall y entrega OTP no se incorporaron.
`,
'docs/ARQUITECTURA-TECNICA.md':`# Arquitectura técnica — FarmaCali v2

## Flujo MVC y despliegue previsto

React llama /api bajo el mismo origen. Express aplica Helmet, CORS, autenticación de cookie, CSRF, permiso y Zod; el controlador invoca el modelo y devuelve JSON o un informe. El modelo agrupa cambios de stock, caja y bitácora en una transacción. El adaptador usa pg para PostgreSQL y SQLite local para demo. Node sirve dist en producción; Vite solo facilita desarrollo.

\`\`\`mermaid
flowchart LR
 V[React · vista] --> R[Express · rutas y protección]
 R --> C[Controladores HTTP]
 C --> M[Modelos de negocio y autenticación]
 M --> D[Adaptador de persistencia]
 D --> P[PostgreSQL · nube prevista]
 D --> S[SQLite · demostración local]
 M --> A[Auditoría encadenada]
\`\`\`

## Roles y alcance

| Recurso | Administrador | Sucursal | Call center | Auditor |
|---|---|---|---|---|
| Sucursales/inventario | Mantiene red | Opera solo su inventario | Consulta red | Consulta |
| Traslados/caja/ventas | Opera y aprueba | Opera su sucursal; solicita reversos | Sin acceso | Consulta |
| Pedidos/clientes | Gestiona | Consulta los vinculados a su sucursal | Gestiona red | Consulta |
| Personal/planilla/activos | Gestiona | Sin acceso | Sin acceso | Consulta |
| Usuarios/roles | Gestiona | Sin acceso | Sin acceso | Consulta |
| Bitácora | Consulta | Sin acceso | Sin acceso | Consulta, exporta, verifica |
| Solicitudes | Aprueba las ajenas | Solicita | Sin acceso | Consulta |
| Recetas | Registra | Registra | Registra desde Clientes | Consulta |

Los permisos se almacenan en roles, permissions y role_permissions. Usuarios se vinculan a role_id y, si el rol tiene alcance branch, a una sucursal. El campo users.role antiguo se conserva únicamente por compatibilidad de migración: el rol efectivo proviene de la tabla roles. Los controladores comprueban permiso y los modelos comprueban alcance/estado; ocultar botones no reemplaza autorización.

## Reglas y estados

Inventario por lote y fecha: FEFO y vencidos bloqueados. Venta inmediata genera salida e ingreso en una transacción. Descuento permitido entre 0 y 50%; desde 15% alimenta la alerta de riesgo, sin afirmar que sea fraude. Borrador de traslado no reserva: se valida stock al despachar. Recepción parcial conserva despachado/recibido/motivo y registra únicamente lo recibido; la diferencia queda visible al auditor.

Pedido Pendiente reserva stock; solo se edita/reasigna en ese estado. Preparando bloquea esas modificaciones, En ruta registra despacho y Entregado cobra una vez. Cancelar antes de entregar requiere motivo y libera reservas. No se edita una venta: se solicita su anulación, otro administrador valida y se conservan documento, contra-asiento y reintegro al kardex. Un pago de planilla anulado queda en estado Anulado; el índice único parcial impide dos pagos activos del mismo empleado/período y permite corregirlo sin borrar el anterior. Se guarda la sucursal del pago para que un traslado posterior del empleado no cambie el reverso.

## Motor de asignación

Distancia Haversine, radio 30 km. ETA = 20 minutos de preparación + 8 por pedido pendiente de la sucursal + viaje a 25 km/h. Score = distancia×2 + cola×5 + cantidad/stock×20. Menor score se prefiere entre sucursales entregables. La sucursal debe estar abierta y poder terminar antes de cerrar. La confirmación vuelve a validar stock, cola y horario. Son estimaciones: no incluyen tráfico ni ubicación GPS del repartidor.

## Persistencia y auditoría

31 tablas con claves, relaciones, índices y cuatro migraciones. Insumo actualizado para el E-R: database/estructura-real.json y postgresql.sql, generados desde PostgreSQL embebido después de migrar. El kardex inicial representa el saldo a la fecha de ampliación, no una reconstrucción de movimientos previos.

PostgreSQL usa SERIALIZABLE y bloquea lotes FOR UPDATE; SQLite serializa transacciones BEGIN IMMEDIATE. Ante conflicto se revierte todo y se solicita reintentar. La bitácora encadena hashes sobre secuencia, anterior, usuario/rol/sucursal, acción/entidad/referencia, valores, fecha, IP y detalles. audit_head guarda el último hash y detecta pérdida de la cola. Triggers impiden modificar/borrar filas por SQL ordinario. Para nube usar usuario de runtime sin DDL ni UPDATE/DELETE en bitácora; el dueño de la base conserva poder para cambiar estructura, por lo que se requieren respaldos y anclas externas independientes.

## Integraciones y escala

Swagger /api/docs/ y OpenAPI /api/openapi.json documentan el contrato. orders.channel distingue mostrador, telefono y portal. NIT permite preparar la integración futura con un certificador FEL de la SAT; no se emiten facturas fiscales. Las recetas se validan por un operador, no por un registro médico externo.

Fase siguiente: proveedores/compras, repartidores y roles de gerente, deducciones ISR/IGSS, pasarelas y GPS/tráfico. Para stands con mala conexión se propone una cola local offline con identificadores idempotentes y reconciliación central; **no está implementada** y no debe vender ni reservar stock central sin reglas explícitas de sincronización.

La pantalla pagina en cliente y snapshot conserva límites 1,000 caja/kardex y 500 auditoría/historial. Escalar a 200 sucursales exige consultas paginadas/filtradas en SQL, reportes históricos, pruebas de carga y monitorización; no se ha demostrado esa capacidad con el prototipo.
`,
'docs/API.md':`# API v2 — contrato e integración

Base local: http://localhost:3001/api. React usa /api mediante el proxy Vite o el mismo servidor compilado. El contrato navegable y actualizado está en **/api/docs/** después del login; JSON en **/api/openapi.json**. Los esquemas de entrada se generan desde Zod. El archivo server/openapi.js documenta permisos, cuerpos y parámetros.

## Autenticación

POST /auth/login recibe email y password. Puede devolver step=password (clave temporal), step=enroll (QR de primer 2FA), step=totp o user tras establecer cookies. POST /auth/complete recibe challenge y new_password o code. Nunca devuelve access/refresh en JSON. Access y refresh son HttpOnly, SameSite=Strict, Secure en producción; en HTTP local Secure se desactiva para poder demostrar. El QR/secret de enrolamiento se entrega solo tras verificar la contraseña.

Access JWT vence en 15 min. Refresh dura 7 días y rota en POST /auth/refresh; su reutilización revoca la sesión. La BD almacena hashes, no los tokens. Para escrituras enviar X-CSRF-Token con el valor de la cookie csrf. Postman puede guardar cookies y copiar esa cookie al header, sin crear un Bearer token. Orígenes permitidos se configuran en APP_ORIGIN; CORS no equivale a autorización.

GET /auth/me obtiene perfil/permisos. POST /auth/activity registra interacción explícita. POST /auth/logout revoca la sesión y borra cookies. POST /auth/password cambia clave y revoca todas las sesiones. Cinco fallos bloquean 15 minutos; credenciales desconocidas y erróneas usan el mismo mensaje. La cuenta temporal obliga a cambiar la clave antes de obtener sesión.

## Operaciones principales

| Endpoint | Regla |
|---|---|
| GET /snapshot | Datos de módulos permitidos y alcance de la sesión |
| POST /procurement/medicines, /procurement/orders, /procurement/suppliers | Alta de medicamentos asociada a proveedor y permisos de abastecimiento |
| POST /branches, /assets, /employees, /payroll | Permisos por recurso y alcance de sucursal |
| POST /inventory, /sales, /cash | Sucursal tomada de sesión cuando el rol tiene alcance branch |
| POST /delivery/quote | Stock, cola, horario, distancia, score, pagos y ETA; no reserva |
| POST /orders | Reserva FEFO y revalida condiciones al confirmar |
| PATCH /orders/:id/status | Pendiente → Preparando → En ruta → Entregado; Cancelado requiere reason |
| POST /manage/:entity/:id | values permitidos + reason; password para baja/restablecimiento crítico |
| POST /transfer-drafts, /transfer-drafts/:id/action | Crear sin consumir; dispatch o cancel con motivo |
| POST /transfers/:id/receive | received_quantity real y reason si hay diferencia |
| POST /clients, /clients/:id/addresses, /prescriptions | Clientes, direcciones y validación documental de receta |
| POST /users, /roles | Crear cuentas temporales y roles definidos en tablas |
| POST /requests, /requests/:id/decision | Cuatro ojos: quien solicita no aprueba/rechaza su solicitud |
| POST /shifts, /shifts/:id/close | Fondo, esperado, contado y diferencia con observación |
| POST /assets/:id/depreciation | Conserva valoración mensual única |
| GET /risk, /audit/integrity | Riesgo y verificación; integridad exclusiva del permiso de auditor |
| POST /audit/simulation | Altera una copia en memoria; conserva bitácora real |
| GET /reports/:name/:format | csv, xlsx o pdf; registra exportación y respeta permiso/alcance |

Pedidos/sales guardan nit; orders guarda client_id, prescription_id y channel. Canal de pedido: telefono o portal, mientras mostrador lo asigna el servidor en la venta. Los medicamentos controlados exigen prescription_id del producto y confirmación de receta.

Informes: sales, orders, inventory, kardex, cash, payroll, audit, branches, transfers, assets, clients, users, requests y prescriptions. branch_id=all o ID filtra sin ampliar el alcance. Bitácora solo exportable por permiso auditoria.exportar. Los informes actuales usan el snapshot limitado; no son una exportación histórica completa.

Errores: 400 campos/reglas; 401 credenciales/sesión; 403 permiso/alcance/CSRF/origen; 404 no encontrado; 409 conflicto/duplicado. Zod devuelve error y fields. Los detalles de errores inesperados quedan en log del servidor. Las consultas usan parámetros; los nombres dinámicos de tablas/columnas provienen de listas cerradas.

Para demostrar 403, usar gerente de sucursal en POST /inventory, PATCH /orders/:id/status o POST /deliveries/:id/assign; usar auditor en POST /procurement/medicines. El ingreso directo de stock se realiza por abastecimiento, donde la sucursal se limita desde la sesión. Repetir estas pruebas en la URL publicada cuando se despliegue; la evidencia local no reemplaza esa comprobación.
`,
'docs/SEGURIDAD.md':`# Seguridad — relación con OWASP Top 10:2025

Mapa técnico del prototipo, **no certificación ni resultado de un pentest**. Referencia: [OWASP Top 10:2025](https://top10.owasp.org/2025/). Los controles y límites de la tabla se deducen del código implementado y de las pruebas locales.

| Categoría 2025 | Control implementado | Pendiente para producción |
|---|---|---|
| A01 Acceso roto | Permisos por ruta/recurso, sucursal de sesión, cuatro ojos, CSRF | Revisión externa de autorización y separación de funciones |
| A02 Configuración | Helmet/CSP, origen limitado, variables .env, Secure en HTTPS | Configurar dominios, TLS y usuario de BD limitado |
| A03 Cadena de suministro | package-lock y npm audit; override uuid compatible con ExcelJS | CI, actualizaciones y revisión de paquetes |
| A04 Criptografía | bcrypt costo 12; AES-256-GCM salarios de empleados/historial, CUI y TOTP; hashes de refresh | Custodia/rotación de claves y cifrado/respaldos del proveedor |
| A05 Inyección | Parámetros SQL, listas cerradas de columnas/entidades, Zod; CSV protege fórmulas | Pentest de API y superficies nuevas |
| A06 Diseño inseguro | FEFO, rollback, bloqueos, estados, planilla única activa y aprobación independiente | Carga/concurrencia PostgreSQL externo y procesos operativos |
| A07 Autenticación | TOTP, clave temporal, bloqueo, refresh rotativo, revocación e inactividad | Recuperación de 2FA con proceso seguro, alertas externas |
| A08 Integridad | Cadena SHA-256, secuencia/ancla y triggers sin UPDATE/DELETE | Ancla externa independiente y usuario sin propiedad/DDL |
| A09 Registro/alertas | Login/fallos/logout/cambios y operaciones auditados; riesgo por reglas | SIEM/avisos externos y retención completa |
| A10 Excepciones | Respuestas genéricas inesperadas, conflictos controlados y rollback | Resiliencia, límites operativos y recuperación ensayada |

La demo HTTP desactiva Secure; la publicación con DEMO_MODE=false exige HTTPS y activa Secure. Access/refresh son HttpOnly, SameSite=Strict; el CSRF legible no es el token de autenticación. No se guardan tokens en almacenamiento web. Password mínimo 10 caracteres con mayúscula, número y símbolo; el administrador inicial de producción requiere 12.

La bitácora impide cambios ordinarios pero un dueño de BD puede desactivar triggers y reemplazar datos/ancla. Preparación de privilegios: database/privilegios-runtime.sql. No se aplicó a una BD externa porque aún no se ha publicado. El QR de TOTP y la clave AES no deben aparecer en capturas; perder la clave AES puede impedir recuperar la información cifrada. El log financiero registra importes y la planilla conserva importes de pagos: el cifrado de empleados no significa que todos los importes financieros estén cifrados en cada tabla.

Evidencias: pruebas-modelo.tap, pruebas-api.json, http-seguridad.json, npm-audit.json y capturas. Las pruebas de SQL malicioso validan que un campo se trata como dato; no sustituyen una auditoría exhaustiva de seguridad.
`,
'docs/GUION-DEMO.md':`# Guion de presentación — 10 minutos

Antes: iniciar npm.cmd run dev, abrir localhost:5173, preparar autenticador del administrador y auditor y usar ventanas/perfiles separados. Todos los nombres, recetas y direcciones de la demo son ficticios. No exponer el QR, cookies ni claves. Si una cuenta está bloqueada esperar 15 minutos o usar la base QA del script, sin modificar la bitácora real.

| Tiempo | Rol y demostración |
|---|---|
| 0:00–1:30 | Admin: explicar React/vista, controladores Node y modelos; entrar con 2FA. Mostrar sucursales/horarios y crear una sucursal ficticia |
| 1:30–3:00 | Admin: ingresar un lote, mostrar usuarios/roles y planilla. Explicar salarios protegidos y pago único por período |
| 3:00–4:30 | Sucursal: mostrar que solo ve su caja/inventario; abrir turno, vender y mostrar descuento FEFO y entrada en caja |
| 4:30–5:30 | Sucursal: crear borrador de traslado, explicar cancelación previa, despachar. Admin/destino recibe unidades reales; diferencia deja alerta |
| 5:30–7:30 | Call center: cliente/dirección, medicamento/cantidad/coordenadas, ranking explicado con stock/cola/horario/pago/ETA. Confirmar Pendiente y luego Preparar, Despachar, Entregar |
| 7:30–8:30 | Sucursal solicita anulación de una venta; admin distinto resuelve con motivo y contraseña. Mostrar contra-asiento y stock reintegrado |
| 8:30–9:30 | Auditor: ver bitácora y hashes, Verificar integridad, Simular alteración en copia: original válido/copia inválida. Descargar Excel o PDF |
| 9:30–10:00 | Mostrar riesgo/mapa y Swagger. Explicar nube prevista en Render/PostgreSQL, publicación posterior y fase futura fiscal/portal/GPS |

## Pruebas listas para defender

1. Gerente intenta POST /api/inventory o gestionar pedidos/entregas → 403; auditor intenta POST /api/procurement/medicines → 403.
2. El gerente registra medicamentos por abastecimiento con un proveedor existente y un lote automático.
3. Texto SQL malicioso en lote queda como dato, sin eliminar tablas.
4. Cinco fallos y un sexto acceso válido muestran bloqueo; mensaje genérico evita revelar cuentas.
5. Dos pedidos concurrentes por la última unidad: solo uno reserva.
6. El solicitante no puede resolver su propia solicitud; la anulación conserva documento y reverso.
7. Bitácora real no acepta UPDATE/DELETE. La simulación altera una copia y señala la fila inconsistente.

Los resultados se encuentran en evidencia/ampliacion. No anunciar que la nube está publicada ni que PGlite demuestra un servidor externo. Para usar Postman, consultar docs/API.md: cookies y X-CSRF-Token, sin Bearer. Las capturas HTTP entregadas se realizaron con fetch real, no con Postman.

## Respuestas breves

Cuatro roles representan administración, sucursal, call center y supervisión. Los permisos residen en tablas. No hay eliminación de documentos financieros: baja lógica o contra-asiento. FEFO prioriza vencimiento; transacciones y bloqueos protegen stock. NIT/canal y OpenAPI preparan FEL/portal, pero no los implementan. La escala a 200 sucursales requiere optimización SQL, carga, monitorización y recursos de nube; todavía no fue demostrada.
`,
'docs/DESPLIEGUE.md':`# Publicación posterior — React, Node y PostgreSQL

## Estado

No se han creado recursos, publicado una URL ni contratado planes. El estudiante decidió publicar después. SQLite local, Blueprint y PostgreSQL embebido no satisfacen por sí solos el requisito de servicio en nube.

## Render y límites verificados

El Blueprint mantiene un servicio Node que sirve React compilado y una BD PostgreSQL separada. Un mismo origen simplifica cookies SameSite=Strict y CSRF; DATABASE_URL vincula la BD sin guardar credenciales en React.

Según [Render Free](https://render.com/docs/free), consultado el 4 de octubre de 2026, el servicio free se suspende tras 15 minutos sin tráfico y puede tardar aproximadamente un minuto en reactivarse. Postgres free tiene 1 GB, vence 30 días después de crearse y no incluye respaldos gestionados. El plan gratuito sirve para una prueba corta, **no para una BD permanente**. Revisar las condiciones nuevamente al publicar.

Para respaldos automáticos se requiere un plan de BD apropiado: [Render Recovery and Backups](https://render.com/docs/postgresql-backups) describe PITR de bases pagadas. No se activaron respaldos de nube. La propuesta empresarial debe cotizar planes/almacenamiento/recuperación y no asumir costo permanente cero.

## Procedimiento concreto

1. Subir código y package-lock a GitHub. Excluir .env, data, node_modules, dist y capturas que contengan secretos.
2. Crear Blueprint con render.yaml. Elegir conscientemente plan free de prueba o planes pagados para continuidad/respaldos. Base nueva y ambiente de demo/producción separados.
3. Configurar ADMIN_EMAIL, ADMIN_PASSWORD nueva (12 caracteres, mayúscula/número/símbolo), DATA_ENCRYPTION_KEY y APP_ORIGIN con la URL HTTPS real del servicio. JWT_SECRET se genera en Render; DATABASE_URL proviene de la BD. DEMO_MODE=false evita cuentas conocidas/datos ficticios.
4. Generar localmente la clave AES con Node crypto.randomBytes(32).toString('hex'); debe ser de 64 caracteres hexadecimales. Guardarla en el gestor de secretos y en respaldo seguro. No cambiarla sin migrar datos; no escribirla en documentación, capturas o frontend.
5. Compilar npm ci && npm run build; ejecutar npm start. Node crea/migra las tablas al iniciar una instalación vacía. La contraseña inicial solo aplica al crear la base; cambiar ADMIN_PASSWORD no cambia una cuenta existente.
6. Abrir HTTPS y /api/health: comprobar PostgreSQL y demo:false. Ingresar con credenciales configuradas, enrolar 2FA y registrar sucursales, productos y lotes.
7. Configurar respaldo automático, probar restauración en otra base y separar propietario/migrador del usuario runtime. database/privilegios-runtime.sql contiene grants/revokes; aplicarlos con el propietario después de instalar. Versiones nuevas con DDL deben migrarse con credencial del propietario antes de ejecutar con runtime.
8. Probar venta, traslado, pedido, 403, auditoría y persistencia tras reiniciar. Capturar URL, fecha, estado saludable y operaciones, sin conexiones/secretos visibles. Solo entonces estará comprobada la entrega en nube.

Conexión interna de Render: DATABASE_SSL=false si el proveedor no exige TLS interno. Para conexión externa que exige TLS usar DATABASE_SSL=true y certificados verificables. No desactivar rejectUnauthorized. El proveedor/infraestructura debe resolver TLS; la configuración no es una prueba de que ya exista.

## Docker local

compose.yaml incluye PostgreSQL y volumen pgdata. Para demo HTTP local usar DEMO_MODE=true y APP_ORIGIN=http://localhost:3001; para producción DEMO_MODE=false exige APP_ORIGIN HTTPS y clave AES, con proxy TLS configurado. Agregar POSTGRES_PASSWORD fuerte y JWT_SECRET a .env, ejecutar docker compose up --build -d. No afirmar validación Docker completa: el daemon del equipo no permitió esta ejecución; se usó PostgreSQL embebido para compatibilidad SQL.

La ampliación no migra automáticamente tus operaciones SQLite a PostgreSQL. Para nube nueva se crean estructuras y se registran datos; transportar historia local requiere un procedimiento de migración específico que preserve hashes, relaciones y claves de cifrado.
`,
'docs/ITERACIONES-RUP-DESARROLLO.md':`# Iteraciones de desarrollo y relación con RUP

Este registro es técnico. Las visiones, arquitectura de negocio, factibilidades y E-R serán completadas por el estudiante.

| Fase | Iteración técnica | Artefacto |
|---|---|---|
| Inicio | Alcance React/Node/MVC, excepción de PostgreSQL en nube, responsabilidades | README y AMPLIACION |
| Elaboración | Contratos, entidades y transacciones del prototipo inicial | Modelo, esquema y arquitectura técnica |
| Construcción 1 | Nueve módulos operativos, FEFO, caja, traslados, pedidos, planilla y CSV | Evidencia inicial conservada |
| Elaboración ampliada | Cuatro actores, matriz de permisos, sesiones y baja lógica | permissions.js y migraciones |
| Construcción 2 | Cookies/refresh/2FA, CSRF, Zod, AES y bitácora encadenada | Modelos de autenticación/auditoría y pruebas de seguridad |
| Construcción 3 | Clientes, turnos, kardex, recetas, CRUD, solicitudes y reversos | Management, Operations y tests operativos |
| Construcción 4 | Ranking con cola/horario, riesgo/mapa, historiales, Excel/PDF y Swagger | Modelos, reportes, OpenAPI y capturas |
| Transición local | Validación API/Chrome, móvil/tablet, build, esquema real y guion | evidencia/ampliacion y GUION-DEMO |
| Transición nube | Preparación actualizada; publicación aplazada por el estudiante | render.yaml, compose.yaml y DESPLIEGUE |

Criterio local: operaciones autorizadas modifican stock/caja y audit de manera atómica; roles rechazan acciones ajenas; simulación detecta copia alterada; interfaz completa el flujo. Criterio pendiente de nube: URL HTTPS PostgreSQL real, respaldos/privilegios configurados, persistencia tras reinicio y evidencia desde el proveedor. Una prueba PGlite no cierra ese criterio.
`,
'docs/EVIDENCIA-DESARROLLO.md':`# Evidencia del desarrollo v2

Fecha: 4 de octubre de 2026, America/Guatemala. Datos ficticios. Desarrollo MVC y documentación técnica; análisis de negocio, visiones, factibilidad y E-R a cargo del estudiante.

| Proceso | Artefacto verificable |
|---|---|
| Preservación de datos | data/backups/antes-ampliacion-*.sqlite, backup-local.mjs |
| Persistencia y migración | 31 tablas; schema.js, migrations.js; database/postgresql.sql y estructura-real.json |
| Roles y aislamiento | permissions.js, Authentication, controladores; pruebas API 403 y sucursal enviada ignorada |
| Autenticación y protección | Cookie HttpOnly/Strict, TOTP, revocación, rotación, CSRF/origen; security.test.js y API |
| Auditoría | Triggers, cadena/ancla, verificar/simular; pruebas SQLite y PostgreSQL embebido |
| Operaciones sensibles | Cuatro ojos, contra-asientos, conservaciones y repago; operations.test.js |
| Interfaz | Chrome local, cuatro contextos, navegación, venta/cierre/pedido/entrega/auditoría, tablet/móvil |
| Reportes y contratos | Excel leído con ExcelJS, PDF válido, Swagger navegable |
| Dependencias | npm-audit.json y captura del resultado real |
| Preparación nube | Blueprint, Docker, variables, grants y guía; no publicado |

La [galería actual](../evidencia/ampliacion/index.html) reúne pruebas-modelo.tap, pruebas-api.json, pruebas-ui.json, http-seguridad.json, npm-audit.json, capturas y ejemplos xlsx/pdf. Los conteos se calculan a partir de esos resultados, no de una lista de funcionalidades declaradas.

Las pruebas de navegador se ejecutaron sobre una API compilada y una base SQLite QA separada. Los horarios de QA usan reloj de negocio fijo, indicado en el JSON; sesiones/TOTP se validan con reloj real. Los scripts no alteran datos ni configuración 2FA de tu base normal. Las capturas de QR lo ocultan.

La evidencia HTTP se obtuvo con fetch y no se presenta como Postman. El bloqueo muestra cinco fallos y rechazo del sexto intento con clave válida, conservando el mensaje genérico. El script prueba SQL como dato y sucursal falsificada; no constituye un pentest completo. La demostración de alteración usa copia en memoria; los triggers de la bitácora real se prueban mediante SQL rechazado.

Los reportes previos en evidencia/index.html y los scripts originales pertenecen a la versión inicial. Ejecutar los comandos actuales de package.json para v2. Docker no pudo validarse debido al daemon local; PGlite verifica SQL y restricciones sin demostrar red/TLS/aislamiento de procesos externos. La publicación real y los entregables de análisis del estudiante siguen pendientes.
`
};
for(const [path,body]of Object.entries(docs))writeFileSync(path,body);
console.log('Documentación técnica v2 actualizada.');
