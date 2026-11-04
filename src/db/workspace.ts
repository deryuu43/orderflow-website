import { eq, and, ilike } from 'drizzle-orm';
import { db } from './index.ts';
import {
  businesses,
  users,
  businessSettings,
  subscriptions,
  customers,
  activityLogs,
} from './schema.ts';

export type UserRole = 'owner' | 'admin' | 'production_staff' | 'customer';

export interface WorkspaceUserContext {
  id: string;
  uid: string;
  businessId: string;
  customerId: string | null;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  actualRole: UserRole;
  effectiveRole: UserRole;
  isActive: boolean;
  businessName: string;
  businessIndustry: string;
}

function slugifyBusinessName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${base || 'workspace'}-${rand}`;
}

export async function getOrProvisionWorkspaceUser(params: {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
  requestedRoleOverride?: string;
}): Promise<WorkspaceUserContext> {
  const normalizedEmail = (params.email || '').trim().toLowerCase();
  const displayName = (params.name || normalizedEmail.split('@')[0] || 'Pengguna OrderFlow').trim();
  const avatarUrl = params.picture || '';

  try {
    // 1. Check if user already exists by Firebase UID
    const existingByUid = await db
      .select()
      .from(users)
      .where(eq(users.uid, params.uid))
      .limit(1);

    let userRecord = existingByUid[0];

    // 2. If not found by UID, check if there is a pending invitation matching this email
    if (!userRecord && normalizedEmail) {
      const invitedList = await db
        .select()
        .from(users)
        .where(
          and(
            ilike(users.email, normalizedEmail),
            eq(users.invitationStatus, 'pending')
          )
        )
        .limit(1);

      if (invitedList[0]) {
        const invited = invitedList[0];
        const updatedInvited = await db
          .update(users)
          .set({
            uid: params.uid,
            fullName: invited.fullName || displayName,
            avatarUrl: avatarUrl || invited.avatarUrl || '',
            invitationStatus: 'active',
            updatedAt: new Date(),
          })
          .where(eq(users.id, invited.id))
          .returning();
        userRecord = updatedInvited[0];

        if (userRecord && userRecord.customerId) {
          await db
            .update(customers)
            .set({ portalUserUid: params.uid, updatedAt: new Date() })
            .where(eq(customers.id, userRecord.customerId));
        }
      }
    }

    // 3. If still no userRecord, provision a new Owner + Business Workspace in a transaction
    if (!userRecord) {
      userRecord = await db.transaction(async (tx) => {
        // Double-check inside transaction using upsert pattern
        const recheck = await tx
          .select()
          .from(users)
          .where(eq(users.uid, params.uid))
          .limit(1);
        if (recheck[0]) {
          return recheck[0];
        }

        const defaultBizName = `Workshop ${displayName}`;
        const [createdBusiness] = await tx
          .insert(businesses)
          .values({
            name: defaultBizName,
            slug: slugifyBusinessName(defaultBizName),
            industry: 'Percetakan, Konveksi & Merchandise',
            email: normalizedEmail,
            phone: '0812-3456-7890',
            address: 'Jl. Industri Kreatif No. 18, Bandung',
            ownerUid: params.uid,
          })
          .returning();

        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + 30);

        await tx
          .insert(businessSettings)
          .values({
            businessId: createdBusiness.id,
            orderPrefix: 'ORD',
            invoicePrefix: 'INV',
            defaultMinDpPercent: 50,
            requireDesignApprovalDefault: true,
            requireDpBeforeProduction: true,
            bankName: 'BCA',
            bankAccountNumber: '8810492819',
            bankAccountHolder: defaultBizName,
          })
          .onConflictDoNothing();

        await tx
          .insert(subscriptions)
          .values({
            businessId: createdBusiness.id,
            plan: 'STARTER',
            status: 'active',
            monthlyPrice: 69000,
            orderLimit: 150,
            userLimit: 3,
            ordersUsedThisMonth: 0,
            currentPeriodStart: new Date(),
            currentPeriodEnd: periodEnd,
            paymentGatewayMode: 'simulation',
          })
          .onConflictDoNothing();

        const [upsertedUser] = await tx
          .insert(users)
          .values({
            uid: params.uid,
            businessId: createdBusiness.id,
            fullName: displayName,
            email: normalizedEmail,
            avatarUrl,
            role: 'owner',
            invitationStatus: 'active',
            isActive: true,
          })
          .onConflictDoUpdate({
            target: users.uid,
            set: {
              email: normalizedEmail,
              updatedAt: new Date(),
            },
          })
          .returning();

        await tx.insert(activityLogs).values({
          businessId: createdBusiness.id,
          actorUid: params.uid,
          actorName: displayName,
          actorRole: 'owner',
          action: 'WORKSPACE_CREATED',
          entityType: 'business',
          entityId: createdBusiness.id,
          description: `Workspace bisnis "${defaultBizName}" berhasil dibuat.`,
        });

        return upsertedUser;
      });
    } else if (userRecord.email !== normalizedEmail && normalizedEmail) {
      const [synced] = await db
        .update(users)
        .set({
          email: normalizedEmail,
          avatarUrl: avatarUrl || userRecord.avatarUrl || '',
          updatedAt: new Date(),
        })
        .where(eq(users.uid, params.uid))
        .returning();
      if (synced) userRecord = synced;
    }

    if (!userRecord.businessId) {
      throw new Error('Akun pengguna belum terhubung dengan workspace bisnis.');
    }

    // Check if customer role needs customerId auto-linked by email
    let resolvedCustomerId = userRecord.customerId;
    if (userRecord.role === 'customer' && !resolvedCustomerId && normalizedEmail) {
      const matchingCustomer = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.businessId, userRecord.businessId),
            ilike(customers.email, normalizedEmail)
          )
        )
        .limit(1);
      if (matchingCustomer[0]) {
        resolvedCustomerId = matchingCustomer[0].id;
        await db
          .update(users)
          .set({ customerId: resolvedCustomerId, updatedAt: new Date() })
          .where(eq(users.id, userRecord.id));
      }
    }

    const [biz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, userRecord.businessId))
      .limit(1);

    const actualRole = (userRecord.role as UserRole) || 'owner';
    const validRoles: UserRole[] = ['owner', 'admin', 'production_staff', 'customer'];

    // Only an authenticated actual 'owner' may simulate another role for operational QA
    let effectiveRole: UserRole = actualRole;
    if (
      actualRole === 'owner' &&
      params.requestedRoleOverride &&
      validRoles.includes(params.requestedRoleOverride as UserRole)
    ) {
      effectiveRole = params.requestedRoleOverride as UserRole;
    }

    return {
      id: userRecord.id,
      uid: userRecord.uid,
      businessId: userRecord.businessId,
      customerId: resolvedCustomerId || null,
      fullName: userRecord.fullName,
      email: userRecord.email,
      phone: userRecord.phone || '',
      avatarUrl: userRecord.avatarUrl || '',
      actualRole,
      effectiveRole,
      isActive: userRecord.isActive,
      businessName: biz?.name || 'OrderFlow Workspace',
      businessIndustry: biz?.industry || 'Manufaktur Custom',
    };
  } catch (error) {
    console.error('Database query failed in getOrProvisionWorkspaceUser:', error);
    throw new Error('Gagal memuat profil dan workspace bisnis. Silakan coba kembali.', {
      cause: error,
    });
  }
}
