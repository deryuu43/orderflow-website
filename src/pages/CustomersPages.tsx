import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, Search, ArrowLeft, Edit3, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  PageHeader,
  Button,
  StatusIndicator,
  Modal,
  EmptyState,
  ErrorBanner,
  TableSkeleton,
} from '../components/ui/DesignSystem.tsx';
import { formatRupiah, formatDateId, ORDER_STATUS_LABELS } from '../lib/formatters.ts';
import { toast } from 'sonner';

interface CustomerItem {
  id: string;
  customerCode: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  orderCount: number;
  totalTransaction: number;
  totalPaid: number;
}

interface CustomerFormValues {
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export function CustomersListPage() {
  const { apiFetch } = useAuth();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset } = useForm<CustomerFormValues>();

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
      const res = await apiFetch<CustomerItem[]>(`/api/customers${qs}`);
      setCustomers(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar pelanggan.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, search]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const openCreateModal = () => {
    setEditingCustomer(null);
    reset({ name: '', company: '', phone: '', email: '', address: '', notes: '' });
    setModalOpen(true);
  };

  const openEditModal = (c: CustomerItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCustomer(c);
    reset({
      name: c.name,
      company: c.company || '',
      phone: c.phone,
      email: c.email || '',
      address: c.address || '',
      notes: c.notes || '',
    });
    setModalOpen(true);
  };

  const onSubmit = async (values: CustomerFormValues) => {
    setSaving(true);
    try {
      if (editingCustomer) {
        await apiFetch(`/api/customers/${editingCustomer.id}`, {
          method: 'PUT',
          body: JSON.stringify(values),
        });
        toast.success('Data pelanggan diperbarui.');
      } else {
        await apiFetch('/api/customers', {
          method: 'POST',
          body: JSON.stringify(values),
        });
        toast.success('Pelanggan baru berhasil disimpan.');
      }
      setModalOpen(false);
      await loadCustomers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan pelanggan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manajemen Pelanggan"
        description="Database kontak pelanggan B2B & retail beserta riwayat pesanan dan nilai transaksi."
        actions={
          <Button type="button" onClick={openCreateModal}>
            <Plus className="w-4 h-4" />
            <span>Tambah Pelanggan</span>
          </Button>
        }
      />

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama pelanggan, instansi, email, atau nomor HP..."
          className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
        />
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadCustomers} />
      ) : customers.length === 0 ? (
        <EmptyState
          title="Belum Ada Data Pelanggan"
          description="Simpan profil pelanggan Anda agar pembuatan pesanan dan invoice menjadi lebih cepat."
          action={
            <Button type="button" onClick={openCreateModal}>
              <Plus className="w-4 h-4" />
              <span>Tambah Pelanggan Pertama</span>
            </Button>
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Kode</th>
                  <th className="py-2.5 px-4">Nama & Instansi</th>
                  <th className="py-2.5 px-4">Kontak</th>
                  <th className="py-2.5 px-4 text-right">Pesanan</th>
                  <th className="py-2.5 px-4 text-right">Total Transaksi</th>
                  <th className="py-2.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/customers/${c.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {c.customerCode}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{c.name}</div>
                      {c.company && <div className="text-slate-500">{c.company}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-slate-800">{c.phone}</div>
                      {c.email && <div className="text-slate-500">{c.email}</div>}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                      {c.orderCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatRupiah(c.totalTransaction)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => openEditModal(c, e)}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
            <input
              type="text"
              required
              {...register('name', { required: true })}
              className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Perusahaan / Organisasi
              </label>
              <input
                type="text"
                {...register('company')}
                className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nomor Telepon *
              </label>
              <input
                type="text"
                required
                {...register('phone', { required: true })}
                className="w-full h-9 px-3 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              {...register('email')}
              className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Lengkap</label>
            <textarea
              rows={2}
              {...register('address')}
              className="w-full p-2.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Catatan</label>
            <textarea
              rows={2}
              {...register('notes')}
              className="w-full p-2.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan Pelanggan'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch, profile } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<{
    customer: CustomerItem;
    orders: Array<{
      id: string;
      orderNumber: string;
      title: string;
      orderStatus: string;
      grandTotal: number;
      paidAmount: number;
      orderDate: string;
      deadline: string;
    }>;
    summary: {
      totalOrders: number;
      activeOrders: number;
      totalTransaction: number;
      totalVerifiedPaid: number;
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<NonNullable<typeof data>>(`/api/customers/${id}`);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat detail pelanggan.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleInvitePortal = async () => {
    if (!data?.customer.email) {
      toast.error('Tambahkan alamat email pelanggan terlebih dahulu untuk mengaktifkan akses portal.');
      return;
    }
    try {
      await apiFetch('/api/workspace/team', {
        method: 'POST',
        body: JSON.stringify({
          fullName: data.customer.name,
          email: data.customer.email,
          role: 'customer',
          phone: data.customer.phone,
          customerId: data.customer.id,
        }),
      });
      toast.success(`Akses Customer Portal berhasil dibuka untuk ${data.customer.email}.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengundang pelanggan.');
    }
  };

  if (loading) return <TableSkeleton rows={5} />;
  if (error || !data) {
    return <ErrorBanner message={error || 'Data tidak ditemukan.'} onRetry={loadDetail} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.customer.name}
        description={`${data.customer.customerCode} · ${data.customer.company || 'Pelanggan Perorangan'}`}
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/customers')}>
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Daftar Pelanggan</span>
            </Button>
            {profile?.effectiveRole === 'owner' && data.customer.email && (
              <Button type="button" size="sm" onClick={handleInvitePortal}>
                <UserPlus className="w-3.5 h-3.5" />
                <span>Undang ke Portal Pelanggan</span>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Pesanan</div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900">
            {data.summary.totalOrders}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Pesanan Aktif</div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-indigo-600">
            {data.summary.activeOrders}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Nilai Transaksi</div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900">
            {formatRupiah(data.summary.totalTransaction)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Pembayaran Terverifikasi</div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-emerald-700">
            {formatRupiah(data.summary.totalVerifiedPaid)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
          <h2 className="text-sm font-semibold text-slate-900">Informasi Kontak</h2>
          <div>
            <span className="text-slate-500 block">Telepon / WhatsApp:</span>
            <span className="font-mono font-medium text-slate-900">{data.customer.phone}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Email:</span>
            <span className="text-slate-900">{data.customer.email || '-'}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Alamat Pengiriman:</span>
            <span className="text-slate-900">{data.customer.address || '-'}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Catatan Pelanggan:</span>
            <span className="text-slate-900">{data.customer.notes || '-'}</span>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80">
            <h2 className="text-sm font-semibold text-slate-900">Riwayat Pesanan Pelanggan</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">No. Pesanan</th>
                  <th className="py-2.5 px-4">Pekerjaan</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Deadline</th>
                  <th className="py-2.5 px-4 text-right">Nilai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {data.orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Belum ada riwayat pesanan untuk pelanggan ini.
                    </td>
                  </tr>
                ) : (
                  data.orders.map((ord) => (
                    <tr
                      key={ord.id}
                      onClick={() => navigate(`/orders/${ord.id}`)}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-3 px-4 font-mono text-indigo-600 font-medium">
                        {ord.orderNumber}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{ord.title}</td>
                      <td className="py-3 px-4">
                        <StatusIndicator
                          status={ord.orderStatus}
                          label={ORDER_STATUS_LABELS[ord.orderStatus] || ord.orderStatus}
                        />
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                        {formatDateId(ord.deadline)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {formatRupiah(ord.grandTotal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
