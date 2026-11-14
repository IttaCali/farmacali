-- Preparación de producción, ejecutar con el propietario DESPUÉS de instalar/migrar.
-- Crear farmared_runtime y su contraseña mediante el proveedor/gestor de secretos.
-- No contiene contraseña, no se ejecuta automáticamente ni se aplicó a una nube.
-- Cambiar el nombre de base si el proveedor usa otro identificador.
GRANT CONNECT ON DATABASE farmared TO farmared_runtime;
GRANT USAGE ON SCHEMA public TO farmared_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO farmared_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM farmared_runtime;
REVOKE CREATE ON SCHEMA public FROM farmared_runtime;
-- Evitar que la concesión PUBLIC del esquema permita crear por herencia.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- El runtime no debe ser dueño de tablas/esquema ni miembro del rol propietario.
-- DDL de migraciones nuevas se ejecuta separadamente con credencial del propietario.
