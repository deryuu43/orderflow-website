import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  Kanban,
  FileText,
  BarChart3,
  UserCog,
  CreditCard,
  Settings,
  Bell,
  Menu,
  X,
  LogOut,
  Plus,
  Layers,
  Palette,
  ExternalLink,
} from 'lucide-react';
import { useAuth, type UserRole } from '../../context/AuthContext.tsx';
import { ROLE_LABELS, formatDateTimeId } from '../../lib/formatters.ts';
import { Button, Modal, cn } from '../ui/DesignSystem.tsx';
import { toast } from 'sonner';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const WORKSPACE_NAV: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['owner', 'admin', 'production_staff'],
  },
  {
    to: '/orders',
    label: 'Pesanan',
    icon: ShoppingBag,
    roles: ['owner', 'admin', 'production_staff'],
  },
  {
    to: '/customers',
    label: 'Pelanggan',
    icon: Users,
    roles: ['owner', 'admin'],
  },
  {
    to: '/production',
    label: 'Produksi Kanban',
    icon: Kanban,
    roles: ['owner', 'admin', 'production_staff'],
  },
  {
    to: '/invoices',
    label: 'Invoice & Pembayaran',
    icon: FileText,
    roles: ['owner', 'admin'],
  },
  {
    to: '/reports',
    label: 'Laporan & Analitik',
    icon: BarChart3,
    roles: ['owner', 'admin'],
  },
  {
    to: '/team',
    label: 'Tim & Akses',
    icon: UserCog,
    roles: ['owner'],
  },
  {
    to: '/subscription',
    label: 'Langganan',
    icon: CreditCard,
    roles: ['owner'],
  },
  {
    to: '/settings',
    label: 'Pengaturan',
    icon: Settings,
    roles: ['owner'],
  },
];

const PORTAL_NAV: NavItem[] = [
  {
    to: '/portal',
    label: 'Ringkasan Portal',
    icon: LayoutDashboard,
    roles: ['customer'],
  },
  {
    to: '/portal/orders',
    label: 'Pesanan Saya',
    icon: ShoppingBag,
    roles: ['customer'],
  },
  {
    to: '/portal/designs',
    label: 'Desain & Approval',
    icon: Palette,
    roles: ['customer'],
  },
  {
    to: '/portal/invoices',
    label: 'Tagihan Saya',
    icon: FileText,
    roles: ['customer'],
  },
];

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  orderId: string | null;
  isRead: boolean;
  createdAt: string;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    profile,
    unreadNotifications,
    roleOverride,
    setRoleOverride,
    logout,
    apiFetch,
    refreshProfile,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loadingNotif, setLoadingNotif] = useState(false);

  const effectiveRole = profile?.effectiveRole || 'owner';
  const navItems = (effectiveRole === 'customer' ? PORTAL_NAV : WORKSPACE_NAV).filter((item) =>
    item.roles.includes(effectiveRole)
  );

  const openNotifications = async () => {
    setNotifOpen(true);
    setLoadingNotif(true);
    try {
      const list = await apiFetch<NotificationRow[]>('/api/notifications');
      setNotifications(list);
    } catch {
      toast.error('Gagal memuat daftar notifikasi.');
    } finally {
      setLoadingNotif(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      await refreshProfile();
      toast.success('Semua notifikasi ditandai telah dibaca.');
    } catch {
      toast.error('Gagal memperbarui notifikasi.');
    }
  };

  const handleRoleSwitch = (nextRole: UserRole) => {
    setRoleOverride(nextRole === profile?.actualRole ? null : nextRole);
    if (nextRole === 'customer') {
      navigate('/portal');
    } else if (location.pathname.startsWith('/portal')) {
      navigate('/dashboard');
    }
    toast.info(`Mode akses beralih ke: ${ROLE_LABELS[nextRole]}`);
  };

  const pathSegments = location.pathname.split('/').filter(Boolean);
  const breadcrumbMap: Record<string, string> = {
    dashboard: 'Dashboard',
    orders: 'Pesanan',
    create: 'Buat Baru',
    customers: 'Pelanggan',
    production: 'Produksi',
    invoices: 'Invoice',
    reports: 'Laporan',
    team: 'Tim & Role',
    subscription: 'Langganan',
    settings: 'Pengaturan',
    portal: 'Portal Pelanggan',
    designs: 'Desain & Revisi',
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200/90">
      {/* Brand Workspace Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200/80">
        <Link
          to={effectiveRole === 'customer' ? '/portal' : '/dashboard'}
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2.5 min-w-0"
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">OrderFlow</div>
            <div className="text-[11px] text-slate-500 truncate">
              {profile?.businessName || 'Workspace'}
            </div>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
          aria-label="Tutup menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            location.pathname === item.to ||
            (item.to !== '/portal' &&
              item.to !== '/dashboard' &&
              location.pathname.startsWith(`${item.to}/`));

          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon
                className={cn(
                  'w-4 h-4 shrink-0',
                  isActive ? 'text-indigo-600' : 'text-slate-400'
                )}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        <div className="pt-4 mt-4 border-t border-slate-200/70">
          <Link
            to="/track"
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <span>Halaman Tracking Publik</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* Owner Role Simulator (Strictly only shown if actual DB role is owner) */}
      {profile?.actualRole === 'owner' && (
        <div className="px-3 py-3 border-t border-slate-200/80 bg-slate-50/60">
          <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
            Uji Tampilan Role (Khusus Owner)
          </label>
          <select
            value={roleOverride || profile.actualRole}
            onChange={(e) => handleRoleSwitch(e.target.value as UserRole)}
            className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <option value="owner">Owner Bisnis (Penuh)</option>
            <option value="admin">Admin Operasional</option>
            <option value="production_staff">Staf Produksi</option>
            <option value="customer">Pelanggan (Customer Portal)</option>
          </select>
        </div>
      )}

      {/* User Account Footer */}
      <div className="p-3 border-t border-slate-200/80 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-900 truncate">
            {profile?.fullName || 'Pengguna'}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {ROLE_LABELS[effectiveRole] || effectiveRole}
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
          title="Keluar dari sesi"
          aria-label="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 max-w-[82vw] h-full z-10">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract for SaaS Workspace */}
        <header className="h-14 bg-white border-b border-slate-200/80 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              aria-label="Buka navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
              <span className="font-medium text-slate-700 truncate">
                {profile?.businessName || 'OrderFlow'}
              </span>
              {pathSegments.map((seg, idx) => (
                <React.Fragment key={idx}>
                  <span aria-hidden="true">/</span>
                  <span
                    className={cn(
                      'truncate',
                      idx === pathSegments.length - 1 ? 'font-medium text-slate-900' : ''
                    )}
                  >
                    {breadcrumbMap[seg] || (seg.length > 14 ? `${seg.slice(0, 8)}...` : seg)}
                  </span>
                </React.Fragment>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={openNotifications}
              className="relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Notifikasi</span>
              {unreadNotifications > 0 && (
                <span className="font-mono tabular-nums text-[11px] font-semibold text-indigo-600">
                  ({unreadNotifications})
                </span>
              )}
            </button>

            {(effectiveRole === 'owner' || effectiveRole === 'admin') && (
              <Button
                type="button"
                size="sm"
                onClick={() => navigate('/orders/create')}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Pesanan Baru</span>
              </Button>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1360px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Notifications Modal */}
      <Modal
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        title="Notifikasi Operasional"
        description="Pembaruan pesanan, persetujuan desain, tenggat produksi, dan pembayaran."
        maxWidth="max-w-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-slate-500">
            Menampilkan {notifications.length} notifikasi terbaru
          </span>
          {notifications.some((n) => !n.isRead) && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Tandai semua dibaca
            </button>
          )}
        </div>

        {loadingNotif ? (
          <div className="py-8 text-center text-xs text-slate-500">Memuat notifikasi...</div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Belum ada notifikasi baru pada workspace ini.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 -mx-2">
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setNotifOpen(false);
                  if (n.orderId) {
                    navigate(
                      effectiveRole === 'customer'
                        ? `/portal/orders/${n.orderId}`
                        : `/orders/${n.orderId}`
                    );
                  }
                }}
                className={cn(
                  'w-full text-left px-3 py-3 rounded-lg hover:bg-slate-50 transition-colors block',
                  !n.isRead ? 'bg-indigo-50/40' : ''
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">{n.title}</span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                    {formatDateTimeId(n.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">{n.message}</p>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
