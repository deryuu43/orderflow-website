import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  requireAuth,
  requireRoles,
  createRateLimiter,
  type AuthRequest,
} from './src/middleware/auth.ts';
import {
  listCustomers,
  getCustomerDetail,
  createCustomer,
  updateCustomer,
  listOrders,
  getOrderFullDetail,
  createOrderWithItems,
  updateOrderWithItems,
  updateOrderStatusAction,
  deleteOrderSafely,
  updateShippingRecord,
} from './src/db/repositories/ordersRepo.ts';
import {
  listProductionBoard,
  getProductionJobDetail,
  updateProductionJob,
  recordQcInspection,
  addProductionPhoto,
  uploadDesignFile,
  requestDesignRevision,
  approveDesignFile,
} from './src/db/repositories/productionDesignRepo.ts';
import {
  listInvoices,
  getInvoiceDetail,
  submitPaymentRecord,
  verifyPaymentRecord,
  getDashboardAnalytics,
  getReportsAnalytics,
  getWorkspaceManagement,
  updateBusinessAndSettings,
  inviteTeamMember,
  updateTeamMember,
  simulateSubscriptionCheckout,
  listNotifications,
  markAllNotificationsRead,
  getPublicOrderTracking,
  seedOperationalWorkspaceData,
} from './src/db/repositories/financeAnalyticsRepo.ts';
import { db } from './src/db/index.ts';
import { users } from './src/db/schema.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validation Schemas (Zod)
const safeAssetUrlSchema = z
  .string()
  .max(6_500_000)
  .refine(
    (val) =>
      val === '' ||
      val.startsWith('https://') ||
      val.startsWith('http://') ||
      val.startsWith('data:image/') ||
      val.startsWith('data:application/pdf'),
    'Format file atau URL tidak diizinkan (hanya gambar atau PDF valid).'
  );

const customerBodySchema = z.object({
  name: z.string().min(2, 'Nama pelanggan minimal 2 karakter').max(120),
  company: z.string().max(150).optional().default(''),
  email: z.string().email('Format email tidak valid').or(z.literal('')).optional().default(''),
  phone: z.string().min(6, 'Nomor telepon minimal 6 digit').max(30),
  address: z.string().max(400).optional().default(''),
  notes: z.string().max(500).optional().default(''),
});

const orderItemSchema = z.object({
  productName: z.string().min(2, 'Nama produk wajib diisi').max(160),
  description: z.string().max(400).optional().default(''),
  specifications: z.string().max(500).optional().default(''),
  quantity: z.coerce.number().int().min(1, 'Jumlah minimal 1'),
  unit: z.string().max(30).optional().default('pcs'),
  unitPrice: z.coerce.number().min(0, 'Harga satuan tidak boleh negatif'),
});

const orderBodySchema = z.object({
  customerId: z.string().uuid('Pilih pelanggan yang valid'),
  title: z.string().min(3, 'Judul pesanan minimal 3 karakter').max(180),
  category: z.string().min(2).max(80).default('Konveksi'),
  description: z.string().max(1000).optional().default(''),
  specifications: z.string().max(1500).optional().default(''),
  items: z.array(orderItemSchema).min(1, 'Minimal 1 item produk dalam pesanan'),
  additionalCost: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
  requiresDesignApproval: z.boolean().default(true),
  minDpPercent: z.coerce.number().min(0).max(100).default(50),
  orderDate: z.string().optional(),
  deadline: z.string().min(4, 'Deadline wajib diisi'),
  notes: z.string().max(1000).optional().default(''),
});

function resolveServerPort(): number {
  const portFlagIndex = process.argv.indexOf('--port');
  if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
    const cliPort = Number(process.argv[portFlagIndex + 1]);
    if (!Number.isNaN(cliPort) && cliPort > 0) return cliPort;
  }
  const eqPortArg = process.argv.find((arg) => arg.startsWith('--port='));
  if (eqPortArg) {
    const cliPort = Number(eqPortArg.split('=')[1]);
    if (!Number.isNaN(cliPort) && cliPort > 0) return cliPort;
  }
  if (process.env.NODE_ENV !== 'production') {
    return 3000;
  }
  return Number(process.env.PORT || 3000);
}

async function startServer() {
  const app = express();
  const PORT = resolveServerPort();

  app.use(express.json({ limit: '8mb' }));
  app.use('/api', createRateLimiter(180, 60_000));

  // Public Order Tracking API (Rate-limited + PIN protected)
  app.get('/api/public/track/:token', createRateLimiter(30, 60_000), async (req, res) => {
    try {
      const pin = typeof req.query.pin === 'string' ? req.query.pin : undefined;
      const result = await getPublicOrderTracking(req.params.token, pin);
      res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Gagal melacak pesanan.';
      res.status(404).json({ error: msg });
    }
  });

  // Auth & Workspace Session Endpoint
  app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const ctx = req.workspaceUser!;
      const notificationsList = await listNotifications(ctx);
      const unreadCount = notificationsList.filter((n) => !n.isRead).length;
      res.json({
        user: ctx,
        unreadNotifications: unreadCount,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Gagal memuat sesi.';
      res.status(500).json({ error: msg });
    }
  });

  app.patch('/api/me/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const ctx = req.workspaceUser!;
      const schema = z.object({
        fullName: z.string().min(2).max(120),
        phone: z.string().max(30).optional().default(''),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Input tidak valid' });
      }
      const [updated] = await db
        .update(users)
        .set({
          fullName: parsed.data.fullName.trim(),
          phone: parsed.data.phone.trim(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.id))
        .returning();
      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: 'Gagal memperbarui profil pengguna.' });
    }
  });

  // Seed sample operational records into PostgreSQL (Owner only, when workspace is empty)
  app.post(
    '/api/workspace/seed',
    requireAuth,
    requireRoles(['owner']),
    async (req: AuthRequest, res) => {
      try {
        const result = await seedOperationalWorkspaceData(req.workspaceUser!);
        res.json(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memuat data operasional.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Dashboard Analytics
  app.get(
    '/api/dashboard',
    requireAuth,
    requireRoles(['owner', 'admin', 'production_staff']),
    async (req: AuthRequest, res) => {
      try {
        const data = await getDashboardAnalytics(req.workspaceUser!);
        res.json(data);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memuat dashboard.';
        res.status(500).json({ error: msg });
      }
    }
  );

  // Customers CRUD
  app.get(
    '/api/customers',
    requireAuth,
    requireRoles(['owner', 'admin']),
    async (req: AuthRequest, res) => {
      try {
        const search = typeof req.query.search === 'string' ? req.query.search : undefined;
        const list = await listCustomers(req.workspaceUser!, search);
        res.json(list);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memuat pelanggan.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.get(
    '/api/customers/:id',
    requireAuth,
    requireRoles(['owner', 'admin']),
    async (req: AuthRequest, res) => {
      try {
        const detail = await getCustomerDetail(req.workspaceUser!, req.params.id);
        res.json(detail);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memuat detail pelanggan.';
        res.status(404).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/customers',
    requireAuth,
    requireRoles(['owner', 'admin']),
    async (req: AuthRequest, res) => {
      try {
        const parsed = customerBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: parsed.error.issues[0]?.message || 'Data pelanggan tidak valid.' });
        }
        const created = await createCustomer(req.workspaceUser!, parsed.data);
        res.status(201).json(created);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal menambah pelanggan.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.put(
    '/api/customers/:id',
    requireAuth,
    requireRoles(['owner', 'admin']),
    async (req: AuthRequest, res) => {
      try {
        const parsed = customerBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: parsed.error.issues[0]?.message || 'Data pelanggan tidak valid.' });
        }
        const updated = await updateCustomer(req.workspaceUser!, req.params.id, parsed.data);
        res.json(updated);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal mengubah pelanggan.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Orders Management & Customer Portal Orders
  app.get(
    '/api/orders',
    requireAuth,
    requireRoles(['owner', 'admin', 'production_staff', 'customer']),
    async (req: AuthRequest, res) => {
      try {
        const result = await listOrders(req.workspaceUser!, {
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
          paymentStatus:
            typeof req.query.paymentStatus === 'string' ? req.query.paymentStatus : undefined,
          dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
          dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
          page: req.query.page ? Number(req.query.page) : 1,
          pageSize: req.query.pageSize ? Number(req.query.pageSize) : 10,
        });
        res.json(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memuat pesanan.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.get(
    '/api/orders/:id',
    requireAuth,
    requireRoles(['owner', 'admin', 'production_staff', 'customer']),
    async (req: AuthRequest, res) => {
      try {
        const detail = await getOrderFullDetail(req.workspaceUser!, req.params.id);
        res.json(detail);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memuat detail pesanan.';
        res.status(404).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/orders',
    requireAuth,
    requireRoles(['owner', 'admin']),
    async (req: AuthRequest, res) => {
      try {
        const parsed = orderBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: parsed.error.issues[0]?.message || 'Form pesanan belum lengkap.' });
        }
        const created = await createOrderWithItems(req.workspaceUser!, parsed.data);
        res.status(201).json(created);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal membuat pesanan.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.put(
    '/api/orders/:id',
    requireAuth,
    requireRoles(['owner', 'admin']),
    async (req: AuthRequest, res) => {
      try {
        const parsed = orderBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: parsed.error.issues[0]?.message || 'Form pesanan tidak valid.' });
        }
        const updated = await updateOrderWithItems(req.workspaceUser!, req.params.id, parsed.data);
        res.json(updated);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memperbarui pesanan.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/orders/:id/status',
    requireAuth,
    requireRoles(['owner', 'admin']),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          action: z.enum(['confirm', 'cancel', 'complete']),
          reason: z.string().max(400).optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Tindakan status tidak valid.' });
        }
        const updated = await updateOrderStatusAction(
          req.workspaceUser!,
          req.params.id,
          parsed.data.action,
          parsed.data.reason
        );
        res.json(updated);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memperbarui status pesanan.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.delete(
    '/api/orders/:id',
    requireAuth,
    requireRoles(['owner', 'admin']),
    async (req: AuthRequest, res) => {
      try {
        const result = await deleteOrderSafely(req.workspaceUser!, req.params.id);
        res.json(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal menghapus pesanan.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.put(
    '/api/orders/:id/shipping',
    requireAuth,
    requireRoles(['owner', 'admin']),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          courierName: z.string().min(2).max(100),
          serviceType: z.string().max(80).optional(),
          trackingNumber: z.string().max(100).optional(),
          recipientName: z.string().min(2).max(120),
          recipientPhone: z.string().min(5).max(30),
          shippingAddress: z.string().min(3).max(400),
          shippingCost: z.coerce.number().min(0).optional(),
          status: z.enum(['belum_dikirim', 'dikemas', 'dikirim', 'diterima']),
          notes: z.string().max(400).optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: parsed.error.issues[0]?.message || 'Data pengiriman tidak valid.' });
        }
        const updated = await updateShippingRecord(req.workspaceUser!, req.params.id, parsed.data);
        res.json(updated);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memperbarui pengiriman.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Design & Revision Endpoints
  app.post(
    '/api/orders/:id/designs',
    requireAuth,
    requireRoles(['owner', 'admin', 'customer']),
    async (req: AuthRequest, res) => {
      try {
        const ctx = req.workspaceUser!;
        const schema = z.object({
          fileType: z.enum(['design_proof', 'customer_reference']),
          title: z.string().min(2, 'Judul desain wajib diisi').max(150),
          fileName: z.string().min(1).max(180),
          fileUrl: safeAssetUrlSchema.refine((v) => v.length > 0, 'File/URL desain wajib diisi'),
          notes: z.string().max(600).optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: parsed.error.issues[0]?.message || 'Data desain tidak valid.' });
        }
        if (ctx.effectiveRole === 'customer' && parsed.data.fileType === 'design_proof') {
          return res
            .status(403)
            .json({ error: 'Pelanggan hanya dapat mengunggah file referensi desain.' });
        }
        const created = await uploadDesignFile(ctx, req.params.id, parsed.data);
        res.status(201).json(created);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal mengunggah desain.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/orders/:id/designs/revision',
    requireAuth,
    requireRoles(['owner', 'admin', 'customer']),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          designFileId: z.string().uuid().optional(),
          revisionNotes: z.string().min(3, 'Catatan revisi minimal 3 karakter').max(1000),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: parsed.error.issues[0]?.message || 'Catatan revisi wajib diisi.' });
        }
        const created = await requestDesignRevision(req.workspaceUser!, req.params.id, parsed.data);
        res.status(201).json(created);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal meminta revisi.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/orders/:id/designs/:designId/approve',
    requireAuth,
    requireRoles(['owner', 'admin', 'customer']),
    async (req: AuthRequest, res) => {
      try {
        const approved = await approveDesignFile(
          req.workspaceUser!,
          req.params.id,
          req.params.designId
        );
        res.json(approved);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal menyetujui desain.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Production Management Endpoints
  app.get(
    '/api/production',
    requireAuth,
    requireRoles(['owner', 'admin', 'production_staff']),
    async (req: AuthRequest, res) => {
      try {
        const board = await listProductionBoard(req.workspaceUser!);
        res.json(board);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memuat papan produksi.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.get(
    '/api/production/:id',
    requireAuth,
    requireRoles(['owner', 'admin', 'production_staff']),
    async (req: AuthRequest, res) => {
      try {
        const detail = await getProductionJobDetail(req.workspaceUser!, req.params.id);
        res.json(detail);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memuat detail produksi.';
        res.status(404).json({ error: msg });
      }
    }
  );

  app.patch(
    '/api/production/:id',
    requireAuth,
    requireRoles(['owner', 'admin', 'production_staff']),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          status: z
            .enum([
              'menunggu_produksi',
              'persiapan',
              'dalam_produksi',
              'quality_control',
              'siap_dikirim',
              'selesai',
            ])
            .optional(),
          priority: z.enum(['normal', 'tinggi', 'mendesak']).optional(),
          assignedStaffUid: z.string().nullable().optional(),
          assignedStaffName: z.string().nullable().optional(),
          productionNotes: z.string().max(1500).optional(),
          logNotes: z.string().max(500).optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: parsed.error.issues[0]?.message || 'Input produksi tidak valid.' });
        }
        const updated = await updateProductionJob(req.workspaceUser!, req.params.id, parsed.data);
        res.json(updated);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memperbarui pekerjaan produksi.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/production/:id/qc',
    requireAuth,
    requireRoles(['owner', 'admin', 'production_staff']),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          passed: z.boolean(),
          checklist: z.object({
            materialChecked: z.boolean(),
            dimensionChecked: z.boolean(),
            printColorChecked: z.boolean(),
            finishingChecked: z.boolean(),
          }),
          notes: z.string().max(600).optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Data inspeksi QC tidak valid.' });
        }
        const inspection = await recordQcInspection(req.workspaceUser!, req.params.id, parsed.data);
        res.status(201).json(inspection);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal menyimpan inspeksi QC.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/production/:id/photos',
    requireAuth,
    requireRoles(['owner', 'admin', 'production_staff']),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          url: safeAssetUrlSchema.refine((v) => v.length > 0, 'Foto hasil produksi wajib dipilih'),
          caption: z.string().min(2, 'Keterangan foto minimal 2 karakter').max(200),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: parsed.error.issues[0]?.message || 'Foto tidak valid.' });
        }
        const updated = await addProductionPhoto(req.workspaceUser!, req.params.id, parsed.data);
        res.status(201).json(updated);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal mengunggah foto produksi.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Invoices & Payments
  app.get(
    '/api/invoices',
    requireAuth,
    requireRoles(['owner', 'admin', 'customer']),
    async (req: AuthRequest, res) => {
      try {
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const search = typeof req.query.search === 'string' ? req.query.search : undefined;
        const list = await listInvoices(req.workspaceUser!, status, search);
        res.json(list);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memuat invoice.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.get(
    '/api/invoices/:id',
    requireAuth,
    requireRoles(['owner', 'admin', 'customer']),
    async (req: AuthRequest, res) => {
      try {
        const detail = await getInvoiceDetail(req.workspaceUser!, req.params.id);
        res.json(detail);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memuat detail invoice.';
        res.status(404).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/invoices/:id/payments',
    requireAuth,
    requireRoles(['owner', 'admin', 'customer']),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          paymentType: z.enum(['dp', 'partial', 'pelunasan', 'refund']),
          method: z.enum(['transfer_bank', 'qris', 'tunai', 'virtual_account']),
          amount: z.coerce.number().positive('Nominal pembayaran harus lebih dari 0'),
          proofUrl: safeAssetUrlSchema.optional().default(''),
          referenceCode: z.string().max(100).optional().default(''),
          notes: z.string().max(500).optional().default(''),
          autoVerify: z.boolean().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: parsed.error.issues[0]?.message || 'Data pembayaran tidak valid.' });
        }
        const created = await submitPaymentRecord(
          req.workspaceUser!,
          req.params.id,
          parsed.data
        );
        res.status(201).json(created);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal mencatat pembayaran.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/payments/:id/verify',
    requireAuth,
    requireRoles(['owner', 'admin']),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          decision: z.enum(['verified', 'rejected']),
          notes: z.string().max(400).optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Keputusan verifikasi tidak valid.' });
        }
        const updated = await verifyPaymentRecord(
          req.workspaceUser!,
          req.params.id,
          parsed.data.decision,
          parsed.data.notes
        );
        res.json(updated);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memverifikasi pembayaran.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Reports & Analytics
  app.get(
    '/api/reports',
    requireAuth,
    requireRoles(['owner', 'admin']),
    async (req: AuthRequest, res) => {
      try {
        const rangeRaw = typeof req.query.range === 'string' ? req.query.range : 'month';
        const allowedRanges = ['today', 'week', 'month', 'year', 'custom'] as const;
        const range = allowedRanges.includes(rangeRaw as (typeof allowedRanges)[number])
          ? (rangeRaw as (typeof allowedRanges)[number])
          : 'month';
        const data = await getReportsAnalytics(req.workspaceUser!, {
          range,
          startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
          endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
        });
        res.json(data);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memuat laporan.';
        res.status(500).json({ error: msg });
      }
    }
  );

  // Workspace Settings, Team & Subscription
  app.get(
    '/api/workspace',
    requireAuth,
    requireRoles(['owner', 'admin']),
    async (req: AuthRequest, res) => {
      try {
        const data = await getWorkspaceManagement(req.workspaceUser!);
        res.json(data);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memuat data workspace.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.put(
    '/api/workspace/settings',
    requireAuth,
    requireRoles(['owner']),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          name: z.string().min(2).max(150),
          industry: z.string().min(2).max(120),
          phone: z.string().max(30),
          email: z.string().email().or(z.literal('')),
          address: z.string().max(400),
          orderPrefix: z.string().min(2).max(10),
          invoicePrefix: z.string().min(2).max(10),
          defaultMinDpPercent: z.coerce.number().min(0).max(100),
          requireDesignApprovalDefault: z.boolean(),
          requireDpBeforeProduction: z.boolean(),
          bankName: z.string().max(80),
          bankAccountNumber: z.string().max(60),
          bankAccountHolder: z.string().max(120),
          invoiceFooterNotes: z.string().max(600),
          whatsappWebhookUrl: z.string().max(300).optional(),
          emailNotificationEnabled: z.boolean(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: parsed.error.issues[0]?.message || 'Pengaturan tidak valid.' });
        }
        const updated = await updateBusinessAndSettings(req.workspaceUser!, parsed.data);
        res.json(updated);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memperbarui pengaturan.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/workspace/team',
    requireAuth,
    requireRoles(['owner']),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          fullName: z.string().min(2, 'Nama lengkap minimal 2 karakter').max(120),
          email: z.string().email('Email tidak valid'),
          role: z.enum(['admin', 'production_staff', 'customer']),
          phone: z.string().max(30).optional(),
          customerId: z.string().uuid().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: parsed.error.issues[0]?.message || 'Input undangan tidak valid.' });
        }
        const created = await inviteTeamMember(req.workspaceUser!, parsed.data);
        res.status(201).json(created);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal mengundang anggota.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.patch(
    '/api/workspace/team/:id',
    requireAuth,
    requireRoles(['owner']),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          role: z.enum(['owner', 'admin', 'production_staff', 'customer']).optional(),
          isActive: z.boolean().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Input pembaruan anggota tidak valid.' });
        }
        const updated = await updateTeamMember(req.workspaceUser!, req.params.id, parsed.data);
        res.json(updated);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal memperbarui anggota.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/workspace/subscription',
    requireAuth,
    requireRoles(['owner']),
    async (req: AuthRequest, res) => {
      try {
        const schema = z.object({
          plan: z.enum(['FREE', 'STARTER', 'BUSINESS', 'ENTERPRISE']),
          gatewayProvider: z.enum(['midtrans_sim', 'xendit_sim']).default('midtrans_sim'),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Pilihan paket tidak valid.' });
        }
        const updated = await simulateSubscriptionCheckout(
          req.workspaceUser!,
          parsed.data.plan,
          parsed.data.gatewayProvider
        );
        res.json(updated);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Gagal mengubah paket langganan.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Notifications
  app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await listNotifications(req.workspaceUser!);
      res.json(list);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Gagal memuat notifikasi.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await markAllNotificationsRead(req.workspaceUser!);
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: 'Gagal menandai notifikasi telah dibaca.' });
    }
  });

  // Frontend Vite Dev Middleware or Static Production Build
  if (process.env.NODE_ENV !== 'production') {
    const viteReady = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: {
          middlewareMode: true,
          host: '0.0.0.0',
          allowedHosts: true,
          hmr: process.env.DISABLE_HMR !== 'true',
        },
        appType: 'spa',
      })
    );

    app.use(async (req, res, next) => {
      try {
        const vite = await viteReady;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OrderFlow server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start OrderFlow server:', err);
  process.exit(1);
});
