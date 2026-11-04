import crypto from 'node:crypto';
import { eq, and, desc, asc, gte, lte, sql } from 'drizzle-orm';
import { db } from '../index.ts';
import {
  customers,
  orders,
  orderItems,
  productionJobs,
  invoices,
  shippingRecords,
  orderStatusHistory,
  notifications,
  activityLogs,
  subscriptions,
  businessSettings,
  designFiles,
  designRevisions,
  productionLogs,
  qcInspections,
  payments,
  businesses,
} from '../schema.ts';
import type { WorkspaceUserContext } from '../workspace.ts';

export interface OrderItemInput {
  productName: string;
  description?: string;
  specifications?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
}

export interface CreateOrderInput {
  customerId: string;
  title: string;
  category: string;
  description?: string;
  specifications?: string;
  items: OrderItemInput[];
  additionalCost: number;
  discount: number;
  requiresDesignApproval: boolean;
  minDpPercent: number;
  orderDate?: string;
  deadline: string;
  notes?: string;
}

function generateSecureTrackingToken(): string {
  const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `TRK-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function extractTrackingPin(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '1234';
}

export async function listCustomers(ctx: WorkspaceUserContext, search?: string) {
  try {
    const allCustomers = await db
      .select()
      .from(customers)
      .where(eq(customers.businessId, ctx.businessId))
      .orderBy(desc(customers.createdAt));

    const allOrders = await db
      .select({
        id: orders.id,
        customerId: orders.customerId,
        grandTotal: orders.grandTotal,
        paidAmount: orders.paidAmount,
        orderStatus: orders.orderStatus,
      })
      .from(orders)
      .where(eq(orders.businessId, ctx.businessId));

    const statsByCustomer = new Map<
      string,
      { orderCount: number; totalTransaction: number; totalPaid: number }
    >();

    for (const ord of allOrders) {
      if (ord.orderStatus === 'dibatalkan') continue;
      const cur = statsByCustomer.get(ord.customerId) || {
        orderCount: 0,
        totalTransaction: 0,
        totalPaid: 0,
      };
      cur.orderCount += 1;
      cur.totalTransaction += Number(ord.grandTotal || 0);
      cur.totalPaid += Number(ord.paidAmount || 0);
      statsByCustomer.set(ord.customerId, cur);
    }

    const q = (search || '').trim().toLowerCase();
    return allCustomers
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          (c.company || '').toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          c.customerCode.toLowerCase().includes(q)
        );
      })
      .map((c) => {
        const st = statsByCustomer.get(c.id) || {
          orderCount: 0,
          totalTransaction: 0,
          totalPaid: 0,
        };
        return {
          ...c,
          orderCount: st.orderCount,
          totalTransaction: st.totalTransaction,
          totalPaid: st.totalPaid,
        };
      });
  } catch (error) {
    console.error('Database query failed in listCustomers:', error);
    throw new Error('Gagal memuat daftar pelanggan.', { cause: error });
  }
}

export async function getCustomerDetail(ctx: WorkspaceUserContext, customerId: string) {
  try {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.businessId, ctx.businessId)))
      .limit(1);

    if (!customer) {
      throw new Error('Pelanggan tidak ditemukan.');
    }

    const customerOrders = await db
      .select()
      .from(orders)
      .where(and(eq(orders.businessId, ctx.businessId), eq(orders.customerId, customerId)))
      .orderBy(desc(orders.createdAt));

    const validOrders = customerOrders.filter((o) => o.orderStatus !== 'dibatalkan');
    const totalTransaction = validOrders.reduce((acc, o) => acc + Number(o.grandTotal || 0), 0);
    const totalVerifiedPaid = validOrders.reduce((acc, o) => acc + Number(o.paidAmount || 0), 0);

    return {
      customer,
      orders: customerOrders,
      summary: {
        totalOrders: customerOrders.length,
        activeOrders: validOrders.filter((o) => o.orderStatus !== 'selesai').length,
        totalTransaction,
        totalVerifiedPaid,
      },
    };
  } catch (error) {
    console.error('Database query failed in getCustomerDetail:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal memuat detail pelanggan.', {
      cause: error,
    });
  }
}

export async function createCustomer(
  ctx: WorkspaceUserContext,
  input: {
    name: string;
    company?: string;
    email?: string;
    phone: string;
    address?: string;
    notes?: string;
  }
) {
  try {
    const existingCountRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(eq(customers.businessId, ctx.businessId));

    const seq = (existingCountRes[0]?.count || 0) + 1;
    const customerCode = `CST-${String(seq).padStart(4, '0')}-${Math.random()
      .toString(36)
      .slice(2, 4)
      .toUpperCase()}`;

    const [created] = await db
      .insert(customers)
      .values({
        businessId: ctx.businessId,
        customerCode,
        name: input.name.trim(),
        company: (input.company || '').trim(),
        email: (input.email || '').trim().toLowerCase(),
        phone: input.phone.trim(),
        address: (input.address || '').trim(),
        notes: (input.notes || '').trim(),
      })
      .returning();

    await db.insert(activityLogs).values({
      businessId: ctx.businessId,
      actorUid: ctx.uid,
      actorName: ctx.fullName,
      actorRole: ctx.effectiveRole,
      action: 'CUSTOMER_CREATED',
      entityType: 'customer',
      entityId: created.id,
      description: `Menambahkan pelanggan baru: ${created.name} (${created.customerCode}).`,
    });

    return created;
  } catch (error) {
    console.error('Database query failed in createCustomer:', error);
    throw new Error('Gagal menyimpan pelanggan baru.', { cause: error });
  }
}

export async function updateCustomer(
  ctx: WorkspaceUserContext,
  customerId: string,
  input: {
    name: string;
    company?: string;
    email?: string;
    phone: string;
    address?: string;
    notes?: string;
  }
) {
  try {
    const [updated] = await db
      .update(customers)
      .set({
        name: input.name.trim(),
        company: (input.company || '').trim(),
        email: (input.email || '').trim().toLowerCase(),
        phone: input.phone.trim(),
        address: (input.address || '').trim(),
        notes: (input.notes || '').trim(),
        updatedAt: new Date(),
      })
      .where(and(eq(customers.id, customerId), eq(customers.businessId, ctx.businessId)))
      .returning();

    if (!updated) {
      throw new Error('Pelanggan tidak ditemukan.');
    }

    await db.insert(activityLogs).values({
      businessId: ctx.businessId,
      actorUid: ctx.uid,
      actorName: ctx.fullName,
      actorRole: ctx.effectiveRole,
      action: 'CUSTOMER_UPDATED',
      entityType: 'customer',
      entityId: updated.id,
      description: `Memperbarui data pelanggan: ${updated.name}.`,
    });

    return updated;
  } catch (error) {
    console.error('Database query failed in updateCustomer:', error);
    throw new Error('Gagal memperbarui data pelanggan.', { cause: error });
  }
}

export async function listOrders(
  ctx: WorkspaceUserContext,
  filters: {
    search?: string;
    status?: string;
    paymentStatus?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }
) {
  try {
    const conditions = [eq(orders.businessId, ctx.businessId)];

    // IDOR & Customer Role Isolation: Customers ONLY see their own orders
    if (ctx.effectiveRole === 'customer') {
      if (ctx.customerId) {
        conditions.push(eq(orders.customerId, ctx.customerId));
      } else {
        // Fallback match by customer email
        const matchingCustomers = await db
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.businessId, ctx.businessId),
              eq(customers.email, ctx.email.toLowerCase())
            )
          );
        if (matchingCustomers[0]) {
          conditions.push(eq(orders.customerId, matchingCustomers[0].id));
        } else {
          // If owner is previewing customer portal, show the first customer's orders so preview is meaningful, else empty
          if (ctx.actualRole === 'owner') {
            const firstCust = await db
              .select({ id: customers.id })
              .from(customers)
              .where(eq(customers.businessId, ctx.businessId))
              .orderBy(asc(customers.createdAt))
              .limit(1);
            if (firstCust[0]) {
              conditions.push(eq(orders.customerId, firstCust[0].id));
            } else {
              return { data: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
            }
          } else {
            return { data: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
          }
        }
      }
    }

    if (filters.status && filters.status !== 'all') {
      conditions.push(eq(orders.orderStatus, filters.status));
    }
    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
      conditions.push(eq(orders.paymentStatus, filters.paymentStatus));
    }
    if (filters.dateFrom) {
      conditions.push(gte(orders.orderDate, new Date(filters.dateFrom)));
    }
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(orders.orderDate, end));
    }

    const rows = await db
      .select({
        order: orders,
        customer: customers,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt));

    const q = (filters.search || '').trim().toLowerCase();
    const now = new Date();

    const filtered = rows
      .filter(({ order, customer }) => {
        if (!q) return true;
        return (
          order.orderNumber.toLowerCase().includes(q) ||
          order.title.toLowerCase().includes(q) ||
          customer.name.toLowerCase().includes(q) ||
          (customer.company || '').toLowerCase().includes(q) ||
          order.trackingToken.toLowerCase().includes(q)
        );
      })
      .map(({ order, customer }) => {
        const isOverdue =
          new Date(order.deadline) < now &&
          order.orderStatus !== 'selesai' &&
          order.orderStatus !== 'dibatalkan';
        return {
          ...order,
          isOverdue,
          customer: {
            id: customer.id,
            name: customer.name,
            company: customer.company,
            phone: customer.phone,
            email: customer.email,
          },
        };
      });

    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.min(50, Math.max(5, Number(filters.pageSize || 10)));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const startIdx = (page - 1) * pageSize;
    const paginated = filtered.slice(startIdx, startIdx + pageSize);

    return {
      data: paginated,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch (error) {
    console.error('Database query failed in listOrders:', error);
    throw new Error('Gagal memuat daftar pesanan.', { cause: error });
  }
}

export async function getOrderFullDetail(ctx: WorkspaceUserContext, orderId: string) {
  try {
    const [row] = await db
      .select({
        order: orders,
        customer: customers,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(and(eq(orders.id, orderId), eq(orders.businessId, ctx.businessId)))
      .limit(1);

    if (!row) {
      throw new Error('Pesanan tidak ditemukan.');
    }

    // Customer IDOR verification
    if (ctx.effectiveRole === 'customer' && ctx.actualRole !== 'owner') {
      const allowedById = ctx.customerId && row.order.customerId === ctx.customerId;
      const allowedByEmail =
        row.customer.email && row.customer.email.toLowerCase() === ctx.email.toLowerCase();
      if (!allowedById && !allowedByEmail) {
        throw new Error('Anda tidak memiliki izin mengakses pesanan ini.');
      }
    }

    const [
      items,
      designs,
      revisions,
      prodJobs,
      invList,
      shipList,
      history,
      bizSettingsList,
      bizList,
    ] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.createdAt)),
      db.select().from(designFiles).where(eq(designFiles.orderId, orderId)).orderBy(desc(designFiles.version)),
      db.select().from(designRevisions).where(eq(designRevisions.orderId, orderId)).orderBy(desc(designRevisions.createdAt)),
      db.select().from(productionJobs).where(eq(productionJobs.orderId, orderId)).limit(1),
      db.select().from(invoices).where(eq(invoices.orderId, orderId)).limit(1),
      db.select().from(shippingRecords).where(eq(shippingRecords.orderId, orderId)).limit(1),
      db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId)).orderBy(desc(orderStatusHistory.createdAt)),
      db.select().from(businessSettings).where(eq(businessSettings.businessId, ctx.businessId)).limit(1),
      db.select().from(businesses).where(eq(businesses.id, ctx.businessId)).limit(1),
    ]);

    const productionJob = prodJobs[0] || null;
    const invoice = invList[0] || null;

    const [prodLogs, qcList, paymentList] = await Promise.all([
      productionJob
        ? db
            .select()
            .from(productionLogs)
            .where(eq(productionLogs.productionJobId, productionJob.id))
            .orderBy(desc(productionLogs.createdAt))
        : Promise.resolve([]),
      productionJob
        ? db
            .select()
            .from(qcInspections)
            .where(eq(qcInspections.productionJobId, productionJob.id))
            .orderBy(desc(qcInspections.inspectedAt))
        : Promise.resolve([]),
      invoice
        ? db
            .select()
            .from(payments)
            .where(eq(payments.invoiceId, invoice.id))
            .orderBy(desc(payments.createdAt))
        : Promise.resolve([]),
    ]);

    const isOverdue =
      new Date(row.order.deadline) < new Date() &&
      row.order.orderStatus !== 'selesai' &&
      row.order.orderStatus !== 'dibatalkan';

    return {
      order: { ...row.order, isOverdue },
      customer: row.customer,
      items,
      designFiles: designs,
      designRevisions: revisions,
      productionJob,
      productionLogs: prodLogs,
      qcInspections: qcList,
      invoice,
      payments: paymentList,
      shipping: shipList[0] || null,
      statusHistory: history,
      business: bizList[0] || null,
      settings: bizSettingsList[0] || null,
    };
  } catch (error) {
    console.error('Database query failed in getOrderFullDetail:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal memuat detail pesanan.', {
      cause: error,
    });
  }
}

export async function createOrderWithItems(ctx: WorkspaceUserContext, input: CreateOrderInput) {
  if (!input.items || input.items.length === 0) {
    throw new Error('Pesanan harus memiliki minimal 1 item produk.');
  }

  try {
    return await db.transaction(async (tx) => {
      // 1. Validate customer belongs to business
      const [customer] = await tx
        .select()
        .from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.businessId, ctx.businessId)))
        .limit(1);

      if (!customer) {
        throw new Error('Pelanggan tidak valid atau tidak ditemukan.');
      }

      // 2. Check subscription monthly order limit
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.businessId, ctx.businessId))
        .limit(1);

      if (sub) {
        if (sub.status === 'expired' || sub.status === 'cancelled') {
          throw new Error('Langganan workspace telah berakhir. Silakan perbarui paket di menu Langganan.');
        }
        if (sub.plan !== 'ENTERPRISE' && sub.ordersUsedThisMonth >= sub.orderLimit) {
          throw new Error(
            `Kuota pesanan bulanan paket ${sub.plan} (${sub.orderLimit} pesanan) telah tercapai. Silakan upgrade paket Anda.`
          );
        }
      }

      const [settings] = await tx
        .select()
        .from(businessSettings)
        .where(eq(businessSettings.businessId, ctx.businessId))
        .limit(1);

      // 3. Calculate exact Subtotal & Grand Total
      const normalizedItems = input.items.map((item) => {
        const qty = Math.max(1, Math.round(Number(item.quantity)));
        const price = Math.max(0, Math.round(Number(item.unitPrice)));
        return {
          productName: item.productName.trim(),
          description: (item.description || '').trim(),
          specifications: (item.specifications || '').trim(),
          quantity: qty,
          unit: (item.unit || 'pcs').trim(),
          unitPrice: price,
          lineTotal: qty * price,
        };
      });

      const subtotal = normalizedItems.reduce((sum, it) => sum + it.lineTotal, 0);
      const additionalCost = Math.max(0, Math.round(Number(input.additionalCost || 0)));
      const discount = Math.max(0, Math.round(Number(input.discount || 0)));
      const grandTotal = Math.max(0, subtotal + additionalCost - discount);

      // 4. Generate unique Order, Job & Invoice numbers
      const countRes = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.businessId, ctx.businessId));

      const nextSeq = (countRes[0]?.count || 0) + 1;
      const now = new Date();
      const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const randSuffix = Math.random().toString(36).slice(2, 5).toUpperCase();
      const orderPrefix = settings?.orderPrefix || 'ORD';
      const invPrefix = settings?.invoicePrefix || 'INV';

      const orderNumber = `${orderPrefix}-${ym}-${String(nextSeq).padStart(4, '0')}`;
      const invoiceNumber = `${invPrefix}-${ym}-${String(nextSeq).padStart(4, '0')}`;
      const jobNumber = `JOB-${ym}-${String(nextSeq).padStart(4, '0')}-${randSuffix}`;
      const trackingToken = generateSecureTrackingToken();
      const trackingPin = extractTrackingPin(customer.phone);

      const orderDate = input.orderDate ? new Date(input.orderDate) : now;
      const deadline = new Date(input.deadline);

      const [createdOrder] = await tx
        .insert(orders)
        .values({
          businessId: ctx.businessId,
          customerId: customer.id,
          orderNumber,
          trackingToken,
          trackingPin,
          title: input.title.trim(),
          category: (input.category || 'Konveksi').trim(),
          description: (input.description || '').trim(),
          specifications: (input.specifications || '').trim(),
          orderStatus: 'menunggu_konfirmasi',
          designStatus: input.requiresDesignApproval ? 'menunggu_desain' : 'tidak_perlu',
          productionStatus: 'menunggu_produksi',
          paymentStatus: 'unpaid',
          requiresDesignApproval: input.requiresDesignApproval,
          minDpPercent: Math.min(100, Math.max(0, Number(input.minDpPercent ?? 50))),
          subtotal,
          additionalCost,
          discount,
          grandTotal,
          paidAmount: 0,
          refundedAmount: 0,
          orderDate,
          deadline,
          notes: (input.notes || '').trim(),
          createdByUid: ctx.uid,
        })
        .returning();

      await tx.insert(orderItems).values(
        normalizedItems.map((it) => ({
          businessId: ctx.businessId,
          orderId: createdOrder.id,
          ...it,
        }))
      );

      const [createdJob] = await tx
        .insert(productionJobs)
        .values({
          businessId: ctx.businessId,
          orderId: createdOrder.id,
          jobNumber,
          status: 'menunggu_produksi',
          priority: 'normal',
          deadline,
          productionNotes: (input.specifications || '').trim(),
          qcPassed: false,
        })
        .returning();

      await tx.insert(productionLogs).values({
        businessId: ctx.businessId,
        productionJobId: createdJob.id,
        orderId: createdOrder.id,
        fromStatus: null,
        toStatus: 'menunggu_produksi',
        notes: 'Antrean produksi dibuat otomatis dari pesanan baru.',
        actorUid: ctx.uid,
        actorName: ctx.fullName,
      });

      await tx.insert(invoices).values({
        businessId: ctx.businessId,
        orderId: createdOrder.id,
        customerId: customer.id,
        invoiceNumber,
        issueDate: orderDate,
        dueDate: deadline,
        subtotal,
        additionalCost,
        discount,
        grandTotal,
        verifiedPaidAmount: 0,
        refundedAmount: 0,
        status: 'unpaid',
        notes: settings?.invoiceFooterNotes || '',
      });

      await tx.insert(shippingRecords).values({
        businessId: ctx.businessId,
        orderId: createdOrder.id,
        courierName: 'Ambil di Workshop',
        serviceType: 'Reguler',
        recipientName: customer.name,
        recipientPhone: customer.phone,
        shippingAddress: customer.address || 'Alamat belum dilengkapi',
        shippingCost: 0,
        status: 'belum_dikirim',
      });

      await tx.insert(orderStatusHistory).values({
        businessId: ctx.businessId,
        orderId: createdOrder.id,
        domain: 'order',
        fromStatus: null,
        toStatus: 'menunggu_konfirmasi',
        reason: 'Pesanan baru dibuat',
        actorUid: ctx.uid,
        actorName: ctx.fullName,
      });

      await tx.insert(notifications).values({
        businessId: ctx.businessId,
        type: 'pesanan_baru',
        title: `Pesanan Baru ${orderNumber}`,
        message: `${customer.name} memesan "${createdOrder.title}" senilai Rp${grandTotal.toLocaleString('id-ID')}.`,
        orderId: createdOrder.id,
      });

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: 'ORDER_CREATED',
        entityType: 'order',
        entityId: createdOrder.id,
        description: `Membuat pesanan ${orderNumber} untuk ${customer.name}.`,
      });

      if (sub) {
        await tx
          .update(subscriptions)
          .set({
            ordersUsedThisMonth: sub.ordersUsedThisMonth + 1,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, sub.id));
      }

      return createdOrder;
    });
  } catch (error) {
    console.error('Database transaction failed in createOrderWithItems:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal membuat pesanan baru.', {
      cause: error,
    });
  }
}

export async function updateOrderWithItems(
  ctx: WorkspaceUserContext,
  orderId: string,
  input: CreateOrderInput
) {
  if (!input.items || input.items.length === 0) {
    throw new Error('Pesanan harus memiliki minimal 1 item produk.');
  }

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.businessId, ctx.businessId)))
        .limit(1);

      if (!existing) {
        throw new Error('Pesanan tidak ditemukan.');
      }
      if (existing.orderStatus === 'dibatalkan') {
        throw new Error('Pesanan yang telah dibatalkan tidak dapat diubah.');
      }

      const normalizedItems = input.items.map((item) => {
        const qty = Math.max(1, Math.round(Number(item.quantity)));
        const price = Math.max(0, Math.round(Number(item.unitPrice)));
        return {
          productName: item.productName.trim(),
          description: (item.description || '').trim(),
          specifications: (item.specifications || '').trim(),
          quantity: qty,
          unit: (item.unit || 'pcs').trim(),
          unitPrice: price,
          lineTotal: qty * price,
        };
      });

      const subtotal = normalizedItems.reduce((sum, it) => sum + it.lineTotal, 0);
      const additionalCost = Math.max(0, Math.round(Number(input.additionalCost || 0)));
      const discount = Math.max(0, Math.round(Number(input.discount || 0)));
      const grandTotal = Math.max(0, subtotal + additionalCost - discount);
      const deadline = new Date(input.deadline);

      // Recompute payment status against new grandTotal
      let nextPaymentStatus = existing.paymentStatus;
      if (existing.refundedAmount > 0) {
        nextPaymentStatus =
          existing.refundedAmount >= existing.paidAmount ? 'refunded' : 'partially_refunded';
      } else if (existing.paidAmount <= 0) {
        nextPaymentStatus = 'unpaid';
      } else if (existing.paidAmount >= grandTotal) {
        nextPaymentStatus = 'paid';
      } else {
        nextPaymentStatus = 'partial';
      }

      let nextDesignStatus = existing.designStatus;
      if (!input.requiresDesignApproval && existing.designStatus === 'menunggu_desain') {
        nextDesignStatus = 'tidak_perlu';
      } else if (input.requiresDesignApproval && existing.designStatus === 'tidak_perlu') {
        nextDesignStatus = 'menunggu_desain';
      }

      const [updatedOrder] = await tx
        .update(orders)
        .set({
          customerId: input.customerId,
          title: input.title.trim(),
          category: (input.category || existing.category).trim(),
          description: (input.description || '').trim(),
          specifications: (input.specifications || '').trim(),
          requiresDesignApproval: input.requiresDesignApproval,
          designStatus: nextDesignStatus,
          minDpPercent: Math.min(100, Math.max(0, Number(input.minDpPercent ?? existing.minDpPercent))),
          subtotal,
          additionalCost,
          discount,
          grandTotal,
          paymentStatus: nextPaymentStatus,
          deadline,
          notes: (input.notes || '').trim(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await tx.insert(orderItems).values(
        normalizedItems.map((it) => ({
          businessId: ctx.businessId,
          orderId,
          ...it,
        }))
      );

      await tx
        .update(invoices)
        .set({
          customerId: input.customerId,
          dueDate: deadline,
          subtotal,
          additionalCost,
          discount,
          grandTotal,
          status: nextPaymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(invoices.orderId, orderId));

      await tx
        .update(productionJobs)
        .set({
          deadline,
          updatedAt: new Date(),
        })
        .where(eq(productionJobs.orderId, orderId));

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: 'ORDER_UPDATED',
        entityType: 'order',
        entityId: orderId,
        description: `Memperbarui detail dan item pesanan ${existing.orderNumber}.`,
      });

      return updatedOrder;
    });
  } catch (error) {
    console.error('Database transaction failed in updateOrderWithItems:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal memperbarui pesanan.', {
      cause: error,
    });
  }
}

export async function updateOrderStatusAction(
  ctx: WorkspaceUserContext,
  orderId: string,
  action: 'confirm' | 'cancel' | 'complete',
  reason?: string
) {
  try {
    return await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.businessId, ctx.businessId)))
        .limit(1);

      if (!order) {
        throw new Error('Pesanan tidak ditemukan.');
      }

      let nextStatus = order.orderStatus;
      if (action === 'confirm') {
        if (order.orderStatus === 'dibatalkan') {
          throw new Error('Pesanan telah dibatalkan.');
        }
        nextStatus = 'dikonfirmasi';
      } else if (action === 'cancel') {
        if (order.orderStatus === 'selesai') {
          throw new Error('Pesanan yang telah selesai tidak dapat dibatalkan.');
        }
        nextStatus = 'dibatalkan';
      } else if (action === 'complete') {
        if (order.productionStatus !== 'selesai' && order.productionStatus !== 'siap_dikirim') {
          throw new Error(
            'Pesanan belum dapat diselesaikan sebelum proses produksi dan QC selesai.'
          );
        }
        nextStatus = 'selesai';
      }

      const [updated] = await tx
        .update(orders)
        .set({
          orderStatus: nextStatus,
          cancelReason: action === 'cancel' ? reason || 'Dibatalkan oleh admin' : order.cancelReason,
          cancelledAt: action === 'cancel' ? new Date() : order.cancelledAt,
          completedAt: action === 'complete' ? new Date() : order.completedAt,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      await tx.insert(orderStatusHistory).values({
        businessId: ctx.businessId,
        orderId,
        domain: 'order',
        fromStatus: order.orderStatus,
        toStatus: nextStatus,
        reason: reason || `Perubahan status pesanan menjadi ${nextStatus}`,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
      });

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: `ORDER_${action.toUpperCase()}`,
        entityType: 'order',
        entityId: orderId,
        description: `Mengubah status pesanan ${order.orderNumber} dari ${order.orderStatus} ke ${nextStatus}.`,
      });

      return updated;
    });
  } catch (error) {
    console.error('Database transaction failed in updateOrderStatusAction:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal mengubah status pesanan.', {
      cause: error,
    });
  }
}

export async function deleteOrderSafely(ctx: WorkspaceUserContext, orderId: string) {
  try {
    return await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.businessId, ctx.businessId)))
        .limit(1);

      if (!order) {
        throw new Error('Pesanan tidak ditemukan.');
      }

      // Business Rule #6: Orders currently in production CANNOT be permanently deleted
      if (order.productionStatus !== 'menunggu_produksi') {
        throw new Error(
          'Pesanan yang sedang atau telah memasuki proses produksi tidak boleh dihapus permanen. Gunakan fitur Pembatalan Pesanan.'
        );
      }

      if (order.paidAmount > 0) {
        throw new Error(
          'Pesanan yang sudah memiliki pembayaran terverifikasi tidak dapat dihapus permanen demi audit keuangan.'
        );
      }

      await tx.delete(orders).where(eq(orders.id, orderId));

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: 'ORDER_DELETED',
        entityType: 'order',
        entityId: orderId,
        description: `Menghapus draf pesanan ${order.orderNumber} sebelum produksi dimulai.`,
      });

      return { deleted: true };
    });
  } catch (error) {
    console.error('Database transaction failed in deleteOrderSafely:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal menghapus pesanan.', {
      cause: error,
    });
  }
}

export async function updateShippingRecord(
  ctx: WorkspaceUserContext,
  orderId: string,
  input: {
    courierName: string;
    serviceType?: string;
    trackingNumber?: string;
    recipientName: string;
    recipientPhone: string;
    shippingAddress: string;
    shippingCost?: number;
    status: 'belum_dikirim' | 'dikemas' | 'dikirim' | 'diterima';
    notes?: string;
  }
) {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(shippingRecords)
        .where(
          and(
            eq(shippingRecords.orderId, orderId),
            eq(shippingRecords.businessId, ctx.businessId)
          )
        )
        .limit(1);

      if (!existing) {
        throw new Error('Data pengiriman tidak ditemukan.');
      }

      const [updated] = await tx
        .update(shippingRecords)
        .set({
          courierName: input.courierName.trim(),
          serviceType: (input.serviceType || 'Reguler').trim(),
          trackingNumber: (input.trackingNumber || '').trim(),
          recipientName: input.recipientName.trim(),
          recipientPhone: input.recipientPhone.trim(),
          shippingAddress: input.shippingAddress.trim(),
          shippingCost: Math.max(0, Math.round(Number(input.shippingCost || 0))),
          status: input.status,
          shippedAt:
            input.status === 'dikirim' && !existing.shippedAt ? new Date() : existing.shippedAt,
          deliveredAt:
            input.status === 'diterima' && !existing.deliveredAt
              ? new Date()
              : existing.deliveredAt,
          notes: (input.notes || '').trim(),
          updatedAt: new Date(),
        })
        .where(eq(shippingRecords.id, existing.id))
        .returning();

      if (existing.status !== input.status) {
        await tx.insert(orderStatusHistory).values({
          businessId: ctx.businessId,
          orderId,
          domain: 'shipping',
          fromStatus: existing.status,
          toStatus: input.status,
          reason: input.trackingNumber ? `Resi: ${input.trackingNumber}` : 'Update status pengiriman',
          actorUid: ctx.uid,
          actorName: ctx.fullName,
        });
      }

      return updated;
    });
  } catch (error) {
    console.error('Database transaction failed in updateShippingRecord:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal memperbarui pengiriman.', {
      cause: error,
    });
  }
}
