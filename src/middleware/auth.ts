import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import {
  getOrProvisionWorkspaceUser,
  type UserRole,
  type WorkspaceUserContext,
} from '../db/workspace.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  workspaceUser?: WorkspaceUserContext;
}

// Simple sliding-window rate limiter to protect API & tracking endpoints
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'anon'}:${req.baseUrl || req.path}`;
    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (!record || now > record.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({
        error: 'Terlalu banyak permintaan dalam waktu singkat. Silakan tunggu beberapa saat.',
      });
    }

    record.count += 1;
    return next();
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Tidak terautentikasi: Token tidak ditemukan.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    const roleHeader = req.headers['x-active-role'];
    const requestedRoleOverride = typeof roleHeader === 'string' ? roleHeader : undefined;

    const workspaceUser = await getOrProvisionWorkspaceUser({
      uid: decodedToken.uid,
      email: decodedToken.email || `${decodedToken.uid}@orderflow.app`,
      name: decodedToken.name,
      picture: decodedToken.picture,
      requestedRoleOverride,
    });

    if (!workspaceUser.isActive) {
      return res.status(403).json({
        error: 'Akun Anda sedang dinonaktifkan oleh pemilik bisnis.',
      });
    }

    req.workspaceUser = workspaceUser;
    return next();
  } catch (error) {
    console.error('Error verifying Firebase ID token or workspace context:', error);
    return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir. Silakan login ulang.' });
  }
};

export function requireRoles(allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const ctx = req.workspaceUser;
    if (!ctx) {
      return res.status(401).json({ error: 'Tidak terautentikasi.' });
    }
    if (!allowedRoles.includes(ctx.effectiveRole)) {
      return res.status(403).json({
        error: `Akses ditolak. Fitur ini hanya diizinkan untuk role: ${allowedRoles.join(', ')}.`,
      });
    }
    return next();
  };
}
