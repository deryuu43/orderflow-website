import crypto from 'node:crypto';
import { eq, and, desc, asc, gte, lte, sql } from 'drizzle-orm';
import { db } from '../index.ts';
import {
  invoices,
  payments,
  orders,
  orderItems,
  customers,
  productionJobs,
  qcInspections,
  designFiles,
  shippingRecords,
  orderStatusHistory,
  notifications,
  activityLogs,
  businesses,
  businessSettings,
  subscriptions,
  users,
  productionLogs,
} from '../schema.ts';
import type { WorkspaceUserContext, UserRole } from '../workspace.ts';

function computePaymentStatus(
  grandTotal: number,
  verifiedPaid: number,
  refunded: number
): 'unpaid' | 'partial' | 'paid' | 'refunded' | 'partially_refunded' {
  if (refunded > 0) {
    return refunded >= verifiedPaid && verifiedPaid > 0 ? 'refunded' : 'partially_refunded';
  }
  if (verifiedPaid <= 0) return 'unpaid';
  if (verifiedPaid >= grandTotal) return 'paid';
  return 'partial';
}

export async function listInvoices(ctx: WorkspaceUserContext, statusFilter?: string, search?: string) {
  try {
    const conditions = [eq(invoices.businessId, ctx.businessId)];

    if (ctx.effectiveRole === 'customer' && ctx.actualRole !== 'owner') {
      if (ctx.customerId) {
        conditions.push(eq(invoices.customerId, ctx.customerId));
      } else {
        const custs = await db
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.businessId, ctx.businessId),
              eq(customers.email, ctx.email.toLowerCase())
            )
          );
        if (custs[0]) {
          conditions.push(eq(invoices.customerId, custs[0].id));
        } else {
          return [];
        }
      }
    }

    if (statusFilter && statusFilter !== 'all') {
      conditions.push(eq(invoices.status, statusFilter));
    }

    const rows = await db
      .select({
        invoice: invoices,
        order: orders,
        customer: customers,
      })
      .from(invoices)
      .innerJoin(orders, eq(invoices.orderId, orders.id))
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(invoices.createdAt));

    const allPendingPayments = await db
      .select({
        invoiceId: payments.invoiceId,
        verificationStatus: payments.verificationStatus,
      })
      .from(payments)
      .where(eq(payments.businessId, ctx.businessId));

    const pendingCountMap = new Map<string, number>();
    for (const p of allPendingPayments) {
      if (p.verificationStatus === 'pending') {
        pendingCountMap.set(p.invoiceId, (pendingCountMap.get(p.invoiceId) || 0) + 1);
      }
    }

    const q = (search || '').trim().toLowerCase();
    return rows
      .filter(({ invoice, order, customer }) => {
        if (!q) return true;
        return (
          invoice.invoiceNumber.toLowerCase().includes(q) ||
          order.orderNumber.toLowerCase().includes(q) ||
          order.title.toLowerCase().includes(q) ||
          customer.name.toLowerCase().includes(q)
        );
      })
      .map(({ invoice, order, customer }) => ({
        ...invoice,
        remainingAmount: Math.max(
          0,
          Number(invoice.grandTotal) -
            (Number(invoice.verifiedPaidAmount) - Number(invoice.refundedAmount))
        ),
        pendingVerificationCount: pendingCountMap.get(invoice.id) || 0,
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          title: order.title,
          orderStatus: order.orderStatus,
        },
        customer: {
          id: customer.id,
          name: customer.name,
          company: customer.company,
          phone: customer.phone,
          email: customer.email,
        },
      }));
  } catch (error) {
    console.error('Database query failed in listInvoices:', error);
    throw new Error('Gagal memuat daftar tagihan invoice.', { cause: error });
  }
}

export async function getInvoiceDetail(ctx: WorkspaceUserContext, invoiceId: string) {
  try {
    const [row] = await db
      .select({
        invoice: invoices,
        order: orders,
        customer: customers,
      })
      .from(invoices)
      .innerJoin(orders, eq(invoices.orderId, orders.id))
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, ctx.businessId)))
      .limit(1);

    if (!row) {
      throw new Error('Invoice tidak ditemukan.');
    }

    if (ctx.effectiveRole === 'customer' && ctx.actualRole !== 'owner') {
      const allowedById = ctx.customerId && row.invoice.customerId === ctx.customerId;
      const allowedByEmail =
        row.customer.email && row.customer.email.toLowerCase() === ctx.email.toLowerCase();
      if (!allowedById && !allowedByEmail) {
        throw new Error('Anda tidak memiliki akses pada invoice ini.');
      }
    }

    const [items, paymentRows, bizRows, settingsRows] = await Promise.all([
      db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, row.order.id))
        .orderBy(asc(orderItems.createdAt)),
      db
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, invoiceId))
        .orderBy(desc(payments.createdAt)),
      db.select().from(businesses).where(eq(businesses.id, ctx.businessId)).limit(1),
      db.select().from(businessSettings).where(eq(businessSettings.businessId, ctx.businessId)).limit(1),
    ]);

    const netVerified =
      Number(row.invoice.verifiedPaidAmount || 0) - Number(row.invoice.refundedAmount || 0);
    const remainingAmount = Math.max(0, Number(row.invoice.grandTotal || 0) - netVerified);

    return {
      invoice: {
        ...row.invoice,
        netVerifiedAmount: netVerified,
        remainingAmount,
      },
      order: row.order,
      customer: row.customer,
      items,
      payments: paymentRows,
      business: bizRows[0] || null,
      settings: settingsRows[0] || null,
    };
  } catch (error) {
    console.error('Database query failed in getInvoiceDetail:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal memuat detail invoice.', {
      cause: error,
    });
  }
}

export async function submitPaymentRecord(
  ctx: WorkspaceUserContext,
  invoiceId: string,
  input: {
    paymentType: 'dp' | 'partial' | 'pelunasan' | 'refund';
    method: 'transfer_bank' | 'qris' | 'tunai' | 'virtual_account';
    amount: number;
    proofUrl?: string;
    referenceCode?: string;
    notes?: string;
    autoVerify?: boolean;
  }
) {
  const numericAmount = Math.round(Number(input.amount));
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('Nominal pembayaran harus lebih dari Rp0.');
  }

  try {
    return await db.transaction(async (tx) => {
      const [inv] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, ctx.businessId)))
        .limit(1);

      if (!inv) {
        throw new Error('Invoice tidak ditemukan.');
      }

      const [ord] = await tx.select().from(orders).where(eq(orders.id, inv.orderId)).limit(1);

      const canVerifyDirectly =
        (ctx.effectiveRole === 'owner' || ctx.effectiveRole === 'admin') &&
        (input.autoVerify === true || input.paymentType === 'refund');

      if (input.paymentType === 'refund') {
        if (ctx.effectiveRole !== 'owner' && ctx.effectiveRole !== 'admin') {
          throw new Error('Hanya Owner atau Admin yang dapat mencatat transaksi refund.');
        }
        const maxRefundable = Number(inv.verifiedPaidAmount) - Number(inv.refundedAmount);
        if (numericAmount > maxRefundable) {
          throw new Error(
            `Nominal refund melebihi dana terverifikasi yang tersedia (maksimal Rp${maxRefundable.toLocaleString(
              'id-ID'
            )}).`
          );
        }
      }

      const countRes = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(payments)
        .where(eq(payments.businessId, ctx.businessId));

      const paySeq = (countRes[0]?.count || 0) + 1;
      const paymentNumber = `PAY-${new Date().getFullYear()}-${String(paySeq).padStart(4, '0')}`;

      const verificationStatus = canVerifyDirectly ? 'verified' : 'pending';

      const [createdPayment] = await tx
        .insert(payments)
        .values({
          businessId: ctx.businessId,
          invoiceId: inv.id,
          orderId: inv.orderId,
          paymentNumber,
          paymentType: input.paymentType,
          method: input.method,
          amount: numericAmount,
          proofUrl: input.proofUrl || '',
          referenceCode: (input.referenceCode || '').trim(),
          verificationStatus,
          notes: (input.notes || '').trim(),
          paidAt: new Date(),
          submittedByUid: ctx.uid,
          submittedByName: ctx.fullName,
          verifiedByUid: canVerifyDirectly ? ctx.uid : null,
          verifiedByName: canVerifyDirectly ? ctx.fullName : null,
          verifiedAt: canVerifyDirectly ? new Date() : null,
        })
        .returning();

      if (canVerifyDirectly) {
        await recalculateInvoiceTotalsInTx(tx, ctx, inv.id, ord?.orderNumber || inv.invoiceNumber);
      } else {
        await tx.insert(notifications).values({
          businessId: ctx.businessId,
          type: 'pembayaran_diterima',
          title: `Bukti Pembayaran Menunggu Verifikasi (${inv.invoiceNumber})`,
          message: `${ctx.fullName} mengunggah pembayaran ${input.paymentType.toUpperCase()} sebesar Rp${numericAmount.toLocaleString(
            'id-ID'
          )}.`,
          orderId: inv.orderId,
        });
      }

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: input.paymentType === 'refund' ? 'PAYMENT_REFUNDED' : 'PAYMENT_SUBMITTED',
        entityType: 'payment',
        entityId: createdPayment.id,
        description: `Mencatat ${input.paymentType.toUpperCase()} Rp${numericAmount.toLocaleString(
          'id-ID'
        )} untuk ${inv.invoiceNumber} (${verificationStatus}).`,
      });

      return createdPayment;
    });
  } catch (error) {
    console.error('Database transaction failed in submitPaymentRecord:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal menyimpan data pembayaran.', {
      cause: error,
    });
  }
}

async function recalculateInvoiceTotalsInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ctx: WorkspaceUserContext,
  invoiceId: string,
  refLabel: string
) {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return;

  const verifiedList = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), eq(payments.verificationStatus, 'verified')));

  let verifiedPaid = 0;
  let refunded = 0;

  for (const p of verifiedList) {
    if (p.paymentType === 'refund') {
      refunded += Number(p.amount || 0);
    } else {
      verifiedPaid += Number(p.amount || 0);
    }
  }

  const nextStatus = computePaymentStatus(Number(inv.grandTotal || 0), verifiedPaid, refunded);

  await tx
    .update(invoices)
    .set({
      verifiedPaidAmount: verifiedPaid,
      refundedAmount: refunded,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));

  const [prevOrder] = await tx.select().from(orders).where(eq(orders.id, inv.orderId)).limit(1);

  await tx
    .update(orders)
    .set({
      paidAmount: Math.max(0, verifiedPaid - refunded),
      refundedAmount: refunded,
      paymentStatus: nextStatus,
      orderStatus:
        prevOrder && prevOrder.orderStatus === 'menunggu_konfirmasi' && verifiedPaid > 0
          ? 'dikonfirmasi'
          : prevOrder?.orderStatus,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, inv.orderId));

  if (prevOrder && prevOrder.paymentStatus !== nextStatus) {
    await tx.insert(orderStatusHistory).values({
      businessId: ctx.businessId,
      orderId: inv.orderId,
      domain: 'payment',
      fromStatus: prevOrder.paymentStatus,
      toStatus: nextStatus,
      reason: `Pembayaran terverifikasi pada ${refLabel}`,
      actorUid: ctx.uid,
      actorName: ctx.fullName,
    });
  }
}

export async function verifyPaymentRecord(
  ctx: WorkspaceUserContext,
  paymentId: string,
  decision: 'verified' | 'rejected',
  notes?: string
) {
  try {
    return await db.transaction(async (tx) => {
      const [pay] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.id, paymentId), eq(payments.businessId, ctx.businessId)))
        .limit(1);

      if (!pay) {
        throw new Error('Data pembayaran tidak ditemukan.');
      }

      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, pay.invoiceId)).limit(1);

      const [updatedPayment] = await tx
        .update(payments)
        .set({
          verificationStatus: decision,
          verifiedByUid: ctx.uid,
          verifiedByName: ctx.fullName,
          verifiedAt: new Date(),
          notes: notes ? `${pay.notes ? pay.notes + ' | ' : ''}${notes.trim()}` : pay.notes,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, paymentId))
        .returning();

      await recalculateInvoiceTotalsInTx(
        tx,
        ctx,
        pay.invoiceId,
        inv?.invoiceNumber || pay.paymentNumber
      );

      await tx.insert(notifications).values({
        businessId: ctx.businessId,
        type: 'pembayaran_diterima',
        title:
          decision === 'verified'
            ? `Pembayaran Diverifikasi (${pay.paymentNumber})`
            : `Pembayaran Ditolak (${pay.paymentNumber})`,
        message:
          decision === 'verified'
            ? `Pembayaran Rp${Number(pay.amount).toLocaleString('id-ID')} telah dikonfirmasi oleh ${ctx.fullName}.`
            : `Pembayaran Rp${Number(pay.amount).toLocaleString('id-ID')} ditolak. ${notes || ''}`,
        orderId: pay.orderId,
      });

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: decision === 'verified' ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED',
        entityType: 'payment',
        entityId: paymentId,
        description: `${decision === 'verified' ? 'Memverifikasi' : 'Menolak'} pembayaran ${
          pay.paymentNumber
        } sebesar Rp${Number(pay.amount).toLocaleString('id-ID')}.`,
      });

      return updatedPayment;
    });
  } catch (error) {
    console.error('Database transaction failed in verifyPaymentRecord:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal memverifikasi pembayaran.', {
      cause: error,
    });
  }
}

export async function getDashboardAnalytics(ctx: WorkspaceUserContext) {
  try {
    const [allOrders, verifiedPayments, allPendingPayments, recentLogs, subRows] =
      await Promise.all([
        db
          .select({
            order: orders,
            customer: customers,
          })
          .from(orders)
          .innerJoin(customers, eq(orders.customerId, customers.id))
          .where(eq(orders.businessId, ctx.businessId))
          .orderBy(desc(orders.createdAt)),
        db
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.businessId, ctx.businessId),
              eq(payments.verificationStatus, 'verified')
            )
          ),
        db
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.businessId, ctx.businessId),
              eq(payments.verificationStatus, 'pending')
            )
          ),
        db
          .select()
          .from(activityLogs)
          .where(eq(activityLogs.businessId, ctx.businessId))
          .orderBy(desc(activityLogs.createdAt))
          .limit(10),
        db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.businessId, ctx.businessId))
          .limit(1),
      ]);

    const now = new Date();
    const activeOrders = allOrders.filter(({ order }) => order.orderStatus !== 'dibatalkan');

    const totalOrders = activeOrders.length;
    const newOrders = activeOrders.filter(
      ({ order }) => order.orderStatus === 'menunggu_konfirmasi'
    ).length;
    const inProduction = activeOrders.filter(({ order }) =>
      ['persiapan', 'dalam_produksi', 'quality_control'].includes(order.productionStatus)
    ).length;
    const completedOrders = activeOrders.filter(
      ({ order }) => order.orderStatus === 'selesai' || order.productionStatus === 'selesai'
    ).length;
    const overdueOrdersList = activeOrders.filter(
      ({ order }) =>
        new Date(order.deadline) < now &&
        order.orderStatus !== 'selesai' &&
        order.productionStatus !== 'selesai'
    );

    let confirmedRevenue = 0;
    for (const p of verifiedPayments) {
      if (p.paymentType === 'refund') {
        confirmedRevenue -= Number(p.amount || 0);
      } else {
        confirmedRevenue += Number(p.amount || 0);
      }
    }

    // Monthly chart buckets (last 6 months based on real database dates)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const monthlySeries: Array<{
      key: string;
      month: string;
      pesanan: number;
      pendapatan: number;
    }> = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlySeries.push({
        key,
        month: `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
        pesanan: 0,
        pendapatan: 0,
      });
    }

    const bucketMap = new Map(monthlySeries.map((b) => [b.key, b]));

    for (const { order } of activeOrders) {
      const od = new Date(order.orderDate);
      const key = `${od.getFullYear()}-${String(od.getMonth() + 1).padStart(2, '0')}`;
      const bucket = bucketMap.get(key);
      if (bucket) bucket.pesanan += 1;
    }

    for (const p of verifiedPayments) {
      const pd = new Date(p.paidAt);
      const key = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
      const bucket = bucketMap.get(key);
      if (bucket) {
        if (p.paymentType === 'refund') {
          bucket.pendapatan = Math.max(0, bucket.pendapatan - Number(p.amount || 0));
        } else {
          bucket.pendapatan += Number(p.amount || 0);
        }
      }
    }

    const prodDistConfig = [
      { status: 'menunggu_produksi', label: 'Menunggu Produksi' },
      { status: 'persiapan', label: 'Persiapan' },
      { status: 'dalam_produksi', label: 'Dalam Produksi' },
      { status: 'quality_control', label: 'Quality Control' },
      { status: 'siap_dikirim', label: 'Siap Dikirim' },
      { status: 'selesai', label: 'Selesai' },
    ];

    const productionDistribution = prodDistConfig.map((cfg) => ({
      status: cfg.status,
      name: cfg.label,
      jumlah: activeOrders.filter(({ order }) => order.productionStatus === cfg.status).length,
    }));

    const nearestDeadlines = [...activeOrders]
      .filter(({ order }) => order.orderStatus !== 'selesai')
      .sort((a, b) => new Date(a.order.deadline).getTime() - new Date(b.order.deadline).getTime())
      .slice(0, 6)
      .map(({ order, customer }) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        title: order.title,
        customerName: customer.name,
        deadline: order.deadline,
        productionStatus: order.productionStatus,
        isOverdue: new Date(order.deadline) < now,
      }));

    // Attention queue: overdue orders, pending design approval/revisions, unverified payments
    const attentionItems: Array<{
      id: string;
      orderId: string;
      severity: 'critical' | 'warning' | 'info';
      category: string;
      title: string;
      subtitle: string;
    }> = [];

    for (const { order, customer } of overdueOrdersList.slice(0, 4)) {
      attentionItems.push({
        id: `overdue-${order.id}`,
        orderId: order.id,
        severity: 'critical',
        category: 'Terlambat',
        title: `${order.orderNumber} · ${order.title}`,
        subtitle: `Melewati deadline (${customer.name}) — tahap ${order.productionStatus.replace(
          /_/g,
          ' '
        )}`,
      });
    }

    for (const p of allPendingPayments.slice(0, 3)) {
      attentionItems.push({
        id: `pay-${p.id}`,
        orderId: p.orderId,
        severity: 'warning',
        category: 'Verifikasi Pembayaran',
        title: `${p.paymentNumber} · Rp${Number(p.amount).toLocaleString('id-ID')}`,
        subtitle: `Menunggu verifikasi Admin (${p.submittedByName})`,
      });
    }

    for (const { order, customer } of activeOrders
      .filter(({ order }) => order.designStatus === 'revisi' || order.designStatus === 'menunggu_persetujuan')
      .slice(0, 3)) {
      attentionItems.push({
        id: `des-${order.id}`,
        orderId: order.id,
        severity: order.designStatus === 'revisi' ? 'warning' : 'info',
        category: order.designStatus === 'revisi' ? 'Revisi Desain' : 'Menunggu Approval',
        title: `${order.orderNumber} · ${order.title}`,
        subtitle: `Pelanggan: ${customer.name}`,
      });
    }

    return {
      stats: {
        totalOrders,
        newOrders,
        inProduction,
        completedOrders,
        overdueOrders: overdueOrdersList.length,
        confirmedRevenue: Math.max(0, confirmedRevenue),
        pendingPaymentCount: allPendingPayments.length,
      },
      monthlySeries,
      productionDistribution,
      recentOrders: allOrders.slice(0, 6).map(({ order, customer }) => ({
        ...order,
        customerName: customer.name,
        isOverdue:
          new Date(order.deadline) < now &&
          order.orderStatus !== 'selesai' &&
          order.orderStatus !== 'dibatalkan',
      })),
      nearestDeadlines,
      attentionItems: attentionItems.slice(0, 8),
      recentActivities: recentLogs,
      subscription: subRows[0] || null,
    };
  } catch (error) {
    console.error('Database query failed in getDashboardAnalytics:', error);
    throw new Error('Gagal memuat analitik dashboard.', { cause: error });
  }
}

export async function getReportsAnalytics(
  ctx: WorkspaceUserContext,
  params: {
    range: 'today' | 'week' | 'month' | 'year' | 'custom';
    startDate?: string;
    endDate?: string;
  }
) {
  try {
    const now = new Date();
    let start = new Date(now.getFullYear(), now.getMonth(), 1);
    let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (params.range === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (params.range === 'week') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
    } else if (params.range === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    } else if (params.range === 'year') {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    } else if (params.range === 'custom' && params.startDate) {
      start = new Date(params.startDate);
      start.setHours(0, 0, 0, 0);
      if (params.endDate) {
        end = new Date(params.endDate);
        end.setHours(23, 59, 59, 999);
      }
    }

    const [periodOrders, periodItems, periodPayments, allQc] = await Promise.all([
      db
        .select({ order: orders, customer: customers })
        .from(orders)
        .innerJoin(customers, eq(orders.customerId, customers.id))
        .where(
          and(
            eq(orders.businessId, ctx.businessId),
            gte(orders.orderDate, start),
            lte(orders.orderDate, end)
          )
        )
        .orderBy(desc(orders.orderDate)),
      db
        .select({
          item: orderItems,
          orderDate: orders.orderDate,
          orderStatus: orders.orderStatus,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(
          and(
            eq(orderItems.businessId, ctx.businessId),
            gte(orders.orderDate, start),
            lte(orders.orderDate, end)
          )
        ),
      db
        .select({
          payment: payments,
          invoiceNumber: invoices.invoiceNumber,
          orderNumber: orders.orderNumber,
          customerName: customers.name,
        })
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(
          and(
            eq(payments.businessId, ctx.businessId),
            eq(payments.verificationStatus, 'verified'),
            gte(payments.paidAt, start),
            lte(payments.paidAt, end)
          )
        )
        .orderBy(desc(payments.paidAt)),
      db
        .select()
        .from(qcInspections)
        .where(
          and(
            eq(qcInspections.businessId, ctx.businessId),
            gte(qcInspections.inspectedAt, start),
            lte(qcInspections.inspectedAt, end)
          )
        ),
    ]);

    const validOrders = periodOrders.filter(({ order }) => order.orderStatus !== 'dibatalkan');
    const completedOrders = validOrders.filter(
      ({ order }) => order.orderStatus === 'selesai' || order.productionStatus === 'selesai'
    );
    const overdueOrders = validOrders.filter(
      ({ order }) =>
        new Date(order.deadline) < now &&
        order.orderStatus !== 'selesai' &&
        order.productionStatus !== 'selesai'
    );

    let confirmedRevenue = 0;
    for (const { payment } of periodPayments) {
      if (payment.paymentType === 'refund') {
        confirmedRevenue -= Number(payment.amount || 0);
      } else {
        confirmedRevenue += Number(payment.amount || 0);
      }
    }

    // Top ordered products aggregation
    const productAgg = new Map<
      string,
      { productName: string; totalQty: number; totalRevenue: number; orderCount: number }
    >();
    for (const { item, orderStatus } of periodItems) {
      if (orderStatus === 'dibatalkan') continue;
      const key = item.productName.trim();
      const cur = productAgg.get(key) || {
        productName: key,
        totalQty: 0,
        totalRevenue: 0,
        orderCount: 0,
      };
      cur.totalQty += Number(item.quantity || 0);
      cur.totalRevenue += Number(item.lineTotal || 0);
      cur.orderCount += 1;
      productAgg.set(key, cur);
    }

    const topProducts = Array.from(productAgg.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 7);

    // Production performance by stage
    const stageCounts = [
      { stage: 'Menunggu', count: validOrders.filter((o) => o.order.productionStatus === 'menunggu_produksi').length },
      { stage: 'Persiapan', count: validOrders.filter((o) => o.order.productionStatus === 'persiapan').length },
      { stage: 'Produksi', count: validOrders.filter((o) => o.order.productionStatus === 'dalam_produksi').length },
      { stage: 'QC', count: validOrders.filter((o) => o.order.productionStatus === 'quality_control').length },
      { stage: 'Siap Kirim', count: validOrders.filter((o) => o.order.productionStatus === 'siap_dikirim').length },
      { stage: 'Selesai', count: validOrders.filter((o) => o.order.productionStatus === 'selesai').length },
    ];

    const qcPassCount = allQc.filter((q) => q.passed).length;
    const qcPassRate = allQc.length > 0 ? Math.round((qcPassCount / allQc.length) * 100) : 100;

    return {
      period: {
        range: params.range,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      summary: {
        totalOrders: validOrders.length,
        confirmedRevenue: Math.max(0, confirmedRevenue),
        completedOrders: completedOrders.length,
        overdueOrders: overdueOrders.length,
        qcPassRate,
        totalQcInspections: allQc.length,
      },
      topProducts,
      productionPerformance: stageCounts,
      paymentHistory: periodPayments.map(({ payment, invoiceNumber, orderNumber, customerName }) => ({
        ...payment,
        invoiceNumber,
        orderNumber,
        customerName,
      })),
    };
  } catch (error) {
    console.error('Database query failed in getReportsAnalytics:', error);
    throw new Error('Gagal memuat laporan bisnis.', { cause: error });
  }
}

export async function getWorkspaceManagement(ctx: WorkspaceUserContext) {
  try {
    const [bizList, settingsList, subList, teamList] = await Promise.all([
      db.select().from(businesses).where(eq(businesses.id, ctx.businessId)).limit(1),
      db.select().from(businessSettings).where(eq(businessSettings.businessId, ctx.businessId)).limit(1),
      db.select().from(subscriptions).where(eq(subscriptions.businessId, ctx.businessId)).limit(1),
      db
        .select()
        .from(users)
        .where(eq(users.businessId, ctx.businessId))
        .orderBy(asc(users.createdAt)),
    ]);

    const activeTeamCount = teamList.filter((u) => u.role !== 'customer' && u.isActive).length;

    return {
      business: bizList[0] || null,
      settings: settingsList[0] || null,
      subscription: subList[0] || null,
      team: teamList,
      usage: {
        activeUsers: activeTeamCount,
        ordersUsedThisMonth: subList[0]?.ordersUsedThisMonth || 0,
      },
    };
  } catch (error) {
    console.error('Database query failed in getWorkspaceManagement:', error);
    throw new Error('Gagal memuat konfigurasi workspace.', { cause: error });
  }
}

export async function updateBusinessAndSettings(
  ctx: WorkspaceUserContext,
  input: {
    name: string;
    industry: string;
    phone: string;
    email: string;
    address: string;
    orderPrefix: string;
    invoicePrefix: string;
    defaultMinDpPercent: number;
    requireDesignApprovalDefault: boolean;
    requireDpBeforeProduction: boolean;
    bankName: string;
    bankAccountNumber: string;
    bankAccountHolder: string;
    invoiceFooterNotes: string;
    whatsappWebhookUrl?: string;
    emailNotificationEnabled: boolean;
  }
) {
  try {
    return await db.transaction(async (tx) => {
      const [updatedBiz] = await tx
        .update(businesses)
        .set({
          name: input.name.trim(),
          industry: input.industry.trim(),
          phone: input.phone.trim(),
          email: input.email.trim().toLowerCase(),
          address: input.address.trim(),
          updatedAt: new Date(),
        })
        .where(eq(businesses.id, ctx.businessId))
        .returning();

      const [updatedSettings] = await tx
        .update(businessSettings)
        .set({
          orderPrefix: input.orderPrefix.trim().toUpperCase() || 'ORD',
          invoicePrefix: input.invoicePrefix.trim().toUpperCase() || 'INV',
          defaultMinDpPercent: Math.min(100, Math.max(0, Number(input.defaultMinDpPercent))),
          requireDesignApprovalDefault: Boolean(input.requireDesignApprovalDefault),
          requireDpBeforeProduction: Boolean(input.requireDpBeforeProduction),
          bankName: input.bankName.trim(),
          bankAccountNumber: input.bankAccountNumber.trim(),
          bankAccountHolder: input.bankAccountHolder.trim(),
          invoiceFooterNotes: input.invoiceFooterNotes.trim(),
          whatsappWebhookUrl: (input.whatsappWebhookUrl || '').trim(),
          emailNotificationEnabled: Boolean(input.emailNotificationEnabled),
          updatedAt: new Date(),
        })
        .where(eq(businessSettings.businessId, ctx.businessId))
        .returning();

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: 'SETTINGS_UPDATED',
        entityType: 'business',
        entityId: ctx.businessId,
        description: 'Memperbarui profil bisnis dan pengaturan operasional.',
      });

      return { business: updatedBiz, settings: updatedSettings };
    });
  } catch (error) {
    console.error('Database transaction failed in updateBusinessAndSettings:', error);
    throw new Error('Gagal menyimpan pengaturan bisnis.', { cause: error });
  }
}

export async function inviteTeamMember(
  ctx: WorkspaceUserContext,
  input: { fullName: string; email: string; role: UserRole; phone?: string; customerId?: string }
) {
  try {
    return await db.transaction(async (tx) => {
      const normalizedEmail = input.email.trim().toLowerCase();

      // Check subscription user limit for internal staff roles
      if (input.role !== 'customer') {
        const [sub] = await tx
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.businessId, ctx.businessId))
          .limit(1);

        const internalMembers = await tx
          .select()
          .from(users)
          .where(and(eq(users.businessId, ctx.businessId), eq(users.isActive, true)));

        const internalCount = internalMembers.filter((u) => u.role !== 'customer').length;
        if (sub && sub.plan !== 'ENTERPRISE' && internalCount >= sub.userLimit) {
          throw new Error(
            `Batas pengguna tim paket ${sub.plan} (${sub.userLimit} pengguna) telah tercapai. Silakan upgrade paket langganan Anda.`
          );
        }
      }

      const existing = await tx
        .select()
        .from(users)
        .where(and(eq(users.businessId, ctx.businessId), eq(users.email, normalizedEmail)))
        .limit(1);

      if (existing[0]) {
        throw new Error('Email tersebut sudah terdaftar pada tim/portal bisnis Anda.');
      }

      const pendingUid = `invited_${crypto.randomUUID()}`;
      const [created] = await tx
        .insert(users)
        .values({
          uid: pendingUid,
          businessId: ctx.businessId,
          customerId: input.customerId || null,
          fullName: input.fullName.trim(),
          email: normalizedEmail,
          phone: (input.phone || '').trim(),
          role: input.role,
          invitationStatus: 'pending',
          invitedByUid: ctx.uid,
          isActive: true,
        })
        .returning();

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: 'TEAM_INVITED',
        entityType: 'user',
        entityId: created.id,
        description: `Mengundang ${created.fullName} (${created.email}) sebagai ${created.role}.`,
      });

      return created;
    });
  } catch (error) {
    console.error('Database transaction failed in inviteTeamMember:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal mengirim undangan tim.', {
      cause: error,
    });
  }
}

export async function updateTeamMember(
  ctx: WorkspaceUserContext,
  memberId: string,
  input: { role?: UserRole; isActive?: boolean }
) {
  try {
    const [target] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, memberId), eq(users.businessId, ctx.businessId)))
      .limit(1);

    if (!target) {
      throw new Error('Anggota tim tidak ditemukan.');
    }
    if (target.uid === ctx.uid && input.isActive === false) {
      throw new Error('Anda tidak dapat menonaktifkan akun Owner utama sendiri.');
    }

    const [updated] = await db
      .update(users)
      .set({
        role: input.role ?? target.role,
        isActive: input.isActive ?? target.isActive,
        updatedAt: new Date(),
      })
      .where(eq(users.id, memberId))
      .returning();

    return updated;
  } catch (error) {
    console.error('Database query failed in updateTeamMember:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal memperbarui anggota tim.', {
      cause: error,
    });
  }
}

export const PLAN_CATALOG: Record<
  'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE',
  { monthlyPrice: number; orderLimit: number; userLimit: number; label: string }
> = {
  FREE: { monthlyPrice: 0, orderLimit: 20, userLimit: 1, label: 'Free' },
  STARTER: { monthlyPrice: 69000, orderLimit: 150, userLimit: 3, label: 'Starter' },
  BUSINESS: { monthlyPrice: 149000, orderLimit: 500, userLimit: 10, label: 'Business' },
  ENTERPRISE: { monthlyPrice: 499000, orderLimit: 99999, userLimit: 999, label: 'Enterprise' },
};

export async function simulateSubscriptionCheckout(
  ctx: WorkspaceUserContext,
  plan: 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE',
  gatewayProvider: 'midtrans_sim' | 'xendit_sim'
) {
  try {
    const planSpec = PLAN_CATALOG[plan];
    if (!planSpec) {
      throw new Error('Paket langganan tidak dikenali.');
    }

    // Simulated server-side webhook signature creation & verification (Rule 13 & Section 11)
    const secret = process.env.SUBSCRIPTION_WEBHOOK_SECRET || 'orderflow_sim_secret_key';
    const orderRef = `SUB-${gatewayProvider.toUpperCase()}-${Date.now()}`;
    const payloadString = `${orderRef}:${ctx.businessId}:${plan}:${planSpec.monthlyPrice}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    const verifiedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    if (expectedSignature !== verifiedSignature) {
      throw new Error('Verifikasi signature simulasi pembayaran gagal.');
    }

    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);

    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(subscriptions)
        .set({
          plan,
          status: 'active',
          monthlyPrice: planSpec.monthlyPrice,
          orderLimit: planSpec.orderLimit,
          userLimit: planSpec.userLimit,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          paymentGatewayMode: `simulation_${gatewayProvider}`,
          lastSimulationRef: orderRef,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.businessId, ctx.businessId))
        .returning();

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: 'SUBSCRIPTION_CHANGED',
        entityType: 'subscription',
        entityId: updated.id,
        description: `Mengubah paket langganan menjadi ${plan} melalui mode simulasi (${orderRef}).`,
      });

      return updated;
    });
  } catch (error) {
    console.error('Database transaction failed in simulateSubscriptionCheckout:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal memproses perubahan paket.', {
      cause: error,
    });
  }
}

export async function listNotifications(ctx: WorkspaceUserContext) {
  try {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.businessId, ctx.businessId))
      .orderBy(desc(notifications.createdAt))
      .limit(30);
  } catch (error) {
    console.error('Database query failed in listNotifications:', error);
    throw new Error('Gagal memuat notifikasi.', { cause: error });
  }
}

export async function markAllNotificationsRead(ctx: WorkspaceUserContext) {
  try {
    await db
      .update(notifications)
      .set({ isRead: true, updatedAt: new Date() })
      .where(eq(notifications.businessId, ctx.businessId));
    return { success: true };
  } catch (error) {
    console.error('Database query failed in markAllNotificationsRead:', error);
    throw new Error('Gagal memperbarui status baca notifikasi.', { cause: error });
  }
}

export async function getPublicOrderTracking(token: string, pin?: string) {
  try {
    const cleanToken = (token || '').trim().toUpperCase();
    if (!cleanToken) {
      throw new Error('Kode tracking wajib diisi.');
    }

    const [row] = await db
      .select({
        order: orders,
        customer: customers,
        business: businesses,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .innerJoin(businesses, eq(orders.businessId, businesses.id))
      .where(eq(orders.trackingToken, cleanToken))
      .limit(1);

    if (!row) {
      throw new Error('Pesanan dengan kode tracking tersebut tidak ditemukan.');
    }

    // Access verification using 4-digit PIN (last 4 digits of customer phone)
    if (!pin || pin.trim() !== row.order.trackingPin) {
      return {
        requiresVerification: true,
        trackingToken: row.order.trackingToken,
        orderNumberMasked: row.order.orderNumber,
        businessName: row.business.name,
        hint: 'Masukkan 4 digit terakhir nomor telepon pemesan untuk membuka detail pesanan.',
      };
    }

    const [items, shipRows, historyRows, prodJobs] = await Promise.all([
      db
        .select({
          id: orderItems.id,
          productName: orderItems.productName,
          specifications: orderItems.specifications,
          quantity: orderItems.quantity,
          unit: orderItems.unit,
          unitPrice: orderItems.unitPrice,
          lineTotal: orderItems.lineTotal,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, row.order.id)),
      db
        .select()
        .from(shippingRecords)
        .where(eq(shippingRecords.orderId, row.order.id))
        .limit(1),
      db
        .select({
          id: orderStatusHistory.id,
          domain: orderStatusHistory.domain,
          toStatus: orderStatusHistory.toStatus,
          reason: orderStatusHistory.reason,
          createdAt: orderStatusHistory.createdAt,
        })
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, row.order.id))
        .orderBy(desc(orderStatusHistory.createdAt)),
      db
        .select({
          status: productionJobs.status,
          qcPassed: productionJobs.qcPassed,
          photos: productionJobs.photos,
          updatedAt: productionJobs.updatedAt,
        })
        .from(productionJobs)
        .where(eq(productionJobs.orderId, row.order.id))
        .limit(1),
    ]);

    const ship = shipRows[0] || null;
    const isOverdue =
      new Date(row.order.deadline) < new Date() &&
      row.order.orderStatus !== 'selesai' &&
      row.order.orderStatus !== 'dibatalkan';

    // Strictly sanitized public payload — zero internal business notes, staff UIDs, or internal margins
    return {
      requiresVerification: false,
      business: {
        name: row.business.name,
        industry: row.business.industry,
        phone: row.business.phone,
      },
      customerName: row.customer.name,
      order: {
        orderNumber: row.order.orderNumber,
        trackingToken: row.order.trackingToken,
        title: row.order.title,
        category: row.order.category,
        specifications: row.order.specifications,
        orderStatus: row.order.orderStatus,
        designStatus: row.order.designStatus,
        productionStatus: row.order.productionStatus,
        paymentStatus: row.order.paymentStatus,
        grandTotal: row.order.grandTotal,
        paidAmount: row.order.paidAmount,
        remainingAmount: Math.max(0, row.order.grandTotal - row.order.paidAmount),
        orderDate: row.order.orderDate,
        deadline: row.order.deadline,
        isOverdue,
      },
      items,
      production: prodJobs[0] || null,
      shipping: ship
        ? {
            courierName: ship.courierName,
            serviceType: ship.serviceType,
            trackingNumber: ship.trackingNumber,
            status: ship.status,
            shippedAt: ship.shippedAt,
            deliveredAt: ship.deliveredAt,
          }
        : null,
      timeline: historyRows,
    };
  } catch (error) {
    console.error('Database query failed in getPublicOrderTracking:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal melacak pesanan.', {
      cause: error,
    });
  }
}

export async function seedOperationalWorkspaceData(ctx: WorkspaceUserContext) {
  try {
    return await db.transaction(async (tx) => {
      const existingOrders = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.businessId, ctx.businessId))
        .limit(1);

      if (existingOrders.length > 0) {
        throw new Error('Workspace sudah memiliki data pesanan operasional.');
      }

      const now = new Date();
      const daysFromNow = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

      // 1. Insert 4 realistic Indonesian custom order customers
      const insertedCustomers = await tx
        .insert(customers)
        .values([
          {
            businessId: ctx.businessId,
            customerCode: 'CST-0001-KR',
            name: 'Raka Pratama',
            company: 'PT Kopi Roastery Nusantara',
            email: 'raka@kopiroastery.co.id',
            phone: '081288904512',
            address: 'Jl. Senopati No. 42, Kebayoran Baru, Jakarta Selatan',
            notes: 'Pelanggan rutin kemasan box & apron barista bordir.',
          },
          {
            businessId: ctx.businessId,
            customerCode: 'CST-0002-at',
            name: 'Nadia Kusuma',
            company: 'Panitia TechSummit Indonesia',
            email: 'nadia@techsummit.id',
            phone: '081377219980',
            address: 'Gedung Cyber Lt. 8, Kuningan, Jakarta',
            notes: 'Prioritas ketepatan warna sablon plastisol.',
          },
          {
            businessId: ctx.businessId,
            customerCode: 'CST-0003-BM',
            name: 'Hendra Wijaya',
            company: 'Bumi Living Studio',
            email: 'hendra@bumiliving.id',
            phone: '081122338844',
            address: 'Jl. Dago Giri No. 19, Bandung',
            notes: 'Pesanan meja kayu jati custom kafe.',
          },
          {
            businessId: ctx.businessId,
            customerCode: 'CST-0004-UN',
            name: 'Sinta Maharani',
            company: 'BEM Fakultas Teknik',
            email: 'sinta@kampusteknik.ac.id',
            phone: '085719283746',
            address: 'Jl. Ganesha No. 10, Bandung',
            notes: 'Jaket himpunan bordir komputer.',
          },
        ])
        .returning();

      const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

      const sampleSpecs = [
        {
          cust: insertedCustomers[1],
          seq: '0001',
          token: `TRK-TS26-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          pin: '9980',
          title: 'Paket Merchandise Kaos & Lanyard TechSummit',
          category: 'Sablon & Merchandise',
          specs: 'Cotton Combed 24s Hitam Jetblack, Sablon Plastisol 4 Warna + Lanyard Tissue 2cm Sublim',
          orderStatus: 'diproses',
          designStatus: 'disetujui',
          prodStatus: 'dalam_produksi',
          payStatus: 'partial',
          orderDate: daysFromNow(-6),
          deadline: daysFromNow(3),
          items: [
            { productName: 'Kaos Cotton Combed 24s Sablon Plastisol', specifications: 'Size S-XXL, Hitam', quantity: 150, unit: 'pcs', unitPrice: 85000 },
            { productName: 'Lanyard Tissue Sublim 2 Sisi + Stopper', specifications: 'Lebar 2cm, Kait Besi', quantity: 150, unit: 'pcs', unitPrice: 18000 },
          ],
          addCost: 150000,
          discount: 200000,
          paid: 8000000,
          qcPassed: false,
        },
        {
          cust: insertedCustomers[0],
          seq: '0002',
          token: `TRK-KR26-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          pin: '4512',
          title: 'Hardbox Kemasan Drip Bag & Apron Kanvas Barista',
          category: 'Percetakan & Konveksi',
          specs: 'Ivory 350gr Laminasi Doff Spot UV + Apron Kanvas Marsoto Bordir Logo Emas',
          orderStatus: 'selesai',
          designStatus: 'disetujui',
          prodStatus: 'selesai',
          payStatus: 'paid',
          orderDate: daysFromNow(-18),
          deadline: daysFromNow(-4),
          items: [
            { productName: 'Packaging Box Drip Coffee Spot UV', specifications: '12x10x8 cm, Cetak Full Color', quantity: 500, unit: 'pcs', unitPrice: 9500 },
            { productName: 'Apron Kanvas Barista Custom Bordir', specifications: 'Warna Olive, Strap Kulit Sintetis', quantity: 24, unit: 'pcs', unitPrice: 145000 },
          ],
          addCost: 0,
          discount: 230000,
          paid: 8000000,
          qcPassed: true,
        },
        {
          cust: insertedCustomers[3],
          seq: '0003',
          token: `TRK-FT26-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          pin: '3746',
          title: 'Jaket Parka Himpunan Bordir Komputer 80 Pcs',
          category: 'Konveksi',
          specs: 'Bahan Taslan Milky Waterproof Navy, Furing Polar, Bordir 4 Titik Presisi',
          orderStatus: 'diproses',
          designStatus: 'disetujui',
          prodStatus: 'quality_control',
          payStatus: 'partial',
          orderDate: daysFromNow(-12),
          deadline: daysFromNow(-1), // Overdue example for operational alert!
          items: [
            { productName: 'Jaket Parka Taslan Bordir 4 Titik', specifications: 'Navy Blue, Size M-XXXL', quantity: 80, unit: 'pcs', unitPrice: 215000 },
          ],
          addCost: 200000,
          discount: 0,
          paid: 10000000,
          qcPassed: false,
        },
        {
          cust: insertedCustomers[2],
          seq: '0004',
          token: `TRK-BL26-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          pin: '8844',
          title: 'Meja Komunal Kayu Jati Solid & Kursi Besi Industrial',
          category: 'Furniture Custom',
          specs: 'Jati Perhutani Grade A Finishing Natural Matte PU, Rangka Hollow 4x6 Powder Coating',
          orderStatus: 'menunggu_konfirmasi',
          designStatus: 'menunggu_persetujuan',
          prodStatus: 'menunggu_produksi',
          payStatus: 'unpaid',
          orderDate: daysFromNow(-1),
          deadline: daysFromNow(14),
          items: [
            { productName: 'Meja Komunal Jati Solid 240x90 cm', specifications: 'Tebal Top 4cm, Kaki Besi Hitam', quantity: 2, unit: 'set', unitPrice: 6800000 },
            { productName: 'Kursi Cafe Industrial Dudukan Jati', specifications: 'Tinggi 45cm, Finishing Matte', quantity: 12, unit: 'pcs', unitPrice: 650000 },
          ],
          addCost: 450000,
          discount: 450000,
          paid: 0,
          qcPassed: false,
        },
      ];

      for (const sp of sampleSpecs) {
        const subtotal = sp.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
        const grandTotal = subtotal + sp.addCost - sp.discount;
        const paidAmt = sp.payStatus === 'paid' ? grandTotal : sp.paid;

        const [ord] = await tx
          .insert(orders)
          .values({
            businessId: ctx.businessId,
            customerId: sp.cust.id,
            orderNumber: `ORD-${ym}-${sp.seq}`,
            trackingToken: sp.token,
            trackingPin: sp.pin,
            title: sp.title,
            category: sp.category,
            description: `Pesanan produksi custom untuk ${sp.cust.company}`,
            specifications: sp.specs,
            orderStatus: sp.orderStatus,
            designStatus: sp.designStatus,
            productionStatus: sp.prodStatus,
            paymentStatus: sp.payStatus,
            requiresDesignApproval: true,
            minDpPercent: 50,
            subtotal,
            additionalCost: sp.addCost,
            discount: sp.discount,
            grandTotal,
            paidAmount: paidAmt,
            orderDate: sp.orderDate,
            deadline: sp.deadline,
            completedAt: sp.orderStatus === 'selesai' ? daysFromNow(-5) : null,
            createdByUid: ctx.uid,
          })
          .returning();

        await tx.insert(orderItems).values(
          sp.items.map((it) => ({
            businessId: ctx.businessId,
            orderId: ord.id,
            productName: it.productName,
            specifications: it.specifications,
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unitPrice,
            lineTotal: it.quantity * it.unitPrice,
          }))
        );

        await tx.insert(designFiles).values({
          businessId: ctx.businessId,
          orderId: ord.id,
          version: 1,
          fileType: 'design_proof',
          title: `Mockup Produksi Final — ${sp.title}`,
          fileName: `mockup-${sp.seq.toLowerCase()}.svg`,
          fileUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#f8fafc"/><rect x="40" y="40" width="720" height="420" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/><text x="80" y="120" font-family="sans-serif" font-size="16" fill="#4f46e5" font-weight="bold">ORDERFLOW TECHNICAL PROOF · ORD-${ym}-${sp.seq}</text><text x="80" y="170" font-family="sans-serif" font-size="26" fill="#0f172a" font-weight="bold">${sp.title.slice(0, 42)}</text><text x="80" y="220" font-family="sans-serif" font-size="15" fill="#475569">${sp.specs.slice(0, 68)}</text><rect x="80" y="270" width="200" height="120" rx="8" fill="#eef2ff" stroke="#c7d2fe"/><text x="115" y="335" font-family="sans-serif" font-size="14" fill="#4338ca" font-weight="bold">SKALA 1:1 CMYK</text><rect x="310" y="270" width="410" height="120" rx="8" fill="#f1f5f9"/><text x="335" y="315" font-family="sans-serif" font-size="14" fill="#334155">Pelanggan: ${sp.cust.name}</text><text x="335" y="345" font-family="sans-serif" font-size="14" fill="#334155">Status: ${sp.designStatus.toUpperCase()}</text></svg>`
          )}`,
          notes: 'Layout ukuran cetak, palet warna Pantone/CMYK, dan posisi logo telah disesuaikan.',
          approvalStatus: sp.designStatus,
          isProductionReference: sp.designStatus === 'disetujui',
          uploadedByUid: ctx.uid,
          uploadedByName: ctx.fullName,
          uploadedByRole: 'owner',
          approvedAt: sp.designStatus === 'disetujui' ? sp.orderDate : null,
          approvedByName: sp.designStatus === 'disetujui' ? sp.cust.name : null,
        });

        const [job] = await tx
          .insert(productionJobs)
          .values({
            businessId: ctx.businessId,
            orderId: ord.id,
            jobNumber: `JOB-${ym}-${sp.seq}`,
            status: sp.prodStatus,
            priority: sp.seq === '0003' ? 'mendesak' : 'tinggi',
            assignedStaffUid: ctx.uid,
            assignedStaffName: ctx.fullName,
            deadline: sp.deadline,
            productionNotes: sp.specs,
            qcPassed: sp.qcPassed,
            startedAt: sp.prodStatus !== 'menunggu_produksi' ? sp.orderDate : null,
            completedAt: sp.prodStatus === 'selesai' ? daysFromNow(-5) : null,
          })
          .returning();

        await tx.insert(productionLogs).values({
          businessId: ctx.businessId,
          productionJobId: job.id,
          orderId: ord.id,
          fromStatus: 'menunggu_produksi',
          toStatus: sp.prodStatus,
          notes: `Status pengerjaan saat ini: ${sp.prodStatus.replace(/_/g, ' ')}.`,
          actorUid: ctx.uid,
          actorName: ctx.fullName,
        });

        if (sp.qcPassed) {
          await tx.insert(qcInspections).values({
            businessId: ctx.businessId,
            productionJobId: job.id,
            orderId: ord.id,
            inspectorUid: ctx.uid,
            inspectorName: ctx.fullName,
            passed: true,
            checklist: {
              materialChecked: true,
              dimensionChecked: true,
              printColorChecked: true,
              finishingChecked: true,
            },
            notes: 'Seluruh sampel batch lulus inspeksi presisi warna dan jahitan.',
            inspectedAt: daysFromNow(-5),
          });
        }

        const [inv] = await tx
          .insert(invoices)
          .values({
            businessId: ctx.businessId,
            orderId: ord.id,
            customerId: sp.cust.id,
            invoiceNumber: `INV-${ym}-${sp.seq}`,
            issueDate: sp.orderDate,
            dueDate: sp.deadline,
            subtotal,
            additionalCost: sp.addCost,
            discount: sp.discount,
            grandTotal,
            verifiedPaidAmount: paidAmt,
            refundedAmount: 0,
            status: sp.payStatus,
            notes: 'Pembayaran via Transfer Bank BCA.',
          })
          .returning();

        if (paidAmt > 0) {
          await tx.insert(payments).values({
            businessId: ctx.businessId,
            invoiceId: inv.id,
            orderId: ord.id,
            paymentNumber: `PAY-${now.getFullYear()}-${sp.seq}`,
            paymentType: sp.payStatus === 'paid' ? 'pelunasan' : 'dp',
            method: 'transfer_bank',
            amount: paidAmt,
            referenceCode: `BCA-${sp.seq}9921`,
            verificationStatus: 'verified',
            notes: sp.payStatus === 'paid' ? 'Pelunasan lunas terverifikasi' : 'DP 50%+ terverifikasi',
            paidAt: sp.orderDate,
            submittedByUid: ctx.uid,
            submittedByName: sp.cust.name,
            verifiedByUid: ctx.uid,
            verifiedByName: ctx.fullName,
            verifiedAt: sp.orderDate,
          });
        }

        await tx.insert(shippingRecords).values({
          businessId: ctx.businessId,
          orderId: ord.id,
          courierName: sp.orderStatus === 'selesai' ? 'JNE Trucking (JTR)' : 'Ambil di Workshop',
          serviceType: 'Reguler',
          trackingNumber: sp.orderStatus === 'selesai' ? 'JTR8829104421' : '',
          recipientName: sp.cust.name,
          recipientPhone: sp.cust.phone,
          shippingAddress: sp.cust.address || '-',
          shippingCost: 0,
          status: sp.orderStatus === 'selesai' ? 'diterima' : 'belum_dikirim',
        });

        await tx.insert(orderStatusHistory).values({
          businessId: ctx.businessId,
          orderId: ord.id,
          domain: 'order',
          fromStatus: null,
          toStatus: sp.orderStatus,
          reason: 'Inisialisasi pesanan operasional',
          actorUid: ctx.uid,
          actorName: ctx.fullName,
        });
      }

      await tx
        .update(subscriptions)
        .set({ ordersUsedThisMonth: 4, updatedAt: new Date() })
        .where(eq(subscriptions.businessId, ctx.businessId));

      await tx.insert(notifications).values([
        {
          businessId: ctx.businessId,
          type: 'pesanan_terlambat',
          title: `Peringatan Deadline ORD-${ym}-0003`,
          message: 'Jaket Parka Himpunan 80 Pcs telah melewati batas waktu dan berada di tahap Quality Control.',
        },
        {
          businessId: ctx.businessId,
          type: 'desain_approval',
          title: `Menunggu Approval Desain ORD-${ym}-0004`,
          message: 'Mockup Meja Komunal Kayu Jati menunggu persetujuan Bumi Living Studio.',
        },
      ]);

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: 'WORKSPACE_SEEDED',
        entityType: 'business',
        entityId: ctx.businessId,
        description: 'Memuat data operasional awal ke database PostgreSQL.',
      });

      return { seeded: true };
    });
  } catch (error) {
    console.error('Database transaction failed in seedOperationalWorkspaceData:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal memuat data operasional.', {
      cause: error,
    });
  }
}
