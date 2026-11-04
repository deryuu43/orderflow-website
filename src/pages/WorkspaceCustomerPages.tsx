import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UserPlus,
  CreditCard,
  CheckCircle2,
  Eye,
  ShoppingBag,
  FileText,
  Palette,
} from 'lucide-react';
import { useAuth, type UserRole } from '../context/AuthContext.tsx';
import {
  PageHeader,
  Button,
  StatusIndicator,
  Modal,
  EmptyState,
  ErrorBanner,
  TableSkeleton,
} from '../components/ui/DesignSystem.tsx';
import {
  formatRupiah,
  formatDateId,
  ORDER_STATUS_LABELS,
  DESIGN_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  ROLE_LABELS,
} from '../lib/formatters.ts';
import { toast } from 'sonner';

interface WorkspaceManagementData {
  business: {
    id: string;
    name: string;
    slug: string;
    industry: string;
    phone: string;
    email: string;
    address: string;
  } | null;
  settings: {
    orderPrefix: string;
    invoicePrefix: string;
    defaultMinDpPercent: number;
    requireDesignApprovalDefault: boolean;
    requireDpBeforeProduction: boolean;
    bankName: string;
    bankAccountNumber: string;
    bankAccountHolder: string;
    invoiceFooterNotes: string;
    whatsappWebhookUrl: string;
    emailNotificationEnabled: boolean;
  } | null;
  subscription: {
    id: string;
    plan: 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
    status: string;
    monthlyPrice: number;
    orderLimit: number;
    userLimit: number;
    ordersUsedThisMonth: number;
    currentPeriodEnd: string;
    paymentGatewayMode: string;
    lastSimulationRef: string | null;
  } | null;
  team: Array<{
    id: string;
    uid: string;
    fullName: string;
    email: string;
    phone: string;
    role: UserRole;
    invitationStatus: string;
    isActive: boolean;
  }>;
  usage: {
    activeUsers: number;
    ordersUsedThisMonth: number;
  };
}

export function TeamPage() {
  const { apiFetch, profile, refreshProfile } = useAuth();

  const [data, setData] = useState<WorkspaceManagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invPhone, setInvPhone] = useState('');
  const [invRole, setInvRole] = useState<'admin' | 'production_staff' | 'customer'>('admin');
  const [submitting, setSubmitting] = useState(false);

  // User own profile edit
  const [myFullName, setMyFullName] = useState(profile?.fullName || '');
  const [myPhone, setMyPhone] = useState(profile?.phone || '');

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<WorkspaceManagementData>('/api/workspace');
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar tim.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  useEffect(() => {
    if (profile) {
      setMyFullName(profile.fullName);
      setMyPhone(profile.phone);
    }
  }, [profile]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/api/workspace/team', {
        method: 'POST',
        body: JSON.stringify({
          fullName: invName,
          email: invEmail,
          phone: invPhone,
          role: invRole,
        }),
      });
      toast.success(`Undangan akses ${ROLE_LABELS[invRole]} berhasil dibuat.`);
      setInviteOpen(false);
      setInvName('');
      setInvEmail('');
      setInvPhone('');
      await loadTeam();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengundang anggota.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (memberId: string, nextActive: boolean) => {
    try {
      await apiFetch(`/api/workspace/team/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: nextActive }),
      });
      toast.success('Status akses anggota diperbarui.');
      await loadTeam();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal memperbarui anggota.');
    }
  };

  const handleRoleUpdate = async (memberId: string, nextRole: UserRole) => {
    try {
      await apiFetch(`/api/workspace/team/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      toast.success('Role pengguna berhasil diubah.');
      await loadTeam();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah role.');
    }
  };

  const handleUpdateMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: myFullName, phone: myPhone }),
      });
      await refreshProfile();
      await loadTeam();
      toast.success('Profil pengguna Anda berhasil diperbarui.');
    } catch {
      toast.error('Gagal memperbarui profil.');
    }
  };

  if (loading) return <TableSkeleton rows={5} />;
  if (error || !data) {
    return <ErrorBanner message={error || 'Data tidak tersedia.'} onRetry={loadTeam} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manajemen Tim, Profil & Role (RBAC)"
        description={`Pengguna aktif internal: ${data.usage.activeUsers} dari batas paket ${
          data.subscription?.userLimit || 3
        } pengguna.`}
        actions={
          <Button type="button" onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4" />
            <span>Undang Anggota / Pelanggan</span>
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80">
            <h2 className="text-sm font-semibold text-slate-900">Daftar Pengguna & Akses</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Nama & Email</th>
                  <th className="py-2.5 px-4">Role Akses</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Kontrol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.team.map((member) => (
                  <tr key={member.id}>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{member.fullName}</div>
                      <div className="text-slate-500">{member.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={member.role}
                        disabled={member.uid === profile?.uid}
                        onChange={(e) => void handleRoleUpdate(member.id, e.target.value as UserRole)}
                        className="h-8 px-2 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-50"
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="production_staff">Production Staff</option>
                        <option value="customer">Customer</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <StatusIndicator
                        status={member.isActive ? 'active' : 'cancelled'}
                        label={
                          !member.isActive
                            ? 'Nonaktif'
                            : member.invitationStatus === 'pending'
                            ? 'Menunggu Login'
                            : 'Aktif'
                        }
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      {member.uid !== profile?.uid && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleToggleActive(member.id, !member.isActive)}
                        >
                          {member.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* User Profile Card */}
        <form
          onSubmit={handleUpdateMyProfile}
          className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit"
        >
          <h2 className="text-sm font-semibold text-slate-900">Profil Akun Saya</h2>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email Terdaftar</label>
            <input
              type="text"
              disabled
              value={profile?.email || ''}
              className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap</label>
            <input
              type="text"
              required
              value={myFullName}
              onChange={(e) => setMyFullName(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">No. Telepon</label>
            <input
              type="text"
              value={myPhone}
              onChange={(e) => setMyPhone(e.target.value)}
              className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-200 rounded-lg"
            />
          </div>
          <Button type="submit" variant="secondary" className="w-full">
            Simpan Profil Saya
          </Button>
        </form>
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Undang Tim atau Pelanggan"
        description="Saat pengguna login menggunakan alamat email ini, sistem otomatis memberikan role yang dipilih."
      >
        <form onSubmit={handleInvite} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Nama Lengkap *</label>
            <input
              type="text"
              required
              value={invName}
              onChange={(e) => setInvName(e.target.value)}
              className="w-full h-9 px-3 border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Email Google *</label>
            <input
              type="email"
              required
              value={invEmail}
              onChange={(e) => setInvEmail(e.target.value)}
              placeholder="nama@gmail.com"
              className="w-full h-9 px-3 border border-slate-200 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Role Akses *</label>
              <select
                value={invRole}
                onChange={(e) =>
                  setInvRole(e.target.value as 'admin' | 'production_staff' | 'customer')
                }
                className="w-full h-9 px-3 border border-slate-200 rounded-lg"
              >
                <option value="admin">Admin Operasional</option>
                <option value="production_staff">Staf Produksi</option>
                <option value="customer">Pelanggan (Portal)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">No. Telepon</label>
              <input
                type="text"
                value={invPhone}
                onChange={(e) => setInvPhone(e.target.value)}
                className="w-full h-9 px-3 font-mono border border-slate-200 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Kirim Undangan'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function SettingsPage() {
  const { apiFetch, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    industry: '',
    phone: '',
    email: '',
    address: '',
    orderPrefix: 'ORD',
    invoicePrefix: 'INV',
    defaultMinDpPercent: 50,
    requireDesignApprovalDefault: true,
    requireDpBeforeProduction: true,
    bankName: 'BCA',
    bankAccountNumber: '',
    bankAccountHolder: '',
    invoiceFooterNotes: '',
    whatsappWebhookUrl: '',
    emailNotificationEnabled: false,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch<WorkspaceManagementData>('/api/workspace');
        if (res.business && res.settings) {
          setForm({
            name: res.business.name,
            industry: res.business.industry,
            phone: res.business.phone || '',
            email: res.business.email || '',
            address: res.business.address || '',
            orderPrefix: res.settings.orderPrefix,
            invoicePrefix: res.settings.invoicePrefix,
            defaultMinDpPercent: res.settings.defaultMinDpPercent,
            requireDesignApprovalDefault: res.settings.requireDesignApprovalDefault,
            requireDpBeforeProduction: res.settings.requireDpBeforeProduction,
            bankName: res.settings.bankName,
            bankAccountNumber: res.settings.bankAccountNumber,
            bankAccountHolder: res.settings.bankAccountHolder,
            invoiceFooterNotes: res.settings.invoiceFooterNotes,
            whatsappWebhookUrl: res.settings.whatsappWebhookUrl || '',
            emailNotificationEnabled: res.settings.emailNotificationEnabled,
          });
        }
      } catch {
        toast.error('Gagal memuat pengaturan bisnis.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [apiFetch]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/workspace/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      await refreshProfile();
      toast.success('Pengaturan bisnis dan aturan produksi berhasil disimpan.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengaturan Profil Bisnis & Operasional"
        description="Atur identitas usaha di invoice, syarat minimal DP, kebijakan approval desain, dan kesiapan integrasi notifikasi."
      />

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">1. Identitas Bisnis & Rekening</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Nama Bisnis *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Bidang Usaha *</label>
              <input
                type="text"
                required
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Telepon Bisnis</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full h-9 px-3 font-mono border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Email Resmi</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Alamat Workshop</label>
            <textarea
              rows={2}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full p-2.5 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Nama Bank</label>
              <input
                type="text"
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">No. Rekening</label>
              <input
                type="text"
                value={form.bankAccountNumber}
                onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
                className="w-full h-9 px-3 font-mono border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Atas Nama</label>
              <input
                type="text"
                value={form.bankAccountHolder}
                onChange={(e) => setForm({ ...form, bankAccountHolder: e.target.value })}
                className="w-full h-9 px-3 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Catatan Kaki Invoice PDF</label>
            <textarea
              rows={2}
              value={form.invoiceFooterNotes}
              onChange={(e) => setForm({ ...form, invoiceFooterNotes: e.target.value })}
              className="w-full p-2.5 border border-slate-200 rounded-lg"
            />
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">
              2. Aturan Produksi & Ekstensi Notifikasi
            </h2>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Prefix Pesanan</label>
                <input
                  type="text"
                  value={form.orderPrefix}
                  onChange={(e) => setForm({ ...form, orderPrefix: e.target.value })}
                  className="w-full h-9 px-3 font-mono border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Prefix Invoice</label>
                <input
                  type="text"
                  value={form.invoicePrefix}
                  onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
                  className="w-full h-9 px-3 font-mono border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Default DP (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.defaultMinDpPercent}
                  onChange={(e) =>
                    setForm({ ...form, defaultMinDpPercent: Number(e.target.value) })
                  }
                  className="w-full h-9 px-3 font-mono border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requireDpBeforeProduction}
                  onChange={(e) =>
                    setForm({ ...form, requireDpBeforeProduction: e.target.checked })
                  }
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span className="text-slate-700">
                  Kunci produksi sebelum syarat pembayaran DP awal terverifikasi
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requireDesignApprovalDefault}
                  onChange={(e) =>
                    setForm({ ...form, requireDesignApprovalDefault: e.target.checked })
                  }
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span className="text-slate-700">
                  Wajibkan persetujuan desain pelanggan secara default untuk pesanan baru
                </span>
              </label>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="font-semibold text-slate-900">
                Fondasi Integrasi Eksternal (WhatsApp & Email)
              </div>
              <p className="text-slate-500 leading-relaxed">
                Notifikasi internal di aplikasi telah aktif sepenuhnya. Konfigurasi webhook
                WhatsApp atau SMTP eksternal di bawah disiapkan untuk tahap integrasi lanjutan
                (saat ini belum terhubung ke provider pihak ketiga).
              </p>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Endpoint Webhook WhatsApp Gateway (Placeholder Konfigurasi)
                </label>
                <input
                  type="text"
                  value={form.whatsappWebhookUrl}
                  onChange={(e) => setForm({ ...form, whatsappWebhookUrl: e.target.value })}
                  placeholder="https://api.whatsapp-provider.id/webhook (Belum dikonfigurasi)"
                  className="w-full h-9 px-3 font-mono border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full mt-6">
            {saving ? 'Menyimpan Pengaturan...' : 'Simpan Seluruh Pengaturan'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function SubscriptionPage() {
  const { apiFetch } = useAuth();

  const [data, setData] = useState<WorkspaceManagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<
    'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE' | null
  >(null);
  const [gateway, setGateway] = useState<'midtrans_sim' | 'xendit_sim'>('midtrans_sim');
  const [processing, setProcessing] = useState(false);

  const loadSub = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<WorkspaceManagementData>('/api/workspace');
      setData(res);
    } catch {
      toast.error('Gagal memuat status langganan.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadSub();
  }, [loadSub]);

  const handleConfirmPlan = async () => {
    if (!checkoutPlan) return;
    setProcessing(true);
    try {
      await apiFetch('/api/workspace/subscription', {
        method: 'POST',
        body: JSON.stringify({ plan: checkoutPlan, gatewayProvider: gateway }),
      });
      toast.success(`Paket langganan berhasil diperbarui ke ${checkoutPlan} (Mode Simulasi).`);
      setCheckoutPlan(null);
      await loadSub();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah paket.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading || !data) return <TableSkeleton rows={4} />;

  const sub = data.subscription;
  const orderPct = sub
    ? Math.min(100, Math.round((data.usage.ordersUsedThisMonth / sub.orderLimit) * 100))
    : 0;
  const userPct = sub
    ? Math.min(100, Math.round((data.usage.activeUsers / sub.userLimit) * 100))
    : 0;

  const plans: Array<{
    code: 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
    audience: string;
    priceLabel: string;
    orderCap: string;
    userCap: string;
  }> = [
    {
      code: 'FREE',
      audience: 'Untuk percobaan operasional mandiri',
      priceLabel: 'Rp0 / bulan',
      orderCap: '20 pesanan per bulan',
      userCap: '1 pengguna internal',
    },
    {
      code: 'STARTER',
      audience: 'Untuk workshop percetakan & sablon',
      priceLabel: 'Rp69.000 / bulan',
      orderCap: '150 pesanan per bulan',
      userCap: '3 pengguna internal',
    },
    {
      code: 'BUSINESS',
      audience: 'Untuk konveksi & produksi skala menengah',
      priceLabel: 'Rp149.000 / bulan',
      orderCap: '500 pesanan per bulan',
      userCap: '10 pengguna internal',
    },
    {
      code: 'ENTERPRISE',
      audience: 'Untuk pabrik custom multi-cabang',
      priceLabel: 'Kustom (Simulasi Rp499rb)',
      orderCap: 'Kapasitas sesuai kesepakatan',
      userCap: 'Pengguna tidak dibatasi',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Langganan SaaS & Penggunaan Kuota"
        description="Kelola kapasitas pesanan bulanan dan jumlah pengguna tim sesuai skala bisnis Anda."
      />

      {sub && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-xs text-slate-500">Paket Saat Ini</div>
            <div className="mt-1 flex items-center gap-2.5">
              <span className="text-xl font-bold text-slate-900">{sub.plan}</span>
              <StatusIndicator status={sub.status} label="Aktif" />
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              Berlaku hingga:{' '}
              <span className="font-mono text-slate-800">
                {formatDateId(sub.currentPeriodEnd)}
              </span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-600">Kuota Pesanan Bulan Ini</span>
              <span className="font-mono font-semibold text-slate-900">
                {data.usage.ordersUsedThisMonth} /{' '}
                {sub.plan === 'ENTERPRISE' ? '∞' : sub.orderLimit}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${orderPct}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-600">Pengguna Tim Aktif</span>
              <span className="font-mono font-semibold text-slate-900">
                {data.usage.activeUsers} / {sub.plan === 'ENTERPRISE' ? '∞' : sub.userLimit}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-slate-900 rounded-full" style={{ width: `${userPct}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {plans.map((p) => {
          const isCurrent = sub?.plan === p.code;
          return (
            <div
              key={p.code}
              className={`bg-white rounded-xl p-6 flex flex-col justify-between border ${
                isCurrent ? 'border-indigo-600' : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">{p.code}</span>
                  {isCurrent && (
                    <span className="text-xs font-medium text-indigo-600">Paket Aktif</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500">{p.audience}</div>
                <div className="mt-4 text-lg font-bold font-mono tabular-nums text-slate-900">
                  {p.priceLabel}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{p.orderCap}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{p.userCap}</span>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                variant={isCurrent ? 'secondary' : 'primary'}
                disabled={isCurrent}
                onClick={() => setCheckoutPlan(p.code)}
                className="mt-6 w-full"
              >
                {isCurrent ? 'Sedang Digunakan' : 'Upgrade / Pilih Paket'}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Simulation Payment Modal */}
      <Modal
        open={Boolean(checkoutPlan)}
        onClose={() => setCheckoutPlan(null)}
        title={`Konfirmasi Perubahan Paket ke ${checkoutPlan}`}
        description="Mode Simulasi Pembayaran Sandbox (Midtrans / Xendit) dengan verifikasi HMAC server-side."
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 leading-relaxed">
            <strong>Mode Simulasi Pengembangan:</strong> Integrasi kredensial live Midtrans/Xendit
            belum dihubungkan. Pembayaran paket di bawah diproses dalam mode simulasi lokal dengan
            validasi tanda tangan webhook di sisi server.
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Pilih Kanal Simulasi Gateway
            </label>
            <select
              value={gateway}
              onChange={(e) => setGateway(e.target.value as 'midtrans_sim' | 'xendit_sim')}
              className="w-full h-9 px-3 border border-slate-200 rounded-lg"
            >
              <option value="midtrans_sim">Midtrans Snap Sandbox (Simulasi)</option>
              <option value="xendit_sim">Xendit Invoice Sandbox (Simulasi)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCheckoutPlan(null)}>
              Batal
            </Button>
            <Button type="button" onClick={handleConfirmPlan} disabled={processing}>
              <CreditCard className="w-3.5 h-3.5" />
              <span>{processing ? 'Memproses...' : 'Simulasikan Pembayaran & Aktifkan'}</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// CUSTOMER PORTAL VIEWS (/portal, /portal/orders, /portal/designs)
export function CustomerPortalOverviewPage() {
  const { apiFetch, profile } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<
    Array<{
      id: string;
      orderNumber: string;
      title: string;
      orderStatus: string;
      designStatus: string;
      productionStatus: string;
      paymentStatus: string;
      grandTotal: number;
      paidAmount: number;
      deadline: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch<{ data: typeof orders }>('/api/orders?pageSize=25');
        setOrders(res.data);
      } catch {
        toast.error('Gagal memuat portal pelanggan.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [apiFetch]);

  if (loading) return <TableSkeleton rows={4} />;

  const awaitingDesign = orders.filter((o) => o.designStatus === 'menunggu_persetujuan').length;
  const unpaidCount = orders.filter(
    (o) => o.paymentStatus === 'unpaid' || o.paymentStatus === 'partial'
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Selamat Datang, ${profile?.fullName || 'Pelanggan'}`}
        description="Pantau progres pesanan custom Anda, tinjau & setujui desain produksi, serta lihat tagihan resmi."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Total Pesanan Saya</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {orders.length}
            </div>
          </div>
          <ShoppingBag className="w-5 h-5 text-indigo-600" />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Desain Menunggu Persetujuan</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-700">
              {awaitingDesign}
            </div>
          </div>
          <Palette className="w-5 h-5 text-amber-600" />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Tagihan Belum Lunas</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {unpaidCount}
            </div>
          </div>
          <FileText className="w-5 h-5 text-slate-500" />
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="Belum Ada Pesanan Terhubung"
          description="Pesanan yang didaftarkan menggunakan alamat email Anda akan otomatis tampil di portal ini."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Daftar Pesanan Saya</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">No. Pesanan</th>
                  <th className="py-2.5 px-4">Produk</th>
                  <th className="py-2.5 px-4">Desain</th>
                  <th className="py-2.5 px-4">Status Pesanan</th>
                  <th className="py-2.5 px-4">Pembayaran</th>
                  <th className="py-2.5 px-4">Deadline</th>
                  <th className="py-2.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-medium text-indigo-600">
                      {ord.orderNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{ord.title}</td>
                    <td className="py-3 px-4">
                      <StatusIndicator
                        status={ord.designStatus}
                        label={DESIGN_STATUS_LABELS[ord.designStatus] || ord.designStatus}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <StatusIndicator
                        status={ord.orderStatus}
                        label={ORDER_STATUS_LABELS[ord.orderStatus] || ord.orderStatus}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <StatusIndicator
                        status={ord.paymentStatus}
                        label={PAYMENT_STATUS_LABELS[ord.paymentStatus] || ord.paymentStatus}
                      />
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                      {formatDateId(ord.deadline)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/portal/orders/${ord.id}`)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Detail & Desain</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function CustomerPortalDesignsPage() {
  const { apiFetch } = useAuth();
  const [orders, setOrders] = useState<
    Array<{
      id: string;
      orderNumber: string;
      title: string;
      designStatus: string;
      deadline: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch<{ data: typeof orders }>('/api/orders?pageSize=25');
        setOrders(res.data);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [apiFetch]);

  if (loading) return <TableSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Persetujuan Desain & Permintaan Revisi"
        description="Pilih pesanan untuk meninjau mockup desain terbaru, meminta revisi, atau menyetujui desain produksi."
      />

      {orders.length === 0 ? (
        <EmptyState
          title="Belum Ada Desain Pesanan"
          description="Daftar desain pesanan Anda akan tampil di halaman ini."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orders.map((ord) => (
            <div
              key={ord.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between gap-4"
            >
              <div>
                <div className="text-xs font-mono text-indigo-600 font-semibold">
                  {ord.orderNumber}
                </div>
                <h3 className="mt-0.5 text-sm font-semibold text-slate-900">{ord.title}</h3>
                <div className="mt-2">
                  <StatusIndicator
                    status={ord.designStatus}
                    label={DESIGN_STATUS_LABELS[ord.designStatus] || ord.designStatus}
                  />
                </div>
              </div>
              <Link to={`/portal/orders/${ord.id}`}>
                <Button type="button" variant="secondary" size="sm">
                  Buka Desain →
                </Button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
