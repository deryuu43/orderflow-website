import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';

export type UserRole = 'owner' | 'admin' | 'production_staff' | 'customer';

export interface WorkspaceProfile {
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

interface AuthContextValue {
  firebaseUser: User | null;
  profile: WorkspaceProfile | null;
  unreadNotifications: number;
  loading: boolean;
  authError: string | null;
  roleOverride: UserRole | null;
  setRoleOverride: (role: UserRole | null) => void;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  apiFetch: <T = unknown>(path: string, options?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [roleOverride, setRoleOverrideState] = useState<UserRole | null>(null);

  // Store token strictly in memory (never in localStorage)
  const tokenRef = useRef<string | null>(null);
  const roleOverrideRef = useRef<UserRole | null>(null);

  const apiFetch = useCallback(
    async <T = unknown>(path: string, options: RequestInit = {}): Promise<T> => {
      const currentUser = auth.currentUser;
      let token = tokenRef.current;
      if (currentUser) {
        token = await currentUser.getIdToken();
        tokenRef.current = token;
      }

      const headers = new Headers(options.headers || {});
      if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
      }
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (roleOverrideRef.current) {
        headers.set('X-Active-Role', roleOverrideRef.current);
      }

      const res = await fetch(path, {
        ...options,
        headers,
      });

      const contentType = res.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(payload?.error || `Permintaan gagal (${res.status})`);
      }

      return payload as T;
    },
    []
  );

  const fetchMe = useCallback(
    async (user: User, activeOverride?: UserRole | null) => {
      try {
        setAuthError(null);
        const token = await user.getIdToken();
        tokenRef.current = token;

        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
        };
        const chosenRole = activeOverride !== undefined ? activeOverride : roleOverrideRef.current;
        if (chosenRole) {
          headers['X-Active-Role'] = chosenRole;
        }

        const res = await fetch('/api/me', { headers });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || 'Gagal memuat profil workspace.');
        }
        setProfile(json.user);
        setUnreadNotifications(Number(json.unreadNotifications || 0));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Gagal memuat profil akun.';
        setAuthError(msg);
      }
    },
    []
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await fetchMe(user);
      } else {
        tokenRef.current = null;
        setProfile(null);
        setUnreadNotifications(0);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [fetchMe]);

  const setRoleOverride = useCallback(
    (role: UserRole | null) => {
      roleOverrideRef.current = role;
      setRoleOverrideState(role);
      if (auth.currentUser) {
        void fetchMe(auth.currentUser, role);
      }
    },
    [fetchMe]
  );

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    const cred = await signInWithPopup(auth, googleAuthProvider);
    await fetchMe(cred.user);
  }, [fetchMe]);

  const logout = useCallback(async () => {
    await signOut(auth);
    tokenRef.current = null;
    roleOverrideRef.current = null;
    setRoleOverrideState(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (auth.currentUser) {
      await fetchMe(auth.currentUser);
    }
  }, [fetchMe]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        unreadNotifications,
        loading,
        authError,
        roleOverride,
        setRoleOverride,
        loginWithGoogle,
        logout,
        refreshProfile,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  }
  return ctx;
}
