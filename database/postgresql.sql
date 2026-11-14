-- FarmaCali v2: esquema REAL después de las migraciones. PostgreSQL.
-- Referencia técnica/insumo E-R; la aplicación instala esquema, roles y migraciones mediante initialize().
-- No ejecutar manualmente sobre una instalación existente. Sin datos ni credenciales.
BEGIN;
CREATE TABLE "asset_depreciation" (
  "id" text NOT NULL,
  "asset_id" text NOT NULL,
  "period" text NOT NULL,
  "original_cents" integer NOT NULL,
  "depreciation_cents" integer NOT NULL,
  "net_cents" integer NOT NULL,
  "created_at" text NOT NULL,
  "created_by" text NOT NULL
);

CREATE TABLE "asset_incidents" (
  "id" text NOT NULL,
  "asset_id" text NOT NULL,
  "branch_id" text NOT NULL,
  "description" text NOT NULL,
  "status" text NOT NULL DEFAULT 'Reportada'::text,
  "resolution" text,
  "created_at" text NOT NULL,
  "created_by" text NOT NULL,
  "resolved_at" text,
  "resolved_by" text
);

CREATE TABLE "assets" (
  "id" text NOT NULL,
  "branch_id" text NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "value_cents" integer NOT NULL,
  "acquired_on" text NOT NULL,
  "useful_life_months" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'Activo'::text,
  "deactivated_at" text,
  "deactivated_by" text,
  "deactivation_reason" text
);

CREATE TABLE "audit_head" (
  "id" text NOT NULL,
  "sequence" integer NOT NULL,
  "last_hash" text NOT NULL
);

CREATE TABLE "audit_log" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "action" text NOT NULL,
  "entity" text NOT NULL,
  "entity_id" text NOT NULL,
  "details" text NOT NULL,
  "created_at" text NOT NULL,
  "sequence" integer,
  "previous_hash" text,
  "current_hash" text,
  "role_code" text NOT NULL DEFAULT 'legacy'::text,
  "branch_id" text,
  "before_value" text,
  "after_value" text,
  "ip" text NOT NULL DEFAULT 'local'::text
);

CREATE TABLE "auth_challenges" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "purpose" text NOT NULL,
  "secret_cipher" text,
  "expires_at" text NOT NULL,
  "consumed" integer NOT NULL DEFAULT 0
);

CREATE TABLE "branches" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "department" text NOT NULL,
  "address" text NOT NULL,
  "type" text NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "active" integer NOT NULL DEFAULT 1,
  "opens_at" text NOT NULL DEFAULT '07:00'::text,
  "closes_at" text NOT NULL DEFAULT '22:00'::text,
  "state" text NOT NULL DEFAULT 'Activo'::text,
  "deactivated_at" text,
  "deactivated_by" text,
  "deactivation_reason" text
);

CREATE TABLE "cash_movements" (
  "id" text NOT NULL,
  "branch_id" text NOT NULL,
  "kind" text NOT NULL,
  "category" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "method" text NOT NULL,
  "description" text NOT NULL,
  "created_at" text NOT NULL,
  "created_by" text NOT NULL
);

CREATE TABLE "cash_shifts" (
  "id" text NOT NULL,
  "branch_id" text NOT NULL,
  "user_id" text NOT NULL,
  "opening_cents" integer NOT NULL,
  "opened_at" text NOT NULL,
  "closed_at" text,
  "expected_cents" integer,
  "counted_cents" integer,
  "difference_cents" integer,
  "state" text NOT NULL DEFAULT 'Abierto'::text,
  "notes" text NOT NULL DEFAULT ''::text
);

CREATE TABLE "client_addresses" (
  "id" text NOT NULL,
  "client_id" text NOT NULL,
  "label" text NOT NULL,
  "address" text NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL
);

CREATE TABLE "clients" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "nit" text NOT NULL DEFAULT 'CF'::text,
  "cui_cipher" text,
  "phone" text NOT NULL,
  "address" text NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "state" text NOT NULL DEFAULT 'Activo'::text,
  "deactivated_at" text,
  "deactivated_by" text,
  "deactivation_reason" text
);

CREATE TABLE "counter_sales" (
  "request_id" text NOT NULL,
  "payload_hash" text NOT NULL,
  "order_id" text NOT NULL
);

CREATE TABLE "delivery_assignments" (
  "order_id" text NOT NULL,
  "courier_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'Asignado'::text,
  "lat" double precision,
  "lng" double precision,
  "accuracy" double precision,
  "location_at" text,
  "location_source" text,
  "assigned_at" text NOT NULL,
  "assigned_by" text NOT NULL
);

CREATE TABLE "delivery_points" (
  "id" text NOT NULL,
  "order_id" text NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "accuracy" double precision,
  "source" text NOT NULL,
  "created_at" text NOT NULL,
  "user_id" text NOT NULL
);

CREATE TABLE "employees" (
  "id" text NOT NULL,
  "branch_id" text NOT NULL,
  "name" text NOT NULL,
  "position" text NOT NULL,
  "salary_cents" integer NOT NULL,
  "active" integer NOT NULL DEFAULT 1,
  "salary_cipher" text,
  "state" text NOT NULL DEFAULT 'Activo'::text,
  "user_id" text,
  "deactivated_at" text,
  "deactivated_by" text,
  "deactivation_reason" text
);

CREATE TABLE "entity_history" (
  "id" text NOT NULL,
  "entity" text NOT NULL,
  "entity_id" text NOT NULL,
  "event" text NOT NULL,
  "details" text NOT NULL,
  "created_at" text NOT NULL,
  "created_by" text NOT NULL
);

CREATE TABLE "inventory" (
  "id" text NOT NULL,
  "branch_id" text NOT NULL,
  "product_id" text NOT NULL,
  "lot" text NOT NULL,
  "expires_on" text NOT NULL,
  "quantity" integer NOT NULL,
  "minimum" integer NOT NULL DEFAULT 20
);

CREATE TABLE "inventory_costs" (
  "inventory_id" text NOT NULL,
  "unit_cost_cents" integer NOT NULL DEFAULT 0,
  "known" integer NOT NULL DEFAULT 0
);

CREATE TABLE "order_item_costs" (
  "item_id" text NOT NULL,
  "unit_cost_cents" integer NOT NULL,
  "known" integer NOT NULL DEFAULT 0
);

CREATE TABLE "order_items" (
  "id" text NOT NULL,
  "order_id" text NOT NULL,
  "inventory_id" text NOT NULL,
  "product_id" text NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price_cents" integer NOT NULL
);

CREATE TABLE "orders" (
  "id" text NOT NULL,
  "branch_id" text NOT NULL,
  "customer" text NOT NULL,
  "phone" text NOT NULL,
  "address" text NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "payment" text NOT NULL,
  "total_cents" integer NOT NULL,
  "eta_minutes" integer NOT NULL,
  "status" text NOT NULL,
  "prescription_confirmed" integer NOT NULL DEFAULT 0,
  "created_at" text NOT NULL,
  "delivered_at" text,
  "created_by" text NOT NULL,
  "client_id" text,
  "channel" text NOT NULL DEFAULT 'telefono'::text,
  "nit" text NOT NULL DEFAULT 'CF'::text,
  "prescription_id" text,
  "discount_percent" double precision NOT NULL DEFAULT 0,
  "fulfillment" text NOT NULL DEFAULT 'delivery'::text
);

CREATE TABLE "payroll" (
  "id" text NOT NULL,
  "employee_id" text NOT NULL,
  "period" text NOT NULL,
  "gross_cents" integer NOT NULL,
  "deductions_cents" integer NOT NULL,
  "net_cents" integer NOT NULL,
  "created_at" text NOT NULL,
  "state" text NOT NULL DEFAULT 'Pagado'::text,
  "branch_id" text
);

CREATE TABLE "payroll_benefits" (
  "id" text NOT NULL,
  "employee_id" text NOT NULL,
  "kind" text NOT NULL,
  "period" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "reason" text NOT NULL,
  "created_at" text NOT NULL,
  "created_by" text NOT NULL
);

CREATE TABLE "payroll_details" (
  "payroll_id" text NOT NULL,
  "breakdown_cipher" text NOT NULL
);

CREATE TABLE "payroll_inputs" (
  "employee_id" text NOT NULL,
  "period" text NOT NULL,
  "days" integer NOT NULL DEFAULT 30,
  "bonus_cents" integer NOT NULL DEFAULT 0,
  "overtime_cents" integer NOT NULL DEFAULT 0,
  "isr_cents" integer NOT NULL DEFAULT 0,
  "other_cents" integer NOT NULL DEFAULT 0,
  "other_reason" text NOT NULL DEFAULT ''::text,
  "social_security" integer NOT NULL DEFAULT 0
);

CREATE TABLE "payroll_rules" (
  "id" text NOT NULL,
  "settings" text NOT NULL,
  "updated_at" text NOT NULL,
  "updated_by" text
);

CREATE TABLE "permissions" (
  "code" text NOT NULL,
  "description" text NOT NULL
);

CREATE TABLE "portal_access_guards" (
  "ticket" text NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "locked_until" text
);

CREATE TABLE "portal_cancellations" (
  "order_id" text NOT NULL,
  "phone_hash" text NOT NULL,
  "dpi_hash" text,
  "reason" text NOT NULL,
  "created_at" text NOT NULL
);

CREATE TABLE "portal_clients" (
  "dpi_hash" text NOT NULL,
  "client_id" text NOT NULL
);

CREATE TABLE "portal_credentials" (
  "order_id" text NOT NULL,
  "code_cipher" text NOT NULL
);

CREATE TABLE "portal_orders" (
  "order_id" text NOT NULL,
  "ticket" text NOT NULL,
  "access_hash" text NOT NULL,
  "request_hash" text NOT NULL,
  "payload_hash" text NOT NULL,
  "ready_estimate" text NOT NULL,
  "expires_at" text,
  "created_at" text NOT NULL
);

CREATE TABLE "portal_prescriptions" (
  "order_id" text NOT NULL,
  "image_cipher" text NOT NULL,
  "mime" text NOT NULL,
  "review_status" text NOT NULL DEFAULT 'Pendiente'::text,
  "reviewed_by" text,
  "reviewed_at" text,
  "notes" text NOT NULL DEFAULT ''::text
);

CREATE TABLE "prescription_versions" (
  "id" text NOT NULL,
  "order_id" text NOT NULL,
  "image_cipher" text NOT NULL,
  "mime" text NOT NULL,
  "review_status" text NOT NULL,
  "reviewed_by" text,
  "reviewed_at" text,
  "notes" text NOT NULL,
  "created_at" text NOT NULL
);

CREATE TABLE "prescriptions" (
  "id" text NOT NULL,
  "customer_name" text NOT NULL,
  "doctor" text NOT NULL,
  "license" text NOT NULL,
  "issued_on" text NOT NULL,
  "product_id" text NOT NULL,
  "notes" text NOT NULL DEFAULT ''::text,
  "created_by" text NOT NULL,
  "created_at" text NOT NULL
);

CREATE TABLE "procurement_actions" (
  "request_id" text NOT NULL,
  "entity_id" text NOT NULL,
  "payload_hash" text NOT NULL
);

CREATE TABLE "products" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "sku" text NOT NULL,
  "category" text NOT NULL,
  "price_cents" integer NOT NULL,
  "prescription" integer NOT NULL DEFAULT 0,
  "controlled" integer NOT NULL DEFAULT 0,
  "state" text NOT NULL DEFAULT 'Activo'::text,
  "deactivated_at" text,
  "deactivated_by" text,
  "deactivation_reason" text,
  "component" text NOT NULL DEFAULT ''::text
);

CREATE TABLE "purchase_lines" (
  "id" text NOT NULL,
  "purchase_id" text NOT NULL,
  "product_id" text NOT NULL,
  "quantity" integer NOT NULL,
  "unit_cost_cents" integer NOT NULL,
  "received" integer NOT NULL DEFAULT 0
);

CREATE TABLE "purchase_orders" (
  "id" text NOT NULL,
  "supplier_id" text NOT NULL,
  "branch_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'Borrador'::text,
  "payment" text NOT NULL DEFAULT 'Transferencia'::text,
  "notes" text NOT NULL DEFAULT ''::text,
  "created_at" text NOT NULL,
  "created_by" text NOT NULL
);

CREATE TABLE "purchase_receipts" (
  "id" text NOT NULL,
  "purchase_id" text NOT NULL,
  "line_id" text NOT NULL,
  "inventory_id" text NOT NULL,
  "quantity" integer NOT NULL,
  "unit_cost_cents" integer NOT NULL,
  "returned" integer NOT NULL DEFAULT 0,
  "document" text NOT NULL,
  "created_at" text NOT NULL,
  "created_by" text NOT NULL
);

CREATE TABLE "recovery_codes" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "code_hash" text NOT NULL,
  "used_at" text,
  "created_at" text NOT NULL
);

CREATE TABLE "requests" (
  "id" text NOT NULL,
  "type" text NOT NULL,
  "entity_id" text NOT NULL,
  "payload" text NOT NULL,
  "requester_id" text NOT NULL,
  "approver_id" text,
  "status" text NOT NULL DEFAULT 'Pendiente'::text,
  "reason" text NOT NULL,
  "decision_reason" text,
  "created_at" text NOT NULL,
  "resolved_at" text
);

CREATE TABLE "role_permissions" (
  "role_id" text NOT NULL,
  "permission_code" text NOT NULL
);

CREATE TABLE "roles" (
  "id" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT ''::text,
  "scope" text NOT NULL DEFAULT 'all'::text,
  "require_totp" integer NOT NULL DEFAULT 0
);

CREATE TABLE "salary_history" (
  "id" text NOT NULL,
  "employee_id" text NOT NULL,
  "salary_cipher" text NOT NULL,
  "reason" text NOT NULL,
  "created_at" text NOT NULL,
  "created_by" text NOT NULL
);

CREATE TABLE "schema_migrations" (
  "version" integer NOT NULL,
  "applied_at" text NOT NULL
);

CREATE TABLE "sessions" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "refresh_hash" text NOT NULL,
  "csrf_hash" text NOT NULL,
  "ip" text NOT NULL,
  "created_at" text NOT NULL,
  "expires_at" text NOT NULL,
  "last_seen" text NOT NULL,
  "revoked" integer NOT NULL DEFAULT 0
);

CREATE TABLE "simulated_messages" (
  "id" text NOT NULL,
  "phone_hash" text NOT NULL,
  "phone_cipher" text NOT NULL,
  "order_id" text,
  "kind" text NOT NULL,
  "text_cipher" text NOT NULL,
  "created_at" text NOT NULL,
  "read_at" text
);

CREATE TABLE "stock_ledger" (
  "id" text NOT NULL,
  "branch_id" text NOT NULL,
  "product_id" text NOT NULL,
  "inventory_id" text,
  "quantity" integer NOT NULL,
  "type" text NOT NULL,
  "reference_id" text NOT NULL,
  "reason" text NOT NULL,
  "created_at" text NOT NULL,
  "user_id" text NOT NULL
);

CREATE TABLE "supplier_returns" (
  "id" text NOT NULL,
  "receipt_id" text NOT NULL,
  "quantity" integer NOT NULL,
  "amount_cents" integer NOT NULL,
  "reason" text NOT NULL,
  "credit_note" text NOT NULL,
  "status" text NOT NULL DEFAULT 'Pendiente de reembolso'::text,
  "created_at" text NOT NULL,
  "created_by" text NOT NULL
);

CREATE TABLE "suppliers" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "nit" text NOT NULL,
  "phone" text NOT NULL,
  "email" text NOT NULL DEFAULT ''::text,
  "address" text NOT NULL DEFAULT ''::text,
  "active" integer NOT NULL DEFAULT 1
);

CREATE TABLE "transfer_costs" (
  "transfer_id" text NOT NULL,
  "unit_cost_cents" integer NOT NULL,
  "known" integer NOT NULL DEFAULT 0
);

CREATE TABLE "transfer_drafts" (
  "id" text NOT NULL,
  "inventory_id" text NOT NULL,
  "destination_id" text NOT NULL,
  "quantity" integer NOT NULL,
  "state" text NOT NULL DEFAULT 'Borrador'::text,
  "created_by" text NOT NULL,
  "created_at" text NOT NULL,
  "reason" text
);

CREATE TABLE "transfers" (
  "id" text NOT NULL,
  "source_id" text NOT NULL,
  "destination_id" text NOT NULL,
  "product_id" text NOT NULL,
  "lot" text NOT NULL,
  "expires_on" text NOT NULL,
  "quantity" integer NOT NULL,
  "status" text NOT NULL,
  "created_at" text NOT NULL,
  "received_at" text,
  "created_by" text NOT NULL,
  "received_quantity" integer,
  "difference_reason" text
);

CREATE TABLE "used_refresh_tokens" (
  "token_hash" text NOT NULL,
  "session_id" text NOT NULL
);

CREATE TABLE "users" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text NOT NULL,
  "role_id" text,
  "branch_id" text,
  "state" text NOT NULL DEFAULT 'Activo'::text,
  "failed_attempts" integer NOT NULL DEFAULT 0,
  "locked_until" text,
  "must_change_password" integer NOT NULL DEFAULT 0,
  "totp_cipher" text,
  "totp_enabled" integer NOT NULL DEFAULT 0,
  "last_totp_step" integer NOT NULL DEFAULT '-1'::integer,
  "deactivated_at" text,
  "deactivated_by" text,
  "deactivation_reason" text
);

CREATE TABLE "voided_records" (
  "id" text NOT NULL,
  "entity" text NOT NULL,
  "entity_id" text NOT NULL,
  "reason" text NOT NULL,
  "created_at" text NOT NULL,
  "created_by" text NOT NULL
);

ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_asset_id_not_null" NOT NULL asset_id;

ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_asset_id_period_key" UNIQUE (asset_id, period);

ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_created_at_not_null" NOT NULL created_at;

ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_created_by_not_null" NOT NULL created_by;

ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_depreciation_cents_not_null" NOT NULL depreciation_cents;

ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_id_not_null" NOT NULL id;

ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_net_cents_not_null" NOT NULL net_cents;

ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_original_cents_not_null" NOT NULL original_cents;

ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_period_not_null" NOT NULL period;

ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_pkey" PRIMARY KEY (id);

ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_asset_id_not_null" NOT NULL asset_id;

ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_branch_id_not_null" NOT NULL branch_id;

ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_created_at_not_null" NOT NULL created_at;

ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_created_by_not_null" NOT NULL created_by;

ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_description_not_null" NOT NULL description;

ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_id_not_null" NOT NULL id;

ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_pkey" PRIMARY KEY (id);

ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_status_not_null" NOT NULL status;

ALTER TABLE "assets" ADD CONSTRAINT "assets_acquired_on_not_null" NOT NULL acquired_on;

ALTER TABLE "assets" ADD CONSTRAINT "assets_branch_id_not_null" NOT NULL branch_id;

ALTER TABLE "assets" ADD CONSTRAINT "assets_code_key" UNIQUE (code);

ALTER TABLE "assets" ADD CONSTRAINT "assets_code_not_null" NOT NULL code;

ALTER TABLE "assets" ADD CONSTRAINT "assets_id_not_null" NOT NULL id;

ALTER TABLE "assets" ADD CONSTRAINT "assets_name_not_null" NOT NULL name;

ALTER TABLE "assets" ADD CONSTRAINT "assets_pkey" PRIMARY KEY (id);

ALTER TABLE "assets" ADD CONSTRAINT "assets_status_not_null" NOT NULL status;

ALTER TABLE "assets" ADD CONSTRAINT "assets_useful_life_months_check" CHECK ((useful_life_months > 0));

ALTER TABLE "assets" ADD CONSTRAINT "assets_useful_life_months_not_null" NOT NULL useful_life_months;

ALTER TABLE "assets" ADD CONSTRAINT "assets_value_cents_check" CHECK ((value_cents > 0));

ALTER TABLE "assets" ADD CONSTRAINT "assets_value_cents_not_null" NOT NULL value_cents;

ALTER TABLE "audit_head" ADD CONSTRAINT "audit_head_id_not_null" NOT NULL id;

ALTER TABLE "audit_head" ADD CONSTRAINT "audit_head_last_hash_not_null" NOT NULL last_hash;

ALTER TABLE "audit_head" ADD CONSTRAINT "audit_head_pkey" PRIMARY KEY (id);

ALTER TABLE "audit_head" ADD CONSTRAINT "audit_head_sequence_not_null" NOT NULL sequence;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_not_null" NOT NULL action;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_created_at_not_null" NOT NULL created_at;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_details_not_null" NOT NULL details;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_entity_id_not_null" NOT NULL entity_id;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_entity_not_null" NOT NULL entity;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_id_not_null" NOT NULL id;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_ip_not_null" NOT NULL ip;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY (id);

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_role_code_not_null" NOT NULL role_code;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_not_null" NOT NULL user_id;

ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_consumed_not_null" NOT NULL consumed;

ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_expires_at_not_null" NOT NULL expires_at;

ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_id_not_null" NOT NULL id;

ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_pkey" PRIMARY KEY (id);

ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_purpose_not_null" NOT NULL purpose;

ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_token_hash_key" UNIQUE (token_hash);

ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_token_hash_not_null" NOT NULL token_hash;

ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_not_null" NOT NULL user_id;

ALTER TABLE "branches" ADD CONSTRAINT "branches_active_not_null" NOT NULL active;

ALTER TABLE "branches" ADD CONSTRAINT "branches_address_not_null" NOT NULL address;

ALTER TABLE "branches" ADD CONSTRAINT "branches_closes_at_not_null" NOT NULL closes_at;

ALTER TABLE "branches" ADD CONSTRAINT "branches_department_not_null" NOT NULL department;

ALTER TABLE "branches" ADD CONSTRAINT "branches_id_not_null" NOT NULL id;

ALTER TABLE "branches" ADD CONSTRAINT "branches_lat_not_null" NOT NULL lat;

ALTER TABLE "branches" ADD CONSTRAINT "branches_lng_not_null" NOT NULL lng;

ALTER TABLE "branches" ADD CONSTRAINT "branches_name_not_null" NOT NULL name;

ALTER TABLE "branches" ADD CONSTRAINT "branches_opens_at_not_null" NOT NULL opens_at;

ALTER TABLE "branches" ADD CONSTRAINT "branches_pkey" PRIMARY KEY (id);

ALTER TABLE "branches" ADD CONSTRAINT "branches_state_not_null" NOT NULL state;

ALTER TABLE "branches" ADD CONSTRAINT "branches_type_check" CHECK ((type = ANY (ARRAY['Centro comercial'::text, 'Gasolinera'::text])));

ALTER TABLE "branches" ADD CONSTRAINT "branches_type_not_null" NOT NULL type;

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_amount_cents_check" CHECK ((amount_cents > 0));

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_amount_cents_not_null" NOT NULL amount_cents;

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_branch_id_not_null" NOT NULL branch_id;

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_category_not_null" NOT NULL category;

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_at_not_null" NOT NULL created_at;

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_not_null" NOT NULL created_by;

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_description_not_null" NOT NULL description;

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_id_not_null" NOT NULL id;

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_kind_check" CHECK ((kind = ANY (ARRAY['Ingreso'::text, 'Egreso'::text])));

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_kind_not_null" NOT NULL kind;

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_method_check" CHECK ((method = ANY (ARRAY['Efectivo'::text, 'Tarjeta'::text, 'Transferencia'::text])));

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_method_not_null" NOT NULL method;

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_pkey" PRIMARY KEY (id);

ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_branch_id_not_null" NOT NULL branch_id;

ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_id_not_null" NOT NULL id;

ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_notes_not_null" NOT NULL notes;

ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_opened_at_not_null" NOT NULL opened_at;

ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_opening_cents_not_null" NOT NULL opening_cents;

ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_pkey" PRIMARY KEY (id);

ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_state_not_null" NOT NULL state;

ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_user_id_not_null" NOT NULL user_id;

ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_address_not_null" NOT NULL address;

ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_client_id_not_null" NOT NULL client_id;

ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_id_not_null" NOT NULL id;

ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_label_not_null" NOT NULL label;

ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_lat_not_null" NOT NULL lat;

ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_lng_not_null" NOT NULL lng;

ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_pkey" PRIMARY KEY (id);

ALTER TABLE "clients" ADD CONSTRAINT "clients_address_not_null" NOT NULL address;

ALTER TABLE "clients" ADD CONSTRAINT "clients_id_not_null" NOT NULL id;

ALTER TABLE "clients" ADD CONSTRAINT "clients_lat_not_null" NOT NULL lat;

ALTER TABLE "clients" ADD CONSTRAINT "clients_lng_not_null" NOT NULL lng;

ALTER TABLE "clients" ADD CONSTRAINT "clients_name_not_null" NOT NULL name;

ALTER TABLE "clients" ADD CONSTRAINT "clients_nit_not_null" NOT NULL nit;

ALTER TABLE "clients" ADD CONSTRAINT "clients_phone_not_null" NOT NULL phone;

ALTER TABLE "clients" ADD CONSTRAINT "clients_pkey" PRIMARY KEY (id);

ALTER TABLE "clients" ADD CONSTRAINT "clients_state_not_null" NOT NULL state;

ALTER TABLE "counter_sales" ADD CONSTRAINT "counter_sales_order_id_not_null" NOT NULL order_id;

ALTER TABLE "counter_sales" ADD CONSTRAINT "counter_sales_payload_hash_not_null" NOT NULL payload_hash;

ALTER TABLE "counter_sales" ADD CONSTRAINT "counter_sales_pkey" PRIMARY KEY (request_id);

ALTER TABLE "counter_sales" ADD CONSTRAINT "counter_sales_request_id_not_null" NOT NULL request_id;

ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_assigned_at_not_null" NOT NULL assigned_at;

ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_assigned_by_not_null" NOT NULL assigned_by;

ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_courier_id_not_null" NOT NULL courier_id;

ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_order_id_not_null" NOT NULL order_id;

ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY (order_id);

ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_status_not_null" NOT NULL status;

ALTER TABLE "delivery_points" ADD CONSTRAINT "delivery_points_created_at_not_null" NOT NULL created_at;

ALTER TABLE "delivery_points" ADD CONSTRAINT "delivery_points_id_not_null" NOT NULL id;

ALTER TABLE "delivery_points" ADD CONSTRAINT "delivery_points_lat_not_null" NOT NULL lat;

ALTER TABLE "delivery_points" ADD CONSTRAINT "delivery_points_lng_not_null" NOT NULL lng;

ALTER TABLE "delivery_points" ADD CONSTRAINT "delivery_points_order_id_not_null" NOT NULL order_id;

ALTER TABLE "delivery_points" ADD CONSTRAINT "delivery_points_pkey" PRIMARY KEY (id);

ALTER TABLE "delivery_points" ADD CONSTRAINT "delivery_points_source_not_null" NOT NULL source;

ALTER TABLE "delivery_points" ADD CONSTRAINT "delivery_points_user_id_not_null" NOT NULL user_id;

ALTER TABLE "employees" ADD CONSTRAINT "employees_active_not_null" NOT NULL active;

ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_not_null" NOT NULL branch_id;

ALTER TABLE "employees" ADD CONSTRAINT "employees_id_not_null" NOT NULL id;

ALTER TABLE "employees" ADD CONSTRAINT "employees_name_not_null" NOT NULL name;

ALTER TABLE "employees" ADD CONSTRAINT "employees_pkey" PRIMARY KEY (id);

ALTER TABLE "employees" ADD CONSTRAINT "employees_position_not_null" NOT NULL "position";

ALTER TABLE "employees" ADD CONSTRAINT "employees_salary_cents_check" CHECK ((salary_cents > 0));

ALTER TABLE "employees" ADD CONSTRAINT "employees_salary_cents_not_null" NOT NULL salary_cents;

ALTER TABLE "employees" ADD CONSTRAINT "employees_state_not_null" NOT NULL state;

ALTER TABLE "entity_history" ADD CONSTRAINT "entity_history_created_at_not_null" NOT NULL created_at;

ALTER TABLE "entity_history" ADD CONSTRAINT "entity_history_created_by_not_null" NOT NULL created_by;

ALTER TABLE "entity_history" ADD CONSTRAINT "entity_history_details_not_null" NOT NULL details;

ALTER TABLE "entity_history" ADD CONSTRAINT "entity_history_entity_id_not_null" NOT NULL entity_id;

ALTER TABLE "entity_history" ADD CONSTRAINT "entity_history_entity_not_null" NOT NULL entity;

ALTER TABLE "entity_history" ADD CONSTRAINT "entity_history_event_not_null" NOT NULL event;

ALTER TABLE "entity_history" ADD CONSTRAINT "entity_history_id_not_null" NOT NULL id;

ALTER TABLE "entity_history" ADD CONSTRAINT "entity_history_pkey" PRIMARY KEY (id);

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_branch_id_not_null" NOT NULL branch_id;

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_branch_id_product_id_lot_key" UNIQUE (branch_id, product_id, lot);

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_expires_on_not_null" NOT NULL expires_on;

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_id_not_null" NOT NULL id;

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_lot_not_null" NOT NULL lot;

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_minimum_not_null" NOT NULL minimum;

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_pkey" PRIMARY KEY (id);

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_not_null" NOT NULL product_id;

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_quantity_check" CHECK ((quantity >= 0));

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_quantity_not_null" NOT NULL quantity;

ALTER TABLE "inventory_costs" ADD CONSTRAINT "inventory_costs_inventory_id_not_null" NOT NULL inventory_id;

ALTER TABLE "inventory_costs" ADD CONSTRAINT "inventory_costs_known_not_null" NOT NULL known;

ALTER TABLE "inventory_costs" ADD CONSTRAINT "inventory_costs_pkey" PRIMARY KEY (inventory_id);

ALTER TABLE "inventory_costs" ADD CONSTRAINT "inventory_costs_unit_cost_cents_not_null" NOT NULL unit_cost_cents;

ALTER TABLE "order_item_costs" ADD CONSTRAINT "order_item_costs_item_id_not_null" NOT NULL item_id;

ALTER TABLE "order_item_costs" ADD CONSTRAINT "order_item_costs_known_not_null" NOT NULL known;

ALTER TABLE "order_item_costs" ADD CONSTRAINT "order_item_costs_pkey" PRIMARY KEY (item_id);

ALTER TABLE "order_item_costs" ADD CONSTRAINT "order_item_costs_unit_cost_cents_not_null" NOT NULL unit_cost_cents;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_id_not_null" NOT NULL id;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_inventory_id_not_null" NOT NULL inventory_id;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_not_null" NOT NULL order_id;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_pkey" PRIMARY KEY (id);

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_not_null" NOT NULL product_id;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_check" CHECK ((quantity > 0));

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_not_null" NOT NULL quantity;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_cents_not_null" NOT NULL unit_price_cents;

ALTER TABLE "orders" ADD CONSTRAINT "orders_address_not_null" NOT NULL address;

ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_not_null" NOT NULL branch_id;

ALTER TABLE "orders" ADD CONSTRAINT "orders_channel_not_null" NOT NULL channel;

ALTER TABLE "orders" ADD CONSTRAINT "orders_created_at_not_null" NOT NULL created_at;

ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_not_null" NOT NULL created_by;

ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_not_null" NOT NULL customer;

ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_percent_check" CHECK (((discount_percent >= (0)::double precision) AND (discount_percent <= (50)::double precision)));

ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_percent_not_null" NOT NULL discount_percent;

ALTER TABLE "orders" ADD CONSTRAINT "orders_eta_minutes_not_null" NOT NULL eta_minutes;

ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_check" CHECK ((fulfillment = ANY (ARRAY['delivery'::text, 'pickup'::text])));

ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_not_null" NOT NULL fulfillment;

ALTER TABLE "orders" ADD CONSTRAINT "orders_id_not_null" NOT NULL id;

ALTER TABLE "orders" ADD CONSTRAINT "orders_lat_not_null" NOT NULL lat;

ALTER TABLE "orders" ADD CONSTRAINT "orders_lng_not_null" NOT NULL lng;

ALTER TABLE "orders" ADD CONSTRAINT "orders_nit_not_null" NOT NULL nit;

ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_check" CHECK ((payment = ANY (ARRAY['Efectivo'::text, 'Tarjeta'::text, 'Transferencia'::text])));

ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_not_null" NOT NULL payment;

ALTER TABLE "orders" ADD CONSTRAINT "orders_phone_not_null" NOT NULL phone;

ALTER TABLE "orders" ADD CONSTRAINT "orders_pkey" PRIMARY KEY (id);

ALTER TABLE "orders" ADD CONSTRAINT "orders_prescription_confirmed_not_null" NOT NULL prescription_confirmed;

ALTER TABLE "orders" ADD CONSTRAINT "orders_status_check" CHECK ((status = ANY (ARRAY['Pendiente'::text, 'Preparando'::text, 'En ruta'::text, 'Listo para recoger'::text, 'Entregado'::text, 'Cancelado'::text])));

ALTER TABLE "orders" ADD CONSTRAINT "orders_status_not_null" NOT NULL status;

ALTER TABLE "orders" ADD CONSTRAINT "orders_total_cents_check" CHECK ((total_cents > 0));

ALTER TABLE "orders" ADD CONSTRAINT "orders_total_cents_not_null" NOT NULL total_cents;

ALTER TABLE "payroll" ADD CONSTRAINT "payroll_created_at_not_null" NOT NULL created_at;

ALTER TABLE "payroll" ADD CONSTRAINT "payroll_deductions_cents_not_null" NOT NULL deductions_cents;

ALTER TABLE "payroll" ADD CONSTRAINT "payroll_employee_id_not_null" NOT NULL employee_id;

ALTER TABLE "payroll" ADD CONSTRAINT "payroll_gross_cents_not_null" NOT NULL gross_cents;

ALTER TABLE "payroll" ADD CONSTRAINT "payroll_id_not_null" NOT NULL id;

ALTER TABLE "payroll" ADD CONSTRAINT "payroll_net_cents_check" CHECK ((net_cents > 0));

ALTER TABLE "payroll" ADD CONSTRAINT "payroll_net_cents_not_null" NOT NULL net_cents;

ALTER TABLE "payroll" ADD CONSTRAINT "payroll_period_not_null" NOT NULL period;

ALTER TABLE "payroll" ADD CONSTRAINT "payroll_pkey" PRIMARY KEY (id);

ALTER TABLE "payroll" ADD CONSTRAINT "payroll_state_not_null" NOT NULL state;

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_amount_cents_check" CHECK ((amount_cents > 0));

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_amount_cents_not_null" NOT NULL amount_cents;

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_created_at_not_null" NOT NULL created_at;

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_created_by_not_null" NOT NULL created_by;

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_employee_id_kind_period_key" UNIQUE (employee_id, kind, period);

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_employee_id_not_null" NOT NULL employee_id;

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_id_not_null" NOT NULL id;

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_kind_not_null" NOT NULL kind;

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_period_not_null" NOT NULL period;

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_pkey" PRIMARY KEY (id);

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_reason_not_null" NOT NULL reason;

ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_breakdown_cipher_not_null" NOT NULL breakdown_cipher;

ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_payroll_id_not_null" NOT NULL payroll_id;

ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_pkey" PRIMARY KEY (payroll_id);

ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_bonus_cents_not_null" NOT NULL bonus_cents;

ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_days_not_null" NOT NULL days;

ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_employee_id_not_null" NOT NULL employee_id;

ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_isr_cents_not_null" NOT NULL isr_cents;

ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_other_cents_not_null" NOT NULL other_cents;

ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_other_reason_not_null" NOT NULL other_reason;

ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_overtime_cents_not_null" NOT NULL overtime_cents;

ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_period_not_null" NOT NULL period;

ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_pkey" PRIMARY KEY (employee_id, period);

ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_social_security_not_null" NOT NULL social_security;

ALTER TABLE "payroll_rules" ADD CONSTRAINT "payroll_rules_id_not_null" NOT NULL id;

ALTER TABLE "payroll_rules" ADD CONSTRAINT "payroll_rules_pkey" PRIMARY KEY (id);

ALTER TABLE "payroll_rules" ADD CONSTRAINT "payroll_rules_settings_not_null" NOT NULL settings;

ALTER TABLE "payroll_rules" ADD CONSTRAINT "payroll_rules_updated_at_not_null" NOT NULL updated_at;

ALTER TABLE "permissions" ADD CONSTRAINT "permissions_code_not_null" NOT NULL code;

ALTER TABLE "permissions" ADD CONSTRAINT "permissions_description_not_null" NOT NULL description;

ALTER TABLE "permissions" ADD CONSTRAINT "permissions_pkey" PRIMARY KEY (code);

ALTER TABLE "portal_access_guards" ADD CONSTRAINT "portal_access_guards_attempts_not_null" NOT NULL attempts;

ALTER TABLE "portal_access_guards" ADD CONSTRAINT "portal_access_guards_pkey" PRIMARY KEY (ticket);

ALTER TABLE "portal_access_guards" ADD CONSTRAINT "portal_access_guards_ticket_not_null" NOT NULL ticket;

ALTER TABLE "portal_cancellations" ADD CONSTRAINT "portal_cancellations_created_at_not_null" NOT NULL created_at;

ALTER TABLE "portal_cancellations" ADD CONSTRAINT "portal_cancellations_order_id_not_null" NOT NULL order_id;

ALTER TABLE "portal_cancellations" ADD CONSTRAINT "portal_cancellations_phone_hash_not_null" NOT NULL phone_hash;

ALTER TABLE "portal_cancellations" ADD CONSTRAINT "portal_cancellations_pkey" PRIMARY KEY (order_id);

ALTER TABLE "portal_cancellations" ADD CONSTRAINT "portal_cancellations_reason_not_null" NOT NULL reason;

ALTER TABLE "portal_clients" ADD CONSTRAINT "portal_clients_client_id_key" UNIQUE (client_id);

ALTER TABLE "portal_clients" ADD CONSTRAINT "portal_clients_client_id_not_null" NOT NULL client_id;

ALTER TABLE "portal_clients" ADD CONSTRAINT "portal_clients_dpi_hash_not_null" NOT NULL dpi_hash;

ALTER TABLE "portal_clients" ADD CONSTRAINT "portal_clients_pkey" PRIMARY KEY (dpi_hash);

ALTER TABLE "portal_credentials" ADD CONSTRAINT "portal_credentials_code_cipher_not_null" NOT NULL code_cipher;

ALTER TABLE "portal_credentials" ADD CONSTRAINT "portal_credentials_order_id_not_null" NOT NULL order_id;

ALTER TABLE "portal_credentials" ADD CONSTRAINT "portal_credentials_pkey" PRIMARY KEY (order_id);

ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_access_hash_not_null" NOT NULL access_hash;

ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_created_at_not_null" NOT NULL created_at;

ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_order_id_not_null" NOT NULL order_id;

ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_payload_hash_not_null" NOT NULL payload_hash;

ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_pkey" PRIMARY KEY (order_id);

ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_ready_estimate_not_null" NOT NULL ready_estimate;

ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_request_hash_key" UNIQUE (request_hash);

ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_request_hash_not_null" NOT NULL request_hash;

ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_ticket_key" UNIQUE (ticket);

ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_ticket_not_null" NOT NULL ticket;

ALTER TABLE "portal_prescriptions" ADD CONSTRAINT "portal_prescriptions_image_cipher_not_null" NOT NULL image_cipher;

ALTER TABLE "portal_prescriptions" ADD CONSTRAINT "portal_prescriptions_mime_not_null" NOT NULL mime;

ALTER TABLE "portal_prescriptions" ADD CONSTRAINT "portal_prescriptions_notes_not_null" NOT NULL notes;

ALTER TABLE "portal_prescriptions" ADD CONSTRAINT "portal_prescriptions_order_id_not_null" NOT NULL order_id;

ALTER TABLE "portal_prescriptions" ADD CONSTRAINT "portal_prescriptions_pkey" PRIMARY KEY (order_id);

ALTER TABLE "portal_prescriptions" ADD CONSTRAINT "portal_prescriptions_review_status_not_null" NOT NULL review_status;

ALTER TABLE "prescription_versions" ADD CONSTRAINT "prescription_versions_created_at_not_null" NOT NULL created_at;

ALTER TABLE "prescription_versions" ADD CONSTRAINT "prescription_versions_id_not_null" NOT NULL id;

ALTER TABLE "prescription_versions" ADD CONSTRAINT "prescription_versions_image_cipher_not_null" NOT NULL image_cipher;

ALTER TABLE "prescription_versions" ADD CONSTRAINT "prescription_versions_mime_not_null" NOT NULL mime;

ALTER TABLE "prescription_versions" ADD CONSTRAINT "prescription_versions_notes_not_null" NOT NULL notes;

ALTER TABLE "prescription_versions" ADD CONSTRAINT "prescription_versions_order_id_not_null" NOT NULL order_id;

ALTER TABLE "prescription_versions" ADD CONSTRAINT "prescription_versions_pkey" PRIMARY KEY (id);

ALTER TABLE "prescription_versions" ADD CONSTRAINT "prescription_versions_review_status_not_null" NOT NULL review_status;

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_created_at_not_null" NOT NULL created_at;

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_created_by_not_null" NOT NULL created_by;

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_customer_name_not_null" NOT NULL customer_name;

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_not_null" NOT NULL doctor;

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_id_not_null" NOT NULL id;

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_issued_on_not_null" NOT NULL issued_on;

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_license_not_null" NOT NULL license;

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_notes_not_null" NOT NULL notes;

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_pkey" PRIMARY KEY (id);

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_product_id_not_null" NOT NULL product_id;

ALTER TABLE "procurement_actions" ADD CONSTRAINT "procurement_actions_entity_id_not_null" NOT NULL entity_id;

ALTER TABLE "procurement_actions" ADD CONSTRAINT "procurement_actions_payload_hash_not_null" NOT NULL payload_hash;

ALTER TABLE "procurement_actions" ADD CONSTRAINT "procurement_actions_pkey" PRIMARY KEY (request_id);

ALTER TABLE "procurement_actions" ADD CONSTRAINT "procurement_actions_request_id_not_null" NOT NULL request_id;

ALTER TABLE "products" ADD CONSTRAINT "products_category_not_null" NOT NULL category;

ALTER TABLE "products" ADD CONSTRAINT "products_component_not_null" NOT NULL component;

ALTER TABLE "products" ADD CONSTRAINT "products_controlled_not_null" NOT NULL controlled;

ALTER TABLE "products" ADD CONSTRAINT "products_id_not_null" NOT NULL id;

ALTER TABLE "products" ADD CONSTRAINT "products_name_not_null" NOT NULL name;

ALTER TABLE "products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);

ALTER TABLE "products" ADD CONSTRAINT "products_prescription_not_null" NOT NULL prescription;

ALTER TABLE "products" ADD CONSTRAINT "products_price_cents_check" CHECK ((price_cents >= 0));

ALTER TABLE "products" ADD CONSTRAINT "products_price_cents_not_null" NOT NULL price_cents;

ALTER TABLE "products" ADD CONSTRAINT "products_sku_key" UNIQUE (sku);

ALTER TABLE "products" ADD CONSTRAINT "products_sku_not_null" NOT NULL sku;

ALTER TABLE "products" ADD CONSTRAINT "products_state_not_null" NOT NULL state;

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_id_not_null" NOT NULL id;

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_pkey" PRIMARY KEY (id);

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_product_id_not_null" NOT NULL product_id;

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_not_null" NOT NULL purchase_id;

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_product_id_key" UNIQUE (purchase_id, product_id);

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_quantity_check" CHECK ((quantity > 0));

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_quantity_not_null" NOT NULL quantity;

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_received_not_null" NOT NULL received;

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_unit_cost_cents_check" CHECK ((unit_cost_cents > 0));

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_unit_cost_cents_not_null" NOT NULL unit_cost_cents;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_not_null" NOT NULL branch_id;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_at_not_null" NOT NULL created_at;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_not_null" NOT NULL created_by;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_id_not_null" NOT NULL id;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_notes_not_null" NOT NULL notes;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_payment_not_null" NOT NULL payment;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY (id);

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_status_not_null" NOT NULL status;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_not_null" NOT NULL supplier_id;

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_at_not_null" NOT NULL created_at;

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_by_not_null" NOT NULL created_by;

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_document_not_null" NOT NULL document;

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_id_not_null" NOT NULL id;

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_inventory_id_not_null" NOT NULL inventory_id;

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_line_id_not_null" NOT NULL line_id;

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY (id);

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_id_not_null" NOT NULL purchase_id;

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_quantity_check" CHECK ((quantity > 0));

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_quantity_not_null" NOT NULL quantity;

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_returned_not_null" NOT NULL returned;

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_unit_cost_cents_not_null" NOT NULL unit_cost_cents;

ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_code_hash_key" UNIQUE (code_hash);

ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_code_hash_not_null" NOT NULL code_hash;

ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_created_at_not_null" NOT NULL created_at;

ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_id_not_null" NOT NULL id;

ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_pkey" PRIMARY KEY (id);

ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_not_null" NOT NULL user_id;

ALTER TABLE "requests" ADD CONSTRAINT "requests_created_at_not_null" NOT NULL created_at;

ALTER TABLE "requests" ADD CONSTRAINT "requests_entity_id_not_null" NOT NULL entity_id;

ALTER TABLE "requests" ADD CONSTRAINT "requests_id_not_null" NOT NULL id;

ALTER TABLE "requests" ADD CONSTRAINT "requests_payload_not_null" NOT NULL payload;

ALTER TABLE "requests" ADD CONSTRAINT "requests_pkey" PRIMARY KEY (id);

ALTER TABLE "requests" ADD CONSTRAINT "requests_reason_not_null" NOT NULL reason;

ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_id_not_null" NOT NULL requester_id;

ALTER TABLE "requests" ADD CONSTRAINT "requests_status_not_null" NOT NULL status;

ALTER TABLE "requests" ADD CONSTRAINT "requests_type_not_null" NOT NULL type;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_code_not_null" NOT NULL permission_code;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY (role_id, permission_code);

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_not_null" NOT NULL role_id;

ALTER TABLE "roles" ADD CONSTRAINT "roles_code_key" UNIQUE (code);

ALTER TABLE "roles" ADD CONSTRAINT "roles_code_not_null" NOT NULL code;

ALTER TABLE "roles" ADD CONSTRAINT "roles_description_not_null" NOT NULL description;

ALTER TABLE "roles" ADD CONSTRAINT "roles_id_not_null" NOT NULL id;

ALTER TABLE "roles" ADD CONSTRAINT "roles_name_not_null" NOT NULL name;

ALTER TABLE "roles" ADD CONSTRAINT "roles_pkey" PRIMARY KEY (id);

ALTER TABLE "roles" ADD CONSTRAINT "roles_require_totp_not_null" NOT NULL require_totp;

ALTER TABLE "roles" ADD CONSTRAINT "roles_scope_not_null" NOT NULL scope;

ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_created_at_not_null" NOT NULL created_at;

ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_created_by_not_null" NOT NULL created_by;

ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_employee_id_not_null" NOT NULL employee_id;

ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_id_not_null" NOT NULL id;

ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_pkey" PRIMARY KEY (id);

ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_reason_not_null" NOT NULL reason;

ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_salary_cipher_not_null" NOT NULL salary_cipher;

ALTER TABLE "schema_migrations" ADD CONSTRAINT "schema_migrations_applied_at_not_null" NOT NULL applied_at;

ALTER TABLE "schema_migrations" ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY (version);

ALTER TABLE "schema_migrations" ADD CONSTRAINT "schema_migrations_version_not_null" NOT NULL version;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_at_not_null" NOT NULL created_at;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_csrf_hash_not_null" NOT NULL csrf_hash;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_expires_at_not_null" NOT NULL expires_at;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_id_not_null" NOT NULL id;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_ip_not_null" NOT NULL ip;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_last_seen_not_null" NOT NULL last_seen;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pkey" PRIMARY KEY (id);

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_refresh_hash_key" UNIQUE (refresh_hash);

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_refresh_hash_not_null" NOT NULL refresh_hash;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_not_null" NOT NULL revoked;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_not_null" NOT NULL user_id;

ALTER TABLE "simulated_messages" ADD CONSTRAINT "simulated_messages_created_at_not_null" NOT NULL created_at;

ALTER TABLE "simulated_messages" ADD CONSTRAINT "simulated_messages_id_not_null" NOT NULL id;

ALTER TABLE "simulated_messages" ADD CONSTRAINT "simulated_messages_kind_not_null" NOT NULL kind;

ALTER TABLE "simulated_messages" ADD CONSTRAINT "simulated_messages_phone_cipher_not_null" NOT NULL phone_cipher;

ALTER TABLE "simulated_messages" ADD CONSTRAINT "simulated_messages_phone_hash_not_null" NOT NULL phone_hash;

ALTER TABLE "simulated_messages" ADD CONSTRAINT "simulated_messages_pkey" PRIMARY KEY (id);

ALTER TABLE "simulated_messages" ADD CONSTRAINT "simulated_messages_text_cipher_not_null" NOT NULL text_cipher;

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_branch_id_not_null" NOT NULL branch_id;

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_created_at_not_null" NOT NULL created_at;

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_id_not_null" NOT NULL id;

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_pkey" PRIMARY KEY (id);

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_product_id_not_null" NOT NULL product_id;

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_quantity_not_null" NOT NULL quantity;

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_reason_not_null" NOT NULL reason;

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_reference_id_not_null" NOT NULL reference_id;

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_type_not_null" NOT NULL type;

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_user_id_not_null" NOT NULL user_id;

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_amount_cents_not_null" NOT NULL amount_cents;

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_created_at_not_null" NOT NULL created_at;

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_created_by_not_null" NOT NULL created_by;

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_credit_note_not_null" NOT NULL credit_note;

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_id_not_null" NOT NULL id;

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_pkey" PRIMARY KEY (id);

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_quantity_check" CHECK ((quantity > 0));

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_quantity_not_null" NOT NULL quantity;

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_reason_not_null" NOT NULL reason;

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_receipt_id_not_null" NOT NULL receipt_id;

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_status_not_null" NOT NULL status;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_active_not_null" NOT NULL active;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_address_not_null" NOT NULL address;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_email_not_null" NOT NULL email;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_id_not_null" NOT NULL id;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_name_not_null" NOT NULL name;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_nit_not_null" NOT NULL nit;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_phone_not_null" NOT NULL phone;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY (id);

ALTER TABLE "transfer_costs" ADD CONSTRAINT "transfer_costs_known_not_null" NOT NULL known;

ALTER TABLE "transfer_costs" ADD CONSTRAINT "transfer_costs_pkey" PRIMARY KEY (transfer_id);

ALTER TABLE "transfer_costs" ADD CONSTRAINT "transfer_costs_transfer_id_not_null" NOT NULL transfer_id;

ALTER TABLE "transfer_costs" ADD CONSTRAINT "transfer_costs_unit_cost_cents_not_null" NOT NULL unit_cost_cents;

ALTER TABLE "transfer_drafts" ADD CONSTRAINT "transfer_drafts_created_at_not_null" NOT NULL created_at;

ALTER TABLE "transfer_drafts" ADD CONSTRAINT "transfer_drafts_created_by_not_null" NOT NULL created_by;

ALTER TABLE "transfer_drafts" ADD CONSTRAINT "transfer_drafts_destination_id_not_null" NOT NULL destination_id;

ALTER TABLE "transfer_drafts" ADD CONSTRAINT "transfer_drafts_id_not_null" NOT NULL id;

ALTER TABLE "transfer_drafts" ADD CONSTRAINT "transfer_drafts_inventory_id_not_null" NOT NULL inventory_id;

ALTER TABLE "transfer_drafts" ADD CONSTRAINT "transfer_drafts_pkey" PRIMARY KEY (id);

ALTER TABLE "transfer_drafts" ADD CONSTRAINT "transfer_drafts_quantity_not_null" NOT NULL quantity;

ALTER TABLE "transfer_drafts" ADD CONSTRAINT "transfer_drafts_state_not_null" NOT NULL state;

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_check" CHECK ((source_id <> destination_id));

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_created_at_not_null" NOT NULL created_at;

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_created_by_not_null" NOT NULL created_by;

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_destination_id_not_null" NOT NULL destination_id;

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_expires_on_not_null" NOT NULL expires_on;

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_id_not_null" NOT NULL id;

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_lot_not_null" NOT NULL lot;

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_pkey" PRIMARY KEY (id);

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_product_id_not_null" NOT NULL product_id;

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_quantity_check" CHECK ((quantity > 0));

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_quantity_not_null" NOT NULL quantity;

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_source_id_not_null" NOT NULL source_id;

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_status_check" CHECK ((status = ANY (ARRAY['En tránsito'::text, 'Recibido'::text])));

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_status_not_null" NOT NULL status;

ALTER TABLE "used_refresh_tokens" ADD CONSTRAINT "used_refresh_tokens_pkey" PRIMARY KEY (token_hash);

ALTER TABLE "used_refresh_tokens" ADD CONSTRAINT "used_refresh_tokens_session_id_not_null" NOT NULL session_id;

ALTER TABLE "used_refresh_tokens" ADD CONSTRAINT "used_refresh_tokens_token_hash_not_null" NOT NULL token_hash;

ALTER TABLE "users" ADD CONSTRAINT "users_email_key" UNIQUE (email);

ALTER TABLE "users" ADD CONSTRAINT "users_email_not_null" NOT NULL email;

ALTER TABLE "users" ADD CONSTRAINT "users_failed_attempts_not_null" NOT NULL failed_attempts;

ALTER TABLE "users" ADD CONSTRAINT "users_id_not_null" NOT NULL id;

ALTER TABLE "users" ADD CONSTRAINT "users_last_totp_step_not_null" NOT NULL last_totp_step;

ALTER TABLE "users" ADD CONSTRAINT "users_must_change_password_not_null" NOT NULL must_change_password;

ALTER TABLE "users" ADD CONSTRAINT "users_name_not_null" NOT NULL name;

ALTER TABLE "users" ADD CONSTRAINT "users_password_hash_not_null" NOT NULL password_hash;

ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);

ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'operator'::text, 'auditor'::text])));

ALTER TABLE "users" ADD CONSTRAINT "users_role_not_null" NOT NULL role;

ALTER TABLE "users" ADD CONSTRAINT "users_state_not_null" NOT NULL state;

ALTER TABLE "users" ADD CONSTRAINT "users_totp_enabled_not_null" NOT NULL totp_enabled;

ALTER TABLE "voided_records" ADD CONSTRAINT "voided_records_created_at_not_null" NOT NULL created_at;

ALTER TABLE "voided_records" ADD CONSTRAINT "voided_records_created_by_not_null" NOT NULL created_by;

ALTER TABLE "voided_records" ADD CONSTRAINT "voided_records_entity_id_key" UNIQUE (entity_id);

ALTER TABLE "voided_records" ADD CONSTRAINT "voided_records_entity_id_not_null" NOT NULL entity_id;

ALTER TABLE "voided_records" ADD CONSTRAINT "voided_records_entity_not_null" NOT NULL entity;

ALTER TABLE "voided_records" ADD CONSTRAINT "voided_records_id_not_null" NOT NULL id;

ALTER TABLE "voided_records" ADD CONSTRAINT "voided_records_pkey" PRIMARY KEY (id);

ALTER TABLE "voided_records" ADD CONSTRAINT "voided_records_reason_not_null" NOT NULL reason;

ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES assets(id);

ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES assets(id);

ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "asset_incidents" ADD CONSTRAINT "asset_incidents_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES users(id);

ALTER TABLE "assets" ADD CONSTRAINT "assets_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE "clients" ADD CONSTRAINT "clients_deactivated_by_fkey" FOREIGN KEY (deactivated_by) REFERENCES users(id);

ALTER TABLE "counter_sales" ADD CONSTRAINT "counter_sales_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES users(id);

ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_courier_id_fkey" FOREIGN KEY (courier_id) REFERENCES users(id);

ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "delivery_points" ADD CONSTRAINT "delivery_points_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "delivery_points" ADD CONSTRAINT "delivery_points_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "entity_history" ADD CONSTRAINT "entity_history_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "inventory_costs" ADD CONSTRAINT "inventory_costs_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES inventory(id);

ALTER TABLE "order_item_costs" ADD CONSTRAINT "order_item_costs_item_id_fkey" FOREIGN KEY (item_id) REFERENCES order_items(id) ON DELETE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES inventory(id);

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "orders" ADD CONSTRAINT "orders_prescription_id_fkey" FOREIGN KEY (prescription_id) REFERENCES prescriptions(id);

ALTER TABLE "payroll" ADD CONSTRAINT "payroll_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE "payroll" ADD CONSTRAINT "payroll_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id);

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "payroll_benefits" ADD CONSTRAINT "payroll_benefits_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id);

ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_payroll_id_fkey" FOREIGN KEY (payroll_id) REFERENCES payroll(id);

ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id);

ALTER TABLE "payroll_rules" ADD CONSTRAINT "payroll_rules_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE "portal_cancellations" ADD CONSTRAINT "portal_cancellations_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "portal_clients" ADD CONSTRAINT "portal_clients_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE "portal_credentials" ADD CONSTRAINT "portal_credentials_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "portal_prescriptions" ADD CONSTRAINT "portal_prescriptions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "portal_prescriptions" ADD CONSTRAINT "portal_prescriptions_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);

ALTER TABLE "prescription_versions" ADD CONSTRAINT "prescription_versions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_fkey" FOREIGN KEY (purchase_id) REFERENCES purchase_orders(id);

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES inventory(id);

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_line_id_fkey" FOREIGN KEY (line_id) REFERENCES purchase_lines(id);

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_id_fkey" FOREIGN KEY (purchase_id) REFERENCES purchase_orders(id);

ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "requests" ADD CONSTRAINT "requests_approver_id_fkey" FOREIGN KEY (approver_id) REFERENCES users(id);

ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES users(id);

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_code_fkey" FOREIGN KEY (permission_code) REFERENCES permissions(code);

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id);

ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id);

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "simulated_messages" ADD CONSTRAINT "simulated_messages_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES inventory(id);

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_receipt_id_fkey" FOREIGN KEY (receipt_id) REFERENCES purchase_receipts(id);

ALTER TABLE "transfer_costs" ADD CONSTRAINT "transfer_costs_transfer_id_fkey" FOREIGN KEY (transfer_id) REFERENCES transfers(id);

ALTER TABLE "transfer_drafts" ADD CONSTRAINT "transfer_drafts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "transfer_drafts" ADD CONSTRAINT "transfer_drafts_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES branches(id);

ALTER TABLE "transfer_drafts" ADD CONSTRAINT "transfer_drafts_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES inventory(id);

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES branches(id);

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_source_id_fkey" FOREIGN KEY (source_id) REFERENCES branches(id);

ALTER TABLE "used_refresh_tokens" ADD CONSTRAINT "used_refresh_tokens_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id);

ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id);

ALTER TABLE "voided_records" ADD CONSTRAINT "voided_records_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

CREATE UNIQUE INDEX idx_audit_sequence ON public.audit_log USING btree (sequence);

CREATE INDEX idx_purchase_branch ON public.purchase_orders USING btree (branch_id, created_at);

CREATE INDEX idx_requests_state ON public.requests USING btree (status, created_at);

CREATE INDEX idx_inventory_branch ON public.inventory USING btree (branch_id, product_id, expires_on);

CREATE INDEX idx_messages_phone ON public.simulated_messages USING btree (phone_hash, created_at);

CREATE INDEX idx_recovery_user ON public.recovery_codes USING btree (user_id, used_at);

CREATE UNIQUE INDEX idx_shift_open_branch ON public.cash_shifts USING btree (branch_id) WHERE (state = 'Abierto'::text);

CREATE INDEX idx_ledger_branch_product ON public.stock_ledger USING btree (branch_id, product_id, created_at);

CREATE UNIQUE INDEX idx_payroll_active_period ON public.payroll USING btree (employee_id, period) WHERE (state = 'Pagado'::text);

CREATE INDEX idx_orders_branch ON public.orders USING btree (branch_id, status);

CREATE INDEX idx_audit_date ON public.audit_log USING btree (created_at);

CREATE INDEX idx_cash_date ON public.cash_movements USING btree (created_at, branch_id);

CREATE INDEX idx_cancel_dpi ON public.portal_cancellations USING btree (dpi_hash);

CREATE INDEX idx_delivery_courier ON public.delivery_assignments USING btree (courier_id, status);

CREATE INDEX idx_cancel_phone ON public.portal_cancellations USING btree (phone_hash);

CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id, revoked);

CREATE INDEX idx_portal_expiry ON public.portal_orders USING btree (expires_at);

CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN RAISE EXCEPTION 'La auditoría es solo de inserción'; END; $function$;

CREATE TRIGGER audit_no_mutation BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
COMMIT;
