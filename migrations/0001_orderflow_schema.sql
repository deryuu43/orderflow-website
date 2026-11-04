-- =============================================================================
-- OrderFlow PostgreSQL Schema Migration (18 Normalized Tables + Triggers + RLS)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper function for automatic updated_at timestamp maintenance
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. businesses
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  industry TEXT NOT NULL DEFAULT 'Percetakan & Konveksi',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  owner_uid TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS businesses_owner_uid_idx ON businesses(owner_uid);

-- 2. users (profiles & RBAC)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid TEXT NOT NULL UNIQUE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'production_staff', 'customer')),
  invitation_status TEXT NOT NULL DEFAULT 'active' CHECK (invitation_status IN ('active', 'pending')),
  invited_by_uid TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_business_id_idx ON users(business_id);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- 3. customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_code TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT NOT NULL,
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  portal_user_uid TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, customer_code)
);
CREATE INDEX IF NOT EXISTS customers_business_id_idx ON customers(business_id);
CREATE INDEX IF NOT EXISTS customers_name_idx ON customers(name);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(phone);

-- 4. orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL,
  tracking_token TEXT NOT NULL UNIQUE,
  tracking_pin TEXT NOT NULL DEFAULT '1234',
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Konveksi',
  description TEXT DEFAULT '',
  specifications TEXT DEFAULT '',
  order_status TEXT NOT NULL DEFAULT 'menunggu_konfirmasi',
  design_status TEXT NOT NULL DEFAULT 'menunggu_desain',
  production_status TEXT NOT NULL DEFAULT 'menunggu_produksi',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  requires_design_approval BOOLEAN NOT NULL DEFAULT TRUE,
  min_dp_percent INTEGER NOT NULL DEFAULT 50,
  subtotal BIGINT NOT NULL DEFAULT 0,
  additional_cost BIGINT NOT NULL DEFAULT 0,
  discount BIGINT NOT NULL DEFAULT 0,
  grand_total BIGINT NOT NULL DEFAULT 0,
  paid_amount BIGINT NOT NULL DEFAULT 0,
  refunded_amount BIGINT NOT NULL DEFAULT 0,
  order_date TIMESTAMP NOT NULL DEFAULT NOW(),
  deadline TIMESTAMP NOT NULL,
  notes TEXT DEFAULT '',
  cancel_reason TEXT,
  cancelled_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_by_uid TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, order_number)
);
CREATE INDEX IF NOT EXISTS orders_business_id_idx ON orders(business_id);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_order_status_idx ON orders(order_status);
CREATE INDEX IF NOT EXISTS orders_deadline_idx ON orders(deadline);

-- 5. order_items
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  specifications TEXT DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  unit_price BIGINT NOT NULL DEFAULT 0,
  line_total BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_business_id_idx ON order_items(business_id);

-- 6. design_files
CREATE TABLE IF NOT EXISTS design_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  file_type TEXT NOT NULL DEFAULT 'design_proof',
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  notes TEXT DEFAULT '',
  approval_status TEXT NOT NULL DEFAULT 'menunggu_persetujuan',
  is_production_reference BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by_uid TEXT NOT NULL,
  uploaded_by_name TEXT NOT NULL,
  uploaded_by_role TEXT NOT NULL,
  approved_at TIMESTAMP,
  approved_by_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS design_files_order_id_idx ON design_files(order_id);
CREATE INDEX IF NOT EXISTS design_files_business_id_idx ON design_files(business_id);

-- 7. design_revisions
CREATE TABLE IF NOT EXISTS design_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  design_file_id UUID REFERENCES design_files(id) ON DELETE SET NULL,
  revision_number INTEGER NOT NULL DEFAULT 1,
  revision_notes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  requested_by_uid TEXT NOT NULL,
  requested_by_name TEXT NOT NULL,
  requested_by_role TEXT NOT NULL,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS design_revisions_order_id_idx ON design_revisions(order_id);
CREATE INDEX IF NOT EXISTS design_revisions_business_id_idx ON design_revisions(business_id);

-- 8. production_jobs
CREATE TABLE IF NOT EXISTS production_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  job_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'menunggu_produksi',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_staff_uid TEXT,
  assigned_staff_name TEXT,
  deadline TIMESTAMP NOT NULL,
  production_notes TEXT DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  qc_passed BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, job_number)
);
CREATE INDEX IF NOT EXISTS production_jobs_business_id_idx ON production_jobs(business_id);
CREATE INDEX IF NOT EXISTS production_jobs_status_idx ON production_jobs(status);

-- 9. production_logs
CREATE TABLE IF NOT EXISTS production_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  production_job_id UUID NOT NULL REFERENCES production_jobs(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  notes TEXT DEFAULT '',
  photo_url TEXT,
  actor_uid TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS production_logs_job_id_idx ON production_logs(production_job_id);
CREATE INDEX IF NOT EXISTS production_logs_business_id_idx ON production_logs(business_id);

-- 10. qc_inspections
CREATE TABLE IF NOT EXISTS qc_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  production_job_id UUID NOT NULL REFERENCES production_jobs(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  inspector_uid TEXT NOT NULL,
  inspector_name TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  checklist JSONB NOT NULL,
  notes TEXT DEFAULT '',
  inspected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS qc_inspections_job_id_idx ON qc_inspections(production_job_id);
CREATE INDEX IF NOT EXISTS qc_inspections_business_id_idx ON qc_inspections(business_id);

-- 11. invoices
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  issue_date TIMESTAMP NOT NULL DEFAULT NOW(),
  due_date TIMESTAMP NOT NULL,
  subtotal BIGINT NOT NULL DEFAULT 0,
  additional_cost BIGINT NOT NULL DEFAULT 0,
  discount BIGINT NOT NULL DEFAULT 0,
  grand_total BIGINT NOT NULL DEFAULT 0,
  verified_paid_amount BIGINT NOT NULL DEFAULT 0,
  refunded_amount BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS invoices_business_id_idx ON invoices(business_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);

-- 12. payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_number TEXT NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'dp',
  method TEXT NOT NULL DEFAULT 'transfer_bank',
  amount BIGINT NOT NULL,
  proof_url TEXT DEFAULT '',
  reference_code TEXT DEFAULT '',
  verification_status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT DEFAULT '',
  paid_at TIMESTAMP NOT NULL DEFAULT NOW(),
  submitted_by_uid TEXT NOT NULL,
  submitted_by_name TEXT NOT NULL,
  verified_by_uid TEXT,
  verified_by_name TEXT,
  verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_order_id_idx ON payments(order_id);
CREATE INDEX IF NOT EXISTS payments_business_id_idx ON payments(business_id);
CREATE INDEX IF NOT EXISTS payments_verification_status_idx ON payments(verification_status);

-- 13. shipping_records
CREATE TABLE IF NOT EXISTS shipping_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  courier_name TEXT NOT NULL DEFAULT 'Ambil di Workshop',
  service_type TEXT DEFAULT 'Reguler',
  tracking_number TEXT DEFAULT '',
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  shipping_cost BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'belum_dikirim',
  shipped_at TIMESTAMP,
  delivered_at TIMESTAMP,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shipping_records_business_id_idx ON shipping_records(business_id);

-- 14. order_status_history
CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT DEFAULT '',
  actor_uid TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_status_history_order_id_idx ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS order_status_history_business_id_idx ON order_status_history(business_id);

-- 15. notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  recipient_uid TEXT,
  target_role TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_channels JSONB NOT NULL DEFAULT '{"inApp":true,"whatsappReady":false,"emailReady":false}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_business_id_idx ON notifications(business_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications(is_read);

-- 16. activity_logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_uid TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_logs_business_id_idx ON activity_logs(business_id);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs(created_at);

-- 17. subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'STARTER',
  status TEXT NOT NULL DEFAULT 'active',
  monthly_price BIGINT NOT NULL DEFAULT 69000,
  order_limit INTEGER NOT NULL DEFAULT 150,
  user_limit INTEGER NOT NULL DEFAULT 3,
  orders_used_this_month INTEGER NOT NULL DEFAULT 0,
  current_period_start TIMESTAMP NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMP NOT NULL,
  payment_gateway_mode TEXT NOT NULL DEFAULT 'simulation',
  last_simulation_ref TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 18. business_settings
CREATE TABLE IF NOT EXISTS business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  order_prefix TEXT NOT NULL DEFAULT 'ORD',
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  default_min_dp_percent INTEGER NOT NULL DEFAULT 50,
  require_design_approval_default BOOLEAN NOT NULL DEFAULT TRUE,
  require_dp_before_production BOOLEAN NOT NULL DEFAULT TRUE,
  bank_name TEXT NOT NULL DEFAULT 'BCA',
  bank_account_number TEXT NOT NULL DEFAULT '8810492819',
  bank_account_holder TEXT NOT NULL DEFAULT 'PT Karya Custom Nusantara',
  invoice_footer_notes TEXT NOT NULL DEFAULT 'Mohon sertakan nomor invoice pada berita transfer.',
  whatsapp_webhook_url TEXT DEFAULT '',
  email_notification_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Attach updated_at triggers
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'businesses', 'users', 'customers', 'orders', 'order_items',
    'design_files', 'design_revisions', 'production_jobs', 'production_logs',
    'qc_inspections', 'invoices', 'payments', 'shipping_records',
    'order_status_history', 'notifications', 'activity_logs',
    'subscriptions', 'business_settings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;', tbl, tbl);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();', tbl, tbl);
  END LOOP;
END $$;

-- Multi-Tenant Row Level Security (RLS) Policies
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies supporting app.current_business_id session context
CREATE POLICY tenant_isolation_customers ON customers
  USING (business_id::text = COALESCE(NULLIF(current_setting('app.current_business_id', true), ''), business_id::text));

CREATE POLICY tenant_isolation_orders ON orders
  USING (business_id::text = COALESCE(NULLIF(current_setting('app.current_business_id', true), ''), business_id::text));

CREATE POLICY tenant_isolation_order_items ON order_items
  USING (business_id::text = COALESCE(NULLIF(current_setting('app.current_business_id', true), ''), business_id::text));

CREATE POLICY tenant_isolation_design_files ON design_files
  USING (business_id::text = COALESCE(NULLIF(current_setting('app.current_business_id', true), ''), business_id::text));

CREATE POLICY tenant_isolation_production_jobs ON production_jobs
  USING (business_id::text = COALESCE(NULLIF(current_setting('app.current_business_id', true), ''), business_id::text));

CREATE POLICY tenant_isolation_invoices ON invoices
  USING (business_id::text = COALESCE(NULLIF(current_setting('app.current_business_id', true), ''), business_id::text));

CREATE POLICY tenant_isolation_payments ON payments
  USING (business_id::text = COALESCE(NULLIF(current_setting('app.current_business_id', true), ''), business_id::text));
