import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// 1. businesses
export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    industry: text('industry').notNull().default('Percetakan & Konveksi'),
    phone: text('phone').default(''),
    email: text('email').default(''),
    address: text('address').default(''),
    logoUrl: text('logo_url').default(''),
    ownerUid: text('owner_uid').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('businesses_slug_unique').on(table.slug),
    index('businesses_owner_uid_idx').on(table.ownerUid),
  ]
);

// 2. users (profiles & RBAC)
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: text('uid').notNull().unique(), // Firebase Auth UID or invited pending UID
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id'),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').default(''),
    avatarUrl: text('avatar_url').default(''),
    role: text('role').notNull().default('owner'), // 'owner' | 'admin' | 'production_staff' | 'customer'
    invitationStatus: text('invitation_status').notNull().default('active'), // 'active' | 'pending'
    invitedByUid: text('invited_by_uid'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('users_business_id_idx').on(table.businessId),
    index('users_email_idx').on(table.email),
    index('users_role_idx').on(table.role),
  ]
);

// 3. customers
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    customerCode: text('customer_code').notNull(),
    name: text('name').notNull(),
    company: text('company').default(''),
    email: text('email').default(''),
    phone: text('phone').notNull(),
    address: text('address').default(''),
    notes: text('notes').default(''),
    portalUserUid: text('portal_user_uid'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('customers_business_code_unique').on(table.businessId, table.customerCode),
    index('customers_business_id_idx').on(table.businessId),
    index('customers_name_idx').on(table.name),
    index('customers_phone_idx').on(table.phone),
  ]
);

// 4. orders
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    orderNumber: text('order_number').notNull(),
    trackingToken: text('tracking_token').notNull(),
    trackingPin: text('tracking_pin').notNull().default('1234'),
    title: text('title').notNull(),
    category: text('category').notNull().default('Konveksi'),
    description: text('description').default(''),
    specifications: text('specifications').default(''),
    orderStatus: text('order_status').notNull().default('menunggu_konfirmasi'),
    // 'menunggu_konfirmasi' | 'dikonfirmasi' | 'diproses' | 'siap_dikirim' | 'selesai' | 'dibatalkan'
    designStatus: text('design_status').notNull().default('menunggu_desain'),
    // 'menunggu_desain' | 'menunggu_persetujuan' | 'revisi' | 'disetujui' | 'tidak_perlu'
    productionStatus: text('production_status').notNull().default('menunggu_produksi'),
    // 'menunggu_produksi' | 'persiapan' | 'dalam_produksi' | 'quality_control' | 'siap_dikirim' | 'selesai'
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    // 'unpaid' | 'partial' | 'paid' | 'refunded' | 'partially_refunded'
    requiresDesignApproval: boolean('requires_design_approval').notNull().default(true),
    minDpPercent: integer('min_dp_percent').notNull().default(50),
    subtotal: bigint('subtotal', { mode: 'number' }).notNull().default(0),
    additionalCost: bigint('additional_cost', { mode: 'number' }).notNull().default(0),
    discount: bigint('discount', { mode: 'number' }).notNull().default(0),
    grandTotal: bigint('grand_total', { mode: 'number' }).notNull().default(0),
    paidAmount: bigint('paid_amount', { mode: 'number' }).notNull().default(0),
    refundedAmount: bigint('refunded_amount', { mode: 'number' }).notNull().default(0),
    orderDate: timestamp('order_date').defaultNow().notNull(),
    deadline: timestamp('deadline').notNull(),
    notes: text('notes').default(''),
    cancelReason: text('cancel_reason'),
    cancelledAt: timestamp('cancelled_at'),
    completedAt: timestamp('completed_at'),
    createdByUid: text('created_by_uid').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('orders_business_number_unique').on(table.businessId, table.orderNumber),
    uniqueIndex('orders_tracking_token_unique').on(table.trackingToken),
    index('orders_business_id_idx').on(table.businessId),
    index('orders_customer_id_idx').on(table.customerId),
    index('orders_order_status_idx').on(table.orderStatus),
    index('orders_deadline_idx').on(table.deadline),
  ]
);

// 5. order_items
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productName: text('product_name').notNull(),
    description: text('description').default(''),
    specifications: text('specifications').default(''),
    quantity: integer('quantity').notNull().default(1),
    unit: text('unit').notNull().default('pcs'),
    unitPrice: bigint('unit_price', { mode: 'number' }).notNull().default(0),
    lineTotal: bigint('line_total', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('order_items_order_id_idx').on(table.orderId),
    index('order_items_business_id_idx').on(table.businessId),
  ]
);

// 6. design_files
export const designFiles = pgTable(
  'design_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    fileType: text('file_type').notNull().default('design_proof'), // 'design_proof' | 'customer_reference'
    title: text('title').notNull(),
    fileName: text('file_name').notNull(),
    fileUrl: text('file_url').notNull(),
    notes: text('notes').default(''),
    approvalStatus: text('approval_status').notNull().default('menunggu_persetujuan'),
    // 'menunggu_desain' | 'menunggu_persetujuan' | 'revisi' | 'disetujui'
    isProductionReference: boolean('is_production_reference').notNull().default(false),
    uploadedByUid: text('uploaded_by_uid').notNull(),
    uploadedByName: text('uploaded_by_name').notNull(),
    uploadedByRole: text('uploaded_by_role').notNull(),
    approvedAt: timestamp('approved_at'),
    approvedByName: text('approved_by_name'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('design_files_order_id_idx').on(table.orderId),
    index('design_files_business_id_idx').on(table.businessId),
  ]
);

// 7. design_revisions
export const designRevisions = pgTable(
  'design_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    designFileId: uuid('design_file_id').references(() => designFiles.id, { onDelete: 'set null' }),
    revisionNumber: integer('revision_number').notNull().default(1),
    revisionNotes: text('revision_notes').notNull(),
    status: text('status').notNull().default('open'), // 'open' | 'resolved'
    requestedByUid: text('requested_by_uid').notNull(),
    requestedByName: text('requested_by_name').notNull(),
    requestedByRole: text('requested_by_role').notNull(),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('design_revisions_order_id_idx').on(table.orderId),
    index('design_revisions_business_id_idx').on(table.businessId),
  ]
);

// 8. production_jobs
export const productionJobs = pgTable(
  'production_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    jobNumber: text('job_number').notNull(),
    status: text('status').notNull().default('menunggu_produksi'),
    // 'menunggu_produksi' | 'persiapan' | 'dalam_produksi' | 'quality_control' | 'siap_dikirim' | 'selesai'
    priority: text('priority').notNull().default('normal'), // 'normal' | 'tinggi' | 'mendesak'
    assignedStaffUid: text('assigned_staff_uid'),
    assignedStaffName: text('assigned_staff_name'),
    deadline: timestamp('deadline').notNull(),
    productionNotes: text('production_notes').default(''),
    photos: jsonb('photos')
      .$type<Array<{ id: string; url: string; caption: string; uploadedBy: string; uploadedAt: string }>>()
      .notNull()
      .default([]),
    qcPassed: boolean('qc_passed').notNull().default(false),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('production_jobs_order_unique').on(table.orderId),
    uniqueIndex('production_jobs_business_job_unique').on(table.businessId, table.jobNumber),
    index('production_jobs_business_id_idx').on(table.businessId),
    index('production_jobs_status_idx').on(table.status),
  ]
);

// 9. production_logs
export const productionLogs = pgTable(
  'production_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    productionJobId: uuid('production_job_id')
      .notNull()
      .references(() => productionJobs.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    notes: text('notes').default(''),
    photoUrl: text('photo_url'),
    actorUid: text('actor_uid').notNull(),
    actorName: text('actor_name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('production_logs_job_id_idx').on(table.productionJobId),
    index('production_logs_business_id_idx').on(table.businessId),
  ]
);

// 10. qc_inspections
export const qcInspections = pgTable(
  'qc_inspections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    productionJobId: uuid('production_job_id')
      .notNull()
      .references(() => productionJobs.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    inspectorUid: text('inspector_uid').notNull(),
    inspectorName: text('inspector_name').notNull(),
    passed: boolean('passed').notNull(),
    checklist: jsonb('checklist')
      .$type<{
        materialChecked: boolean;
        dimensionChecked: boolean;
        printColorChecked: boolean;
        finishingChecked: boolean;
      }>()
      .notNull(),
    notes: text('notes').default(''),
    inspectedAt: timestamp('inspected_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('qc_inspections_job_id_idx').on(table.productionJobId),
    index('qc_inspections_business_id_idx').on(table.businessId),
  ]
);

// 11. invoices
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    invoiceNumber: text('invoice_number').notNull(),
    issueDate: timestamp('issue_date').defaultNow().notNull(),
    dueDate: timestamp('due_date').notNull(),
    subtotal: bigint('subtotal', { mode: 'number' }).notNull().default(0),
    additionalCost: bigint('additional_cost', { mode: 'number' }).notNull().default(0),
    discount: bigint('discount', { mode: 'number' }).notNull().default(0),
    grandTotal: bigint('grand_total', { mode: 'number' }).notNull().default(0),
    verifiedPaidAmount: bigint('verified_paid_amount', { mode: 'number' }).notNull().default(0),
    refundedAmount: bigint('refunded_amount', { mode: 'number' }).notNull().default(0),
    status: text('status').notNull().default('unpaid'),
    // 'unpaid' | 'partial' | 'paid' | 'refunded' | 'partially_refunded'
    notes: text('notes').default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('invoices_business_number_unique').on(table.businessId, table.invoiceNumber),
    uniqueIndex('invoices_order_unique').on(table.orderId),
    index('invoices_business_id_idx').on(table.businessId),
    index('invoices_status_idx').on(table.status),
  ]
);

// 12. payments
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    paymentNumber: text('payment_number').notNull(),
    paymentType: text('payment_type').notNull().default('dp'), // 'dp' | 'partial' | 'pelunasan' | 'refund'
    method: text('method').notNull().default('transfer_bank'), // 'transfer_bank' | 'qris' | 'tunai' | 'virtual_account'
    amount: bigint('amount', { mode: 'number' }).notNull(),
    proofUrl: text('proof_url').default(''),
    referenceCode: text('reference_code').default(''),
    verificationStatus: text('verification_status').notNull().default('pending'),
    // 'pending' | 'verified' | 'rejected'
    notes: text('notes').default(''),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
    submittedByUid: text('submitted_by_uid').notNull(),
    submittedByName: text('submitted_by_name').notNull(),
    verifiedByUid: text('verified_by_uid'),
    verifiedByName: text('verified_by_name'),
    verifiedAt: timestamp('verified_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('payments_invoice_id_idx').on(table.invoiceId),
    index('payments_order_id_idx').on(table.orderId),
    index('payments_business_id_idx').on(table.businessId),
    index('payments_verification_status_idx').on(table.verificationStatus),
  ]
);

// 13. shipping_records
export const shippingRecords = pgTable(
  'shipping_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    courierName: text('courier_name').notNull().default('Ambil di Workshop'),
    serviceType: text('service_type').default('Reguler'),
    trackingNumber: text('tracking_number').default(''),
    recipientName: text('recipient_name').notNull(),
    recipientPhone: text('recipient_phone').notNull(),
    shippingAddress: text('shipping_address').notNull(),
    shippingCost: bigint('shipping_cost', { mode: 'number' }).notNull().default(0),
    status: text('status').notNull().default('belum_dikirim'),
    // 'belum_dikirim' | 'dikemas' | 'dikirim' | 'diterima'
    shippedAt: timestamp('shipped_at'),
    deliveredAt: timestamp('delivered_at'),
    notes: text('notes').default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('shipping_records_order_unique').on(table.orderId),
    index('shipping_records_business_id_idx').on(table.businessId),
  ]
);

// 14. order_status_history
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(), // 'order' | 'design' | 'production' | 'payment' | 'shipping'
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    reason: text('reason').default(''),
    actorUid: text('actor_uid').notNull(),
    actorName: text('actor_name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('order_status_history_order_id_idx').on(table.orderId),
    index('order_status_history_business_id_idx').on(table.businessId),
  ]
);

// 15. notifications
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    recipientUid: text('recipient_uid'),
    targetRole: text('target_role'),
    type: text('type').notNull(),
    // 'pesanan_baru' | 'status_produksi' | 'deadline_mendekat' | 'pesanan_terlambat' | 'desain_approval' | 'revisi_pelanggan' | 'pembayaran_diterima' | 'invoice_belum_dibayar'
    title: text('title').notNull(),
    message: text('message').notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    isRead: boolean('is_read').notNull().default(false),
    deliveryChannels: jsonb('delivery_channels')
      .$type<{ inApp: boolean; whatsappReady: boolean; emailReady: boolean }>()
      .notNull()
      .default({ inApp: true, whatsappReady: false, emailReady: false }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('notifications_business_id_idx').on(table.businessId),
    index('notifications_is_read_idx').on(table.isRead),
  ]
);

// 16. activity_logs
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    actorUid: text('actor_uid').notNull(),
    actorName: text('actor_name').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    description: text('description').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('activity_logs_business_id_idx').on(table.businessId),
    index('activity_logs_created_at_idx').on(table.createdAt),
  ]
);

// 17. subscriptions
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    plan: text('plan').notNull().default('STARTER'), // 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE'
    status: text('status').notNull().default('active'), // 'active' | 'past_due' | 'expired' | 'cancelled'
    monthlyPrice: bigint('monthly_price', { mode: 'number' }).notNull().default(69000),
    orderLimit: integer('order_limit').notNull().default(150),
    userLimit: integer('user_limit').notNull().default(3),
    ordersUsedThisMonth: integer('orders_used_this_month').notNull().default(0),
    currentPeriodStart: timestamp('current_period_start').defaultNow().notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    paymentGatewayMode: text('payment_gateway_mode').notNull().default('simulation'),
    lastSimulationRef: text('last_simulation_ref'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('subscriptions_business_unique').on(table.businessId),
  ]
);

// 18. business_settings
export const businessSettings = pgTable(
  'business_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    orderPrefix: text('order_prefix').notNull().default('ORD'),
    invoicePrefix: text('invoice_prefix').notNull().default('INV'),
    defaultMinDpPercent: integer('default_min_dp_percent').notNull().default(50),
    requireDesignApprovalDefault: boolean('require_design_approval_default').notNull().default(true),
    requireDpBeforeProduction: boolean('require_dp_before_production').notNull().default(true),
    bankName: text('bank_name').notNull().default('BCA'),
    bankAccountNumber: text('bank_account_number').notNull().default('8810492819'),
    bankAccountHolder: text('bank_account_holder').notNull().default('PT Karya Custom Nusantara'),
    invoiceFooterNotes: text('invoice_footer_notes')
      .notNull()
      .default('Mohon sertakan nomor invoice pada berita transfer. Produksi dimulai setelah DP terverifikasi.'),
    whatsappWebhookUrl: text('whatsapp_webhook_url').default(''),
    emailNotificationEnabled: boolean('email_notification_enabled').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('business_settings_business_unique').on(table.businessId),
  ]
);

// Relations
export const businessesRelations = relations(businesses, ({ many, one }) => ({
  users: many(users),
  customers: many(customers),
  orders: many(orders),
  subscription: one(subscriptions, {
    fields: [businesses.id],
    references: [subscriptions.businessId],
  }),
  settings: one(businessSettings, {
    fields: [businesses.id],
    references: [businessSettings.businessId],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  business: one(businesses, {
    fields: [orders.businessId],
    references: [businesses.id],
  }),
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  items: many(orderItems),
  designFiles: many(designFiles),
  designRevisions: many(designRevisions),
  productionJob: one(productionJobs, {
    fields: [orders.id],
    references: [productionJobs.orderId],
  }),
  invoice: one(invoices, {
    fields: [orders.id],
    references: [invoices.orderId],
  }),
  shipping: one(shippingRecords, {
    fields: [orders.id],
    references: [shippingRecords.orderId],
  }),
  statusHistory: many(orderStatusHistory),
}));
