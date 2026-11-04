import crypto from 'node:crypto';
import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../index.ts';
import {
  productionJobs,
  productionLogs,
  qcInspections,
  orders,
  customers,
  orderItems,
  designFiles,
  designRevisions,
  businessSettings,
  orderStatusHistory,
  notifications,
  activityLogs,
  users,
} from '../schema.ts';
import type { WorkspaceUserContext } from '../workspace.ts';

export type ProductionStatus =
  | 'menunggu_produksi'
  | 'persiapan'
  | 'dalam_produksi'
  | 'quality_control'
  | 'siap_dikirim'
  | 'selesai';

export async function listProductionBoard(ctx: WorkspaceUserContext) {
  try {
    const rows = await db
      .select({
        job: productionJobs,
        order: orders,
        customer: customers,
      })
      .from(productionJobs)
      .innerJoin(orders, eq(productionJobs.orderId, orders.id))
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(productionJobs.businessId, ctx.businessId))
      .orderBy(asc(productionJobs.deadline));

    const staffMembers = await db
      .select({
        id: users.id,
        uid: users.uid,
        fullName: users.fullName,
        role: users.role,
      })
      .from(users)
      .where(and(eq(users.businessId, ctx.businessId), eq(users.isActive, true)));

    const now = new Date();
    const jobs = rows
      .filter(({ order }) => order.orderStatus !== 'dibatalkan')
      .map(({ job, order, customer }) => {
        const isOverdue =
          new Date(job.deadline) < now && job.status !== 'selesai';
        const minDpAmount = Math.ceil(order.grandTotal * (order.minDpPercent / 100));
        const dpFulfilled = order.paidAmount >= minDpAmount;
        const designReady =
          !order.requiresDesignApproval || order.designStatus === 'disetujui';
        const orderConfirmed = order.orderStatus !== 'menunggu_konfirmasi';

        return {
          ...job,
          isOverdue,
          readiness: {
            orderConfirmed,
            dpFulfilled,
            minDpAmount,
            paidAmount: order.paidAmount,
            designReady,
            canStartProduction: orderConfirmed && dpFulfilled && designReady,
          },
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            title: order.title,
            category: order.category,
            orderStatus: order.orderStatus,
            designStatus: order.designStatus,
            paymentStatus: order.paymentStatus,
            grandTotal: order.grandTotal,
            paidAmount: order.paidAmount,
            requiresDesignApproval: order.requiresDesignApproval,
          },
          customer: {
            id: customer.id,
            name: customer.name,
            company: customer.company,
          },
        };
      });

    return {
      jobs,
      staffMembers: staffMembers.filter((u) => u.role !== 'customer'),
    };
  } catch (error) {
    console.error('Database query failed in listProductionBoard:', error);
    throw new Error('Gagal memuat papan produksi Kanban.', { cause: error });
  }
}

export async function getProductionJobDetail(ctx: WorkspaceUserContext, jobId: string) {
  try {
    const [row] = await db
      .select({
        job: productionJobs,
        order: orders,
        customer: customers,
      })
      .from(productionJobs)
      .innerJoin(orders, eq(productionJobs.orderId, orders.id))
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(and(eq(productionJobs.id, jobId), eq(productionJobs.businessId, ctx.businessId)))
      .limit(1);

    if (!row) {
      throw new Error('Pekerjaan produksi tidak ditemukan.');
    }

    const [items, designs, logs, inspections, staffList, settingsList] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, row.order.id)),
      db
        .select()
        .from(designFiles)
        .where(eq(designFiles.orderId, row.order.id))
        .orderBy(desc(designFiles.version)),
      db
        .select()
        .from(productionLogs)
        .where(eq(productionLogs.productionJobId, jobId))
        .orderBy(desc(productionLogs.createdAt)),
      db
        .select()
        .from(qcInspections)
        .where(eq(qcInspections.productionJobId, jobId))
        .orderBy(desc(qcInspections.inspectedAt)),
      db
        .select()
        .from(users)
        .where(and(eq(users.businessId, ctx.businessId), eq(users.isActive, true))),
      db
        .select()
        .from(businessSettings)
        .where(eq(businessSettings.businessId, ctx.businessId))
        .limit(1),
    ]);

    const isOverdue = new Date(row.job.deadline) < new Date() && row.job.status !== 'selesai';
    const settings = settingsList[0];
    const minDpAmount = Math.ceil(row.order.grandTotal * (row.order.minDpPercent / 100));
    const dpFulfilled =
      !settings?.requireDpBeforeProduction || row.order.paidAmount >= minDpAmount;
    const designReady =
      !row.order.requiresDesignApproval || row.order.designStatus === 'disetujui';
    const orderConfirmed =
      row.order.orderStatus !== 'menunggu_konfirmasi' &&
      row.order.orderStatus !== 'dibatalkan';

    return {
      job: { ...row.job, isOverdue },
      order: row.order,
      customer: row.customer,
      items,
      approvedDesign: designs.find((d) => d.isProductionReference || d.approvalStatus === 'disetujui') || null,
      allDesigns: designs,
      logs,
      qcInspections: inspections,
      staffMembers: staffList.filter((u) => u.role !== 'customer'),
      readiness: {
        orderConfirmed,
        dpFulfilled,
        minDpAmount,
        designReady,
        canStartProduction: orderConfirmed && dpFulfilled && designReady,
      },
    };
  } catch (error) {
    console.error('Database query failed in getProductionJobDetail:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal memuat detail produksi.', {
      cause: error,
    });
  }
}

export async function updateProductionJob(
  ctx: WorkspaceUserContext,
  jobId: string,
  input: {
    status?: ProductionStatus;
    priority?: 'normal' | 'tinggi' | 'mendesak';
    assignedStaffUid?: string | null;
    assignedStaffName?: string | null;
    productionNotes?: string;
    logNotes?: string;
  }
) {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          job: productionJobs,
          order: orders,
        })
        .from(productionJobs)
        .innerJoin(orders, eq(productionJobs.orderId, orders.id))
        .where(and(eq(productionJobs.id, jobId), eq(productionJobs.businessId, ctx.businessId)))
        .limit(1);

      if (!row) {
        throw new Error('Pekerjaan produksi tidak ditemukan.');
      }

      const { job, order } = row;

      // Staff RBAC Rule: Production staff can only modify jobs assigned to them (unless owner previewing)
      if (ctx.effectiveRole === 'production_staff' && ctx.actualRole !== 'owner') {
        if (job.assignedStaffUid && job.assignedStaffUid !== ctx.uid) {
          throw new Error(
            `Pekerjaan ini ditugaskan kepada ${job.assignedStaffName || 'staf lain'}. Staf produksi hanya boleh memperbarui pekerjaan yang ditugaskan kepadanya.`
          );
        }
        if (input.assignedStaffUid !== undefined && input.assignedStaffUid !== job.assignedStaffUid) {
          throw new Error('Hanya Owner atau Admin yang dapat mengubah penugasan staf produksi.');
        }
      }

      const nextStatus = input.status || (job.status as ProductionStatus);

      if (nextStatus !== job.status) {
        const [settings] = await tx
          .select()
          .from(businessSettings)
          .where(eq(businessSettings.businessId, ctx.businessId))
          .limit(1);

        // Business Rule #4 & #5: Production only starts after order confirmation, DP verified, and Design approved
        if (nextStatus !== 'menunggu_produksi') {
          if (order.orderStatus === 'menunggu_konfirmasi' || order.orderStatus === 'dibatalkan') {
            throw new Error(
              'Produksi belum dapat dimulai karena pesanan belum dikonfirmasi oleh Admin/Owner.'
            );
          }

          if (settings?.requireDpBeforeProduction !== false) {
            const requiredDp = Math.ceil(order.grandTotal * (order.minDpPercent / 100));
            if (order.paidAmount < requiredDp) {
              throw new Error(
                `Produksi belum dapat dimulai. Pembayaran DP terverifikasi saat ini Rp${order.paidAmount.toLocaleString(
                  'id-ID'
                )}, sedangkan minimal DP (${order.minDpPercent}%) adalah Rp${requiredDp.toLocaleString('id-ID')}.`
              );
            }
          }

          if (order.requiresDesignApproval && order.designStatus !== 'disetujui') {
            throw new Error(
              'Produksi belum dapat dimulai karena desain pesanan belum disetujui (status desain harus Disetujui).'
            );
          }
        }

        // Business Rule Module 5: Production CANNOT be marked Siap Dikirim or Selesai before QC Passed!
        if ((nextStatus === 'siap_dikirim' || nextStatus === 'selesai') && !job.qcPassed) {
          throw new Error(
            'Produksi tidak dapat dinyatakan Siap Dikirim atau Selesai sebelum pemeriksaan Quality Control (QC) dinyatakan LOLOS.'
          );
        }
      }

      let nextOrderStatus = order.orderStatus;
      if (
        nextStatus === 'persiapan' ||
        nextStatus === 'dalam_produksi' ||
        nextStatus === 'quality_control'
      ) {
        nextOrderStatus = 'diproses';
      } else if (nextStatus === 'siap_dikirim') {
        nextOrderStatus = 'siap_dikirim';
      } else if (nextStatus === 'selesai') {
        nextOrderStatus = 'selesai';
      }

      const [updatedJob] = await tx
        .update(productionJobs)
        .set({
          status: nextStatus,
          priority: input.priority ?? job.priority,
          assignedStaffUid:
            input.assignedStaffUid !== undefined ? input.assignedStaffUid : job.assignedStaffUid,
          assignedStaffName:
            input.assignedStaffName !== undefined
              ? input.assignedStaffName
              : job.assignedStaffName,
          productionNotes:
            input.productionNotes !== undefined ? input.productionNotes : job.productionNotes,
          startedAt:
            nextStatus !== 'menunggu_produksi' && !job.startedAt ? new Date() : job.startedAt,
          completedAt: nextStatus === 'selesai' ? new Date() : job.completedAt,
          updatedAt: new Date(),
        })
        .where(eq(productionJobs.id, jobId))
        .returning();

      await tx
        .update(orders)
        .set({
          productionStatus: nextStatus,
          orderStatus: nextOrderStatus,
          completedAt: nextOrderStatus === 'selesai' ? new Date() : order.completedAt,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      if (nextStatus !== job.status || input.logNotes) {
        await tx.insert(productionLogs).values({
          businessId: ctx.businessId,
          productionJobId: jobId,
          orderId: order.id,
          fromStatus: job.status,
          toStatus: nextStatus,
          notes:
            input.logNotes ||
            (nextStatus !== job.status
              ? `Status produksi diperbarui menjadi ${nextStatus.replace(/_/g, ' ')}.`
              : 'Catatan produksi diperbarui.'),
          actorUid: ctx.uid,
          actorName: ctx.fullName,
        });
      }

      if (nextStatus !== job.status) {
        await tx.insert(orderStatusHistory).values({
          businessId: ctx.businessId,
          orderId: order.id,
          domain: 'production',
          fromStatus: job.status,
          toStatus: nextStatus,
          reason: input.logNotes || 'Perubahan tahap produksi Kanban',
          actorUid: ctx.uid,
          actorName: ctx.fullName,
        });

        await tx.insert(notifications).values({
          businessId: ctx.businessId,
          type: 'status_produksi',
          title: `Update Produksi ${order.orderNumber}`,
          message: `Pekerjaan "${order.title}" berpindah ke tahap ${nextStatus.replace(/_/g, ' ')}.`,
          orderId: order.id,
        });
      }

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: 'PRODUCTION_UPDATED',
        entityType: 'production_job',
        entityId: jobId,
        description: `Memperbarui produksi ${order.orderNumber} (${nextStatus}).`,
      });

      return updatedJob;
    });
  } catch (error) {
    console.error('Database transaction failed in updateProductionJob:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal memperbarui status produksi.', {
      cause: error,
    });
  }
}

export async function recordQcInspection(
  ctx: WorkspaceUserContext,
  jobId: string,
  input: {
    passed: boolean;
    checklist: {
      materialChecked: boolean;
      dimensionChecked: boolean;
      printColorChecked: boolean;
      finishingChecked: boolean;
    };
    notes?: string;
  }
) {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ job: productionJobs, order: orders })
        .from(productionJobs)
        .innerJoin(orders, eq(productionJobs.orderId, orders.id))
        .where(and(eq(productionJobs.id, jobId), eq(productionJobs.businessId, ctx.businessId)))
        .limit(1);

      if (!row) {
        throw new Error('Pekerjaan produksi tidak ditemukan.');
      }

      const [inspection] = await tx
        .insert(qcInspections)
        .values({
          businessId: ctx.businessId,
          productionJobId: jobId,
          orderId: row.order.id,
          inspectorUid: ctx.uid,
          inspectorName: ctx.fullName,
          passed: input.passed,
          checklist: input.checklist,
          notes: (input.notes || '').trim(),
          inspectedAt: new Date(),
        })
        .returning();

      const nextStatus = input.passed ? row.job.status : 'dalam_produksi';

      await tx
        .update(productionJobs)
        .set({
          qcPassed: input.passed,
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(productionJobs.id, jobId));

      if (!input.passed) {
        await tx
          .update(orders)
          .set({ productionStatus: 'dalam_produksi', updatedAt: new Date() })
          .where(eq(orders.id, row.order.id));
      }

      await tx.insert(productionLogs).values({
        businessId: ctx.businessId,
        productionJobId: jobId,
        orderId: row.order.id,
        fromStatus: row.job.status,
        toStatus: nextStatus,
        notes: input.passed
          ? `QC LOLOS: ${input.notes || 'Seluruh standar spesifikasi terpenuhi.'}`
          : `QC TIDAK LOLOS (Rework): ${input.notes || 'Perlu perbaikan kualitas.'}`,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
      });

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: input.passed ? 'QC_PASSED' : 'QC_FAILED',
        entityType: 'qc_inspection',
        entityId: inspection.id,
        description: `Inspeksi QC ${row.order.orderNumber}: ${input.passed ? 'LOLOS' : 'PERLU REWORK'}.`,
      });

      return inspection;
    });
  } catch (error) {
    console.error('Database transaction failed in recordQcInspection:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal menyimpan hasil QC.', {
      cause: error,
    });
  }
}

export async function addProductionPhoto(
  ctx: WorkspaceUserContext,
  jobId: string,
  input: { url: string; caption: string }
) {
  try {
    return await db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(productionJobs)
        .where(and(eq(productionJobs.id, jobId), eq(productionJobs.businessId, ctx.businessId)))
        .limit(1);

      if (!job) {
        throw new Error('Pekerjaan produksi tidak ditemukan.');
      }

      if (
        ctx.effectiveRole === 'production_staff' &&
        ctx.actualRole !== 'owner' &&
        job.assignedStaffUid &&
        job.assignedStaffUid !== ctx.uid
      ) {
        throw new Error('Anda hanya dapat mengunggah foto pada pekerjaan yang ditugaskan kepada Anda.');
      }

      const newPhoto = {
        id: crypto.randomUUID(),
        url: input.url,
        caption: (input.caption || 'Dokumentasi produksi').trim(),
        uploadedBy: ctx.fullName,
        uploadedAt: new Date().toISOString(),
      };

      const nextPhotos = [...(job.photos || []), newPhoto];

      const [updated] = await tx
        .update(productionJobs)
        .set({
          photos: nextPhotos,
          updatedAt: new Date(),
        })
        .where(eq(productionJobs.id, jobId))
        .returning();

      await tx.insert(productionLogs).values({
        businessId: ctx.businessId,
        productionJobId: jobId,
        orderId: job.orderId,
        fromStatus: job.status,
        toStatus: job.status,
        notes: `Mengunggah foto hasil produksi: ${newPhoto.caption}`,
        photoUrl: input.url,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
      });

      return updated;
    });
  } catch (error) {
    console.error('Database transaction failed in addProductionPhoto:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal mengunggah foto produksi.', {
      cause: error,
    });
  }
}

export async function uploadDesignFile(
  ctx: WorkspaceUserContext,
  orderId: string,
  input: {
    fileType: 'design_proof' | 'customer_reference';
    title: string;
    fileName: string;
    fileUrl: string;
    notes?: string;
  }
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

      const existingFiles = await tx
        .select()
        .from(designFiles)
        .where(eq(designFiles.orderId, orderId))
        .orderBy(desc(designFiles.version));

      const nextVersion =
        input.fileType === 'design_proof'
          ? (existingFiles.find((f) => f.fileType === 'design_proof')?.version || 0) + 1
          : 1;

      const approvalStatus =
        input.fileType === 'design_proof' ? 'menunggu_persetujuan' : 'menunggu_desain';

      const [createdFile] = await tx
        .insert(designFiles)
        .values({
          businessId: ctx.businessId,
          orderId,
          version: nextVersion,
          fileType: input.fileType,
          title: input.title.trim(),
          fileName: input.fileName.trim(),
          fileUrl: input.fileUrl,
          notes: (input.notes || '').trim(),
          approvalStatus,
          isProductionReference: false,
          uploadedByUid: ctx.uid,
          uploadedByName: ctx.fullName,
          uploadedByRole: ctx.effectiveRole,
        })
        .returning();

      if (input.fileType === 'design_proof') {
        // Resolve open revisions when new proof version is uploaded
        await tx
          .update(designRevisions)
          .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(designRevisions.orderId, orderId), eq(designRevisions.status, 'open')));

        await tx
          .update(orders)
          .set({ designStatus: 'menunggu_persetujuan', updatedAt: new Date() })
          .where(eq(orders.id, orderId));

        await tx.insert(orderStatusHistory).values({
          businessId: ctx.businessId,
          orderId,
          domain: 'design',
          fromStatus: order.designStatus,
          toStatus: 'menunggu_persetujuan',
          reason: `Desain versi v${nextVersion} diunggah untuk persetujuan`,
          actorUid: ctx.uid,
          actorName: ctx.fullName,
        });

        await tx.insert(notifications).values({
          businessId: ctx.businessId,
          type: 'desain_approval',
          title: `Desain v${nextVersion} Menunggu Persetujuan`,
          message: `Desain "${input.title}" untuk ${order.orderNumber} siap ditinjau pelanggan.`,
          orderId,
        });
      }

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: 'DESIGN_UPLOADED',
        entityType: 'design_file',
        entityId: createdFile.id,
        description: `Mengunggah ${
          input.fileType === 'design_proof' ? `desain v${nextVersion}` : 'referensi pelanggan'
        } pada pesanan ${order.orderNumber}.`,
      });

      return createdFile;
    });
  } catch (error) {
    console.error('Database transaction failed in uploadDesignFile:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal mengunggah file desain.', {
      cause: error,
    });
  }
}

export async function requestDesignRevision(
  ctx: WorkspaceUserContext,
  orderId: string,
  input: { designFileId?: string; revisionNotes: string }
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

      const prevRevs = await tx
        .select()
        .from(designRevisions)
        .where(eq(designRevisions.orderId, orderId));

      const revNum = prevRevs.length + 1;

      const [revision] = await tx
        .insert(designRevisions)
        .values({
          businessId: ctx.businessId,
          orderId,
          designFileId: input.designFileId || null,
          revisionNumber: revNum,
          revisionNotes: input.revisionNotes.trim(),
          status: 'open',
          requestedByUid: ctx.uid,
          requestedByName: ctx.fullName,
          requestedByRole: ctx.effectiveRole,
        })
        .returning();

      if (input.designFileId) {
        await tx
          .update(designFiles)
          .set({
            approvalStatus: 'revisi',
            isProductionReference: false,
            updatedAt: new Date(),
          })
          .where(eq(designFiles.id, input.designFileId));
      }

      await tx
        .update(orders)
        .set({ designStatus: 'revisi', updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        businessId: ctx.businessId,
        orderId,
        domain: 'design',
        fromStatus: order.designStatus,
        toStatus: 'revisi',
        reason: input.revisionNotes.trim(),
        actorUid: ctx.uid,
        actorName: ctx.fullName,
      });

      await tx.insert(notifications).values({
        businessId: ctx.businessId,
        type: 'revisi_pelanggan',
        title: `Permintaan Revisi Desain #${revNum} (${order.orderNumber})`,
        message: `${ctx.fullName}: "${input.revisionNotes.trim()}"`,
        orderId,
      });

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: 'DESIGN_REVISION_REQUESTED',
        entityType: 'design_revision',
        entityId: revision.id,
        description: `Meminta revisi desain #${revNum} pada pesanan ${order.orderNumber}.`,
      });

      return revision;
    });
  } catch (error) {
    console.error('Database transaction failed in requestDesignRevision:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal mengirim permintaan revisi.', {
      cause: error,
    });
  }
}

export async function approveDesignFile(
  ctx: WorkspaceUserContext,
  orderId: string,
  designFileId: string
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

      // Clear previous production reference flags on this order
      await tx
        .update(designFiles)
        .set({ isProductionReference: false, updatedAt: new Date() })
        .where(eq(designFiles.orderId, orderId));

      const [approved] = await tx
        .update(designFiles)
        .set({
          approvalStatus: 'disetujui',
          isProductionReference: true,
          approvedAt: new Date(),
          approvedByName: ctx.fullName,
          updatedAt: new Date(),
        })
        .where(and(eq(designFiles.id, designFileId), eq(designFiles.orderId, orderId)))
        .returning();

      if (!approved) {
        throw new Error('File desain tidak ditemukan.');
      }

      await tx
        .update(designRevisions)
        .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(designRevisions.orderId, orderId), eq(designRevisions.status, 'open')));

      await tx
        .update(orders)
        .set({ designStatus: 'disetujui', updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        businessId: ctx.businessId,
        orderId,
        domain: 'design',
        fromStatus: order.designStatus,
        toStatus: 'disetujui',
        reason: `Desain v${approved.version} disetujui sebagai acuan produksi`,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
      });

      await tx.insert(notifications).values({
        businessId: ctx.businessId,
        type: 'desain_approval',
        title: `Desain v${approved.version} Disetujui (${order.orderNumber})`,
        message: `${ctx.fullName} menyetujui desain "${approved.title}" sebagai acuan produksi resmi.`,
        orderId,
      });

      await tx.insert(activityLogs).values({
        businessId: ctx.businessId,
        actorUid: ctx.uid,
        actorName: ctx.fullName,
        actorRole: ctx.effectiveRole,
        action: 'DESIGN_APPROVED',
        entityType: 'design_file',
        entityId: approved.id,
        description: `Menyetujui desain v${approved.version} pesanan ${order.orderNumber} sebagai acuan produksi.`,
      });

      return approved;
    });
  } catch (error) {
    console.error('Database transaction failed in approveDesignFile:', error);
    throw new Error(error instanceof Error ? error.message : 'Gagal menyetujui desain.', {
      cause: error,
    });
  }
}
